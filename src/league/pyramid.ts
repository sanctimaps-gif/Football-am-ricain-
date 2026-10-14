import { Rng, hashString } from '../core/rng';
import { buildDepthChart, generateRoster, teamFromTemplate } from '../data/generator';
import { overall } from '../data/ratings';
import type { TeamTemplate } from '../data/teams';
import { fullName, type Player, type Team } from '../data/types';
import { ALL_CLUBS, displayName, generateClubTemplate, leagueDef } from '../data/world';
import { createLeague, defaultFinance, standings } from './league';
import { DEFAULT_GAMEPLAN } from '../ai/playcaller';
import { generateTransferList } from './transfers';
import { DIVISIONS, DIVISION_SIZE, type DivisionLevel, type League } from './types';

export interface ClubCareerOptions {
  leagueId: string;
  clubId: string;
  /** Joueurs conservés de l'effectif d'origine (3 au maximum). */
  keepIds: string[];
  seed?: number;
  weeks?: number;
  quarterMinutes?: number;
  coachName?: string;
}

export const KEEP_PLAYERS = 3;
/** Niveau des effectifs générés par division (avant resserrement des écarts, voir teamFromTemplate). */
const TIER_RANGE: Record<DivisionLevel, [number, number]> = { 1: [0.9, 0.96], 2: [0.78, 0.85], 3: [0.66, 0.74] };

/** Effectif d'origine d'un club, pour choisir les joueurs conservés. */
export function originalSquad(clubId: string, seed = 1): Player[] {
  const tpl = ALL_CLUBS.find((t) => t.id === clubId);
  if (!tpl) throw new Error(`Club inconnu ${clubId}`);
  return [...teamFromTemplate(tpl, seed).roster].sort((a, b) => overall(b) - overall(a));
}

function freshTeam(tpl: TeamTemplate, seed: number, suffix: string): Team {
  const t = teamFromTemplate(tpl, seed);
  for (const p of t.roster) p.id = `${p.id}${suffix}`;
  t.depth = buildDepthChart(t.roster);
  return t;
}

/**
 * Carrière de club : le club choisi repart de la troisième division avec seulement 3 joueurs de son effectif ;
 * les autres places sont prises par des joueurs générés. Les 4 premiers montent, jusqu'à la première division.
 */
export function createClubCareer(o: ClubCareerOptions): League {
  const seed = o.seed ?? (Date.now() >>> 0);
  const rng = new Rng(seed);
  const def = leagueDef(o.leagueId);
  const clubTpl = def.teams.find((t) => t.id === o.clubId);
  if (!clubTpl) throw new Error(`Club ${o.clubId} absent de ${def.name}`);
  const taken = new Set<string>(ALL_CLUBS.map((t) => t.id));
  for (const t of def.teams) taken.add(`city:${t.city}`);
  const tier = (lvl: DivisionLevel) => rng.range(...TIER_RANGE[lvl]);

  // première division : les meilleurs clubs de la ligue (complétée par des clubs générés si la ligue est petite)
  const d1: TeamTemplate[] = def.teams.filter((t) => t.id !== clubTpl.id).sort((a, b) => b.tier - a.tier).slice(0, DIVISION_SIZE);
  while (d1.length < DIVISION_SIZE) d1.push(generateClubTemplate(def.id, seed + d1.length * 7919, tier(1), taken));
  const d2 = Array.from({ length: DIVISION_SIZE }, (_, i) => generateClubTemplate(def.id, seed + 1000 + i * 104729, tier(2), taken));
  const d3 = Array.from({ length: DIVISION_SIZE - 1 }, (_, i) => generateClubTemplate(def.id, seed + 5000 + i * 15485863, tier(3), taken));

  // le club de l'utilisateur : identité d'origine, effectif reconstruit
  const user = teamFromTemplate({ ...clubTpl, tier: 0.78 }, seed);
  user.roster = generateRoster(clubTpl.id, seed ^ 0x5bd1e995, 0.85);
  const squad = originalSquad(clubTpl.id, 1);
  const kept = o.keepIds.slice(0, KEEP_PLAYERS).map((id) => squad.find((p) => p.id === id)).filter((p): p is Player => !!p);
  for (const p of kept) {
    // remplace le joueur généré le plus faible au même poste
    const same = user.roster.filter((x) => x.position === p.position).sort((a, b) => overall(a) - overall(b))[0];
    if (same) user.roster.splice(user.roster.indexOf(same), 1);
    const used = new Set(user.roster.map((x) => x.number));
    while (used.has(p.number)) p.number = (p.number % 99) + 1;
    // contrat de fidélité : le joueur accepte de suivre le club en divisions inférieures
    p.contract = { salary: Math.max(750, Math.round(p.contract.salary * 0.5 / 10) * 10), years: Math.max(3, p.contract.years) };
    p.id = `${p.id}-keep`;
    user.roster.push(p);
  }
  user.depth = buildDepthChart(user.roster);

  const active = [user, ...d3.map((t) => freshTeam(t, seed, 's1'))];
  active.forEach((t, i) => (t.conference = (i % 2) as 0 | 1));
  const l = createLeague({
    mode: 'club', userTeamId: user.id, teams: active, seed, weeks: o.weeks ?? DIVISION_SIZE - 1, playoffTeams: 2,
    quarterMinutes: o.quarterMinutes, name: def.name, coachName: o.coachName,
  });
  l.leagueId = def.id;
  l.conferenceNames = def.conferenceNames;
  const templates: Record<string, TeamTemplate> = {};
  for (const t of [...d1, ...d2, ...d3, clubTpl]) templates[t.id] = t;
  l.pyramid = {
    leagueId: def.id,
    level: 3,
    members: { 1: d1.map((t) => t.id), 2: d2.map((t) => t.id), 3: active.map((t) => t.id) },
    templates,
    log: [],
  };
  l.finances[user.id].cash = 25000;
  l.finances[user.id].fanSupport = 70;
  for (const t of active) if (t.id !== user.id) l.finances[t.id].cash = 15000;
  l.transferList = generateTransferList(l);
  l.news.unshift(`🏁 ${displayName(user)} repart de la ${DIVISIONS[3].name} : ${kept.length ? `${kept.map(fullName).join(', ')} ${kept.length > 1 ? 'restent' : 'reste'} au club.` : 'effectif entièrement renouvelé.'} Objectif : le top ${DIVISIONS[3].promote} pour monter.`);
  return l;
}

