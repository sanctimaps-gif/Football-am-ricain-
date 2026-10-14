import { Rng } from '../core/rng';
import { buildDepthChart, generateAttributes, salaryFor } from '../data/generator';
import { overall } from '../data/ratings';
import { fullName, type Attributes, type Player, type Position } from '../data/types';
import { createLeague, teamById } from './league';
import { growthAttrs } from './offseason';
import type { CareerGoal, League } from './types';

export interface CreatedPlayer {
  firstName: string;
  lastName: string;
  position: Position;
  number: number;
  skinTone: number;
  heightCm: number;
  visor: boolean;
}

export const CAREER_POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'LB', 'CB', 'SS', 'DE'];

export function goalsFor(pos: Position, weeks: number): CareerGoal[] {
  const k = weeks / 10;
  switch (pos) {
    case 'QB': return [{ key: 'yards', target: Math.round(1600 * k), progress: 0 }, { key: 'tds', target: Math.round(12 * k), progress: 0 }];
    case 'RB': return [{ key: 'yards', target: Math.round(500 * k), progress: 0 }, { key: 'tds', target: Math.round(5 * k), progress: 0 }];
    case 'WR': case 'TE': return [{ key: 'catches', target: Math.round(30 * k), progress: 0 }, { key: 'yards', target: Math.round(400 * k), progress: 0 }];
    case 'CB': case 'SS': return [{ key: 'tackles', target: Math.round(30 * k), progress: 0 }, { key: 'ints', target: Math.round(2 * k), progress: 0 }];
    default: return [{ key: 'tackles', target: Math.round(40 * k), progress: 0 }, { key: 'starts', target: weeks, progress: 0 }];
  }
}

/**
 * Création d'une carrière : le joueur créé passe par la draft (rang selon ses notes) puis rejoint une équipe.
 * Il est verrouillé comme joueur contrôlé pendant les matchs (voir MatchController.lockedPlayerId).
 */
export function createPlayerCareer(cp: CreatedPlayer, seed = Date.now() >>> 0): League {
  const rng = new Rng(seed);
  // équipe : sélection par draft (les équipes faibles choisissent en premier)
  const l = createLeague({ mode: 'playerCareer', userTeamId: 'lyn', seed });
  const attrs: Attributes = generateAttributes(rng, cp.position, 0.86);
  const player: Player = {
    id: 'career-player',
    firstName: cp.firstName || 'Alex',
    lastName: cp.lastName || 'Rookie',
    position: cp.position,
    number: cp.number,
    age: 21,
    attrs,
    potential: 92,
    contract: { salary: Math.max(900, Math.round(salaryFor(overall({ attrs, position: cp.position } as Player), cp.position) * 0.5)), years: 4 },
    appearance: { skinTone: cp.skinTone, heightCm: cp.heightCm, weightKg: 100, visor: cp.visor },
    injuryWeeks: 0,
    xp: 0,
    history: [],
    isUserCreated: true,
  };
  const ovr = overall(player);
  const round = ovr >= 72 ? 1 : ovr >= 66 ? 2 : 3;
  const ranked = [...l.teams].sort((a, b) => a.roster.reduce((s, p) => s + overall(p), 0) - b.roster.reduce((s, p) => s + overall(p), 0));
  const pickIdx = rng.int(0, Math.min(ranked.length - 1, 7));
  const team = ranked[pickIdx];
  // place libre dans l'effectif et numéro unique
  const sameNum = team.roster.find((p) => p.number === player.number);
  if (sameNum) sameNum.number = ((sameNum.number + 50) % 99) + 1;
  team.roster.push(player);
  team.depth = buildDepthChart(team.roster);
  l.userTeamId = team.id;
  l.career = { playerId: player.id, skillPoints: 0, trainedWeek: 0, goals: goalsFor(cp.position, l.weeks), awards: [], draft: { round, pick: pickIdx + 1, teamId: team.id } };
  l.news.unshift(`🎓 Draft : ${team.city} ${team.name} choisit ${fullName(player)} au tour ${round} (choix n°${pickIdx + 1}).`);
  return l;
}

export function careerPlayer(l: League): Player | null {
  if (!l.career) return null;
  for (const t of l.teams) {
    const p = t.roster.find((x) => x.id === l.career!.playerId);
    if (p) return p;
  }
  return null;
}

