import { DEFAULT_GAMEPLAN } from '../ai/playcaller';
import { Rng } from '../core/rng';
import { buildDepthChart, createDefaultTeams } from '../data/generator';
import { overall } from '../data/ratings';
import type { Player, SeasonStatLine, Team } from '../data/types';
import { fullName } from '../data/types';
import { quickSimulate } from '../match/quickSim';
import { DEFAULT_RULES, PLAYOFF_RULES } from '../rules/config';
import { playerImpact, type PlayerGameStats } from '../rules/stats';
import type { GameState } from '../rules/types';
import { advancePlayoffs, computeStandings, roundRobin, seedPlayoffs, sortStandings, type PlayoffGame, type ScheduledGame } from './schedule';
import { SALARY_CAP, type Finance, type League, type LeagueMode } from './types';

export interface CreateLeagueOptions {
  mode: LeagueMode;
  userTeamId: string;
  seed?: number;
  weeks?: number;
  playoffTeams?: 2 | 4;
  quarterMinutes?: number;
  teams?: Team[];
  name?: string;
  coachName?: string;
}

export function defaultFinance(team: Team): Finance {
  return {
    cash: 60000,
    salaryCap: SALARY_CAP,
    ticketPrice: 85,
    fanSupport: 55,
    facilities: { training: 2, medical: 2, stadium: Math.min(5, Math.max(1, Math.round(team.stadium.capacity / 15000))) },
    seasonRevenue: 0,
    seasonExpenses: 0,
  };
}

export function createLeague(o: CreateLeagueOptions): League {
  const seed = o.seed ?? (Date.now() >>> 0);
  const teams = o.teams ?? createDefaultTeams(seed);
  const weeks = Math.min(o.weeks ?? 10, (teams.length - 1) * 2);
  const league: League = {
    version: 1,
    id: `L${seed}`,
    name: o.name ?? 'Ligue Gridiron',
    mode: o.mode,
    seed,
    season: 1,
    week: 1,
    phase: 'regular',
    weeks,
    playoffTeams: o.playoffTeams ?? 4,
    quarterMinutes: o.quarterMinutes ?? 3,
    teams,
    userTeamId: o.userTeamId,
    schedule: roundRobin(teams.map((t) => t.id), weeks, seed),
    playoffs: [],
    champion: null,
    seasonStats: {},
    history: [],
    records: { mostPointsGame: null, bestSeason: null, passYdsSeason: null, rushYdsSeason: null },
    finances: Object.fromEntries(teams.map((t) => [t.id, defaultFinance(t)])),
    plans: Object.fromEntries(teams.map((t) => [t.id, { ...DEFAULT_GAMEPLAN }])),
    freeAgents: [],
    draftClass: [],
    draftOrder: [],
    draftPick: 0,
    draftRounds: 3,
    coach: o.mode === 'coach' || o.mode === 'franchise'
      ? { name: o.coachName ?? 'Coach', reputation: 50, security: 70, objectives: { wins: Math.ceil(weeks / 2), playoffs: false }, fired: false, seasons: [] }
      : null,
    career: null,
    news: [],
    nextPlayerId: 1,
  };
  return league;
}

export const teamById = (l: League, id: string): Team => {
  const t = l.teams.find((x) => x.id === id);
  if (!t) throw new Error(`Équipe inconnue ${id}`);
  return t;
};

export const userTeam = (l: League): Team => teamById(l, l.userTeamId);

export function standings(l: League) {
  return sortStandings(computeStandings(l.teams, l.schedule), l.schedule);
}

/** Match de l'utilisateur pour la semaine courante (saison ou playoffs). */
export function userGame(l: League): ScheduledGame | PlayoffGame | null {
  if (l.phase === 'regular') {
    const w = l.schedule[l.week - 1] ?? [];
    return w.find((g) => !g.played && (g.home === l.userTeamId || g.away === l.userTeamId)) ?? null;
  }
  if (l.phase === 'playoffs') return l.playoffs.find((g) => !g.played && (g.home === l.userTeamId || g.away === l.userTeamId)) ?? null;
  return null;
}

function emptySeasonLine(season: number, teamId: string): SeasonStatLine {
  return { season, teamId, games: 0, passAtt: 0, passComp: 0, passYds: 0, passTD: 0, passInt: 0, rushAtt: 0, rushYds: 0, rushTD: 0, rec: 0, recYds: 0, recTD: 0, tackles: 0, sacks: 0, ints: 0, fgm: 0, fga: 0 };
}

