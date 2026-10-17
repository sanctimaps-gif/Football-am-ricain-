import type { Team } from '../data/types';
import type { FacilityKind, Finance, League } from './types';

/**
 * Installations du club (rôle d'investisseur) : 5 bâtiments à 5 niveaux. Chaque niveau coûte de l'argent et des
 * diplômes, demande un temps de construction (en semaines de compétition) et a un effet réel sur les matchs ou les finances.
 */

export interface FacilityLevel {
  level: number;
  /** Coût en milliers de $. */
  cost: number;
  diplomas: number;
  weeks: number;
  /** Lignes d'effet affichées (libellé, valeur). */
  effects: [string, string][];
}

export interface FacilityDef {
  kind: FacilityKind;
  name: string;
  icon: string;
  desc: string;
  levels: FacilityLevel[];
}

export const HOME_ADVANTAGE = [0, 3, 5, 6, 7, 8]; // % par niveau de stade (index = niveau)
export const STADIUM_REVENUE = [0, 0, 20, 40, 60, 80]; // % de recettes de billetterie en plus
export const SEATS_FACTOR = [0, 1, 1.15, 1.3, 1.5, 1.75];
export const SHOP_WEEKLY = [0, 300, 600, 1000, 1500, 2200]; // milliers $ par semaine
export const MEDICAL_DAYS = [0, 0, 1, 1, 2, 2]; // semaines de blessure en moins
export const MEDICAL_KITS = [0, 0, 0.15, 0.25, 0.35, 0.5]; // chance d'obtenir une trousse après chaque match
export const TRAINING_BONUS = [0, 0, 10, 20, 35, 50]; // % de progression en plus

const L = (level: number, cost: number, diplomas: number, weeks: number, effects: [string, string][]): FacilityLevel => ({ level, cost, diplomas, weeks, effects });

export const FACILITIES: FacilityDef[] = [
  {
    kind: 'stadium', name: 'Stade', icon: '🏟️', desc: 'Avantage à domicile en match et bonus de recettes de billetterie.',
    levels: [1, 2, 3, 4, 5].map((n) => L(n, 6000 * n, 20 * n, n, [['Avantage à domicile', `${HOME_ADVANTAGE[n]} %`], ['Bonus de recettes', `${STADIUM_REVENUE[n]} %`]])),
  },
  {
    kind: 'seats', name: 'Sièges', icon: '💺', desc: 'Plus de places : plus de spectateurs et de billets vendus.',
    levels: [1, 2, 3, 4, 5].map((n) => L(n, 4000 * n, 12 * n, Math.max(1, n - 1), [['Capacité', `×${SEATS_FACTOR[n].toFixed(2)}`]])),
  },
  {
    kind: 'shop', name: 'Boutique du club', icon: '🛍️', desc: 'Produits dérivés : revenu chaque semaine de compétition.',
    levels: [1, 2, 3, 4, 5].map((n) => L(n, 3000 * n, 10 * n, Math.max(1, n - 1), [['Revenu par semaine', `${SHOP_WEEKLY[n]} k$`]])),
  },
  {
    kind: 'medical', name: 'Infirmerie', icon: '🩺', desc: 'Blessures plus courtes et trousses de secours après les matchs.',
    levels: [1, 2, 3, 4, 5].map((n) => L(n, 3500 * n, 15 * n, n, [['Blessures', MEDICAL_DAYS[n] ? `−${MEDICAL_DAYS[n]} sem.` : 'normales'], ['Trousse après match', `${Math.round(MEDICAL_KITS[n] * 100)} %`]])),
  },
  {
    kind: 'training', name: 'Entraînement', icon: '🏋️', desc: 'Les joueurs progressent plus vite à l’intersaison.',
    levels: [1, 2, 3, 4, 5].map((n) => L(n, 4500 * n, 18 * n, n, [['Progression', `+${TRAINING_BONUS[n]} %`]])),
  },
];

export const facilityDef = (k: FacilityKind): FacilityDef => FACILITIES.find((f) => f.kind === k)!;

/** Niveau actuel (les anciennes sauvegardes n'ont ni sièges ni boutique : niveau 1). */
export function facilityLevel(f: Finance | undefined, k: FacilityKind): number {
  if (!f) return 1;
  const v = f.facilities[k];
  return typeof v === 'number' && v >= 1 ? Math.min(5, Math.floor(v)) : 1;
}

export const diplomas = (f: Finance): number => f.diplomas ?? 0;
export const kits = (f: Finance): number => f.kits ?? 0;

export type BuildResult = { ok: true; message: string } | { ok: false; reason: string };

