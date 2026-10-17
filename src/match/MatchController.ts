import { EventBus } from '../core/events';
import { FIELD } from '../core/config';
import { Rng } from '../core/rng';
import {
  chooseDefensivePlay, chooseOffensivePlay, decideConversion, DEFAULT_GAMEPLAN, shouldCallTimeout,
  type GamePlan, type ScoutingReport,
} from '../ai/playcaller';
import { DEF_FRONTS, DEFENSIVE_PLAYS, FORMATIONS, OFFENSIVE_PLAYS, defPlayById, playById, type DefensivePlay, type OffensivePlay } from '../data/playbook';
import type { Player, Team } from '../data/types';
import { DEFAULT_RULES, type RulesConfig } from '../rules/config';
import {
  applyCoinToss, applyRunoff, attackDir, callTimeout, createGameState, leader, lineToGain, resolvePlay, setConversionType,
} from '../rules/engine';
import { playerImpact } from '../rules/stats';
import { other, type GameState, type PlayResult, type Side } from '../rules/types';
import { PlaySim } from '../sim/PlaySim';
import { kickoffCoverage, kickReturnUnit, selectPersonnel } from '../sim/personnel';
import { DIFFICULTIES, emptyInput, type Difficulty, type PlaySetup, type SimEvent, type SimInput, type SimKind } from '../sim/types';

export type MatchPhase =
  | 'PreGame' | 'CoinToss' | 'PlaySelection' | 'PreSnap' | 'LivePlay' | 'PassInFlight' | 'BallDead'
  | 'PlayReview' | 'QuarterBreak' | 'Halftime' | 'MatchFinished';

export type MatchEvent =
  | { type: 'phase'; phase: MatchPhase }
  | { type: 'sim'; event: SimEvent }
  | { type: 'resolved'; tags: string[]; result: PlayResult }
  | { type: 'coinToss'; winner: Side; userCall?: 'heads' | 'tails'; result: 'heads' | 'tails' }
  | { type: 'timeout'; team: Side }
  | { type: 'finished'; winner: Side | null };

export interface MatchOptions {
  rules?: RulesConfig;
  difficulty?: Difficulty['id'];
  /**
   * Équipe entraînée par l'utilisateur (il appelle les actions, les joueurs sont tous dirigés par l'IA),
   * null = IA contre IA (spectateur / simulation).
   */
  userSide: Side | null;
  seed?: number;
  plans?: [GamePlan, GamePlan];
  /** Mode sans interface : pas de temps morts d'affichage. */
  headless?: boolean;
  /** Tactiques disponibles pour l'entraîneur (débloquées à l'académie) ; les actions spéciales restent disponibles. */
  playbook?: { off: string[]; def: string[] };
  /** Actions imposées aux deux équipes (démonstrations au ralenti de l'académie). */
  forcedCalls?: { off?: string; def?: string };
  /** Condition de fin anticipée (Arena : fin du drive), vérifiée avant chaque action. */
  endCheck?: (s: GameState) => boolean;
}

const BANNER_TIME = { review: 1.7, reviewScore: 3.0, quarter: 2.2, dead: 1.35 };

export class MatchController {
  readonly teams: [Team, Team];
  readonly rules: RulesConfig;
  readonly difficulty: Difficulty;
  readonly userSide: Side | null;
  readonly state: GameState;
  readonly bus = new EventBus<MatchEvent>();
  readonly headless: boolean;
  readonly rng: Rng;
  phase: MatchPhase = 'PreGame';
  phaseTime = 0;
  sim: PlaySim | null = null;
  ballY = FIELD.width / 2;
  offCall: OffensivePlay | null = null;
  defCall: DefensivePlay | null = null;
  conversionType: 'kick' | 'two' | null = null;
  lastTags: string[] = [];
  lastResult: PlayResult | null = null;
  /** L'entraîneur adjoint appelle les actions à la place de l'utilisateur. */
  autoCoach = false;
  /** Consigne de l'entraîneur pour la prochaine passe : receveur prioritaire (slot). */
  priorityTarget: string | null = null;
  plans: [GamePlan, GamePlan];
  scouting: [ScoutingReport, ScoutingReport] = [{ passes: 0, runs: 0 }, { passes: 0, runs: 0 }];
  recentCalls: [string[], string[]] = [[], []];
  fatigue = new Map<string, number>();
  paused = false;
  /** Entraînement / tutoriel : permet de fixer la situation avant chaque action. */
  practiceHook: ((s: GameState) => void) | null = null;
  private accumulator = 0;
  private pendingBanner: MatchPhase | null = null;

