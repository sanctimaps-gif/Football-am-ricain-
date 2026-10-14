import { FIELD } from '../core/config';
import { clamp, dist2, len2 } from '../core/math';
import type { PlaySim } from './PlaySim';
import type { Agent } from './types';

const W = FIELD.width;
type Desire = [number, number, boolean];

const STOP: Desire = [0, 0, false];

/** Nombre de bloqueurs ayant déjà choisi ce défenseur. */
function targetedBy(sim: PlaySim, d: Agent, except: Agent): number {
  let n = 0;
  for (const b of sim.agents) if (b !== except && b.blockTarget === d.idx) n++;
  return n;
}

/** Vitesse souhaitée pour rejoindre (tx,ty) avec ralentissement à l'arrivée. */
export function seek(a: Agent, tx: number, ty: number, speedFrac = 1, arrive = 1.2): Desire {
  const dx = tx - a.x;
  const dy = ty - a.y;
  const d = len2(dx, dy);
  if (d < 0.05) return STOP;
  const s = a.maxSpeed * speedFrac * Math.min(1, d / arrive);
  return [(dx / d) * s, (dy / d) * s, speedFrac > 0.9];
}

/** Point d'interception d'une cible mobile. */
export function interceptPoint(a: Agent, t: Agent, quality = 1): [number, number] {
  const d = dist2(a.x, a.y, t.x, t.y);
  const lead = clamp(d / Math.max(4, a.maxSpeed), 0, 1.3) * (0.45 + 0.55 * quality);
  return [t.x + t.vx * lead, t.y + t.vy * lead];
}

function pursue(sim: PlaySim, a: Agent, t: Agent): Desire {
  const [ix, iy] = interceptPoint(a, t, a.player.attrs.awareness / 100);
  const dsr = seek(a, ix, iy, 1, 0.3);
  dsr[2] = true;
  void sim;
  return dsr;
}

/** Cerveau de chaque agent non contrôlé par l'utilisateur. */
export function think(sim: PlaySim, a: Agent, dt: number): Desire {
  const b = sim.ball;
  const c = sim.carrier();
  const kind = sim.setup.kind;

  // ——— Ballon libre : les plus proches se jettent dessus ———
  if (b.state === 'loose') {
    const d = dist2(a.x, a.y, b.x, b.y);
    if (d < 14) return seek(a, b.x, b.y, 1, 0.2);
    return seek(a, b.x, b.y, 0.6);
  }

  // ——— Coup d'envoi / punt / field goal ———
  if (kind === 'kickoff') return kickoffThink(sim, a);
  const sub = sim.setup.offPlay?.subtype;
  if (sub === 'punt') {
    const r = puntThink(sim, a);
    if (r) return r;
  }
  if (sub === 'fieldGoal') {
    if (a.offense) return a.offAssign?.kind === 'kick' || a.offAssign?.kind === 'hold' ? STOP : holdBlock(sim, a);
    return rush(sim, a, sim.agents[sim.holderIdx] ?? a);
  }
  if (sub === 'kneel') return STOP;

  // ——— Ballon en l'air (passe) ———
  if (b.state === 'air' && b.flight === 'pass') return passInAirThink(sim, a);
  if (b.state === 'air' && (b.flight === 'snap' || b.flight === 'pitch')) {
    if (a.idx === b.target) return seek(a, b.tx, b.ty, 1, 0.5);
  }

  if (!c && b.state !== 'air') return STOP;
  const carrier = c ?? sim.agents[b.target] ?? sim.agents[sim.qbIdx];
  if (!carrier) return STOP;

  if (a.idx === carrier.idx && c) return carrierThink(sim, a, dt);

  const qbInPocket = sim.isPassPlay && !sim.thrown && !sim.scramble && carrier.idx === sim.qbIdx;
  const runBeforeLos = sim.isRunPlay && sim.toPlay(carrier.x, carrier.y).down < 1 && sim.t < 2.5 && sim.carrierRole !== 'reception';

  if (a.side === carrier.side) {
    if (qbInPocket) return offensePassThink(sim, a);
    if (runBeforeLos) return runBlockThink(sim, a, carrier);
    return escort(sim, a, carrier);
  }
  // défenseur
  if (qbInPocket) return coverageThink(sim, a, carrier);
  if (sim.isRunPlay || sim.carrierRole === 'rush') {
    const identified = sim.runIdentified >= 0 && sim.t > sim.runIdentified + a.readDelay;
    if (a.defAssign === 'rush' || identified || dist2(a.x, a.y, carrier.x, carrier.y) < 4) return pursueOrRush(sim, a, carrier);
    // play-action / lecture : on suit sa couverture en attendant
    return coverageThink(sim, a, carrier);
  }
  return pursueOrRush(sim, a, carrier);
}

