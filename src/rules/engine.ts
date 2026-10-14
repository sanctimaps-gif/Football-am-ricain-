import { overtimeSeconds, quarterSeconds, runoffSeconds, type RulesConfig } from './config';
import { emptyPlayerStats, emptyTeamStats, type StatEvent } from './stats';
import { other, type GameState, type PenaltyCall, type PlayResult, type Side } from './types';

/**
 * Moteur de règles pur : aucune dépendance au rendu ni à l'interface.
 * Toutes les décisions de score, downs, possession, chrono et pénalités passent ici.
 */

export const PENALTY_YARDS: Record<PenaltyCall['type'], number> = {
  falseStart: 5,
  offside: 5,
  holding: 10,
  passInterference: 0, // faute au point
  facemask: 15,
};

export function createGameState(rules: RulesConfig, sideOf: Record<string, Side> = {}, openingKicker: Side = 0): GameState {
  return {
    quarter: 1,
    clock: quarterSeconds(rules),
    score: [0, 0],
    possession: openingKicker,
    ballOn: rules.kickoffSpot,
    down: 1,
    toGo: 10,
    timeouts: [rules.timeoutsPerHalf, rules.timeoutsPerHalf],
    nextKind: 'kickoff',
    clockRunning: false,
    openingKicker,
    ot: null,
    needsCoinToss: false,
    finished: false,
    winner: null,
    teamStats: [emptyTeamStats(), emptyTeamStats()],
    playerStats: {},
    sideOf,
    log: [],
    playNumber: 0,
    lastPeriodEnded: 'none',
  };
}

/** Le gagnant du toss choisit de recevoir (l'autre équipe botte). */
export function applyCoinToss(state: GameState, receiver: Side, rules: RulesConfig): void {
  const kicker = other(receiver);
  if (state.quarter >= 5) {
    state.ot = { firstPossessor: receiver, possessionsCompleted: 0 };
    state.needsCoinToss = false;
  } else {
    state.openingKicker = kicker;
  }
  setKickoff(state, kicker, rules.kickoffSpot);
}

function setKickoff(state: GameState, kicker: Side, spot: number): void {
  state.nextKind = 'kickoff';
  state.possession = kicker;
  state.ballOn = spot;
  state.down = 1;
  state.toGo = 10;
  state.clockRunning = false;
}

function setFirstDown(state: GameState, team: Side, ballOn: number): void {
  state.possession = team;
  state.ballOn = clampSpot(ballOn);
  state.down = 1;
  state.toGo = Math.min(10, 100 - state.ballOn);
  state.nextKind = 'scrimmage';
}

const clampSpot = (s: number): number => Math.max(1, Math.min(99, Math.round(s)));

export const leader = (s: GameState): Side | null => (s.score[0] > s.score[1] ? 0 : s.score[1] > s.score[0] ? 1 : null);

/** Propriétaire « logique » de la possession (pour la prolongation) : l'équipe qui reçoit lors d'un kickoff. */
const possessionOwner = (s: GameState): Side => (s.nextKind === 'kickoff' ? other(s.possession) : s.possession);

/** Écoulement du chrono entre deux actions, appliqué au moment du snap. */
export function applyRunoff(state: GameState, rules: RulesConfig): number {
  if (!state.clockRunning || state.nextKind !== 'scrimmage') return 0;
  const before = state.clock;
  state.clock = Math.max(Math.min(state.clock, 1), state.clock - runoffSeconds(rules));
  const used = before - state.clock;
  state.teamStats[state.possession].timeOfPossession += used;
  return used;
}

export function callTimeout(state: GameState, team: Side): boolean {
  if (state.timeouts[team] <= 0 || state.finished) return false;
  state.timeouts[team]--;
  state.clockRunning = false;
  return true;
}

/** Choix de conversion : extra point (1) ou tentative à 2 points. */
export function setConversionType(state: GameState, type: 'kick' | 'two', rules: RulesConfig): void {
  state.ballOn = 100 - (type === 'kick' ? rules.extraPointSpot : rules.twoPointSpot);
  state.down = 1;
  state.toGo = 100 - state.ballOn;
}