  constructor(home: Team, away: Team, private readonly opts: MatchOptions) {
    this.teams = [home, away];
    this.rules = opts.rules ?? DEFAULT_RULES;
    this.difficulty = DIFFICULTIES[opts.difficulty ?? 'normal'];
    this.userSide = opts.userSide;
    this.headless = opts.headless ?? false;
    this.rng = new Rng(opts.seed ?? (Date.now() >>> 0));
    this.plans = opts.plans ?? [DEFAULT_GAMEPLAN, DEFAULT_GAMEPLAN];
    const sideOf: Record<string, Side> = {};
    for (const p of home.roster) sideOf[p.id] = 0;
    for (const p of away.roster) sideOf[p.id] = 1;
    this.state = createGameState(this.rules, sideOf, 0);
  }

  // ——————————————————————— Cycle de vie ———————————————————————

  private setPhase(p: MatchPhase): void {
    this.phase = p;
    this.phaseTime = 0;
    this.bus.emit({ type: 'phase', phase: p });
  }

  start(): void {
    this.setPhase('CoinToss');
    if (this.userSide === null || this.headless) this.resolveCoinToss(this.rng.chance(0.5) ? 'heads' : 'tails');
  }

  /** Pile ou face : l'utilisateur annonce, le gagnant choisit. */
  resolveCoinToss(call: 'heads' | 'tails', userChoice: 'receive' | 'kick' = 'receive'): Side {
    if (this.phase !== 'CoinToss') return 0;
    const result = this.rng.chance(0.5) ? 'heads' : 'tails';
    const caller: Side = this.userSide ?? 1;
    const winner: Side = result === call ? caller : other(caller);
    let receiver: Side;
    if (this.userSide !== null && winner === this.userSide) receiver = userChoice === 'receive' ? winner : other(winner);
    else receiver = this.rng.chance(0.7) ? other(winner) : winner; // l'IA préfère différer
    this.bus.emit({ type: 'coinToss', winner, userCall: this.userSide !== null ? call : undefined, result });
    applyCoinToss(this.state, receiver, this.rules);
    this.prepareNext();
    return winner;
  }

  /** Avance la simulation (pas fixe interne de 1/60 s). */
  update(dt: number, input: SimInput = emptyInput()): void {
    if (this.paused || this.phase === 'MatchFinished') return;
    this.phaseTime += dt;
    switch (this.phase) {
      case 'PreSnap': {
        if (!this.sim) return;
        this.stepSim(dt, input);
        // les joueurs sont tous dirigés par l'IA : snap automatique après la mise en place
        const autoDelay = this.headless ? 0 : 1.2 + (this.sim.setup.seed % 10) / 20;
        if (this.phaseTime >= autoDelay) this.snap();
        break;
      }
      case 'LivePlay':
      case 'PassInFlight': {
        if (!this.sim) return;
        this.stepSim(dt, input);
        if (this.sim.phase === 'dead') this.setPhase('BallDead');
        else {
          const air = this.sim.ball.state === 'air' && this.sim.ball.flight === 'pass';
          if (air && this.phase !== 'PassInFlight') this.setPhase('PassInFlight');
          else if (!air && this.phase === 'PassInFlight') this.setPhase('LivePlay');
        }
        break;
      }
      case 'BallDead': {
        if (this.sim) this.stepSim(dt, emptyInput());
        if (this.headless || this.phaseTime >= BANNER_TIME.dead) this.resolveCurrentPlay();
        break;
      }
      case 'PlayReview': {
        if (this.sim) this.stepSim(dt, emptyInput());
        const scoring = this.lastTags.some((t) => ['TOUCHDOWN', 'FG_GOOD', 'SAFETY', 'XP_GOOD', 'TWO_PT_GOOD'].includes(t));
        const wait = scoring ? BANNER_TIME.reviewScore : BANNER_TIME.review;
        if (this.headless || this.phaseTime >= wait) this.afterReview();
        break;
      }
      case 'QuarterBreak':
      case 'Halftime':
        if (this.headless || this.phaseTime >= BANNER_TIME.quarter) this.prepareNext(true);
        break;
      case 'PlaySelection':
        if (this.userSide === null || this.autoCoach) this.aiSelectAll();
        break;
      default:
        break;
    }
  }

