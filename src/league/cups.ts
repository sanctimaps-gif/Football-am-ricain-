import { Rng } from '../core/rng';
import { teamFromTemplate } from '../data/generator';
import type { TeamTemplate } from '../data/teams';
import { ALL_CLUBS, LEAGUES, leagueDef, NATIONS } from '../data/world';
import { pow2Floor, seededKnockout } from './knockout';
import { createLeague } from './league';
import { roundRobin, type ScheduledGame } from './schedule';
import type { League } from './types';

/** Coupes et tournois : élimination directe, éventuellement précédée d'une phase de groupes de 4. */
export interface CupDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  kind: 'clubs' | 'nations';
  /** Nombre de participants (puissance de 2). */
  size: 8 | 16;
  groups: 0 | 2 | 4;
  /** Équipes éligibles (l'utilisateur peut en choisir n'importe laquelle). */
  pool: () => TeamTemplate[];
  /** Ligue de la coupe nationale (choisie par l'utilisateur). */
  national?: boolean;
}

const EUROPEAN_FRA = ['lyn', 'mar', 'bdx', 'lil', 'tls', 'nts', 'nce', 'str', 'bru', 'gva', 'ren'];
const AFRICAN_FRA = ['dkr', 'abj', 'cas'];
const NA_FRA = ['mtl', 'qbc'];
const byIds = (ids: string[]) => ALL_CLUBS.filter((t) => ids.includes(t.id));
const nations = (ids: string[]) => NATIONS.filter((t) => ids.includes(t.abbr));

export const CUPS: CupDef[] = [
  { id: 'national', name: 'Coupe nationale', icon: '🏆', desc: 'Les clubs d’une ligue en élimination directe.', kind: 'clubs', size: 16, groups: 0, national: true, pool: () => [] },
  { id: 'champions', name: 'Coupe des Champions', icon: '🌐', desc: 'Les 16 meilleurs clubs du monde : groupes puis phase finale.', kind: 'clubs', size: 16, groups: 4, pool: () => ALL_CLUBS },
  { id: 'europe', name: 'Coupe d’Europe des clubs', icon: '🇪🇺', desc: 'Clubs européens : 4 groupes de 4, quarts, demies, finale.', kind: 'clubs', size: 16, groups: 4, pool: () => [...leagueDef('eur').teams, ...byIds(EUROPEAN_FRA)] },
  { id: 'northam', name: 'Coupe d’Amérique du Nord', icon: '🦅', desc: 'Clubs des États-Unis et du Canada.', kind: 'clubs', size: 16, groups: 4, pool: () => [...leagueDef('usa').teams, ...leagueDef('can').teams, ...byIds(NA_FRA)] },
  { id: 'latina', name: 'Copa Latina', icon: '🌎', desc: 'Les clubs d’Amérique latine en élimination directe.', kind: 'clubs', size: 8, groups: 0, pool: () => leagueDef('lat').teams },
  { id: 'africa', name: 'Coupe d’Afrique des clubs', icon: '🌍', desc: 'Les meilleurs clubs africains en élimination directe.', kind: 'clubs', size: 8, groups: 0, pool: () => [...leagueDef('afr').teams, ...byIds(AFRICAN_FRA)] },
  { id: 'asia', name: 'Coupe d’Asie-Pacifique', icon: '🌏', desc: 'Les clubs d’Asie et d’Océanie en élimination directe.', kind: 'clubs', size: 8, groups: 0, pool: () => leagueDef('asi').teams },
  { id: 'nations', name: 'Coupe des Nations', icon: '🌍', desc: '16 sélections nationales : groupes puis phase finale.', kind: 'nations', size: 16, groups: 4, pool: () => NATIONS },
  { id: 'nationsEu', name: 'Ligue des Nations européenne', icon: '🇪🇺', desc: '8 sélections européennes : 2 groupes, demies, finale.', kind: 'nations', size: 8, groups: 2, pool: () => nations(['GER', 'AUT', 'GBR', 'FRA', 'FIN', 'ITA', 'SWE', 'ESP', 'NED']) },
  { id: 'goldBowl', name: 'Gold Bowl des Amériques et du Pacifique', icon: '🥇', desc: '8 sélections : 2 groupes, demies, finale.', kind: 'nations', size: 8, groups: 2, pool: () => nations(['USA', 'CAN', 'MEX', 'BRA', 'JPN', 'AUS', 'KOR', 'GBR']) },
];