/** Intègre les statistiques d'un match (interactif ou simulé) dans les statistiques de saison. */
export function absorbGameStats(l: League, home: Team, away: Team, s: GameState): void {
  for (const team of [home, away]) {
    for (const p of team.roster) {
      const st: PlayerGameStats | undefined = s.playerStats[p.id];
      if (!st) continue;
      const line = (l.seasonStats[p.id] ??= emptySeasonLine(l.season, team.id));
      line.games++;
      line.passAtt += st.passAtt;
      line.passComp += st.passComp;
      line.passYds += st.passYds;
      line.passTD += st.passTD;
      line.passInt += st.passInt;
      line.rushAtt += st.rushAtt;
      line.rushYds += st.rushYds;
      line.rushTD += st.rushTD;
      line.rec += st.rec;
      line.recYds += st.recYds;
      line.recTD += st.recTD;
      line.tackles += st.tackles;
      line.sacks += st.sacks;
      line.ints += st.ints;
      line.fgm += st.fgm;
      line.fga += st.fga;
      p.xp += Math.round(playerImpact(st));
    }
  }
  const best = Math.max(s.score[0], s.score[1]);
  const bestTeam = s.score[0] >= s.score[1] ? home.id : away.id;
  if (!l.records.mostPointsGame || best > l.records.mostPointsGame.value) l.records.mostPointsGame = { value: best, teamId: bestTeam, season: l.season };
}

/** Recettes et dépenses d'un match à domicile. */
function settleGameFinances(l: League, homeId: string): void {
  const f = l.finances[homeId];
  const team = teamById(l, homeId);
  if (!f) return;
  const attendance = Math.round(team.stadium.capacity * Math.min(1, (0.45 + f.fanSupport / 200) * (0.85 + f.facilities.stadium * 0.04)) * Math.min(1.1, 95 / Math.max(30, f.ticketPrice)));
  const tickets = (attendance * f.ticketPrice) / 1000;
  const tv = 9000;
  f.cash += tickets + tv;
  f.seasonRevenue += tickets + tv;
}

function weeklyExpenses(l: League): void {
  for (const team of l.teams) {
    const f = l.finances[team.id];
    if (!f) continue;
    const payroll = team.roster.reduce((t, p) => t + p.contract.salary, 0);
    const facilities = (f.facilities.training + f.facilities.medical + f.facilities.stadium) * 350;
    const cost = payroll / Math.max(1, l.weeks) + facilities;
    f.cash -= cost;
    f.seasonExpenses += cost;
  }
}

export function recordResult(l: League, game: ScheduledGame | PlayoffGame, s: GameState, userPlayed: boolean): void {
  game.played = true;
  game.score = [s.score[0], s.score[1]];
  if ('overtime' in game) game.overtime = s.quarter > 4;
  if ('userPlayed' in game || userPlayed) (game as ScheduledGame).userPlayed = userPlayed;
  if ('winner' in game) game.winner = s.score[0] >= s.score[1] ? game.home : game.away;
  const home = teamById(l, game.home);
  const away = teamById(l, game.away);
  absorbGameStats(l, home, away, s);
  settleGameFinances(l, game.home);
  // fans : la victoire à domicile augmente le soutien
  for (const [id, won] of [[game.home, s.score[0] > s.score[1]], [game.away, s.score[1] > s.score[0]]] as [string, boolean][]) {
    const f = l.finances[id];
    if (f) f.fanSupport = Math.max(5, Math.min(100, f.fanSupport + (won ? 2 : -1.5)));
  }
  applyInjuries(l, home, s);
  applyInjuries(l, away, s);
}

function applyInjuries(l: League, team: Team, s: GameState): void {
  const rng = new Rng(l.seed + l.season * 1000 + l.week * 31 + team.id.length + s.playNumber);
  const medical = l.finances[team.id]?.facilities.medical ?? 2;
  for (const p of team.roster) {
    if (!s.playerStats[p.id]) continue;
    if (rng.chance(0.012)) {
      p.injuryWeeks = Math.max(1, Math.round(rng.range(1, 5) - medical * 0.4));
      l.news.unshift(`🚑 ${fullName(p)} (${team.abbr}) blessé pour ${p.injuryWeeks} semaine(s).`);
    }
  }
}

function simulateGame(l: League, g: ScheduledGame | PlayoffGame, playoff: boolean): void {
  const home = teamById(l, g.home);
  const away = teamById(l, g.away);
  const base = { ...DEFAULT_RULES, quarterMinutes: l.quarterMinutes };
  const s = quickSimulate(home, away, {
    rules: playoff ? PLAYOFF_RULES(base) : base,
    seed: l.seed + l.season * 7919 + l.week * 104729 + g.id.length * 13 + g.home.charCodeAt(0),
    plans: [l.plans[home.id] ?? DEFAULT_GAMEPLAN, l.plans[away.id] ?? DEFAULT_GAMEPLAN],
  });
  recordResult(l, g, s, false);
}