  private stepSim(dt: number, input: SimInput): void {
    const sim = this.sim!;
    const step = 1 / 60;
    this.accumulator += Math.min(dt, 0.1);
    let first = true;
    while (this.accumulator >= step) {
      // les impulsions (boutons) ne sont consommées qu'une fois
      sim.step(step, first ? input : { ...input, pass: false, juke: false, dive: false, tackle: false, jump: false, switchPlayer: false, fairCatch: false });
      first = false;
      this.accumulator -= step;
    }
    if (sim.events.length) {
      for (const e of sim.events) this.bus.emit({ type: 'sim', event: e });
      sim.events.length = 0;
    }
  }

  // ——————————————————————— Sélection des actions ———————————————————————

  /** Prépare l'action suivante selon l'état des règles. */
  private prepareNext(fromBanner = false): void {
    const s = this.state;
    if (this.opts.endCheck && !s.finished && s.nextKind !== 'conversion' && this.opts.endCheck(s)) {
      s.finished = true;
      s.winner = s.score[0] === s.score[1] ? null : s.score[0] > s.score[1] ? 0 : 1;
    }
    if (this.practiceHook) {
      this.practiceHook(s);
      this.pendingBanner = null;
    }
    if (s.finished) {
      this.setPhase('MatchFinished');
      this.bus.emit({ type: 'finished', winner: s.winner });
      return;
    }
    if (!fromBanner && this.pendingBanner) {
      const b = this.pendingBanner;
      this.pendingBanner = null;
      this.setPhase(b);
      return;
    }
    if (s.needsCoinToss) {
      this.setPhase('CoinToss');
      if (this.userSide === null || this.headless) this.resolveCoinToss(this.rng.chance(0.5) ? 'heads' : 'tails');
      return;
    }
    this.offCall = null;
    this.defCall = null;
    this.conversionType = null;
    if (s.nextKind === 'kickoff') {
      this.ballY = FIELD.width / 2;
      this.buildSim('kickoff', null, null);
      this.setPhase('PreSnap');
      return;
    }
    if (s.nextKind === 'conversion') this.ballY = FIELD.width / 2;
    // temps morts de l'IA
    for (const side of [0, 1] as Side[]) {
      if (side !== this.userSide && shouldCallTimeout(s, this.rules, side) && callTimeout(s, side)) {
        this.bus.emit({ type: 'timeout', team: side });
      }
    }
    this.setPhase('PlaySelection');
    this.aiSelectAll();
  }

  /** Côté appelé par l'IA : adversaire, spectateur, ou entraîneur adjoint en mode automatique. */
  private aiCalls(side: Side): boolean {
    return side !== this.userSide || this.autoCoach;
  }

  private allowedFor(side: Side): { off?: Set<string>; def?: Set<string> } {
    const book = side === this.userSide ? this.opts.playbook : undefined;
    return book ? { off: new Set(book.off), def: new Set(book.def) } : {};
  }

  /** Suggestion d'attaque de l'entraîneur adjoint (limitée aux tactiques disponibles). */
  suggestOffense(): OffensivePlay {
    const s = this.state;
    const off = this.userSide ?? s.possession;
    return chooseOffensivePlay(s, this.rules, this.teams[off], new Rng(this.rng.int(0, 2 ** 31)), this.plans[off], this.recentCalls[off], this.allowedFor(off).off);
  }

  /** Suggestion de défense de l'entraîneur adjoint (formation adverse supposée selon la situation). */
  suggestDefense(visible: OffensivePlay['formation'] = 'shotgun'): DefensivePlay {
    const s = this.state;
    const def = this.userSide ?? other(s.possession);
    return chooseDefensivePlay(s, this.rules, new Rng(this.rng.int(0, 2 ** 31)), visible, this.scouting[s.possession], this.plans[def], this.recentCalls[def], this.allowedFor(def).def);
  }

