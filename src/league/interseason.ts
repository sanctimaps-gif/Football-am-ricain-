import { DEFAULT_GAMEPLAN } from '../ai/playcaller';
import { Rng } from '../core/rng';
import { teamFromTemplate } from '../data/generator';
import type { TeamTemplate } from '../data/teams';
import type { Team } from '../data/types';
import { ALL_CLUBS, displayName, leagueOfTeam } from '../data/world';
import { quickSimulate } from '../match/quickSim';
import { DEFAULT_RULES, PLAYOFF_RULES } from '../rules/config';
import type { GameState } from '../rules/types';
import { nextKnockoutRound, seededKnockout } from './knockout';
import { userTeam } from './league';
import type { DivisionLevel, InterseasonCup, League } from './types';

/**
 * Tournoi intersaison (style Rugby Nations) : entre deux saisons, le club affronte des clubs d'autres régions du
 * monde dans un mini-tournoi à 4 (demi-finales, finale). Primes et trophée, sans effet sur le classement.
 */
const TARGET_TIER: Record<DivisionLevel, number> = { 3: 0.84, 2: 0.9, 1: 1.0 };
const NAMES = ['Trophée des Continents', 'Coupe du Monde des Clubs (intersaison)', 'Tournoi des Cinq Océans', 'Challenge Intercontinental'];

export function createInterseason(l: League): InterseasonCup {
  const rng = new Rng(l.seed + l.season * 4243);
  const level = l.pyramid?.level ?? 1;
  const home = l.pyramid?.leagueId ?? l.leagueId ?? '';
  // clubs étrangers d'un niveau proche, de trois ligues différentes si possible
  const pool = ALL_CLUBS.filter((t) => leagueOfTeam(t.id)?.id !== home)
    .map((t) => ({ t, d: Math.abs(t.tier - TARGET_TIER[level]) + rng.range(0, 0.05) }))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.t);
  const opponents: TeamTemplate[] = [];
  const usedLeagues = new Set<string>();
  for (const t of pool) {
    const lg = leagueOfTeam(t.id)?.id ?? '';
    if (opponents.length < 3 && !usedLeagues.has(lg)) {
      opponents.push(t);
      usedLeagues.add(lg);
    }
  }
  for (const t of pool) if (opponents.length < 3 && !opponents.includes(t)) opponents.push(t);
  const scale = level === 1 ? 1 : level === 2 ? 0.6 : 0.35;
  return {
    name: NAMES[l.season % NAMES.length],
    season: l.season,
    opponents,
    games: seededKnockout([l.userTeamId, ...opponents.map((t) => t.id)]),
    prize: [Math.round(6000 * scale), Math.round(2500 * scale)],
    done: false,
  };
}

const cache = new Map<string, Team>();

/** Équipe d'un participant (effectif de l'utilisateur ou club étranger généré de façon déterministe). */
export function interseasonTeam(l: League, id: string): Team {
  if (id === l.userTeamId) return userTeam(l);
  const key = `${l.id}|${l.season}|${id}`;
  let t = cache.get(key);
  if (!t) {
    const tpl = l.interseason?.opponents.find((x) => x.id === id);
    if (!tpl) throw new Error(`Participant inconnu ${id}`);
    t = teamFromTemplate(tpl, l.seed + l.season);
    cache.set(key, t);
  }
  return t;
}

export const interseasonUserGame = (l: League) => l.interseason?.games.find((g) => !g.played && (g.home === l.userTeamId || g.away === l.userTeamId)) ?? null;

/** Enregistre un résultat, crée la finale si besoin et verse les primes en fin de tournoi. */
export function recordInterseason(l: League, gameId: string, s: GameState): string[] {
  const c = l.interseason;
  if (!c) return [];
  const g = c.games.find((x) => x.id === gameId);
  if (!g || g.played) return [];
  g.played = true;
  g.score = [s.score[0], s.score[1]];
  g.winner = s.score[0] >= s.score[1] ? g.home : g.away;
  return progress(l);
}

function progress(l: League): string[] {
  const c = l.interseason!;
  const next = nextKnockoutRound(c.games);
  if (next.length) c.games.push(...next);
  const final = c.games.find((g) => g.id === 'final');
  if (!final?.played || c.done) return [];
  c.done = true;
  const msgs: string[] = [];
  const f = l.finances[l.userTeamId];
  const name = (id: string) => displayName(interseasonTeam(l, id));
  if (final.winner === l.userTeamId) {
    f.cash += c.prize[0];
    (l.trophies ??= []).push(`${c.name} ${l.season}`);
    msgs.push(`🏆 Vous remportez le ${c.name} ! Prime : ${Math.round(c.prize[0] / 100) / 10} M$.`);
  } else if (final.home === l.userTeamId || final.away === l.userTeamId) {
    f.cash += c.prize[1];
    msgs.push(`🥈 Finaliste du ${c.name}. Prime : ${Math.round(c.prize[1] / 100) / 10} M$.`);
  } else msgs.push(`${c.name} : victoire de ${name(final.winner!)}.`);
  l.news.unshift(msgs[0]);
  return msgs;
}

/** Simule les matchs restants (celui de l'utilisateur seulement si demandé). */
export function simulateInterseason(l: League, includeUser: boolean): string[] {
  const c = l.interseason;
  if (!c) return [];
  const msgs: string[] = [];
  for (let guard = 0; guard < 6 && !c.done; guard++) {
    const pending = c.games.filter((g) => !g.played && (includeUser || (g.home !== l.userTeamId && g.away !== l.userTeamId)));
    if (!pending.length) break;
    for (const g of pending) {
      const home = interseasonTeam(l, g.home);
      const away = interseasonTeam(l, g.away);
      const s = quickSimulate(home, away, {
        rules: PLAYOFF_RULES({ ...DEFAULT_RULES, quarterMinutes: l.quarterMinutes }),
        seed: l.seed + l.season * 31 + g.id.length * 7 + g.round,
        plans: [l.plans[home.id] ?? DEFAULT_GAMEPLAN, l.plans[away.id] ?? DEFAULT_GAMEPLAN],
      });
      msgs.push(...recordInterseason(l, g.id, s));
    }
  }
  return msgs;
}