function applyStats(state: GameState, events: StatEvent[]): void {
  const ps = (id: string) => (state.playerStats[id] ??= emptyPlayerStats());
  const ts = (id: string): GameState['teamStats'][0] | null => {
    const side = state.sideOf[id];
    return side === undefined ? null : state.teamStats[side];
  };
  for (const e of events) {
    switch (e.kind) {
      case 'passAtt': {
        ps(e.passer).passAtt++;
        const t = ts(e.passer);
        if (t) t.passAtt++;
        break;
      }
      case 'completion': {
        const p = ps(e.passer);
        p.passComp++;
        p.passYds += e.yards;
        const r = ps(e.receiver);
        r.rec++;
        r.recYds += e.yards;
        const t = ts(e.passer);
        if (t) {
          t.passComp++;
          t.passYds += e.yards;
          t.totalYards += e.yards;
        }
        break;
      }
      case 'rush': {
        const p = ps(e.runner);
        p.rushAtt++;
        p.rushYds += e.yards;
        const t = ts(e.runner);
        if (t) {
          t.rushAtt++;
          t.rushYds += e.yards;
          t.totalYards += e.yards;
        }
        break;
      }
      case 'sack': {
        if (e.by) {
          ps(e.by).sacks++;
          ps(e.by).tackles++;
        }
        const t = ts(e.qb);
        if (t) {
          t.sacks++;
          t.totalYards += e.yards;
        }
        break;
      }
      case 'tackle':
        ps(e.by).tackles++;
        break;
      case 'interception': {
        ps(e.passer).passInt++;
        ps(e.by).ints++;
        const t = ts(e.passer);
        if (t) t.interceptionsThrown++;
        break;
      }
      case 'passDefl':
        ps(e.by).passDefl++;
        break;
      case 'fumbleLost': {
        const t = ts(e.by);
        if (t) t.fumblesLost++;
        break;
      }
      case 'kick': {
        const p = ps(e.kicker);
        if (e.fieldGoal) {
          p.fga++;
          if (e.good) p.fgm++;
        } else {
          p.xpa++;
          if (e.good) p.xpm++;
        }
        break;
      }
      case 'kickReturn':
        ps(e.returner).kickRetYds += e.yards;
        break;
      case 'touchdown': {
        if (e.via === 'pass') {
          ps(e.scorer).recTD++;
          if (e.passer) ps(e.passer).passTD++;
          const t = ts(e.scorer);
          if (t) t.passTD++;
        } else if (e.via === 'rush') {
          ps(e.scorer).rushTD++;
          const t = ts(e.scorer);
          if (t) t.rushTD++;
        }
        break;
      }
    }
  }
}

function enforcePreSnap(state: GameState, pen: PenaltyCall, tags: string[]): void {
  const offense = state.possession;
  const yards = PENALTY_YARDS[pen.type];
  state.teamStats[pen.against].penalties++;
  if (pen.against === offense) {
    const dist = Math.min(yards, Math.floor(state.ballOn / 2));
    state.ballOn -= dist;
    state.toGo += dist;
    state.teamStats[pen.against].penaltyYds += dist;
  } else {
    const dist = Math.min(yards, Math.floor((100 - state.ballOn) / 2));
    state.ballOn += dist;
    state.toGo -= dist;
    state.teamStats[pen.against].penaltyYds += dist;
    if (state.toGo <= 0) {
      state.down = 1;
      state.toGo = Math.min(10, 100 - state.ballOn);
      tags.push('FIRST_DOWN');
    }
  }
  state.ballOn = clampSpot(state.ballOn);
  state.clockRunning = false;
  tags.push(`PENALTY:${pen.type}`);
}

/** Valeur heuristique d'un état pour une équipe (utilisée pour accepter/refuser une pénalité). */
export function stateValue(s: GameState, team: Side): number {
  let v = (s.score[team] - s.score[other(team)]) * 1.0;
  const pos = s.nextKind === 'kickoff' ? other(s.possession) : s.possession;
  const fieldValue =
    s.nextKind === 'kickoff'
      ? 0.8
      : s.nextKind === 'conversion'
        ? 0.9
        : (s.ballOn - 25) / 14 - (s.down - 1) * 0.45 - Math.min(s.toGo, 25) * 0.05 + (s.down === 4 ? -1.2 : 0);
  v += pos === team ? fieldValue : -fieldValue;
  return v;
}

function cloneState(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s));
}

/**
 * Applique le résultat d'une action à l'état du match. Renvoie les tags de log.
 * C'est l'unique point d'entrée pour faire évoluer le score, les downs et la possession.
 */