/** Lance la construction du niveau suivant d'un bâtiment (une seule construction à la fois). */
export function startBuilding(l: League, teamId: string, k: FacilityKind): BuildResult {
  const f = l.finances[teamId];
  if (!f) return { ok: false, reason: 'Finances indisponibles.' };
  if (f.building) return { ok: false, reason: `Une construction est déjà en cours (${facilityDef(f.building.kind).name}).` };
  const cur = facilityLevel(f, k);
  if (cur >= 5) return { ok: false, reason: 'Niveau maximum atteint.' };
  const next = facilityDef(k).levels[cur];
  if (f.cash < next.cost) return { ok: false, reason: `Il faut ${(next.cost / 1000).toFixed(1)} M$ (trésorerie insuffisante).` };
  if (diplomas(f) < next.diplomas) return { ok: false, reason: `Il faut ${next.diplomas} diplômes (vous en avez ${diplomas(f)}).` };
  f.cash -= next.cost;
  f.seasonExpenses += next.cost;
  f.diplomas = diplomas(f) - next.diplomas;
  f.building = { kind: k, level: next.level, weeksLeft: next.weeks };
  return { ok: true, message: `Construction lancée : ${facilityDef(k).name} niveau ${next.level} (${next.weeks} semaine${next.weeks > 1 ? 's' : ''}).` };
}

/** Avance les chantiers d'une semaine (appelé à chaque semaine de compétition). */
export function progressBuilding(l: League): void {
  for (const team of l.teams) {
    const f = l.finances[team.id];
    const b = f?.building;
    if (!f || !b) continue;
    b.weeksLeft--;
    if (b.weeksLeft <= 0) {
      f.facilities[b.kind] = b.level;
      f.building = null;
      if (b.kind === 'seats') team.stadium.capacity = Math.round(team.stadium.capacity * (SEATS_FACTOR[b.level] / SEATS_FACTOR[b.level - 1]));
      if (team.id === l.userTeamId) l.news.unshift(`🏗️ Construction terminée : ${facilityDef(b.kind).name} niveau ${b.level} !`);
    }
  }
}

/** Avantage à domicile (%) du stade de l'équipe qui reçoit. */
export const homeAdvantage = (l: League, homeId: string): number => HOME_ADVANTAGE[facilityLevel(l.finances[homeId], 'stadium')];

/** Copie de l'équipe dont les attributs sont légèrement relevés (avantage à domicile). */
export function withHomeAdvantage(team: Team, pct: number): Team {
  if (pct <= 0) return team;
  const k = 1 + pct / 200;
  return {
    ...team,
    roster: team.roster.map((p) => ({ ...p, attrs: Object.fromEntries(Object.entries(p.attrs).map(([a, v]) => [a, Math.min(99, Math.round(v * k))])) as unknown as typeof p.attrs })),
  };
}

/** Soigne immédiatement un joueur blessé avec une trousse de secours. */
export function useKit(l: League, teamId: string, playerId: string): BuildResult {
  const f = l.finances[teamId];
  const team = l.teams.find((t) => t.id === teamId);
  const p = team?.roster.find((x) => x.id === playerId);
  if (!f || !p) return { ok: false, reason: 'Joueur introuvable.' };
  if (p.injuryWeeks <= 0) return { ok: false, reason: 'Ce joueur n’est pas blessé.' };
  if (kits(f) <= 0) return { ok: false, reason: 'Aucune trousse de secours.' };
  f.kits = kits(f) - 1;
  p.injuryWeeks = 0;
  return { ok: true, message: `${p.firstName} ${p.lastName} est soigné et disponible.` };
}

export interface MatchRewards {
  cash: number;
  diplomas: number;
  kits: number;
}

/** Récompenses d'un match joué ou simulé par l'utilisateur (argent déjà encaissé via la billetterie). */
export function grantMatchRewards(l: League, teamId: string, cashBefore: number, result: 'win' | 'tie' | 'loss', seed: number): MatchRewards {
  const f = l.finances[teamId];
  if (!f) return { cash: 0, diplomas: 0, kits: 0 };
  // prime de match (versée à domicile comme à l'extérieur, en plus de la billetterie à domicile)
  const prize = result === 'win' ? 800 : result === 'tie' ? 400 : 200;
  f.cash += prize;
  f.seasonRevenue += prize;
  const dip = result === 'win' ? 35 : result === 'tie' ? 22 : 14;
  f.diplomas = diplomas(f) + dip;
  const chance = MEDICAL_KITS[facilityLevel(f, 'medical')] + (result === 'win' ? 0.15 : 0.05);
  const r = ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1;
  const kit = r < chance ? 1 : 0;
  f.kits = kits(f) + kit;
  return { cash: Math.round(f.cash - cashBefore), diplomas: dip, kits: kit };
}