/** Rang du joueur dans la profondeur de poste (0 = titulaire). */
export function depthRank(l: League): number {
  const p = careerPlayer(l);
  if (!p) return -1;
  const t = teamById(l, l.userTeamId);
  return (t.depth[p.position] ?? []).indexOf(p.id);
}

export type TrainingFocus = 'physique' | 'technique' | 'mental';

/** Entraînement hebdomadaire : une séance par semaine, gain selon le focus. */
export function train(l: League, focus: TrainingFocus): string {
  const p = careerPlayer(l);
  if (!p || !l.career) return 'Aucun joueur.';
  if (l.career.trainedWeek === l.week + l.season * 100) return 'Séance déjà effectuée cette semaine.';
  l.career.trainedWeek = l.week + l.season * 100;
  const keys: (keyof Attributes)[] = focus === 'physique' ? ['speed', 'acceleration', 'strength', 'stamina'] : focus === 'mental' ? ['awareness'] : growthAttrs(p.position);
  const rng = new Rng(l.seed + l.week * 7 + l.season);
  const k = rng.pick(keys);
  const gain = overall(p) < p.potential ? rng.int(1, 2) : 0;
  p.attrs[k] = Math.min(99, p.attrs[k] + gain);
  p.xp += 15;
  return gain ? `Entraînement ${focus} : +${gain} ${k}.` : 'Votre joueur a atteint son potentiel actuel.';
}

/** Après un match : progression des objectifs, points de compétence, promotion dans la profondeur. */
export function updateCareerAfterGame(l: League): string[] {
  const p = careerPlayer(l);
  const c = l.career;
  if (!p || !c) return [];
  const s = l.seasonStats[p.id];
  const msgs: string[] = [];
  for (const g of c.goals) {
    const before = g.progress;
    if (!s) continue;
    g.progress = g.key === 'yards' ? s.passYds + s.rushYds + s.recYds : g.key === 'tds' ? s.passTD + s.rushTD + s.recTD : g.key === 'tackles' ? s.tackles : g.key === 'catches' ? s.rec : g.key === 'ints' ? s.ints : g.key === 'fg' ? s.fgm : s.games;
    if (before < g.target && g.progress >= g.target) {
      c.skillPoints += 3;
      msgs.push(`🎯 Objectif atteint (${g.key}) : +3 points de compétence.`);
    }
  }
  // l'expérience de match convertie en points de compétence
  while (p.xp >= 60) {
    p.xp -= 60;
    c.skillPoints++;
  }
  // promotion : si le joueur est meilleur que le titulaire, l'entraîneur le titularise
  const t = teamById(l, l.userTeamId);
  const depth = t.depth[p.position] ?? [];
  const idx = depth.indexOf(p.id);
  if (idx > 0) {
    const starter = t.roster.find((x) => x.id === depth[idx - 1]);
    if (starter && overall(p) >= overall(starter) - 1) {
      depth.splice(idx, 1);
      depth.splice(idx - 1, 0, p.id);
      msgs.push(`⬆️ Vous montez dans la hiérarchie : ${idx === 1 ? 'titulaire !' : `n°${idx} au poste`}.`);
    }
  }
  return msgs;
}

export function spendSkillPoint(l: League, attr: keyof Attributes): boolean {
  const p = careerPlayer(l);
  if (!p || !l.career || l.career.skillPoints <= 0 || p.attrs[attr] >= 99) return false;
  p.attrs[attr]++;
  l.career.skillPoints--;
  return true;
}

/** Récompenses de fin de saison pour le joueur de carrière. */
export function careerAwards(l: League): string[] {
  const p = careerPlayer(l);
  if (!p || !l.career) return [];
  const out: string[] = [];
  const s = l.seasonStats[p.id];
  const mvp = l.history[0]?.mvp;
  if (mvp?.id === p.id) out.push(`MVP saison ${l.season}`);
  if (l.champion === l.userTeamId) out.push(`Champion saison ${l.season}`);
  if (s && l.career.goals.every((g) => g.progress >= g.target)) out.push(`Pro Bowl saison ${l.season}`);
  if (l.season === 1 && s && s.games >= Math.ceil(l.weeks / 2)) out.push('Rookie de l’année (nominé)');
  l.career.awards.push(...out);
  l.career.goals = goalsFor(p.position, l.weeks);
  return out;
}