export function resolvePlay(state: GameState, result: PlayResult, rules: RulesConfig): string[] {
  if (state.finished) return ['IGNORED_FINISHED'];
  const tags: string[] = [];
  const before = { down: state.down, toGo: state.toGo, ballOn: state.ballOn, offense: state.possession, quarter: state.quarter, clock: state.clock };
  const ownerBefore = possessionOwner(state);
  const scoreBefore: [number, number] = [state.score[0], state.score[1]];
  const wasConversion = state.nextKind === 'conversion';
  state.playNumber++;
  state.lastPeriodEnded = 'none';

  // Temps de jeu
  const elapsed = Math.max(0, Math.min(result.elapsed, state.clock));
  if (!wasConversion) {
    state.clock = Math.max(0, state.clock - result.elapsed);
    state.teamStats[state.possession].timeOfPossession += elapsed;
  }

  if (result.preSnapPenalty && rules.penaltiesEnabled) {
    enforcePreSnap(state, result.preSnapPenalty, tags);
  } else {
    const penalties = rules.penaltiesEnabled ? result.penalties : [];
    const sides = new Set(penalties.map((p) => p.against));
    if (sides.size === 2) {
      // Fautes compensées : le down est rejoué
      tags.push('PENALTY:offsetting');
      state.clockRunning = false;
      for (const p of penalties) state.teamStats[p.against].penalties++;
    } else if (penalties.length > 0) {
      const pen = penalties[0];
      const victim = other(pen.against);
      const declined = cloneState(state);
      const declinedTags = applyOutcome(declined, result, rules);
      const accepted = cloneState(state);
      const acceptedTags = enforceLivePenalty(accepted, result, pen, rules);
      if (stateValue(accepted, victim) >= stateValue(declined, victim)) {
        Object.assign(state, accepted);
        tags.push(...acceptedTags, `PENALTY:${pen.type}:accepted`);
        state.teamStats[pen.against].penalties++;
      } else {
        Object.assign(state, declined);
        tags.push(...declinedTags, `PENALTY:${pen.type}:declined`);
        state.teamStats[pen.against].penalties++;
      }
    } else {
      tags.push(...applyOutcome(state, result, rules));
    }
  }

  // Prolongation : mort subite modifiée
  if (state.ot && !state.finished) {
    const ownerAfter = possessionOwner(state);
    const scored = state.score[0] !== scoreBefore[0] || state.score[1] !== scoreBefore[1];
    const completedBefore = state.ot.possessionsCompleted;
    if (ownerAfter !== ownerBefore) state.ot.possessionsCompleted++;
    if (scored) {
      const fg = tags.includes('FG_GOOD');
      if (!fg) finish(state, tags);
      else if (completedBefore > 0 || ownerBefore !== state.ot.firstPossessor) {
        if (leader(state) !== null) finish(state, tags);
      }
    } else if (state.ot.possessionsCompleted >= 2 && leader(state) !== null) {
      finish(state, tags);
    }
  }

  // Fin de période
  if (!state.finished && state.clock <= 0 && state.nextKind !== 'conversion') {
    endPeriod(state, rules, tags);
  }

  state.log.push({
    n: state.playNumber,
    quarter: before.quarter,
    clock: before.clock,
    offense: before.offense,
    down: before.down,
    toGo: before.toGo,
    ballOn: before.ballOn,
    summary: result.summary,
    tags,
    score: [state.score[0], state.score[1]],
  });
  return tags;
}

function finish(state: GameState, tags: string[]): void {
  state.finished = true;
  state.winner = leader(state);
  state.clockRunning = false;
  tags.push('GAME_OVER');
}

function endPeriod(state: GameState, rules: RulesConfig, tags: string[]): void {
  const q = state.quarter;
  if (q === 1 || q === 3) {
    state.quarter++;
    state.clock = quarterSeconds(rules);
    state.clockRunning = false;
    state.lastPeriodEnded = 'quarter';
    tags.push('END_QUARTER');
  } else if (q === 2) {
    state.quarter = 3;
    state.clock = quarterSeconds(rules);
    state.timeouts = [rules.timeoutsPerHalf, rules.timeoutsPerHalf];
    state.lastPeriodEnded = 'half';
    tags.push('HALFTIME');
    setKickoff(state, other(state.openingKicker), rules.kickoffSpot);
  } else if (q === 4 || q >= 5) {
    const lead = leader(state);
    if (lead !== null) {
      state.lastPeriodEnded = q === 4 ? 'regulation' : 'overtime';
      finish(state, tags);
      return;
    }
    const canPlayOt = rules.overtime.enabled && (q === 4 || !rules.overtime.allowTie);
    if (!canPlayOt) {
      state.lastPeriodEnded = q === 4 ? 'regulation' : 'overtime';
      finish(state, tags);
      return;
    }
    state.quarter = q + 1;
    state.clock = overtimeSeconds(rules);
    state.clockRunning = false;
    state.timeouts = [2, 2];
    state.lastPeriodEnded = q === 4 ? 'regulation' : 'overtime';
    tags.push('OVERTIME');
    if (q === 4) {
      state.needsCoinToss = true;
      setKickoff(state, 0, rules.kickoffSpot); // remplacé par le toss
    }
  }
}

