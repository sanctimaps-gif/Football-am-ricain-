import { chooseDefensivePlay, chooseOffensivePlay, decideConversion, DEFAULT_GAMEPLAN, kickerRange, type GamePlan } from '../ai/playcaller';
import { Rng } from '../core/rng';
import { overallFor } from '../data/ratings';
import type { Player, Position, Team } from '../data/types';
import { DEFAULT_RULES, type RulesConfig } from '../rules/config';
import { applyCoinToss, applyRunoff, createGameState, resolvePlay, setConversionType } from '../rules/engine';
import { emptyResult, other, type GameState, type PlayResult, type Side } from '../rules/types';
import { availableAt } from '../sim/personnel';

/**
 * Simulation rapide « action par action » sans agents physiques, pour les matchs de saison non joués.
 * Elle utilise le MÊME moteur de règles (downs, score, chrono, prolongation, pénalités) que le match interactif ;
 * seules les issues des actions sont tirées statistiquement à partir des notes des joueurs.
 */
interface Unit {
  qb: Player | undefined;
  rb: Player | undefined;
  receivers: Player[];
  k: Player | undefined;
  p: Player | undefined;
  ol: number;
  pass: number;
  run: number;
  dl: number;
  cover: number;
  tackle: number;
}

function unit(team: Team): Unit {
  const top = (pos: Position, n: number) => availableAt(team, pos).slice(0, n);
  const avg = (ps: Player[], pos: Position) => (ps.length ? ps.reduce((t, p) => t + overallFor(p.attrs, pos), 0) / ps.length : 50);
  const qb = top('QB', 1)[0];
  const rb = top('RB', 1)[0];
  const wr = top('WR', 3);
  const te = top('TE', 1);
  const ol = [...top('OT', 2), ...top('OG', 2), ...top('C', 1)];
  const dl = [...top('DE', 2), ...top('DT', 2)];
  const lb = top('LB', 3);
  const db = [...top('CB', 3), ...top('FS', 1), ...top('SS', 1)];
  return {
    qb, rb, receivers: [...wr, ...te, ...(rb ? [rb] : [])], k: top('K', 1)[0], p: top('P', 1)[0],
    ol: avg(ol, 'OG'),
    pass: (qb ? overallFor(qb.attrs, 'QB') : 50) * 0.6 + avg(wr, 'WR') * 0.4,
    run: (rb ? overallFor(rb.attrs, 'RB') : 50),
    dl: avg(dl, 'DE'),
    cover: avg(db, 'CB'),
    tackle: avg(lb, 'LB'),
  };
}

export function quickSimulate(home: Team, away: Team, opts: { rules?: RulesConfig; seed?: number; plans?: [GamePlan, GamePlan] } = {}): GameState {
  const rules = opts.rules ?? DEFAULT_RULES;
  const rng = new Rng(opts.seed ?? Date.now());
  const teams: [Team, Team] = [home, away];
  const units: [Unit, Unit] = [unit(home), unit(away)];
  const plans = opts.plans ?? [DEFAULT_GAMEPLAN, DEFAULT_GAMEPLAN];
  const sideOf: Record<string, Side> = {};
  for (const p of home.roster) sideOf[p.id] = 0;
  for (const p of away.roster) sideOf[p.id] = 1;
  const s = createGameState(rules, sideOf, 0);
  applyCoinToss(s, rng.chance(0.5) ? 0 : 1, rules);
  const scouting = [{ passes: 0, runs: 0 }, { passes: 0, runs: 0 }];
  let guard = 0;
  while (!s.finished && guard++ < 2000) {
    if (s.needsCoinToss) applyCoinToss(s, rng.chance(0.5) ? 0 : 1, rules);
    const off = s.possession;
    const def = other(off);
    const O = units[off];
    const D = units[def];
    let r: PlayResult;
    if (s.nextKind === 'kickoff') {
      r = emptyResult('kickoff', def, 0);
      if (rng.chance(0.55)) {
        r.kickTouchback = true;
        r.endSpot = 105;
      } else r.endSpot = 100 - Math.round(rng.range(15, 32) + (rng.chance(0.02) ? 70 : 0));
      r.elapsed = r.kickTouchback ? 0 : rng.range(5, 8);
    } else {
      if (s.nextKind === 'conversion') setConversionType(s, decideConversion(s, rules), rules);
      const play = s.nextKind === 'conversion' && s.ballOn === 100 - rules.extraPointSpot
        ? { subtype: 'fieldGoal', category: 'special', formation: 'fieldGoal' as const }
        : chooseOffensivePlay(s, rules, teams[off], rng, plans[off]);
      applyRunoff(s, rules);
      if (play.category === 'run') scouting[off].runs++;
      else if (play.category === 'pass') scouting[off].passes++;
      void chooseDefensivePlay;
      r = resolveQuick(s, play.subtype, play.category, O, D, rng, rules, teams[off]);
    }
    resolvePlay(s, r, rules);
  }
  return s;
}

