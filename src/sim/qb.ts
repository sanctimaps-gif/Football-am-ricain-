import { FIELD, GRAVITY } from '../core/config';
import { clamp, dist2 } from '../core/math';
import type { PlaySim } from './PlaySim';
import type { Agent, PassType } from './types';

export type QbDecision =
  | { action: 'hold' }
  | { action: 'throw'; target: number; passType: PassType }
  | { action: 'throwAway' }
  | { action: 'scramble' };

/** Vitesse horizontale selon le type de passe et la puissance du bras. */
export function passSpeed(type: PassType, power: number): number {
  switch (type) {
    case 'bullet':
      return 19 + power * 0.09;
    case 'lob':
      return 11.5 + power * 0.045;
    default:
      return 15 + power * 0.065;
  }
}

/** Calcule le point visé (avec anticipation de la course du receveur), le temps de vol et l'erreur. */
export function computeThrow(sim: PlaySim, qb: Agent, r: Agent, type: PassType, pressure: boolean, aiSide: boolean) {
  const a = qb.player.attrs;
  const vh = passSpeed(type, a.throwPower);
  let tx = r.x;
  let ty = r.y;
  let T = 0.5;
  for (let i = 0; i < 3; i++) {
    const d = dist2(qb.x, qb.y, tx, ty);
    T = Math.max(0.35, d / vh) + (type === 'lob' ? 0.25 : 0);
    tx = r.x + r.vx * T;
    ty = r.y + r.vy * T;
  }
  ty = clamp(ty, 0.5, FIELD.width - 0.5);
  const d = dist2(qb.x, qb.y, tx, ty);
  const maxRange = 42 + a.throwPower * 0.26;
  const overRange = Math.max(0, d - maxRange);
  const typeF = type === 'bullet' ? 1.12 : type === 'lob' ? 1.22 : 1;
  const moving = Math.hypot(qb.vx, qb.vy) > 3 ? 1.35 : 1;
  const diff = aiSide ? sim.setup.difficulty.accuracy : 1;
  const sd = (0.35 + d * 0.03) * (1.25 - a.throwAccuracy / 100) * (pressure ? 1.7 : 1) * typeF * moving * diff + overRange * 0.25;
  let ex = sim.rng.normal(0, sd);
  let ey = sim.rng.normal(0, sd);
  // passe trop courte au-delà de la portée
  if (overRange > 0) {
    const ux = (tx - qb.x) / d;
    const uy = (ty - qb.y) / d;
    ex -= ux * overRange;
    ey -= uy * overRange;
  }
  return { tx, ty, T, ex, ey };
}

/** Hauteur maximale de la trajectoire (pour le rendu de l'arc). */
export function apexHeight(T: number): number {
  return 1.5 + (GRAVITY * T * T) / 8;
}

/** Ouverture d'un receveur : distance au défenseur le plus proche au moment de l'arrivée. */
export function openness(sim: PlaySim, qb: Agent, r: Agent): number {
  const T = dist2(qb.x, qb.y, r.x, r.y) / 17;
  const px = r.x + r.vx * T;
  const py = r.y + r.vy * T;
  let sep = 15;
  for (const d of sim.agents) {
    if (d.side === r.side || d.down || d.engagedWith.length) continue;
    const reach = d.maxSpeed * Math.max(0, T - 0.3) * 0.55;
    const dd = dist2(d.x, d.y, px, py) - reach;
    if (dd < sep) sep = dd;
  }
  return sep;
}

/** Décision du QB contrôlé par l'IA (lecture des progressions, pression, scramble). */
export function qbDecide(sim: PlaySim, qb: Agent): QbDecision {
  const off = sim.setup.offPlay!;
  const t = sim.t;
  const shotgun = off.formation === 'shotgun' || off.formation === 'shotgunTrips';
  const dropTime = off.subtype === 'screen' ? 1.3 : sim.playAction ? 2.1 : shotgun ? 1.25 : 1.6;
  if (t < dropTime) return { action: 'hold' };
  const aw = qb.player.attrs.awareness;
  const readTime = 0.55 - aw / 400;
  const progression = (off.progression ?? []).map((slot) => sim.agents.find((a) => a.offense && a.slot === slot)).filter((a): a is Agent => !!a && !a.down);
  // en carrière, le QB IA cherche en priorité le joueur verrouillé s'il est démarqué
  const locked = sim.setup.lockedPlayerId ? sim.agents.find((a) => a.player.id === sim.setup.lockedPlayerId && a.eligible) : undefined;
  if (locked && !progression.includes(locked)) progression.unshift(locked);
  const reads = Math.min(progression.length, 1 + Math.floor((t - dropTime) / readTime));
  let pressure = 0;
  for (const d of sim.agents) {
    if (d.side === qb.side || d.down) continue;
    const dd = dist2(d.x, d.y, qb.x, qb.y);
    if (dd < 2.6) pressure = Math.max(pressure, 2.6 - dd);
  }
  const threshold = clamp(3.0 - (t - dropTime) * 0.45 - pressure * 0.4, 1.5 - aw / 200, 3.0);
  let best: Agent | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < reads; i++) {
    const r = progression[i];
    // tracé pas encore développé (avant la cassure) : le QB attend
    if (r.route.length > 1 && r.routeIdx < r.route.length - 1 && t < dropTime + 1.2) continue;
    const sep = openness(sim, qb, r);
    const depth = sim.toPlay(r.x, r.y).down;
    const needed = sim.setup.situation.toGo;
    const score = sep + (depth >= needed ? 0.6 : 0) - i * 0.25 + (r === locked ? 0.5 : 0);
    if (sep > threshold && score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  if (best) {
    const depth = dist2(qb.x, qb.y, best.x, best.y);
    const passType: PassType = depth < 9 ? 'bullet' : depth > 24 ? 'lob' : 'touch';
    return { action: 'throw', target: best.idx, passType };
  }
  // sous forte pression : scramble ou dégagement
  if (pressure > 1.4 || t > 4.8) {
    let laneFree = true;
    for (const d of sim.agents) {
      if (d.side === qb.side || d.down || d.engagedWith.length) continue;
      const p = sim.toPlay(d.x, d.y);
      const q = sim.toPlay(qb.x, qb.y);
      if (p.down > q.down && p.down - q.down < 6 && Math.abs(p.lat - q.lat) < 3.5) laneFree = false;
    }
    if (laneFree && qb.player.attrs.speed > 55 && sim.rng.chance(0.5)) return { action: 'scramble' };
    // meilleure option même couverte
    let fallback: Agent | null = null;
    let fs = -Infinity;
    for (const r of progression) {
      const sep = openness(sim, qb, r);
      if (sep > fs) {
        fs = sep;
        fallback = r;
      }
    }
    if (fallback && fs > 1.1) return { action: 'throw', target: fallback.idx, passType: 'touch' };
    if (t > 4.8 || sim.rng.chance(0.25 * (aw / 100))) return { action: 'throwAway' };
  }
  return { action: 'hold' };
}