/** Simule tous les matchs de la semaine sauf celui de l'utilisateur (sauf s'il demande la simulation). */
export function simulateWeek(l: League, includeUser = false): void {
  if (l.phase === 'regular') {
    for (const g of l.schedule[l.week - 1] ?? []) {
      if (g.played) continue;
      const isUser = g.home === l.userTeamId || g.away === l.userTeamId;
      if (isUser && !includeUser) continue;
      simulateGame(l, g, false);
    }
  } else if (l.phase === 'playoffs') {
    for (const g of l.playoffs) {
      if (g.played) continue;
      const isUser = g.home === l.userTeamId || g.away === l.userTeamId;
      if (isUser && !includeUser) continue;
      simulateGame(l, g, true);
    }
  }
}

export function weekComplete(l: League): boolean {
  if (l.phase === 'regular') return (l.schedule[l.week - 1] ?? []).every((g) => g.played);
  if (l.phase === 'playoffs') return l.playoffs.every((g) => g.played);
  return true;
}

/** Passe à la semaine suivante ; gère le passage aux playoffs et la fin de saison. */
export function advanceWeek(l: League): void {
  if (!weekComplete(l)) throw new Error('Semaine non terminée');
  weeklyExpenses(l);
  for (const t of l.teams) for (const p of t.roster) if (p.injuryWeeks > 0) p.injuryWeeks--;
  for (const t of l.teams) t.depth = mergeDepth(t);
  if (l.phase === 'regular') {
    if (l.week < l.weeks) {
      l.week++;
      return;
    }
    l.phase = 'playoffs';
    l.playoffs = seedPlayoffs(computeStandings(l.teams, l.schedule), l.schedule, l.playoffTeams);
    l.week++;
    const userIn = l.playoffs.some((g) => g.home === l.userTeamId || g.away === l.userTeamId);
    l.news.unshift(userIn ? '🏆 Votre équipe est qualifiée pour les playoffs !' : 'Votre équipe est éliminée : les playoffs se jouent sans vous.');
    return;
  }
  if (l.phase === 'playoffs') {
    const order = standings(l).map((r) => r.teamId);
    const next = advancePlayoffs(l.playoffs, order);
    if (next.length) {
      l.playoffs.push(...next);
      l.week++;
      return;
    }
    const final = l.playoffs.find((g) => g.id === 'final');
    if (final?.played) {
      l.champion = final.winner;
      l.phase = 'offseason';
      l.news.unshift(`🏆 ${teamById(l, final.winner!).city} ${teamById(l, final.winner!).name} remporte le championnat !`);
    }
  }
}

/** Garde la profondeur de poste cohérente (blessés en fin de liste, nouveaux joueurs ajoutés). */
export function mergeDepth(team: Team): Team['depth'] {
  const fresh = buildDepthChart(team.roster);
  const out: Team['depth'] = {};
  for (const pos of Object.keys(fresh) as (keyof typeof fresh)[]) {
    const prev = (team.depth[pos] ?? []).filter((id) => fresh[pos]!.includes(id));
    const extra = fresh[pos]!.filter((id) => !prev.includes(id));
    const merged = [...prev, ...extra];
    const byId = new Map(team.roster.map((p) => [p.id, p]));
    merged.sort((a, b) => Number(byId.get(a)!.injuryWeeks > 0) - Number(byId.get(b)!.injuryWeeks > 0));
    out[pos] = merged;
  }
  return out;
}

/** Meilleur joueur de la saison (MVP). */
export function seasonMvp(l: League): { player: Player; team: Team } | null {
  let best: { player: Player; team: Team; v: number } | null = null;
  for (const team of l.teams) for (const p of team.roster) {
    const s = l.seasonStats[p.id];
    if (!s) continue;
    const v = s.passYds * 0.04 + s.passTD * 4 - s.passInt * 2 + s.rushYds * 0.1 + s.rushTD * 6 + s.recYds * 0.1 + s.recTD * 6 + s.tackles + s.sacks * 4 + s.ints * 5 + overall(p) * 0.2;
    if (!best || v > best.v) best = { player: p, team, v };
  }
  return best ? { player: best.player, team: best.team } : null;
}

export const isUserTeam = (l: League, id: string): boolean => l.userTeamId === id;

/** Validation minimale d'une ligue chargée depuis une sauvegarde. */
export function isLeague(d: unknown): d is League {
  const x = d as League;
  return !!x && typeof x === 'object' && x.version === 1 && Array.isArray(x.teams) && x.teams.length >= 4 && Array.isArray(x.schedule) && typeof x.userTeamId === 'string' && x.teams.some((t) => t.id === x.userTeamId);
}