function pursueOrRush(sim: PlaySim, a: Agent, carrier: Agent): Desire {
  if (a.engagedWith.length) {
    const [dx, dy] = seek(a, carrier.x, carrier.y);
    return [dx, dy, true];
  }
  return pursue(sim, a, carrier);
}

// ——————————————————————————— Porteur du ballon ———————————————————————————

function carrierThink(sim: PlaySim, a: Agent, dt: number): Desire {
  const off = sim.setup.offPlay;
  // QB dans la poche (passe)
  if (sim.isPassPlay && a.idx === sim.qbIdx && !sim.thrown && !sim.scramble) return qbPocket(sim, a);
  // QB avant la remise
  if (sim.isRunPlay && a.idx === sim.qbIdx && !sim.handedOff && sim.handoffTarget >= 0) {
    const rb = sim.agents[sim.handoffTarget];
    // point de rencontre : projection du QB sur la trajectoire du RB
    const aim = sim.toWorld(off!.runAim!.down, off!.runAim!.lat);
    const vx = aim.x - rb.x;
    const vy = aim.y - rb.y;
    const l2 = vx * vx + vy * vy || 1;
    const t = clamp(((a.x - rb.x) * vx + (a.y - rb.y) * vy) / l2, 0, 1);
    const mx = rb.x + vx * t;
    const my = rb.y + vy * t;
    const back = sim.toWorld(-2.2, sim.toPlay(mx, my).lat);
    return seek(a, (mx + back.x) / 2, my, 0.75, 0.5);
  }
  // Porteur avant la ligne sur une course : suit le point visé
  if (off && off.runAim && sim.carrierRole === 'rush' && !sim.scramble) {
    const p = sim.toPlay(a.x, a.y);
    const aim = off.runAim;
    if (p.down < -1.5 && sim.t < 1.6 && Math.abs(p.lat - aim.lat) > 1.5) {
      // course vers le point visé tant qu'on est loin derrière la ligne
      const w = sim.toWorld(Math.min(aim.down, p.down + 2), aim.lat);
      const d = seek(a, w.x, w.y, 1, 0.3);
      d[2] = true;
      return d;
    }
    if (p.down < aim.down && sim.t < 2.4) return openField(sim, a, dt, aim.lat);
  }
  return openField(sim, a, dt);
}

