import { Rng } from '../core/rng';
import { DEFENSIVE_PLAYS, OFFENSIVE_PLAYS, type DefensivePlay, type FormationId, type OffensivePlay } from '../data/playbook';
import type { Team } from '../data/types';
import { availableAt } from '../sim/personnel';
import { runoffSeconds, type RulesConfig } from '../rules/config';
import { other, type GameState, type Side } from '../rules/types';

/** Plan de jeu d'un coach (carrière de coach / franchise) : influence l'IA. */
export interface GamePlan {
  passRatio: number; // 0..1 tendance à passer
  aggression: number; // 0..1 4e tentatives, blitz
  deepShots: number; // 0..1
}

export const DEFAULT_GAMEPLAN: GamePlan = { passRatio: 0.52, aggression: 0.5, deepShots: 0.4 };

export type FourthDownChoice = 'go' | 'punt' | 'fieldGoal';

/** Portée du kicker en yards de coup de pied (distance réelle = 100 - ballOn + 17). */
export function kickerRange(team: Team): number {
  const k = availableAt(team, 'K')[0] ?? availableAt(team, 'P')[0];
  return k ? 40 + k.attrs.kickPower * 0.17 : 40;
}

export const fieldGoalDistance = (ballOn: number): number => 100 - ballOn + 17;

function timeContext(s: GameState, rules: RulesConfig, team: Side) {
  const qLen = rules.quarterMinutes * 60;
  const diff = s.score[team] - s.score[other(team)];
  const lateGame = s.quarter >= 4 && s.clock < qLen * 0.45;
  const endHalf = s.quarter === 2 && s.clock < qLen * 0.2;
  return { diff, lateGame, endHalf, qLen };
}

export function decideFourthDown(s: GameState, rules: RulesConfig, team: Team, plan: GamePlan = DEFAULT_GAMEPLAN): FourthDownChoice {
  const side = s.possession;
  const { diff, lateGame } = timeContext(s, rules, side);
  const fgDist = fieldGoalDistance(s.ballOn);
  const range = kickerRange(team);
  // en fin de match, mené de plus de 3 : on tente
  if (lateGame && diff < -3) return 'go';
  if (lateGame && diff < 0 && diff >= -3 && fgDist <= range) return 'fieldGoal';
  if (lateGame && diff < 0) return 'go';
  const goDist = 1 + plan.aggression * 2.2;
  if (s.toGo <= goDist && s.ballOn >= 45 - plan.aggression * 15 && !(fgDist <= range - 12 && s.toGo > 1)) return 'go';
  if (fgDist <= range) return 'fieldGoal';
  if (s.ballOn >= 62 && s.toGo <= 4) return 'go';
  return 'punt';
}

export function decideConversion(s: GameState, rules: RulesConfig): 'kick' | 'two' {
  const side = s.possession;
  const { diff, lateGame } = timeContext(s, rules, side);
  // diff inclut déjà les 6 points du touchdown
  if (lateGame && [-2, 1, 5, -5, -10, -9, 12].includes(diff)) return 'two';
  return 'kick';
}

/** Faut-il poser le genou pour écouler le temps ? */
export function shouldKneel(s: GameState, rules: RulesConfig): boolean {
  const side = s.possession;
  const diff = s.score[side] - s.score[other(side)];
  if (diff <= 0 || s.nextKind !== 'scrimmage') return false;
  const opp = other(side);
  const runoff = runoffSeconds(rules);
  const playsLeft = 5 - s.down;
  const timeoutsOpp = s.timeouts[opp];
  const killable = (playsLeft - timeoutsOpp) * (runoff + 1.5);
  return (s.quarter >= 4 && s.clock <= killable) || (s.quarter === 2 && s.clock <= runoff && s.ballOn < 60);
}

export function chooseOffensivePlay(
  s: GameState,
  rules: RulesConfig,
  team: Team,
  rng: Rng,
  plan: GamePlan = DEFAULT_GAMEPLAN,
  recent: string[] = [],
): OffensivePlay {
  const byId = (id: string) => OFFENSIVE_PLAYS.find((p) => p.id === id)!;
  if (shouldKneel(s, rules)) return byId('kneel');
  if (s.down === 4 && s.nextKind === 'scrimmage') {
    const c = decideFourthDown(s, rules, team, plan);
    if (c === 'punt') return byId('punt');
    if (c === 'fieldGoal') return byId('fieldGoal');
  }
  const side = s.possession;
  const { diff, lateGame, endHalf } = timeContext(s, rules, side);
  // dernière seconde de la mi-temps à portée : field goal
  if (endHalf && s.clock < runoffSeconds(rules) + 3 && fieldGoalDistance(s.ballOn) <= kickerRange(team)) return byId('fieldGoal');
  let pPass = plan.passRatio;
  if (s.down === 3 && s.toGo >= 7) pPass = 0.85;
  else if (s.down >= 3 && s.toGo <= 2) pPass = 0.3;
  else if (s.down === 2 && s.toGo >= 8) pPass += 0.15;
  if (lateGame && diff < 0) pPass = Math.max(pPass, 0.75);
  if (lateGame && diff > 0) pPass = Math.min(pPass, 0.28);
  if (endHalf) pPass = Math.max(pPass, 0.7);
  const goalLine = s.ballOn >= 96;
  const pool: { p: OffensivePlay; w: number }[] = [];
  const add = (id: string, w: number) => {
    const p = byId(id);
    pool.push({ p, w: recent.includes(id) ? w * 0.35 : w });
  };
  if (rng.chance(pPass)) {
    const long = s.toGo >= 8 || (lateGame && diff < -7);
    const deep = plan.deepShots;
    if (goalLine) {
      add('tePop', 3);
      add('quickSlants', 2);
      add('hitchFlat', 1);
    } else {
      add('quickSlants', s.toGo <= 6 ? 3 : 1.5);
      add('hitchFlat', s.toGo <= 5 ? 2.5 : 1);
      add('meshDrag', 2);
      add('curlFlat', 2);
      add('digsOut', long ? 3 : 1.5);
      add('fourVerts', (long ? 2 : 0.8) * (0.5 + deep));
      add('postCorner', (long ? 1.8 : 0.8) * (0.5 + deep));
      add('rbScreen', s.toGo >= 6 ? 1.2 : 0.7);
      if (s.down <= 2) {
        add('paBoot', 1.2 * (0.5 + deep));
        add('paCross', 1.2);
      }
    }
  } else {
    if (s.toGo <= 1) {
      add('qbSneak', 2.5);
      add('goalLineDive', 3);
      add('powerI', 1.5);
    } else if (goalLine) {
      add('goalLineDive', 3);
      add('powerI', 2);
      add('qbSneak', 1);
    } else {
      add('insideZone', 3);
      add('powerI', 2);
      add('outsideZone', 2.2);
      add('tossSweep', 1.3);
      add('readOption', 1.2);
    }
  }
  return weighted(pool, rng);
}

