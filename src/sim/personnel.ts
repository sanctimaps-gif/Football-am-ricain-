import { overallFor } from '../data/ratings';
import type { DefSlot, FormationSlot } from '../data/playbook';
import type { Player, Position, Team } from '../data/types';

/** Postes de remplacement si la profondeur est insuffisante. */
const FALLBACK: Record<Position, Position[]> = {
  QB: ['RB', 'WR'], RB: ['FB', 'WR', 'CB'], FB: ['RB', 'TE', 'LB'], WR: ['TE', 'RB', 'CB'], TE: ['FB', 'OT', 'WR'],
  C: ['OG', 'OT'], OG: ['C', 'OT', 'DT'], OT: ['OG', 'C', 'DE'], DE: ['DT', 'LB'], DT: ['DE', 'OG'],
  LB: ['SS', 'DE', 'FB'], CB: ['FS', 'SS', 'WR'], FS: ['SS', 'CB'], SS: ['FS', 'LB', 'CB'], K: ['P'], P: ['K'],
};

export function availableAt(team: Team, pos: Position): Player[] {
  const byId = new Map(team.roster.map((p) => [p.id, p]));
  const ordered = (team.depth[pos] ?? []).map((id) => byId.get(id)).filter((p): p is Player => !!p && p.injuryWeeks <= 0);
  // joueurs du poste absents de la profondeur (sécurité)
  for (const p of team.roster) if (p.position === pos && p.injuryWeeks <= 0 && !ordered.includes(p)) ordered.push(p);
  return ordered;
}

/**
 * Choisit les joueurs d'une formation selon la profondeur de poste.
 * Garantit 11 joueurs distincts tant que l'effectif le permet.
 */
export function selectPersonnel(team: Team, slots: (FormationSlot | DefSlot)[]): Map<string, Player> {
  const used = new Set<string>();
  const out = new Map<string, Player>();
  // traiter d'abord les slots avec depthIndex explicite faible pour respecter l'ordre
  const order = slots.map((s, i) => ({ s, i })).sort((a, b) => (a.s.depthIndex ?? 0) - (b.s.depthIndex ?? 0));
  for (const { s } of order) {
    const pick = pickFor(team, s.pos, s.depthIndex ?? 0, used);
    if (pick) {
      used.add(pick.id);
      out.set(s.slot, pick);
    }
  }
  return out;
}

function pickFor(team: Team, pos: Position, depthIndex: number, used: Set<string>): Player | null {
  const all = availableAt(team, pos);
  let cand: Player | undefined = all[depthIndex];
  if (!cand || used.has(cand.id)) cand = all.find((p) => !used.has(p.id));
  if (cand) return cand;
  for (const alt of FALLBACK[pos]) {
    const list = availableAt(team, alt).filter((p) => !used.has(p.id));
    if (list.length) return list[list.length - 1];
  }
  const any = team.roster.filter((p) => !used.has(p.id) && p.injuryWeeks <= 0).sort((a, b) => overallFor(b.attrs, pos) - overallFor(a.attrs, pos));
  return any[0] ?? null;
}

/** Équipe de coup d'envoi : kicker + 10 joueurs rapides de rotation. */
export function kickoffCoverage(team: Team): Map<string, Player> {
  const out = new Map<string, Player>();
  const used = new Set<string>();
  const k = availableAt(team, 'K')[0] ?? availableAt(team, 'P')[0] ?? team.roster[0];
  out.set('K', k);
  used.add(k.id);
  const pool = team.roster
    .filter((p) => !used.has(p.id) && p.injuryWeeks <= 0 && ['LB', 'SS', 'FS', 'CB', 'WR', 'RB', 'TE', 'FB'].includes(p.position))
    .sort((a, b) => b.attrs.speed + b.attrs.tackling - (a.attrs.speed + a.attrs.tackling));
  // privilégier les remplaçants (rotation) : on saute les meilleurs titulaires
  const picks = pool.slice(2, 12).length >= 10 ? pool.slice(2, 12) : pool.slice(0, 10);
  picks.forEach((p, i) => out.set(`KC${i}`, p));
  return out;
}

export function kickReturnUnit(team: Team): Map<string, Player> {
  const out = new Map<string, Player>();
  const used = new Set<string>();
  const returners = team.roster
    .filter((p) => p.injuryWeeks <= 0 && ['RB', 'WR', 'CB'].includes(p.position))
    .sort((a, b) => b.attrs.speed + b.attrs.agility + b.attrs.catching * 0.5 - (a.attrs.speed + a.attrs.agility + a.attrs.catching * 0.5));
  const kr = returners[0] ?? team.roster[0];
  out.set('KR', kr);
  used.add(kr.id);
  const blockers = team.roster
    .filter((p) => !used.has(p.id) && p.injuryWeeks <= 0 && ['LB', 'TE', 'FB', 'SS', 'RB', 'WR', 'DE', 'CB'].includes(p.position))
    .sort((a, b) => b.attrs.blocking + b.attrs.strength - (a.attrs.blocking + a.attrs.strength));
  blockers.slice(0, 10).forEach((p, i) => out.set(`KB${i}`, p));
  return out;
}