function resolveQuick(s: GameState, subtype: string, category: string, O: Unit, D: Unit, rng: Rng, rules: RulesConfig, offTeam: Team): PlayResult {
  const off = s.possession;
  const los = s.ballOn;
  const kind = s.nextKind === 'conversion' && subtype === 'fieldGoal' ? 'extraPoint' : subtype === 'fieldGoal' ? 'fieldGoal' : subtype === 'punt' ? 'punt' : subtype === 'kneel' ? 'kneel' : 'scrimmage';
  const r = emptyResult(kind, off, los);
  r.elapsed = rng.range(4, 7);
  if (kind === 'kneel') {
    r.endSpot = los - 1;
    return r;
  }
  if (kind === 'fieldGoal' || kind === 'extraPoint') {
    const dist = 100 - los + 17;
    const range = kickerRange(offTeam);
    const acc = O.k?.attrs.kickAccuracy ?? 60;
    const p = dist > range ? 0.05 : Math.min(0.99, 0.98 - Math.max(0, dist - 25) * 0.012 * (1.3 - acc / 100));
    r.kickGood = rng.chance(p);
    if (O.k) r.stats.push({ kind: 'kick', kicker: O.k.id, fieldGoal: kind === 'fieldGoal', good: r.kickGood });
    return r;
  }
  if (kind === 'punt') {
    const d = 38 + (O.p?.attrs.kickPower ?? 60) * 0.1 + rng.normal(0, 5);
    const land = los + d;
    if (land >= 100) {
      r.kickTouchback = true;
      r.endSpot = 105;
    } else {
      r.endSpot = Math.min(99, land - Math.max(0, rng.normal(7, 5)));
      r.fairCatch = rng.chance(0.3);
    }
    r.finalPossessor = other(off);
    return r;
  }
  const edge = (a: number, b: number) => (a - b) / 100;
  if (category === 'pass') {
    const qb = O.qb;
    const tgt = O.receivers[Math.floor(rng.next() * Math.max(1, O.receivers.length))];
    const sackP = 0.06 + edge(D.dl, O.ol) * 0.25;
    if (qb && rng.chance(sackP)) {
      const loss = Math.round(rng.range(3, 9));
      r.endSpot = los - loss;
      r.stats.push({ kind: 'sack', qb: qb.id, by: null, yards: -loss });
      return r;
    }
    if (qb) r.stats.push({ kind: 'passAtt', passer: qb.id });
    const deep = subtype === 'deep' || subtype === 'playAction';
    const compP = 0.64 + edge(O.pass, D.cover) * 0.9 - (deep ? 0.2 : 0) + (subtype === 'screen' ? 0.12 : 0);
    const intP = 0.022 - edge(O.pass, D.cover) * 0.05 + (deep ? 0.012 : 0);
    if (rng.chance(Math.max(0.005, intP))) {
      r.finalPossessor = other(off);
      r.turnover = 'interception';
      r.endSpot = Math.min(99, los + rng.range(5, 25) - rng.range(0, 20));
      if (qb) r.stats.push({ kind: 'interception', passer: qb.id, by: '' });
      return r;
    }
    if (!rng.chance(compP)) {
      r.incomplete = true;
      return r;
    }
    let yds = Math.round(Math.max(-2, rng.normal(deep ? 19 : 8, deep ? 9 : 5) + edge(O.pass, D.cover) * 10));
    if (rng.chance(0.05)) yds += Math.round(rng.range(15, 55));
    r.endSpot = los + yds;
    r.outOfBounds = rng.chance(0.2);
    if (qb && tgt) {
      r.stats.push({ kind: 'completion', passer: qb.id, receiver: tgt.id, yards: Math.min(yds, 100 - los) });
      if (los + yds >= 100) r.stats.push({ kind: 'touchdown', scorer: tgt.id, passer: qb.id, via: 'pass' });
    }
  } else {
    const runner = subtype === 'sneak' || subtype === 'option' ? O.qb : O.rb;
    let yds = Math.round(rng.normal(3.6, 3.5) + edge(O.run * 0.5 + O.ol * 0.5, D.dl * 0.5 + D.tackle * 0.5) * 9);
    if (rng.chance(0.06)) yds += Math.round(rng.range(8, 50));
    if (subtype === 'sneak') yds = Math.round(rng.normal(1.6, 1.4));
    r.endSpot = los + yds;
    r.outOfBounds = rng.chance(0.1);
    if (runner) {
      r.stats.push({ kind: 'rush', runner: runner.id, yards: Math.min(yds, 100 - los) });
      if (los + yds >= 100) r.stats.push({ kind: 'touchdown', scorer: runner.id, via: 'rush' });
    }
    if (rng.chance(0.012)) {
      r.finalPossessor = other(off);
      r.turnover = 'fumble';
      if (runner) r.stats.push({ kind: 'fumbleLost', by: runner.id });
    }
  }
  // pénalités
  if (rules.penaltiesEnabled && rng.chance(0.06)) {
    const roll = rng.next();
    if (roll < 0.4) r.penalties.push({ type: 'holding', against: off });
    else if (roll < 0.7) r.preSnapPenalty = { type: rng.chance(0.6) ? 'falseStart' : 'offside', against: roll < 0.6 ? off : other(off) };
    else if (roll < 0.9) r.penalties.push({ type: 'passInterference', against: other(off), spot: Math.min(99, los + rng.range(5, 25)) });
    else r.penalties.push({ type: 'facemask', against: other(off) });
    if (r.preSnapPenalty) r.preSnapPenalty.type = r.preSnapPenalty.against === off ? 'falseStart' : 'offside';
  }
  return r;
}