/** Score et suite après un touchdown pour `team`. */
function scoreTouchdown(state: GameState, team: Side, rules: RulesConfig, tags: string[]): void {
  state.score[team] += 6;
  tags.push('TOUCHDOWN');
  state.clockRunning = false;
  state.possession = team;
  state.nextKind = 'conversion';
  state.ballOn = 100 - rules.extraPointSpot;
  state.down = 1;
  state.toGo = rules.extraPointSpot;
}

function scoreSafety(state: GameState, conceding: Side, rules: RulesConfig, tags: string[]): void {
  state.score[other(conceding)] += 2;
  tags.push('SAFETY');
  setKickoff(state, conceding, rules.safetyFreeKickSpot);
}

/** Résultat sans pénalité. */
function applyOutcome(state: GameState, r: PlayResult, rules: RulesConfig): string[] {
  const tags: string[] = [];
  const offense = state.possession;
  const defense = other(offense);
  const los = state.ballOn;
  const P = r.finalPossessor;
  // position en repère de l'équipe P
  const spotForP = P === offense ? r.endSpot : 100 - r.endSpot;
  applyStats(state, r.stats);

  if (r.kind === 'kneel') {
    advanceDowns(state, Math.max(1, los - 1), tags);
    state.clockRunning = true;
    return tags;
  }

  if (state.nextKind === 'conversion') {
    const isKick = r.kind === 'extraPoint';
    const ts = state.teamStats[offense];
    if (isKick) {
      ts.xpAtt++;
      if (r.kickGood) {
        ts.xpMade++;
        state.score[offense] += 1;
        tags.push('XP_GOOD');
      } else tags.push('XP_NO_GOOD');
    } else {
      ts.twoPtAtt++;
      if (P === offense && spotForP >= 100 && !r.incomplete) {
        ts.twoPtMade++;
        state.score[offense] += 2;
        tags.push('TWO_PT_GOOD');
      } else if (P === defense && spotForP >= 100) {
        state.score[defense] += 2;
        tags.push('DEFENSIVE_TWO_PT');
      } else tags.push('TWO_PT_FAILED');
    }
    setKickoff(state, offense, rules.kickoffSpot);
    return tags;
  }

  if (r.kind === 'fieldGoal') {
    const ts = state.teamStats[offense];
    ts.fgAtt++;
    if (r.kickGood) {
      ts.fgMade++;
      state.score[offense] += 3;
      tags.push('FG_GOOD');
      setKickoff(state, offense, rules.kickoffSpot);
    } else {
      tags.push('FG_NO_GOOD');
      setFirstDown(state, defense, Math.max(20, 100 - (los - 7)));
      state.clockRunning = false;
    }
    return tags;
  }

  if (r.kind === 'kickoff' || r.kind === 'punt') {
    const kicker = offense;
    const receiver = defense;
    if (r.kind === 'punt') state.teamStats[kicker].punts++;
    state.clockRunning = false;
    if (r.kickOutOfBounds && P === receiver) {
      if (r.kind === 'kickoff') setFirstDown(state, receiver, rules.kickoffOutOfBoundsSpot);
      else setFirstDown(state, receiver, Math.max(1, 100 - r.endSpot));
      tags.push('KICK_OUT_OF_BOUNDS');
      return tags;
    }
    if (r.kickTouchback) {
      setFirstDown(state, receiver, r.kind === 'kickoff' ? rules.kickoffTouchbackSpot : rules.puntTouchbackSpot);
      tags.push('TOUCHBACK');
      return tags;
    }
    if (P === receiver) {
      if (spotForP >= 100) {
        scoreTouchdown(state, receiver, rules, tags);
        tags.push('RETURN_TD');
      } else if (spotForP <= 0) {
        if (r.possessionChangedInEndZone) {
          setFirstDown(state, receiver, r.kind === 'kickoff' ? rules.kickoffTouchbackSpot : rules.puntTouchbackSpot);
          tags.push('TOUCHBACK');
        } else scoreSafety(state, receiver, rules, tags);
      } else {
        setFirstDown(state, receiver, spotForP);
        if (r.fairCatch) tags.push('FAIR_CATCH');
      }
    } else {
      // ballon récupéré par l'équipe qui a botté
      tags.push('KICK_RECOVERED');
      if (spotForP >= 100) scoreTouchdown(state, kicker, rules, tags);
      else setFirstDown(state, kicker, spotForP);
    }
    return tags;
  }

  // Action de scrimmage
  if (P === offense) {
    if (r.incomplete) {
      tags.push('INCOMPLETE');
      state.clockRunning = false;
      advanceDowns(state, los, tags);
      return tags;
    }
    if (spotForP >= 100) {
      scoreTouchdown(state, offense, rules, tags);
      return tags;
    }
    if (spotForP <= 0) {
      scoreSafety(state, offense, rules, tags);
      return tags;
    }
    state.clockRunning = !r.outOfBounds;
    advanceDowns(state, Math.min(99, Math.round(spotForP)), tags);
    return tags;
  }

  // Changement de possession pendant l'action (interception / fumble perdu)
  tags.push(r.turnover === 'interception' ? 'INTERCEPTION' : 'FUMBLE_LOST');
  state.clockRunning = false;
  if (spotForP >= 100) {
    scoreTouchdown(state, defense, rules, tags);
    tags.push('DEFENSIVE_TD');
  } else if (spotForP <= 0) {
    if (r.possessionChangedInEndZone) {
      setFirstDown(state, defense, 20);
      tags.push('TOUCHBACK');
    } else scoreSafety(state, defense, rules, tags);
  } else {
    setFirstDown(state, defense, spotForP);
  }
  return tags;
}