  private aiSelectAll(): void {
    const s = this.state;
    const off = s.possession;
    const def = other(off);
    const forced = this.opts.forcedCalls;
    if (this.aiCalls(off) && !this.offCall) {
      if (s.nextKind === 'conversion' && !this.conversionType) {
        this.conversionType = decideConversion(s, this.rules);
        setConversionType(s, this.conversionType, this.rules);
      }
      if (forced?.off && s.nextKind === 'scrimmage') this.offCall = playById(forced.off);
      else if (s.nextKind === 'conversion' && this.conversionType === 'kick') this.offCall = playById('fieldGoal');
      else if (off !== this.userSide && this.difficulty.id === 'easy' && s.nextKind === 'scrimmage' && s.down < 4 && this.rng.chance(0.35)) {
        // adversaire facile : appels moins adaptés à la situation
        const pool = OFFENSIVE_PLAYS.filter((p) => p.category !== 'special');
        this.offCall = pool[this.rng.int(0, pool.length - 1)];
      } else this.offCall = chooseOffensivePlay(s, this.rules, this.teams[off], this.rng, this.plans[off], this.recentCalls[off], this.allowedFor(off).off);
      if (s.nextKind === 'conversion' && this.conversionType === 'two' && this.offCall.category === 'special') this.offCall = playById('quickSlants');
    }
    if (this.aiCalls(def) && !this.defCall && this.offCall) {
      if (forced?.def) this.defCall = defPlayById(forced.def);
      else if (def !== this.userSide && this.difficulty.id === 'easy' && this.rng.chance(0.35)) this.defCall = DEFENSIVE_PLAYS[this.rng.int(0, DEFENSIVE_PLAYS.length - 1)];
      else {
        // adversaire difficile : il « lit » souvent les intentions (tendance de l'action réellement appelée)
        const peek = def !== this.userSide && this.difficulty.id === 'hard' && this.offCall.category !== 'special' && this.rng.chance(0.3);
        const scout = peek ? (this.offCall.category === 'pass' ? { passes: 9, runs: 1 } : { passes: 1, runs: 9 }) : this.scouting[off];
        this.defCall = chooseDefensivePlay(s, this.rules, this.rng, this.offCall.formation, scout, this.plans[def], this.recentCalls[def], this.allowedFor(def).def);
      }
    }
    this.tryStartPlay();
  }

  /** Choix de conversion par l'utilisateur. */
  chooseConversion(type: 'kick' | 'two'): void {
    if (this.phase !== 'PlaySelection' || this.state.nextKind !== 'conversion' || this.state.possession !== this.userSide) return;
    this.conversionType = type;
    setConversionType(this.state, type, this.rules);
    if (type === 'kick') this.selectOffense('fieldGoal');
  }

  selectOffense(playId: string): boolean {
    if (this.phase !== 'PlaySelection' || this.state.possession !== this.userSide || this.offCall) return false;
    const p = playById(playId);
    if (this.state.nextKind === 'conversion') {
      if (!this.conversionType) {
        this.conversionType = p.subtype === 'fieldGoal' ? 'kick' : 'two';
        setConversionType(this.state, this.conversionType, this.rules);
      }
      if (this.conversionType === 'two' && p.category === 'special') return false;
    }
    if (p.subtype === 'kneel' && this.state.nextKind === 'conversion') return false;
    // consigne de l'entraîneur : receveur prioritaire en tête de la lecture du QB
    const target = this.priorityTarget;
    this.priorityTarget = null;
    this.offCall = target && p.progression?.includes(target) ? { ...p, progression: [target, ...p.progression.filter((x) => x !== target)] } : p;
    this.aiSelectAll();
    return true;
  }

  selectDefense(playId: string): boolean {
    if (this.phase !== 'PlaySelection' || this.state.possession === this.userSide || this.defCall) return false;
    this.defCall = defPlayById(playId);
    this.aiSelectAll();
    return true;
  }

  /** Temps mort demandé par l'utilisateur pendant la sélection. */
  userTimeout(): boolean {
    if (this.userSide === null || this.phase !== 'PlaySelection') return false;
    const ok = callTimeout(this.state, this.userSide);
    if (ok) this.bus.emit({ type: 'timeout', team: this.userSide });
    return ok;
  }