/** IA de course en terrain ouvert : choisit la direction la plus libre vers l'avant. */
function openField(sim: PlaySim, a: Agent, dt: number, biasLat: number | null = null): Desire {
  const cdir = a.side === sim.offense ? sim.dir : -sim.dir;
  const situation = sim.setup.situation;
  const seekSideline = situation.trailingLate && a.side === sim.offense;
  let bestAng = 0;
  let bestScore = -Infinity;
  const base = cdir > 0 ? 0 : Math.PI;
  let nearest = Infinity;
  let gang = 0;
  for (const o of sim.agents) {
    if (o.side === a.side || o.down) continue;
    const d = dist2(o.x, o.y, a.x, a.y);
    if (d < nearest) nearest = d;
    if (d < 2) gang++;
  }
  for (let k = -4; k <= 4; k++) {
    const ang = base + (k * Math.PI) / 9;
    const hx = Math.cos(ang);
    const hy = Math.sin(ang);
    let score = hx * cdir * 1.4;
    for (const step of [1.5, 3.5, 6]) {
      const px = a.x + hx * step;
      const py = a.y + hy * step;
      if (py < 1.2 || py > W - 1.2) score -= seekSideline ? -0.6 : 2.5;
      if (biasLat !== null) score -= Math.abs(sim.toPlay(px, py).lat - biasLat) * 0.12;
      for (const o of sim.agents) {
        if (o === a || o.down) continue;
        const d = dist2(o.x + o.vx * 0.3, o.y + o.vy * 0.3, px, py);
        if (o.side !== a.side && !o.engagedWith.length) {
          if (d < 4.5) score -= (4.5 - d) * (4.5 - d) * 0.09 * (step < 2 ? 1.3 : 1);
        } else if (d < 0.8) {
          // mêlée (bloqueurs engagés) : obstacle physique
          score -= (0.8 - d) * 0.9;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestAng = ang;
    }
  }
  // feinte de l'IA
  if (nearest < 2.0 && a.jukeCooldown <= 0 && sim.rng.chance(dt * 1.6 * (a.player.attrs.agility / 99))) {
    sim.doJuke(a, 0, 0);
  }
  a.protect = gang >= 2;
  const s = a.maxSpeed;
  return [Math.cos(bestAng) * s, Math.sin(bestAng) * s, true];
}

function qbPocket(sim: PlaySim, a: Agent): Desire {
  const off = sim.setup.offPlay!;
  const shotgun = off.formation === 'shotgun' || off.formation === 'shotgunTrips';
  const t = sim.t;
  if (sim.playAction && t < 0.75) {
    const rb = sim.agents.find((x) => x.offense && x.slot === 'RB');
    if (rb) return seek(a, rb.x - 0.8 * sim.dir, rb.y, 0.7, 0.5);
  }
  const dropDepth = off.subtype === 'screen' ? -7.5 : shotgun ? -6.3 : sim.playAction ? -7.5 : -7;
  const p = sim.toPlay(a.x, a.y);
  if (p.down > dropDepth + 0.3 && t < 1.8) {
    const w = sim.toWorld(dropDepth, p.lat);
    return seek(a, w.x, w.y, 0.85, 0.6);
  }
  // glissement dans la poche pour éviter la pression
  let px = 0;
  let py = 0;
  for (const o of sim.agents) {
    if (o.side === a.side || o.down) continue;
    const d = dist2(o.x, o.y, a.x, a.y);
    if (d < 4) {
      px += ((a.x - o.x) / d) * (4 - d);
      py += ((a.y - o.y) / d) * (4 - d);
    }
  }
  const l = len2(px, py);
  if (l > 0.3) return [(px / l) * a.maxSpeed * 0.45, (py / l) * a.maxSpeed * 0.45, false];
  return STOP;
}

// ——————————————————————————— Attaque ———————————————————————————

function offensePassThink(sim: PlaySim, a: Agent): Desire {
  const as = a.offAssign;
  if (!as) return STOP;
  switch (as.kind) {
    case 'route':
      return runRoute(sim, a);
    case 'fake':
      if (sim.t < 1.0) {
        const w = sim.toWorld(1.5, 1.2);
        return seek(a, w.x, w.y, 0.9);
      }
      return passBlock(sim, a);
    case 'screenBlock':
      if (sim.t < 1.1) return passBlock(sim, a);
      return screenRelease(sim, a);
    case 'qb':
    case 'carry':
      return STOP;
    default:
      return passBlock(sim, a);
  }
}

function runRoute(sim: PlaySim, a: Agent): Desire {
  if (sim.t < a.routeDelay) {
    return a.offAssign?.kind === 'route' && a.offAssign.route === 'screen' ? passBlock(sim, a) : STOP;
  }
  if (a.routeIdx < a.route.length) {
    const wp = a.route[a.routeIdx];
    if (dist2(a.x, a.y, wp.x, wp.y) < 0.9) a.routeIdx++;
    else {
      const d = seek(a, wp.x, wp.y, 0.94, 0.2);
      d[2] = true;
      return d;
    }
  }
  if (a.routeEnd === 'continue' && a.route.length) {
    const last = a.route[a.route.length - 1];
    const prev = a.route.length > 1 ? a.route[a.route.length - 2] : { x: a.x - sim.dir, y: a.y };
    const dx = last.x - prev.x;
    const dy = last.y - prev.y;
    const l = len2(dx, dy) || 1;
    let tx = a.x + (dx / l) * 10;
    let ty = a.y + (dy / l) * 10;
    ty = clamp(ty, 1.5, W - 1.5);
    const endX = sim.dir > 0 ? FIELD.length - 1 : 1;
    if ((tx - endX) * sim.dir > 0) tx = endX;
    const d = seek(a, tx, ty, 1, 0.2);
    d[2] = true;
    return d;
  }
  // se démarquer : s'éloigner du défenseur le plus proche
  let nx = 0;
  let ny = 0;
  let nd = Infinity;
  for (const o of sim.agents) {
    if (o.side === a.side || o.down) continue;
    const d = dist2(o.x, o.y, a.x, a.y);
    if (d < nd) {
      nd = d;
      nx = a.x - o.x;
      ny = a.y - o.y;
    }
  }
  if (nd < 3) {
    const l = len2(nx, ny) || 1;
    return [(nx / l) * 2.2, (ny / l) * 2.2, false];
  }
  return STOP;
}

function anchorOf(sim: PlaySim, a: Agent): { x: number; y: number } {
  const p = sim.toPlay(a.x, a.y);
  return sim.toWorld(Math.min(p.down, -1.6), p.lat);
}

function passBlock(sim: PlaySim, a: Agent): Desire {
  if (a.blockTarget >= 0) {
    const d = sim.agents[a.blockTarget];
    if (d.engagedWith.includes(a.idx)) return STOP; // la contrainte d'engagement gère la position
    if (d.down || dist2(a.x, a.y, d.x, d.y) > 6) a.blockTarget = -1;
  }
  const qb = sim.agents[sim.qbIdx] ?? a;
  if (a.blockTarget < 0) {
    let best = -1;
    let bs = Infinity;
    for (const d of sim.agents) {
      if (d.offense || d.down) continue;
      if (d.engagedWith.length >= 2) continue;
      const dist = dist2(a.x, a.y, d.x, d.y);
      if (dist > 5.5) continue;
      const dq = dist2(d.x, d.y, qb.x, qb.y);
      const score = dist + dq * 0.25 + (d.engagedWith.length + targetedBy(sim, d, a)) * 2.5;
      if (score < bs) {
        bs = score;
        best = d.idx;
      }
    }
    a.blockTarget = best;
  }
  if (a.blockTarget >= 0) {
    const d = sim.agents[a.blockTarget];
    if (sim.tryEngage(a, d)) return STOP;
    // se placer entre le rusher et le QB
    const tx = d.x + (qb.x - d.x) * 0.3;
    const ty = d.y + (qb.y - d.y) * 0.3;
    return seek(a, tx, ty, 0.95, 0.3);
  }
  const anc = anchorOf(sim, a);
  return seek(a, anc.x, anc.y, 0.5);
}

function holdBlock(sim: PlaySim, a: Agent): Desire {
  for (const d of sim.agents) {
    if (d.offense === a.offense || d.down) continue;
    if (dist2(a.x, a.y, d.x, d.y) < 1.4 && sim.tryEngage(a, d)) return STOP;
  }
  return STOP;
}

function screenRelease(sim: PlaySim, a: Agent): Desire {
  const rb = sim.agents.find((x) => x.offense && x.slot === 'RB');
  if (!rb) return passBlock(sim, a);
  const c = sim.carrier();
  if (c && c.idx === rb.idx) return escort(sim, a, rb);
  const p = sim.toPlay(rb.x, rb.y);
  const w = sim.toWorld(p.down + 3, p.lat + Math.sign(p.lat || 1) * 1.5 + (a.slot === 'C' ? -2 : a.slot === 'LG' ? -4 : 0));
  return seek(a, w.x, w.y, 0.9);
}

function runBlockThink(sim: PlaySim, a: Agent, carrier: Agent): Desire {
  const as = a.offAssign;
  if (as?.kind === 'qb') {
    // fausse feinte (bootleg) après la remise
    const p = sim.toPlay(a.x, a.y);
    const w = sim.toWorld(p.down - 0.5, p.lat - Math.sign(sim.setup.offPlay?.runAim?.lat ?? 1) * 3);
    return seek(a, w.x, w.y, 0.5);
  }
  if (as?.kind === 'route') return runRoute(sim, a);
  if (as?.kind === 'carry') {
    // porteur désigné avant la remise : course vers le point visé
    const aim = sim.setup.offPlay?.runAim;
    if (aim) {
      const p = sim.toPlay(a.x, a.y);
      const w = sim.toWorld(Math.min(aim.down, p.down + 3), aim.lat);
      const d = seek(a, w.x, w.y, 0.9, 0.3);
      return d;
    }
  }
  if (a.blockTarget >= 0) {
    const d = sim.agents[a.blockTarget];
    if (d.engagedWith.includes(a.idx)) return STOP;
    if (d.down) a.blockTarget = -1;
  }
  const lead = as?.kind === 'lead';
  const ap = sim.toPlay(a.x, a.y);
  if (a.blockTarget < 0) {
    let best = -1;
    let bs = Infinity;
    for (const d of sim.agents) {
      if (d.offense || d.down || d.engagedWith.length >= 2) continue;
      const dp = sim.toPlay(d.x, d.y);
      const ahead = dp.down - ap.down;
      if (ahead < -1.5) continue;
      const lat = Math.abs(dp.lat - ap.lat);
      const isWide = a.pos === 'WR';
      if (!isWide && !lead && lat > 4.5) continue;
      const dist = dist2(a.x, a.y, d.x, d.y);
      if (dist > (isWide ? 12 : lead ? 9 : 7)) continue;
      const score = dist + (d.engagedWith.length + targetedBy(sim, d, a)) * 4 + (lead ? dist2(d.x, d.y, carrier.x, carrier.y) * 0.5 : 0);
      if (score < bs) {
        bs = score;
        best = d.idx;
      }
    }
    a.blockTarget = best;
  }
  if (a.blockTarget >= 0) {
    const d = sim.agents[a.blockTarget];
    if (sim.tryEngage(a, d)) return STOP;
    const r = seek(a, d.x - (d.x - carrier.x) * 0.15, d.y - (d.y - carrier.y) * 0.15, 1, 0.2);
    r[2] = true;
    return r;
  }
  if (lead) {
    const aim = sim.setup.offPlay?.runAim;
    if (aim) {
      const w = sim.toWorld(aim.down + 1, aim.lat);
      return seek(a, w.x, w.y, 1);
    }
  }
  const w = sim.toWorld(ap.down + 2, ap.lat);
  return seek(a, w.x, w.y, 0.6);
}

/** Bloc d'escorte en terrain ouvert (après réception, retour, turnover). */
function escort(sim: PlaySim, a: Agent, carrier: Agent): Desire {
  if (a.blockTarget >= 0) {
    const d = sim.agents[a.blockTarget];
    if (d.engagedWith.includes(a.idx)) return STOP;
    if (d.down || dist2(d.x, d.y, carrier.x, carrier.y) > 18) a.blockTarget = -1;
  }
  if (a.blockTarget < 0) {
    let best = -1;
    let bs = Infinity;
    for (const d of sim.agents) {
      if (d.side === a.side || d.down || d.engagedWith.length) continue;
      const dc = dist2(d.x, d.y, carrier.x, carrier.y);
      if (dc > 16) continue;
      const da = dist2(d.x, d.y, a.x, a.y);
      const score = da + dc * 0.7 + targetedBy(sim, d, a) * 5;
      if (score < bs) {
        bs = score;
        best = d.idx;
      }
    }
    a.blockTarget = best;
  }
  if (a.blockTarget >= 0) {
    const d = sim.agents[a.blockTarget];
    if (sim.tryEngage(a, d)) return STOP;
    const tx = d.x + (carrier.x - d.x) * 0.25;
    const ty = d.y + (carrier.y - d.y) * 0.25;
    const r = seek(a, tx, ty, 1, 0.2);
    r[2] = true;
    return r;
  }
  // suivre le porteur à distance
  const cdir = carrier.side === sim.offense ? sim.dir : -sim.dir;
  return seek(a, carrier.x + 3 * cdir, clamp(a.y, 2, W - 2), 0.7);
}

// ——————————————————————————— Défense ———————————————————————————

function rush(sim: PlaySim, a: Agent, target: Agent): Desire {
  if (a.engagedWith.length) {
    const r = seek(a, target.x, target.y);
    r[2] = true;
    return r;
  }
  // contournement des bloqueurs proches
  let tx = target.x;
  let ty = target.y;
  for (const o of sim.agents) {
    if (o.side === a.side || o.down || o.idx === target.idx) continue;
    const d = dist2(o.x, o.y, a.x, a.y);
    if (d < 1.6 && o.blockTarget !== a.idx) {
      const side = (a.y - o.y) >= 0 ? 1 : -1;
      ty += side * 0.6;
    }
  }
  const r = seek(a, tx, ty, 1, 0.2);
  r[2] = true;
  return r;
}

function coverageThink(sim: PlaySim, a: Agent, qb: Agent): Desire {
  // play-action : les LB et safeties « mordent » à la feinte
  if (sim.playAction && sim.t < 1.1 && (a.pos === 'LB' || a.pos === 'SS') && a.player.attrs.awareness < 88) {
    const p = sim.toPlay(a.x, a.y);
    const w = sim.toWorld(Math.max(1.2, p.down - 2), p.lat * 0.8);
    return seek(a, w.x, w.y, 0.7);
  }
  // scramble du QB au-delà de la ligne : poursuite
  if (sim.toPlay(qb.x, qb.y).down > -0.5 && qb.idx === sim.qbIdx && sim.ball.holder === qb.idx) return pursue(sim, a, qb);
  switch (a.defAssign) {
    case 'rush':
      return rush(sim, a, qb);
    case 'man':
      return manCover(sim, a);
    case 'spy': {
      const w = sim.toWorld(Math.max(4, sim.toPlay(a.x, a.y).down), sim.toPlay(qb.x, qb.y).lat);
      return seek(a, w.x, w.y, 0.8);
    }
    default:
      return zoneCover(sim, a);
  }
}

function manCover(sim: PlaySim, a: Agent): Desire {
  const r = sim.agents[a.manTarget];
  if (!r) return zoneCover(sim, a);
  if (a.reaction > 0) {
    // lecture : recule légèrement
    const p = sim.toPlay(a.x, a.y);
    const w = sim.toWorld(p.down + 1, p.lat);
    return seek(a, w.x, w.y, 0.45);
  }
  const rp = sim.toPlay(r.x, r.y);
  const ap = sim.toPlay(a.x, a.y);
  const cushion = rp.down > 12 ? 0.8 : 1.1;
  const lead = 0.45;
  // en retard sur un receveur qui file en profondeur : effort maximal
  if (rp.down > ap.down && rp.down > 8) {
    const d = seek(a, r.x + r.vx * 0.5 + 1.5 * sim.dir, r.y + r.vy * 0.5, 1.04, 0.2);
    d[2] = true;
    return d;
  }
  const tx = r.x + r.vx * lead + cushion * sim.dir;
  const ty = r.y + r.vy * lead;
  const d = seek(a, tx, ty, 1, 0.4);
  d[2] = true;
  return d;
}

function zoneCover(sim: PlaySim, a: Agent): Desire {
  let tx = a.zoneX;
  let ty = a.zoneY;
  if (a.reaction > 0) {
    // déplacement vers la zone pendant la lecture, sans réagir aux receveurs
    return seek(a, tx, ty, 0.75);
  }
  let threat: Agent | null = null;
  let td = 9;
  for (const r of sim.agents) {
    if (!r.eligible || r.side === a.side || r.down) continue;
    const d = dist2(r.x, r.y, a.zoneX, a.zoneY);
    if (d < td) {
      td = d;
      threat = r;
    }
  }
  if (threat) {
    const deepZone = sim.toPlay(a.zoneX, a.zoneY).down > 12;
    tx = a.zoneX * 0.35 + threat.x * 0.65 + (deepZone ? 1.8 * sim.dir : 0.6 * sim.dir);
    ty = a.zoneY * 0.35 + threat.y * 0.65;
  }
  return seek(a, tx, ty, 0.95, 0.8);
}

function passInAirThink(sim: PlaySim, a: Agent): Desire {
  const b = sim.ball;
  const remaining = Math.max(0.05, b.flightTime - b.airTime);
  const target = sim.agents[b.target];
  if (a.offense === (sim.agents[b.thrower]?.offense ?? true)) {
    if (a.idx === b.target) {
      const d = seek(a, b.tx, b.ty, 1, 0.25);
      d[2] = true;
      return d;
    }
    if (a.offAssign?.kind === 'route') return runRoute(sim, a);
    return passBlock(sim, a);
  }
  // défenseur
  if (a.reaction > 0) {
    if (a.defAssign === 'man') return manCover(sim, a);
    if (a.defAssign === 'rush') return STOP;
    return zoneCover(sim, a);
  }
  const reachT = dist2(a.x, a.y, b.tx, b.ty) / a.maxSpeed;
  // en individuelle, le défenseur dos au ballon ne le repère que tardivement
  const trailing = a.defAssign === 'man' && target && a.manTarget === target.idx && remaining > 0.45;
  if (trailing && target) {
    sim.checkPassInterference(a, target);
    return pursue(sim, a, target);
  }
  if (reachT < remaining + 0.2) {
    if (target && a.defAssign === 'man' && a.manTarget === target.idx) sim.checkPassInterference(a, target);
    if (target && dist2(a.x, a.y, target.x, target.y) < 1.2) sim.checkPassInterference(a, target);
    const d = seek(a, b.tx, b.ty, 1, 0.2);
    d[2] = true;
    if (remaining < 0.35 && dist2(a.x, a.y, b.x, b.y) < 2 && a.jumpTimer <= 0 && sim.rng.chance(0.25)) a.jumpTimer = 0.5;
    return d;
  }
  if (target) return pursue(sim, a, target);
  return STOP;
}

// ——————————————————————————— Équipes spéciales ———————————————————————————

function kickoffThink(sim: PlaySim, a: Agent): Desire {
  const b = sim.ball;
  const c = sim.carrier();
  const kickingSide = sim.offense;
  if (a.side === kickingSide) {
    if (a.idx === sim.kickerIdx && !sim.kicked) return STOP;
    if (!sim.kicked) {
      // avance avec le kicker
      return sim.t > 0.45 ? seek(a, a.x + 4 * sim.dir, a.y, 0.6) : STOP;
    }
    if (c && c.side !== kickingSide) return pursue(sim, a, c);
    if (b.state === 'air') {
      // couloirs de couverture
      const ty = a.zoneY * 0.6 + b.ty * 0.4;
      const tx = b.tx - 8 * sim.dir;
      const r = seek(a, tx, ty, 1, 0.5);
      r[2] = true;
      return r;
    }
    return seek(a, b.x, b.y, 1);
  }
  // équipe qui reçoit
  if (a.idx === sim.returnerIdx && b.state === 'air') {
    const d = seek(a, b.tx, b.ty, 1, 0.3);
    d[2] = true;
    return d;
  }
  if (c && c.side === a.side) return escort(sim, a, c);
  if (c && c.side !== a.side) return pursue(sim, a, c);
  if (sim.kicked) {
    // recul vers le retourneur pour former un mur
    const ret = sim.agents[sim.returnerIdx];
    const tx = ret ? ret.x - 12 * sim.dir * (a.slot < 'KB5' ? 1 : 0.6) : a.zoneX;
    return seek(a, sim.dir > 0 ? Math.min(a.zoneX + 6, tx) : Math.max(a.zoneX - 6, tx), a.zoneY, 0.7);
  }
  return STOP;
}

function puntThink(sim: PlaySim, a: Agent): Desire | null {
  const b = sim.ball;
  const c = sim.carrier();
  if (a.offense) {
    if (a.slot === 'P') return STOP;
    const gunner = a.offAssign?.kind === 'cover';
    if (!sim.kicked) {
      if (gunner) {
        const w = sim.toWorld(sim.toPlay(a.x, a.y).down + 6, sim.toPlay(a.x, a.y).lat * 0.9);
        const r = seek(a, w.x, w.y, 1);
        r[2] = true;
        return r;
      }
      return passBlock(sim, a);
    }
    if (c && c.side !== a.side) return pursue(sim, a, c);
    if (b.state === 'air') {
      const r = seek(a, b.tx - 4 * sim.dir, b.ty + (a.y - b.ty) * 0.3, 1);
      r[2] = true;
      return r;
    }
    return seek(a, b.x, b.y, 1);
  }
  // retour de punt
  if (a.idx === sim.returnerIdx && b.state === 'air' && sim.kicked) {
    const d = seek(a, b.tx, b.ty, 1, 0.3);
    d[2] = true;
    return d;
  }
  if (c && c.side === a.side) return escort(sim, a, c);
  if (c && c.idx !== -1 && !c.offense) return null;
  if (!sim.kicked) {
    if (a.defAssign === 'rush') {
      const p = sim.agents.find((x) => x.offense && x.slot === 'P');
      if (p) return rush(sim, a, p);
    }
    return STOP;
  }
  // après le coup de pied : recul vers le retourneur
  const ret = sim.agents[sim.returnerIdx];
  if (ret) return seek(a, ret.x - 10 * sim.dir, clamp(a.y, 3, W - 3), 0.8);
  return STOP;
}