/** Avance les downs. Renvoie true si premier down obtenu. */
function advanceDowns(state: GameState, newSpot: number, tags: string[]): boolean {
  const offense = state.possession;
  const lineToGain = state.ballOn + state.toGo;
  const wasThird = state.down === 3;
  if (wasThird) state.teamStats[offense].thirdDownAtt++;
  if (newSpot >= lineToGain) {
    if (wasThird) {
      tags.push('THIRD_DOWN_CONV');
      state.teamStats[offense].thirdDownConv++;
    }
    state.teamStats[offense].firstDowns++;
    setFirstDown(state, offense, newSpot);
    tags.push('FIRST_DOWN');
    return true;
  }
  state.down++;
  state.toGo = lineToGain - newSpot;
  state.ballOn = clampSpot(newSpot);
  state.toGo = Math.max(1, lineToGain - state.ballOn);
  if (state.down > 4) {
    tags.push('TURNOVER_ON_DOWNS');
    setFirstDown(state, other(offense), 100 - state.ballOn);
    state.clockRunning = false;
  }
  return false;
}

function enforceLivePenalty(state: GameState, r: PlayResult, pen: PenaltyCall, rules: RulesConfig): string[] {
  const tags: string[] = [];
  const offense = state.possession;
  state.clockRunning = false;
  if (pen.type === 'holding' && pen.against === offense) {
    const dist = Math.min(PENALTY_YARDS.holding, Math.floor(state.ballOn / 2));
    state.ballOn = clampSpot(state.ballOn - dist);
    state.toGo += dist;
    state.teamStats[offense].penaltyYds += dist;
    if (state.nextKind === 'conversion') state.toGo = 100 - state.ballOn;
    return tags;
  }
  if (pen.type === 'passInterference' && pen.against !== offense) {
    let spot = pen.spot ?? state.ballOn + 5;
    if (spot >= 100) spot = 99;
    const yards = Math.max(1, spot - state.ballOn);
    state.teamStats[pen.against].penaltyYds += yards;
    if (state.nextKind === 'conversion') {
      state.ballOn = 99;
      state.toGo = 1;
      return tags;
    }
    state.teamStats[offense].firstDowns++;
    setFirstDown(state, offense, Math.max(state.ballOn + 1, spot));
    tags.push('FIRST_DOWN');
    return tags;
  }
  if (pen.type === 'facemask' && pen.against !== offense) {
    // L'action est validée puis 15 yards ajoutés au point d'arrivée
    const t = applyOutcome(state, r, rules);
    tags.push(...t);
    if (state.possession === offense && state.nextKind === 'scrimmage') {
      const dist = Math.min(15, Math.floor((100 - state.ballOn) / 2));
      state.teamStats[pen.against].penaltyYds += dist;
      setFirstDown(state, offense, state.ballOn + dist);
      if (!tags.includes('FIRST_DOWN')) tags.push('FIRST_DOWN');
    }
    state.clockRunning = false;
    return tags;
  }
  // pénalité inattendue : on applique simplement l'action
  return applyOutcome(state, r, rules);
}

/** Line to gain en repère de l'attaque. */
export const lineToGain = (s: GameState): number => Math.min(100, s.ballOn + s.toGo);

/** Direction d'attaque (+1 vers x croissant) d'une équipe selon le quart-temps. */
export function attackDir(team: Side, quarter: number): 1 | -1 {
  const homeDir = quarter % 2 === 1 ? 1 : -1;
  return (team === 0 ? homeDir : -homeDir) as 1 | -1;
}