/** Objectif de la saison selon la division. */
export function divisionObjective(level: DivisionLevel): string {
  const d = DIVISIONS[level];
  if (level === 1) return `Gagner le titre (top 4 pour les playoffs) · éviter les ${d.relegate} dernières places`;
  return `Finir dans le top ${d.promote} pour monter${d.relegate ? ` · éviter les ${d.relegate} dernières places` : ''}`;
}

/** Zone d'un rang dans le classement de la division active. */
export function rankZone(l: League, rank: number): 'up' | 'down' | 'title' | null {
  if (!l.pyramid) return null;
  const d = DIVISIONS[l.pyramid.level];
  if (d.playoffs && rank < 4) return 'title';
  if (rank < d.promote) return 'up';
  if (d.relegate && rank >= l.teams.length - d.relegate) return 'down';
  return null;
}

/**
 * Fin de saison de la pyramide : montées et relégations dans toutes les divisions.
 * Les divisions non jouées sont classées selon le niveau des clubs, avec une part d'aléatoire.
 * À appeler avant la génération du nouveau calendrier.
 */
export function applyPromotions(l: League): string[] {
  const p = l.pyramid;
  if (!p) return [];
  const rng = new Rng(l.seed + l.season * 271);
  const order: Record<DivisionLevel, string[]> = { 1: [], 2: [], 3: [] };
  for (const lvl of [1, 2, 3] as DivisionLevel[]) {
    if (lvl === p.level) order[lvl] = standings(l).map((r) => r.teamId);
    else order[lvl] = [...p.members[lvl]].map((id) => ({ id, v: (p.templates[id]?.tier ?? 0.8) + rng.normal(0, 0.035) })).sort((a, b) => b.v - a.v).map((x) => x.id);
  }
  const next: Record<DivisionLevel, string[]> = { 1: [], 2: [], 3: [] };
  for (const lvl of [1, 2, 3] as DivisionLevel[]) {
    const d = DIVISIONS[lvl];
    const ids = order[lvl];
    const up = lvl > 1 ? ids.slice(0, d.promote) : [];
    const down = lvl < 3 ? ids.slice(ids.length - d.relegate) : [];
    next[lvl].push(...ids.filter((id) => !up.includes(id) && !down.includes(id)));
    if (up.length) next[(lvl - 1) as DivisionLevel].push(...up);
    if (down.length) next[(lvl + 1) as DivisionLevel].push(...down);
  }
  const oldLevel = p.level;
  const rank = order[oldLevel].indexOf(l.userTeamId);
  const newLevel = ([1, 2, 3] as DivisionLevel[]).find((lvl) => next[lvl].includes(l.userTeamId))!;
  const moved = newLevel < oldLevel ? 'up' : newLevel > oldLevel ? 'down' : 'stay';
  p.log.push({ season: l.season, level: oldLevel, rank: rank + 1, moved });
  const msgs: string[] = [];
  if (moved === 'up') msgs.push(`⬆️ PROMOTION ! Votre club monte en ${DIVISIONS[newLevel].name}.`);
  else if (moved === 'down') msgs.push(`⬇️ Relégation en ${DIVISIONS[newLevel].name}.`);
  else msgs.push(`Votre club reste en ${DIVISIONS[newLevel].name} (${rank + 1}e).`);
  p.members = next;
  p.level = newLevel;

  // reconstitution de la division active : les équipes qui partent redeviennent des modèles, les arrivantes sont générées
  const keep = new Set(next[newLevel]);
  const leaving = l.teams.filter((t) => !keep.has(t.id));
  for (const t of leaving) {
    if (!p.templates[t.id]) p.templates[t.id] = { id: t.id, city: t.city, name: t.name, abbr: t.abbr, conference: t.conference, primary: t.colors.primary, secondary: t.colors.secondary, accent: t.colors.accent, logoShape: t.logo.shape, glyph: t.logo.glyph, stadium: t.stadium.name, capacity: t.stadium.capacity, tier: 0.85 };
    delete l.finances[t.id];
    delete l.plans[t.id];
  }
  const stay = l.teams.filter((t) => keep.has(t.id));
  const present = new Set(stay.map((t) => t.id));
  const arriving = next[newLevel].filter((id) => !present.has(id)).map((id) => freshTeam(p.templates[id], l.seed + hashString(id), `s${l.season + 1}`));
  l.teams = [...stay, ...arriving];
  l.teams.forEach((t, i) => (t.conference = (i % 2) as 0 | 1));
  for (const t of arriving) {
    l.finances[t.id] = defaultFinance(t);
    l.finances[t.id].cash = newLevel === 1 ? 60000 : 25000;
    l.plans[t.id] = { ...DEFAULT_GAMEPLAN };
  }
  return msgs;
}