  private tryStartPlay(): void {
    if (!this.offCall || !this.defCall || this.phase !== 'PlaySelection') return;
    const s = this.state;
    let kind: SimKind = 'scrimmage';
    if (s.nextKind === 'conversion') kind = this.conversionType === 'kick' ? 'extraPoint' : 'twoPoint';
    else if (this.offCall.subtype === 'punt') kind = 'punt';
    else if (this.offCall.subtype === 'fieldGoal') kind = 'fieldGoal';
    this.recentCalls[s.possession] = [this.offCall.id, ...this.recentCalls[s.possession]].slice(0, 3);
    this.recentCalls[other(s.possession)] = [this.defCall.id, ...this.recentCalls[other(s.possession)]].slice(0, 3);
    this.buildSim(kind, this.offCall, this.defCall);
    this.setPhase('PreSnap');
  }

  private buildSim(kind: SimKind, off: OffensivePlay | null, def: DefensivePlay | null): void {
    const s = this.state;
    const offense = s.possession;
    const dir = attackDir(offense, s.quarter);
    const ownGoal = dir > 0 ? FIELD.goalLeft : FIELD.goalRight;
    const losX = ownGoal + s.ballOn * dir;
    const offTeam = this.teams[offense];
    const defTeam = this.teams[other(offense)];
    let offPlayers: Map<string, Player>;
    let defPlayers: Map<string, Player>;
    if (kind === 'kickoff') {
      offPlayers = kickoffCoverage(offTeam);
      defPlayers = kickReturnUnit(defTeam);
    } else {
      offPlayers = selectPersonnel(offTeam, FORMATIONS[off!.formation]);
      if (kind === 'punt') {
        const front = DEF_FRONTS['43'].map((x) => ({ ...x }));
        defPlayers = selectPersonnel(defTeam, front);
        const ret = kickReturnUnit(defTeam).get('KR')!;
        // le retourneur remplace le free safety
        const used = new Set([...defPlayers.values()].map((p) => p.id));
        defPlayers.delete('FS');
        defPlayers.set('PR', used.has(ret.id) ? selectPersonnel(defTeam, [{ slot: 'PR', pos: 'WR', down: 0, lat: 0, role: 's', depthIndex: 2 }]).get('PR')! : ret);
      } else if (kind === 'fieldGoal' || kind === 'extraPoint') {
        defPlayers = selectPersonnel(defTeam, DEF_FRONTS.goalLine);
      } else {
        defPlayers = selectPersonnel(defTeam, DEF_FRONTS[def!.front]);
      }
    }
    const qLen = this.rules.quarterMinutes * 60;
    const diff = s.score[offense] - s.score[other(offense)];
    const late = s.quarter >= 4 && s.clock < qLen * 0.35;
    const setup: PlaySetup = {
      kind,
      offense,
      dir,
      losX,
      ballY: this.ballY,
      lineToGainX: ownGoal + lineToGain(s) * dir,
      offPlay: kind === 'kickoff' ? null : off,
      defPlay: def ?? DEFENSIVE_PLAYS[0],
      offPlayers,
      defPlayers,
      // aucun joueur n'est dirigé par l'utilisateur : l'entraîneur ne fait qu'appeler les actions
      userSide: null,
      lockedPlayerId: null,
      userDefSlot: null,
      // tous les joueurs sont dirigés par l'IA : mêmes réflexes des deux côtés, la difficulté porte sur le coach adverse
      difficulty: DIFFICULTIES.normal,
      rules: this.rules,
      seed: this.rng.int(0, 2 ** 31),
      situation: { trailingLate: late && diff < 0, leadingLate: late && diff > 0, down: s.down, toGo: s.toGo },
      fatigue: this.fatigue,
      autoSwitch: false,
      userKicks: false,
    };
    this.sim = new PlaySim(setup);
    this.accumulator = 0;
  }

  /** Snap (automatique après la mise en place). */
  snap(): boolean {
    if (this.phase !== 'PreSnap' || !this.sim) return false;
    applyRunoff(this.state, this.rules);
    this.sim.snap();
    if (this.sim.phase === 'dead') this.setPhase('BallDead');
    else this.setPhase('LivePlay');
    return true;
  }

  // ——————————————————————— Résolution ———————————————————————