function weighted<T>(pool: { p: T; w: number }[], rng: Rng): T {
  const total = pool.reduce((t, x) => t + x.w, 0);
  let r = rng.next() * total;
  for (const x of pool) {
    r -= x.w;
    if (r <= 0) return x.p;
  }
  return pool[pool.length - 1].p;
}

/** Observation de l'adversaire : uniquement la tendance passée (jamais l'action en cours). */
export interface ScoutingReport {
  passes: number;
  runs: number;
}

/**
 * Choix défensif : basé sur le down, la distance, la formation visible de l'attaque
 * et les tendances observées. L'IA ne connaît pas l'action choisie par l'adversaire.
 */
export function chooseDefensivePlay(
  s: GameState,
  rules: RulesConfig,
  rng: Rng,
  visibleFormation: FormationId,
  scouting: ScoutingReport,
  plan: GamePlan = DEFAULT_GAMEPLAN,
  recent: string[] = [],
): DefensivePlay {
  const byId = (id: string) => DEFENSIVE_PLAYS.find((p) => p.id === id)!;
  const side = other(s.possession);
  const { diff, lateGame } = timeContext(s, rules, side);
  const total = scouting.passes + scouting.runs;
  const passTendency = total >= 4 ? scouting.passes / total : 0.5;
  const pool: { p: DefensivePlay; w: number }[] = [];
  const add = (id: string, w: number) => pool.push({ p: byId(id), w: recent.includes(id) ? w * 0.4 : w });
  const heavy = visibleFormation === 'goalLine' || visibleFormation === 'iform';
  const spread = visibleFormation === 'shotgun' || visibleFormation === 'shotgunTrips';
  if (s.ballOn >= 95 || (s.toGo <= 1 && heavy)) {
    add('goalLineD', 4);
    add('43runStop', 2);
    add('43cover1', 1);
    return weighted(pool, rng);
  }
  if (lateGame && diff > 0 && s.toGo >= 10) {
    add('dimeDeep', 4);
    add('nickelQuarters', 2);
    return weighted(pool, rng);
  }
  const passLikely = (s.down === 3 && s.toGo >= 6) || (s.down === 2 && s.toGo >= 9) || spread;
  const runLikely = heavy || s.toGo <= 2;
  const blitzW = 0.6 + plan.aggression * 1.2;
  if (passLikely) {
    add('nickelMan', 2.2);
    add('nickelQuarters', 1.6 + passTendency);
    add('43cover2', 1.5);
    add('nickelBlitz', blitzW);
    add('34blitz', blitzW * 0.6);
    add('43cover3', 1.2);
  } else if (runLikely) {
    add('43runStop', 2.5 + (1 - passTendency));
    add('goalLineD', s.toGo <= 1 ? 1.5 : 0.3);
    add('34cover3', 1.5);
    add('43cover1', 1.2);
  } else {
    add('43cover3', 2);
    add('43cover2', 1.6);
    add('34cover3', 1.4);
    add('43cover1', 1.2);
    add('43runStop', 0.8 + (1 - passTendency) * 1.2);
    add('nickelBlitz', blitzW * 0.5);
  }
  return weighted(pool, rng);
}

/** L'IA appelle-t-elle un temps mort (fin de mi-temps / de match) ? */
export function shouldCallTimeout(s: GameState, rules: RulesConfig, team: Side): boolean {
  if (s.timeouts[team] <= 0 || !s.clockRunning || s.finished) return false;
  const { diff, qLen } = timeContext(s, rules, team);
  const offense = s.possession === team;
  if (s.quarter === 4 || s.quarter >= 5) {
    if (offense && diff <= 0 && s.clock < qLen * 0.25) return true;
    if (!offense && diff < 0 && diff >= -8 && s.clock < qLen * 0.3) return true;
  }
  if (s.quarter === 2 && offense && s.clock < qLen * 0.12 && s.ballOn > 50) return true;
  return false;
}