export const cupDef = (id: string): CupDef => CUPS.find((c) => c.id === id) ?? CUPS[0];

/** Participants d'une coupe : l'équipe de l'utilisateur + les meilleures équipes éligibles. */
export function cupEntrants(def: CupDef, userTeamId: string, leagueId?: string): TeamTemplate[] {
  const pool = def.national ? leagueDef(leagueId ?? 'usa').teams : def.pool();
  const size = def.national ? Math.min(16, pow2Floor(pool.length)) : def.size;
  const user = pool.find((t) => t.id === userTeamId) ?? [...ALL_CLUBS, ...NATIONS].find((t) => t.id === userTeamId);
  if (!user) throw new Error(`Équipe inconnue ${userTeamId}`);
  // Coupe des Champions : quotas par ligue pour représenter toutes les régions
  let ranked: TeamTemplate[];
  if (def.id === 'champions') {
    const quota: Record<string, number> = { usa: 5, eur: 3, fra: 2, can: 2, asi: 1, lat: 1, afr: 1 };
    ranked = LEAGUES.flatMap((l) => [...l.teams].sort((a, b) => b.tier - a.tier).slice(0, quota[l.id] ?? 1));
  } else ranked = [...pool].sort((a, b) => b.tier - a.tier);
  const out = ranked.filter((t) => t.id !== user.id).slice(0, size - 1);
  if (out.length < size - 1) {
    const extra = [...pool].sort((a, b) => b.tier - a.tier).filter((t) => t.id !== user.id && !out.includes(t));
    out.push(...extra.slice(0, size - 1 - out.length));
  }
  out.push(user);
  return out.sort((a, b) => b.tier - a.tier);
}

/** Calendrier des groupes : chaque groupe en round-robin simple, journée par journée. */
function groupSchedule(groups: string[][], seed: number): ScheduledGame[][] {
  const per = groups.map((g, i) => roundRobin(g, g.length - 1, seed + i));
  const weeks = Math.max(...per.map((p) => p.length));
  return Array.from({ length: weeks }, (_, w) => per.flatMap((p) => p[w] ?? []).map((g) => ({ ...g, id: `${g.id}-g` })));
}

export function createCup(cupId: string, userTeamId: string, opts: { leagueId?: string; seed?: number; quarterMinutes?: number } = {}): League {
  const def = cupDef(cupId);
  const seed = opts.seed ?? (Date.now() >>> 0);
  const rng = new Rng(seed);
  const entrants = cupEntrants(def, userTeamId, opts.leagueId);
  const teams = entrants.map((t) => teamFromTemplate(t, seed));
  teams.forEach((t, i) => (t.conference = (i % 2) as 0 | 1));
  const name = def.national ? `Coupe de la ${leagueDef(opts.leagueId ?? 'usa').name}` : def.name;
  const l = createLeague({ mode: 'cup', userTeamId, teams, seed, weeks: 1, playoffTeams: 2, quarterMinutes: opts.quarterMinutes, name });
  let groups: string[][] | null = null;
  if (def.groups) {
    // tirage au sort par chapeaux : une tête de série par groupe
    const pots: string[][] = [];
    const ids = entrants.map((t) => t.id);
    const per = ids.length / def.groups;
    for (let p = 0; p < per; p++) pots.push(rng.shuffle(ids.slice(p * def.groups, (p + 1) * def.groups)));
    groups = Array.from({ length: def.groups }, (_, g) => pots.map((pot) => pot[g]));
    l.schedule = groupSchedule(groups, seed);
    l.weeks = l.schedule.length;
    l.phase = 'regular';
  } else {
    l.schedule = [];
    l.weeks = 0;
    l.phase = 'playoffs';
    l.playoffs = seededKnockout(entrants.map((t) => t.id));
  }
  l.cup = { id: def.id, name, icon: def.icon, groups };
  l.leagueId = opts.leagueId;
  l.news.unshift(`${def.icon} ${name} : ${teams.length} équipes${groups ? `, ${groups.length} groupes de ${groups[0].length}` : ', élimination directe'}.`);
  return l;
}