  private resolveCurrentPlay(): void {
    const sim = this.sim!;
    const result = sim.result!;
    const s = this.state;
    const offense = s.possession;
    // repérage des tendances (observables) de l'attaque
    if (sim.setup.kind === 'scrimmage' && sim.setup.offPlay) {
      if (sim.setup.offPlay.category === 'pass') this.scouting[offense].passes++;
      else if (sim.setup.offPlay.category === 'run') this.scouting[offense].runs++;
    }
    // position latérale du prochain snap (entre les hash marks)
    const endY = sim.ball.y;
    const half = FIELD.width / 2;
    this.ballY = Math.max(half - FIELD.hashOffset, Math.min(half + FIELD.hashOffset, endY));
    if (result.incomplete || result.preSnapPenalty) this.ballY = sim.setup.ballY;
    // fatigue
    for (const a of sim.agents) {
      const cur = this.fatigue.get(a.player.id) ?? 0;
      this.fatigue.set(a.player.id, Math.min(0.6, cur + 0.035 * (1.5 - a.player.attrs.stamina / 100)));
    }
    for (const [id, f] of this.fatigue) {
      if (!sim.agents.some((a) => a.player.id === id)) this.fatigue.set(id, Math.max(0, f - 0.05));
    }
    const quarterBefore = s.quarter;
    const tags = resolvePlay(s, result, this.rules);
    this.lastTags = tags;
    this.lastResult = result;
    this.bus.emit({ type: 'resolved', tags, result });
    if (s.lastPeriodEnded === 'half') this.pendingBanner = 'Halftime';
    else if (s.lastPeriodEnded === 'quarter' || (s.quarter !== quarterBefore && !s.finished)) this.pendingBanner = 'QuarterBreak';
    this.setPhase('PlayReview');
  }

  private afterReview(): void {
    this.prepareNext();
  }

  // ——————————————————————— Accès utilitaires ———————————————————————

  /** Chronomètre affiché (décompte pendant l'action). */
  displayClock(): number {
    const s = this.state;
    if (this.sim && (this.phase === 'LivePlay' || this.phase === 'PassInFlight') && s.nextKind !== 'conversion') {
      return Math.max(0, s.clock - this.sim.t);
    }
    return s.clock;
  }

  /** Position x monde d'une ligne exprimée en repère de l'équipe en possession. */
  worldX(spotFromPossession: number): number {
    const dir = attackDir(this.state.possession, this.state.quarter);
    const ownGoal = dir > 0 ? FIELD.goalLeft : FIELD.goalRight;
    return ownGoal + spotFromPossession * dir;
  }

  offensePlaysForUser(): OffensivePlay[] {
    const s = this.state;
    if (s.nextKind === 'conversion') {
      if (this.conversionType === 'two') return OFFENSIVE_PLAYS.filter((p) => p.category !== 'special');
      return OFFENSIVE_PLAYS.filter((p) => p.subtype === 'fieldGoal' || p.category !== 'special');
    }
    const book = this.opts.playbook?.off;
    return OFFENSIVE_PLAYS.filter((p) => (p.subtype !== 'kneel' || s.down >= 1) && (!book || p.category === 'special' || book.includes(p.id)));
  }

  defensePlaysForUser(): DefensivePlay[] {
    const book = this.opts.playbook?.def;
    const list = DEFENSIVE_PLAYS.filter((p) => !book || book.includes(p.id));
    return list.length ? list : DEFENSIVE_PLAYS;
  }

  playerOfTheGame(): { player: Player; side: Side; impact: number } | null {
    let best: { player: Player; side: Side; impact: number } | null = null;
    for (const side of [0, 1] as Side[]) {
      for (const p of this.teams[side].roster) {
        const st = this.state.playerStats[p.id];
        if (!st) continue;
        const impact = playerImpact(st) + (this.state.winner === side ? 2 : 0);
        if (!best || impact > best.impact) best = { player: p, side, impact };
      }
    }
    return best;
  }

  winner(): Side | null {
    return this.state.finished ? this.state.winner : leader(this.state);
  }

  /** Simulation complète sans rendu (matchs de saison simulés, tests). */
  runToEnd(maxSteps = 400000): void {
    if (this.phase === 'PreGame') this.start();
    let n = 0;
    while (this.phase !== 'MatchFinished' && n < maxSteps) {
      this.update(1 / 30);
      n++;
    }
    if (this.phase !== 'MatchFinished') throw new Error(`Match non terminé après ${maxSteps} pas (phase ${this.phase})`);
  }
}

export function simulateMatch(home: Team, away: Team, opts: Partial<MatchOptions> = {}): MatchController {
  const m = new MatchController(home, away, { userSide: null, headless: true, ...opts });
  m.runToEnd();
  return m;
}
