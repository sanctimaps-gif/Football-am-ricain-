import { FIELD, GRAVITY } from '../core/config';
import { clamp, dist2, len2 } from '../core/math';
import { Rng } from '../core/rng';
import { DEF_FRONTS, FORMATIONS, ROUTES, type DefSlot, type FormationSlot } from '../data/playbook';
import { accelRate, topSpeed } from '../data/ratings';
import type { Player } from '../data/types';
import { emptyResult, other, type PenaltyCall, type PlayResult, type Side } from '../rules/types';
import type { StatEvent } from '../rules/stats';
import { think } from './behaviors';
import { computeThrow, qbDecide } from './qb';
import {
  emptyInput, type Agent, type Ball, type BallFlight, type PassType, type PlaySetup, type SimEvent, type SimInput,
} from './types';

const W = FIELD.width;
const MAX_PLAY_TIME = 28;

/**
 * Simulation d'une action de jeu : 22 agents, un ballon, contacts, plaquages, passes et coups de pied.
 * Indépendante du rendu : utilisée pour le match interactif ET pour les matchs simulés.
 */
export class PlaySim {
  readonly setup: PlaySetup;
  readonly rng: Rng;
  readonly dir: 1 | -1;
  readonly losX: number;
  readonly offense: Side;
  agents: Agent[] = [];
  ball: Ball;
  t = 0;
  phase: 'pre' | 'live' | 'dead' = 'pre';
  deadTime = 0;
  events: SimEvent[] = [];
  result: PlayResult | null = null;
  userAgent = -1;
  passTarget = -1;
  // état de l'action
  thrown = false;
  handedOff = false;
  pitched = false;
  kicked = false;
  awaitingKick = false;
  kickDeadline = 0;
  scramble = false;
  completedTo = -1;
  carrierRole: 'none' | 'rush' | 'reception' | 'return' | 'interception' | 'recovery' = 'none';
  turnover: 'none' | 'interception' | 'fumble' = 'none';
  possessionChangedInEndZone = false;
  fairCatchSignal = false;
  kickTouchback = false;
  kickOutOfBounds = false;
  kickGood = false;
  penalties: PenaltyCall[] = [];
  stats: StatEvent[] = [];
  offenseLostAtSpot: number | null = null;
  fumbler = -1;
  lastTackler = -1;
  sackBy = -1;
  playAction = false;
  isPassPlay = false;
  isRunPlay = false;
  runIdentified = -1; // temps auquel la course est lisible par la défense
  qbIdx = -1;
  kickerIdx = -1;
  holderIdx = -1;
  returnerIdx = -1;
  handoffTarget = -1;
  private qbThinkTimer = 0;
  private holdingCalled = false;
  private piCalled = false;
  private lastInput: SimInput = emptyInput();

  constructor(setup: PlaySetup) {
    this.setup = setup;
    this.rng = new Rng(setup.seed);
    this.dir = setup.dir;
    this.losX = setup.losX;
    this.offense = setup.offense;
    this.ball = {
      state: 'held', holder: -1, x: setup.losX, y: setup.ballY, z: 0.15, vx: 0, vy: 0, vz: 0,
      flight: null, thrower: -1, target: -1, tx: 0, ty: 0, airTime: 0, flightTime: 0, passType: 'touch',
      lastSide: setup.offense, spin: 0,
    };
    if (setup.kind === 'kickoff') this.buildKickoff();
    else this.buildScrimmage();
    this.ball.lastSide = this.offense;
    this.chooseInitialUserAgent();
  }

  // ————————————————————————————————— Construction —————————————————————————————————

  /** Repère action → monde. */
  toWorld(down: number, lat: number): { x: number; y: number } {
    return { x: this.losX + down * this.dir, y: clamp(this.setup.ballY - lat * this.dir, 0.8, W - 0.8) };
  }

  /** Repère monde → (down, lat). */
  toPlay(x: number, y: number): { down: number; lat: number } {
    return { down: (x - this.losX) * this.dir, lat: (this.setup.ballY - y) * this.dir };
  }

  private makeAgent(side: Side, slot: string, player: Player, x: number, y: number, offense: boolean): Agent {
    const fat = this.setup.fatigue.get(player.id) ?? 0;
    const heavy = ['OT', 'OG', 'C', 'DT', 'DE'].includes(player.position);
    const a = player.attrs;
    const power = offense
      ? a.blocking * 0.65 + a.strength * 0.35
      : a.strength * 0.55 + a.agility * 0.25 + a.tackling * 0.2;
    const aiSide = this.setup.userSide !== side;
    const diffPower = aiSide ? this.setup.difficulty.power : 0;
    return {
      idx: this.agents.length, side, slot, player, pos: player.position, offense,
      x, y, vx: 0, vy: 0, facing: offense === (this.dir > 0) ? 0 : Math.PI,
      maxSpeed: topSpeed(a) * (1 - fat * 0.12), accel: accelRate(a), radius: heavy ? 0.5 : 0.42,
      power: power + diffPower,
      offAssign: null, defAssign: null, route: [], routeIdx: 0, routeEnd: 'settle', routeDelay: 0,
      zoneX: x, zoneY: y, manTarget: -1, blockTarget: -1, engagedWith: [], shedFrom: -1, shedTimer: 0,
      tackleCooldown: 0, stunned: 0, down: false, downTimer: 0, reaction: 0, readDelay: 0.5, diveTimer: 0, jukeTimer: 0,
      jukeCooldown: 0, jumpTimer: 0, protect: false, catchAttempted: false, eligible: false, user: false,
      sprinting: false, action: 'stance', actionTime: 0, stride: Math.random() * 6, fatigue: fat,
    };
  }

  private buildScrimmage(): void {
    const s = this.setup;
    const off = s.offPlay!;
    const dSide = other(this.offense);
    this.isPassPlay = off.category === 'pass';
    this.isRunPlay = off.category === 'run';
    this.playAction = off.subtype === 'playAction';
    const formation: FormationSlot[] = FORMATIONS[off.formation];
    for (const slot of formation) {
      const p = s.offPlayers.get(slot.slot);
      if (!p) continue;
      const w = this.toWorld(slot.down, slot.lat);
      const a = this.makeAgent(this.offense, slot.slot, p, w.x, w.y, true);
      a.offAssign = off.assign[slot.slot] ?? { kind: 'block' };
      a.eligible = ['WR', 'TE', 'RB', 'FB'].includes(slot.pos) && !['punt', 'fieldGoal'].includes(off.subtype);
      if (a.offAssign.kind === 'route') {
        const def = ROUTES[a.offAssign.route];
        const sgn = slot.lat === 0 ? 1 : Math.sign(slot.lat);
        a.route = def.points.map((pt) => this.toWorld(slot.down + pt.down, slot.lat + sgn * pt.out));
        a.routeEnd = def.end;
        a.routeDelay = a.offAssign.delay ?? 0;
      }
      if (slot.slot === 'QB') this.qbIdx = a.idx;
      if (a.offAssign.kind === 'kick') this.kickerIdx = a.idx;
      if (a.offAssign.kind === 'hold') this.holderIdx = a.idx;
      if (off.handoffTo === slot.slot) this.handoffTarget = a.idx;
      this.agents.push(a);
    }
    // Ballon : centre en main
    const center = this.agents.find((a) => a.slot === 'C');
    this.ball.holder = center ? center.idx : 0;
    this.ball.x = this.losX;
    this.ball.y = s.ballY;

    if (off.subtype === 'punt') this.buildPuntReturn(dSide);
    else this.buildDefense(dSide);
  }

  private buildDefense(dSide: Side): void {
    const s = this.setup;
    const def = s.defPlay!;
    const isKick = s.kind === 'fieldGoal' || s.kind === 'extraPoint';
    const front: DefSlot[] = isKick ? DEF_FRONTS.goalLine : DEF_FRONTS[def.front];
    const coverage = isKick ? 'cover0' : def.coverage;
    // receveurs éligibles (repère action)
    const recv = this.agents.filter((a) => a.eligible).map((a) => ({ a, ...this.toPlay(a.x, a.y) }));
    recv.sort((p, q) => p.lat - q.lat);
    const outsideLeft = recv[0];
    const outsideRight = recv[recv.length - 1];
    const slots = recv.filter((r) => r !== outsideLeft && r !== outsideRight && (r.a.pos === 'WR' || r.a.pos === 'TE'));
    const backs = recv.filter((r) => r.a.pos === 'RB' || r.a.pos === 'FB');
    const tePlay = recv.find((r) => r.a.pos === 'TE');
    const strong = tePlay ? Math.sign(tePlay.lat) || 1 : 1;
    const manQueue = [...slots];
    const takenMan = new Set<number>();
    const deep = (d: number) => (s.losX + d * this.dir - (this.dir > 0 ? FIELD.goalRight : FIELD.goalLeft)) * this.dir < 0 ? d : Math.max(1, ((this.dir > 0 ? FIELD.goalRight + 9 : FIELD.goalLeft - 9) - s.losX) * this.dir);

    let lbCount = 0;
    for (const slot of front) {
      const p = s.defPlayers.get(slot.slot);
      if (!p) continue;
      let down = slot.down;
      let lat = slot.lat;
      let assign: Agent['defAssign'] = 'zone';
      let zone: { down: number; lat: number } | null = null;
      let manTarget = -1;
      const blitz = isKick || def.blitz.includes(slot.slot);
      const manCov = coverage === 'cover0' || coverage === 'cover1';
      if (slot.role === 'dl' || blitz) {
        assign = 'rush';
      } else if (slot.role === 'cb') {
        const tgt = slot.slot === 'LCB' ? outsideLeft : slot.slot === 'RCB' ? outsideRight : manQueue.shift();
        if (tgt) {
          lat = tgt.lat + (slot.slot === 'LCB' ? 0.8 : slot.slot === 'RCB' ? -0.8 : 0);
          down = manCov ? 1.6 : slot.slot === 'NB' || slot.slot === 'DB' ? 5 : 6.5;
        }
        if (manCov && tgt && !takenMan.has(tgt.a.idx)) {
          assign = 'man';
          manTarget = tgt.a.idx;
          takenMan.add(tgt.a.idx);
        } else if (coverage === 'cover2') {
          zone = { down: 5, lat: Math.sign(lat || -1) * 16 };
        } else if (coverage === 'cover3') {
          zone = slot.slot === 'NB' || slot.slot === 'DB' ? { down: 6, lat: Math.sign(lat || -1) * 13 } : { down: 15, lat: Math.sign(lat || -1) * 17 };
        } else {
          zone = slot.slot === 'NB' || slot.slot === 'DB' ? { down: 8, lat: Math.sign(lat || -1) * 11 } : { down: 14, lat: Math.sign(lat || -1) * 18 };
        }
      } else if (slot.role === 's') {
        const isFS = slot.slot === 'FS';
        if (coverage === 'cover2' || coverage === 'cover4') {
          lat = isFS ? -9 : 9;
          down = 13;
          zone = coverage === 'cover2' ? { down: 17, lat: isFS ? -11 : 11 } : { down: 15, lat: isFS ? -6 : 6 };
        } else if (coverage === 'cover3' || coverage === 'cover1') {
          if (isFS) {
            lat = 0;
            down = 14;
            zone = { down: 18, lat: 0 };
          } else {
            lat = 5 * strong;
            down = def.runFocus ? 5.5 : 8;
            const tgt = tePlay && !takenMan.has(tePlay.a.idx) ? tePlay : manQueue.shift();
            if (coverage === 'cover1' && tgt && !takenMan.has(tgt.a.idx)) {
              assign = 'man';
              manTarget = tgt.a.idx;
              takenMan.add(tgt.a.idx);
            } else zone = { down: 6, lat: 13 * strong };
          }
        } else {
          // cover0 : tout le monde en individuelle
          down = 7;
          const tgt = (tePlay && !takenMan.has(tePlay.a.idx) ? tePlay : null) ?? manQueue.shift() ?? backs.find((b) => !takenMan.has(b.a.idx));
          if (tgt) {
            assign = 'man';
            manTarget = tgt.a.idx;
            takenMan.add(tgt.a.idx);
            lat = tgt.lat;
          } else assign = 'spy';
        }
      } else if (slot.role === 'lb') {
        lbCount++;
        if (manCov) {
          const tgt = backs.find((b) => !takenMan.has(b.a.idx)) ?? (tePlay && !takenMan.has(tePlay.a.idx) ? tePlay : undefined);
          if (tgt) {
            assign = 'man';
            manTarget = tgt.a.idx;
            takenMan.add(tgt.a.idx);
          } else assign = 'spy';
        } else {
          const hooks = [-7, 7, 0, -3, 3];
          zone = { down: coverage === 'cover2' ? 9 : 7, lat: hooks[(lbCount - 1) % hooks.length] };
        }
        if (def.runFocus) down = Math.min(down, 3.8);
      }
      const w = this.toWorld(deep(down), lat);
      const a = this.makeAgent(dSide, slot.slot, p, w.x, w.y, false);
      a.defAssign = assign;
      a.manTarget = manTarget;
      if (zone) {
        const z = this.toWorld(deep(zone.down), zone.lat);
        a.zoneX = z.x;
        a.zoneY = z.y;
      } else {
        a.zoneX = w.x;
        a.zoneY = w.y;
      }
      this.agents.push(a);
    }
  }

  private buildPuntReturn(dSide: Side): void {
    const s = this.setup;
    const spots: { slot: string; down: number; lat: number; role: 'rush' | 'zone' | 'ret' }[] = [
      { slot: 'LE', down: 1, lat: -3.6, role: 'rush' }, { slot: 'LDT', down: 1, lat: -1, role: 'rush' },
      { slot: 'RDT', down: 1, lat: 1, role: 'rush' }, { slot: 'RE', down: 1, lat: 3.6, role: 'rush' },
      { slot: 'WLB', down: 1.5, lat: -6, role: 'rush' }, { slot: 'SLB', down: 1.5, lat: 6, role: 'rush' },
      { slot: 'MLB', down: 6, lat: 0, role: 'zone' }, { slot: 'LCB', down: 1.5, lat: -20, role: 'zone' },
      { slot: 'RCB', down: 1.5, lat: 20, role: 'zone' }, { slot: 'SS', down: 22, lat: 4, role: 'zone' },
      { slot: 'PR', down: 40, lat: 0, role: 'ret' },
    ];
    for (const sp of spots) {
      const p = s.defPlayers.get(sp.slot);
      if (!p) continue;
      const w = this.toWorld(Math.min(sp.down, this.maxDownField(-2)), sp.lat);
      const a = this.makeAgent(dSide, sp.slot, p, w.x, w.y, false);
      a.defAssign = sp.role === 'rush' ? 'rush' : 'zone';
      if (sp.role === 'ret') this.returnerIdx = a.idx;
      this.agents.push(a);
    }
  }

  /** Distance maximale vers l'avant avant la ligne de fond adverse. */
  private maxDownField(margin: number): number {
    const endLine = this.dir > 0 ? FIELD.length : 0;
    return (endLine - this.losX) * this.dir + margin;
  }

  private buildKickoff(): void {
    const s = this.setup;
    const kSide = this.offense;
    const rSide = other(kSide);
    // Équipe qui botte
    const k = s.offPlayers.get('K')!;
    const kw = this.toWorld(-7, 0.5);
    const kicker = this.makeAgent(kSide, 'K', k, kw.x, kw.y, true);
    kicker.offAssign = { kind: 'kick' };
    this.kickerIdx = kicker.idx;
    this.agents.push(kicker);
    for (let i = 0; i < 10; i++) {
      const p = s.offPlayers.get(`KC${i}`);
      if (!p) continue;
      const lat = -22 + i * (44 / 9);
      const w = this.toWorld(-1.2, lat);
      const a = this.makeAgent(kSide, `KC${i}`, p, w.x, w.y, true);
      a.offAssign = { kind: 'cover' };
      a.zoneY = w.y;
      this.agents.push(a);
    }
    // Équipe qui reçoit
    const kr = s.defPlayers.get('KR')!;
    const rw = this.toWorld(Math.min(63, this.maxDownField(-6)), 0);
    const ret = this.makeAgent(rSide, 'KR', kr, rw.x, rw.y, false);
    this.returnerIdx = ret.idx;
    this.agents.push(ret);
    const layout = [
      [12, -16], [12, -8], [12, 0], [12, 8], [12, 16], [24, -12], [24, 0], [24, 12], [38, -6], [38, 6],
    ];
    for (let i = 0; i < 10; i++) {
      const p = s.defPlayers.get(`KB${i}`);
      if (!p) continue;
      const w = this.toWorld(layout[i][0], layout[i][1]);
      const a = this.makeAgent(rSide, `KB${i}`, p, w.x, w.y, false);
      a.defAssign = 'zone';
      a.zoneX = w.x;
      a.zoneY = w.y;
      this.agents.push(a);
    }
    this.ball.holder = -1;
    this.ball.state = 'dead';
    const tee = this.toWorld(0, 0);
    this.ball.x = tee.x;
    this.ball.y = tee.y;
    this.ball.z = 0.25;
  }

  private chooseInitialUserAgent(): void {
    const s = this.setup;
    if (s.userSide === null) return;
    let idx = -1;
    if (s.lockedPlayerId) idx = this.agents.findIndex((a) => a.player.id === s.lockedPlayerId);
    if (idx < 0) {
      if (s.kind === 'kickoff') {
        idx = s.userSide === this.offense ? this.agents.findIndex((a) => a.slot === 'KC5') : this.returnerIdx;
      } else if (s.userSide === this.offense) {
        idx = this.qbIdx >= 0 ? this.qbIdx : this.kickerIdx;
        if (s.offPlay?.subtype === 'punt') idx = this.agents.findIndex((a) => a.slot === 'GL');
      } else {
        if (this.returnerIdx >= 0) idx = this.returnerIdx;
        else {
          const pref = s.userDefSlot ? this.agents.findIndex((a) => !a.offense && a.slot === s.userDefSlot) : -1;
          idx = pref >= 0 ? pref : this.agents.findIndex((a) => !a.offense && (a.slot === 'MLB' || a.slot === 'FS'));
        }
      }
    }
    if (idx < 0) idx = this.agents.findIndex((a) => a.side === s.userSide);
    this.setUser(idx);
  }

  setUser(idx: number): void {
    if (this.userAgent >= 0) this.agents[this.userAgent].user = false;
    this.userAgent = idx;
    if (idx >= 0) {
      this.agents[idx].user = true;
      this.events.push({ type: 'switch', to: idx });
    }
  }

  /** Changement de défenseur avant le snap (cycle) ou pendant l'action (le plus proche du ballon). */
  switchUser(): void {
    const s = this.setup;
    if (s.userSide === null || s.lockedPlayerId) return;
    const mine = this.agents.filter((a) => a.side === s.userSide && !a.down);
    if (!mine.length) return;
    if (this.phase === 'pre') {
      const order = mine.filter((a) => !a.offense || a.offense === (s.userSide === this.offense));
      const cur = order.findIndex((a) => a.idx === this.userAgent);
      this.setUser(order[(cur + 1) % order.length].idx);
      return;
    }
    const bx = this.ball.state === 'air' ? this.ball.tx : this.ball.x;
    const by = this.ball.state === 'air' ? this.ball.ty : this.ball.y;
    let best = -1;
    let bd = Infinity;
    for (const a of mine) {
      if (a.idx === this.userAgent || a.idx === this.ball.holder) continue;
      const d = dist2(a.x, a.y, bx, by);
      if (d < bd) {
        bd = d;
        best = a.idx;
      }
    }
    if (best >= 0) this.setUser(best);
  }

  // ————————————————————————————————— Snap —————————————————————————————————

  snap(): void {
    if (this.phase !== 'pre') return;
    const s = this.setup;
    this.phase = 'live';
    this.t = 0;
    this.events.push({ type: 'snap' });
    for (const a of this.agents) {
      a.action = 'run';
      // temps de lecture de la défense
      if (!a.offense) {
        const aware = a.player.attrs.awareness;
        const aiMult = s.userSide === a.side ? 1 : s.difficulty.reaction;
        a.reaction = (0.18 + (1 - aware / 100) * 0.45) * aiMult;
        a.readDelay = (0.32 + (1 - aware / 100) * 0.6) * aiMult * (a.pos === 'DE' || a.pos === 'DT' ? 0.4 : 1);
      }
    }
    // Pénalités avant le snap
    if (s.rules.penaltiesEnabled && s.kind !== 'kickoff') {
      const offAgents = this.agents.filter((a) => a.offense && ['OT', 'OG', 'C', 'TE'].includes(a.pos));
      const avgAw = offAgents.reduce((t, a) => t + a.player.attrs.awareness, 0) / Math.max(1, offAgents.length);
      if (this.rng.chance(0.004 + (1 - avgAw / 100) * 0.012)) {
        const fs = offAgents[Math.floor(this.rng.next() * offAgents.length)];
        this.endPreSnap({ type: 'falseStart', against: this.offense, playerId: fs?.player.id });
        return;
      }
      if (this.rng.chance(0.007)) {
        const dl = this.agents.find((a) => !a.offense && a.defAssign === 'rush');
        this.endPreSnap({ type: 'offside', against: other(this.offense), playerId: dl?.player.id });
        return;
      }
    }
    if (s.kind === 'kickoff') {
      this.awaitingKick = true;
      this.kickDeadline = 0.9;
      return;
    }
    const center = this.agents[this.ball.holder];
    const off = s.offPlay!;
    // Snap vers le QB, le punter ou le holder
    const receiver = off.subtype === 'punt' ? this.agents.find((a) => a.slot === 'P') : off.subtype === 'fieldGoal' ? this.agents[this.holderIdx] : this.agents[this.qbIdx];
    if (!receiver) return;
    const shotgun = off.formation === 'shotgun' || off.formation === 'shotgunTrips' || off.subtype === 'punt' || off.subtype === 'fieldGoal';
    if (shotgun) {
      const d = dist2(center.x, center.y, receiver.x, receiver.y);
      const T = Math.max(0.25, d / 18);
      this.launchBall(center, receiver.x, receiver.y, 1.1, T, 'snap', receiver.idx);
      this.ball.z = 0.4;
    } else {
      this.giveBall(receiver.idx, false);
    }
    if (off.subtype === 'kneel') {
      this.giveBall(receiver.idx, false);
      receiver.action = 'kneel';
    }
  }

  private endPreSnap(p: PenaltyCall): void {
    this.events.push({ type: 'flag', penalty: p.type }, { type: 'whistle' });
    this.phase = 'dead';
    const r = emptyResult(this.resultKind(), this.offense, this.spotOf(this.losX));
    r.preSnapPenalty = p;
    r.summary = { key: `penalty.${p.type}` };
    this.result = r;
  }

  private resultKind(): PlayResult['kind'] {
    const k = this.setup.kind;
    if (k === 'kickoff') return 'kickoff';
    if (k === 'punt') return 'punt';
    if (k === 'fieldGoal') return 'fieldGoal';
    if (k === 'extraPoint') return 'extraPoint';
    if (this.setup.offPlay?.subtype === 'kneel') return 'kneel';
    return 'scrimmage';
  }

  // ————————————————————————————————— Boucle —————————————————————————————————

  step(dt: number, input: SimInput = emptyInput()): void {
    this.lastInput = input;
    if (this.phase === 'dead') {
      this.deadTime += dt;
      this.animateDead(dt);
      return;
    }
    if (this.phase === 'pre') {
      this.stepPreSnap(dt, input);
      return;
    }
    this.t += dt;
    this.handleUserActions(input);
    this.updateKicking(dt, input);
    this.updatePlayLogic(dt);
    // IA + contrôle utilisateur
    for (const a of this.agents) {
      this.tickTimers(a, dt);
      if (a.down) {
        a.vx *= 0.85;
        a.vy *= 0.85;
        continue;
      }
      let dvx: number;
      let dvy: number;
      let sprint: boolean;
      if (a.user && this.isUserMovable(a)) {
        [dvx, dvy, sprint] = this.userDesired(a, input);
      } else {
        [dvx, dvy, sprint] = think(this, a, dt);
      }
      this.applyMovement(a, dvx, dvy, sprint, dt);
    }
    this.autoEngage();
    this.resolveEngagements(dt);
    this.separate();
    this.updateBall(dt);
    if (this.phase === 'live') this.checkContacts();
    if (this.phase === 'live') this.checkBoundaries();
    if (this.phase === 'live' && this.t > MAX_PLAY_TIME) this.endPlayAtBall('timeout');
    this.updateAnimations(dt);
  }

  private stepPreSnap(dt: number, input: SimInput): void {
    // le défenseur contrôlé peut se repositionner avant le snap (de son côté de la ligne)
    const u = this.userAgent >= 0 ? this.agents[this.userAgent] : null;
    if (u && !u.offense && this.setup.kind !== 'kickoff') {
      const [dvx, dvy] = this.userDesired(u, input);
      this.applyMovement(u, dvx * 0.5, dvy * 0.5, false, dt);
      const p = this.toPlay(u.x, u.y);
      if (p.down < 1) {
        const w = this.toWorld(1, p.lat);
        u.x = w.x;
      }
      u.y = clamp(u.y, 1, W - 1);
    }
    if (input.switchPlayer) this.switchUser();
    for (const a of this.agents) {
      a.actionTime += dt;
      if (!a.user || len2(a.vx, a.vy) < 0.3) a.action = 'stance';
      else a.action = 'run';
      a.stride += len2(a.vx, a.vy) * dt * 1.6;
    }
  }

  private isUserMovable(a: Agent): boolean {
    if (this.awaitingKick && a.idx === this.kickerIdx) return false;
    if (this.setup.offPlay?.subtype === 'kneel') return false;
    // QB sous le centre avant la remise automatique
    if (this.isRunPlay && a.idx === this.qbIdx && !this.handedOff && this.handoffTarget >= 0) return false;
    return true;
  }

  private userDesired(a: Agent, input: SimInput): [number, number, boolean] {
    const mag = Math.min(1, len2(input.moveX, input.moveY));
    if (input.contain && !a.offense) {
      const c = this.carrier();
      if (c && c.side !== a.side) {
        const lead = clamp(dist2(a.x, a.y, c.x, c.y) / a.maxSpeed, 0, 1.0);
        const tx = c.x + c.vx * lead;
        const ty = c.y + c.vy * lead;
        const d = dist2(a.x, a.y, tx, ty) || 1;
        return [((tx - a.x) / d) * a.maxSpeed, ((ty - a.y) / d) * a.maxSpeed, true];
      }
    }
    if (mag < 0.12) return [0, 0, false];
    const speed = a.maxSpeed * (input.sprint ? 1 : 0.8) * mag * (a.protect ? 0.85 : 1);
    return [(input.moveX / mag) * speed * Math.min(1, mag), (input.moveY / mag) * speed * Math.min(1, mag), input.sprint];
  }

  private applyMovement(a: Agent, dvx: number, dvy: number, sprint: boolean, dt: number): void {
    a.sprinting = sprint;
    let maxS = a.maxSpeed * (sprint ? 1 : 0.86);
    if (a.stunned > 0) maxS *= 0.35;
    if (a.engagedWith.length) maxS *= 0.25;
    if (this.ball.state === 'held' && this.ball.holder === a.idx && a.protect) maxS *= 0.85;
    const ds = len2(dvx, dvy);
    if (ds > maxS) {
      dvx = (dvx / ds) * maxS;
      dvy = (dvy / ds) * maxS;
    }
    if (a.diveTimer > 0) return; // trajectoire balistique du plongeon
    if (a.jukeTimer > 0.18) {
      // déplacement latéral explosif pendant la feinte
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      return;
    }
    const ax = dvx - a.vx;
    const ay = dvy - a.vy;
    const need = len2(ax, ay);
    const agilityBoost = 1 + a.player.attrs.agility / 220;
    const maxDv = a.accel * agilityBoost * dt;
    if (need > maxDv) {
      a.vx += (ax / need) * maxDv;
      a.vy += (ay / need) * maxDv;
    } else {
      a.vx = dvx;
      a.vy = dvy;
    }
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    const sp = len2(a.vx, a.vy);
    if (sp > 0.4) a.facing = Math.atan2(a.vy, a.vx);
    a.stride += sp * dt * 1.55;
    if (sprint && sp > a.maxSpeed * 0.9) a.fatigue = Math.min(1, a.fatigue + dt * 0.006 * (1.6 - a.player.attrs.stamina / 100));
  }

  private tickTimers(a: Agent, dt: number): void {
    a.actionTime += dt;
    if (a.reaction > 0) a.reaction -= dt;
    if (a.tackleCooldown > 0) a.tackleCooldown -= dt;
    if (a.stunned > 0) a.stunned -= dt;
    if (a.shedTimer > 0) a.shedTimer -= dt;
    if (a.jukeCooldown > 0) a.jukeCooldown -= dt;
    if (a.jumpTimer > 0) a.jumpTimer -= dt;
    if (a.jukeTimer > 0) a.jukeTimer -= dt;
    if (a.diveTimer > 0) {
      a.diveTimer -= dt;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.vx *= 0.94;
      a.vy *= 0.94;
      if (a.diveTimer <= 0) {
        a.down = true;
        a.downTimer = 0.9;
        a.action = 'down';
        a.actionTime = 0;
      }
    }
    if (a.down && a.downTimer > 0 && this.phase === 'live') {
      a.downTimer -= dt;
      if (a.downTimer <= 0 && this.ball.holder !== a.idx) {
        a.down = false;
        a.action = 'run';
      }
    }
  }

  // ————————————————————————————————— Actions utilisateur —————————————————————————————————

  private handleUserActions(input: SimInput): void {
    if (input.switchPlayer) this.switchUser();
    const u = this.userAgent >= 0 ? this.agents[this.userAgent] : null;
    if (!u || u.down) return;
    const hasBall = this.ball.state === 'held' && this.ball.holder === u.idx;
    if (hasBall) {
      u.protect = input.protect;
      if (input.pass) this.userPass(u, input);
      if (input.juke) this.doJuke(u, input.moveX, input.moveY);
      if (input.dive) {
        if (this.inOwnEndZone(u) && (this.carrierRole === 'return')) {
          // genou à terre dans l'en-but : touchback
          this.endPlayAtBall('kneel');
          return;
        }
        this.startDive(u, u.facing);
      }
    } else {
      if ((input.tackle || input.dive) && u.diveTimer <= 0) {
        const c = this.carrier();
        const ang = c && c.side !== u.side && dist2(u.x, u.y, c.x, c.y) < 3.5 ? Math.atan2(c.y - u.y, c.x - u.x) : u.facing;
        this.startDive(u, ang);
      }
      if (input.jump) {
        u.jumpTimer = 0.55;
        u.action = 'catch';
        u.actionTime = 0;
      }
      if (input.fairCatch && this.ball.state === 'air' && (this.ball.flight === 'punt') && u.idx === this.returnerIdx) {
        this.fairCatchSignal = true;
      }
      if (input.pass && this.ball.state === 'held' && this.setup.offPlay?.subtype === 'option') {
        // le QB n'est pas contrôlé : rien
      }
    }
  }

  private userPass(u: Agent, input: SimInput): void {
    if (this.thrown) return;
    const off = this.setup.offPlay;
    // Option : latérale vers le RB
    if (off?.subtype === 'option' && !this.pitched && u.idx === this.qbIdx) {
      const rb = this.agents.find((a) => a.offense && a.slot === 'RB');
      if (rb && (rb.x - u.x) * this.dir < 0.5) this.pitch(u, rb);
      return;
    }
    if (u.idx !== this.qbIdx) return;
    if (this.toPlay(u.x, u.y).down > 0.2) return; // passe en avant interdite au-delà de la ligne
    let target = input.passTarget >= 0 ? input.passTarget : this.passTarget;
    if (target < 0 || !this.agents[target]?.eligible) target = this.bestOpenReceiver();
    if (target < 0) return;
    this.throwTo(u, target, input.passType, input.aimX, input.aimY);
  }

  doJuke(a: Agent, mx: number, my: number): void {
    if (a.jukeCooldown > 0) return;
    // feinte latérale perpendiculaire à la course
    const fx = Math.cos(a.facing);
    const fy = Math.sin(a.facing);
    let side = mx * -fy + my * fx;
    if (Math.abs(side) < 0.1) side = this.rng.chance(0.5) ? 1 : -1;
    const s = Math.sign(side);
    const burst = 4 + a.player.attrs.agility / 30;
    a.vx = fx * a.maxSpeed * 0.55 + -fy * s * burst;
    a.vy = fy * a.maxSpeed * 0.55 + fx * s * burst;
    a.jukeTimer = 0.42;
    a.jukeCooldown = 1.1;
    a.action = 'juke';
    a.actionTime = 0;
    this.events.push({ type: 'juke', by: a.idx });
  }

  startDive(a: Agent, angle: number): void {
    if (a.diveTimer > 0 || a.down) return;
    const sp = Math.max(len2(a.vx, a.vy), 4) + 2.5;
    a.vx = Math.cos(angle) * sp;
    a.vy = Math.sin(angle) * sp;
    a.facing = angle;
    a.diveTimer = 0.45;
    a.action = 'dive';
    a.actionTime = 0;
  }

  // ————————————————————————————————— Logique de l'action —————————————————————————————————

  carrier(): Agent | null {
    return this.ball.state === 'held' && this.ball.holder >= 0 ? this.agents[this.ball.holder] : null;
  }

  private updatePlayLogic(dt: number): void {
    const s = this.setup;
    const off = s.offPlay;
    const c = this.carrier();
    if (!off || s.kind === 'kickoff') return;
    if (off.subtype === 'kneel' && c) {
      if (this.t > 0.8) {
        c.down = true;
        this.endPlayAtBall('kneel');
      }
      return;
    }
    // Remise (handoff)
    if (this.isRunPlay && !this.handedOff && this.handoffTarget >= 0 && c && c.idx === this.qbIdx) {
      const rb = this.agents[this.handoffTarget];
      const d = dist2(c.x, c.y, rb.x, rb.y);
      const toss = off.id === 'tossSweep';
      if (toss && this.t > 0.3) {
        this.pitch(c, rb);
        this.handedOff = true;
        this.runIdentified = this.t;
      } else if (!toss && (d < 1.25 || this.t > 1.25)) {
        if (d < 2.2) {
          this.giveBall(rb.idx, true);
          this.events.push({ type: 'handoff', to: rb.idx });
          c.action = 'handoff';
          c.actionTime = 0;
          this.carrierRole = 'rush';
          if (s.userSide === this.offense && !s.lockedPlayerId) this.setUser(rb.idx);
        } else {
          this.carrierRole = 'rush'; // le QB garde le ballon
        }
        this.handedOff = true;
        this.runIdentified = this.t;
      }
    }
    if ((off.subtype === 'sneak' || off.subtype === 'option') && this.carrierRole === 'none' && c && c.idx === this.qbIdx) {
      this.carrierRole = 'rush';
      if (this.runIdentified < 0) this.runIdentified = off.subtype === 'sneak' ? 0 : 0.5;
    }
    // Option jouée par l'IA : latérale quand un défenseur menace
    if (off.subtype === 'option' && c && c.idx === this.qbIdx && !this.pitched && !c.user) {
      const rb = this.agents.find((a) => a.offense && a.slot === 'RB');
      const threat = this.agents.some((d) => !d.offense && !d.down && !d.engagedWith.length && dist2(d.x, d.y, c.x, c.y) < 3.2);
      if (rb && threat && (rb.x - c.x) * this.dir < 0.3 && this.t > 0.6) this.pitch(c, rb);
    }
    // QB IA en passe
    if (this.isPassPlay && c && c.idx === this.qbIdx && !this.thrown && !this.scramble) {
      const qbUser = c.user;
      if (!qbUser) {
        this.qbThinkTimer -= dt;
        if (this.qbThinkTimer <= 0) {
          this.qbThinkTimer = 0.1;
          const d = qbDecide(this, c);
          if (d.action === 'throw') this.throwTo(c, d.target, d.passType, 0, 0);
          else if (d.action === 'throwAway') this.throwAway(c);
          else if (d.action === 'scramble') {
            this.scramble = true;
            this.carrierRole = 'rush';
          }
        }
      }
    }
    // Le QB qui franchit la ligne devient coureur
    if (c && c.idx === this.qbIdx && !this.thrown && this.toPlay(c.x, c.y).down > 0 && this.carrierRole !== 'rush') {
      this.carrierRole = 'rush';
      this.scramble = true;
    }
    if (c && this.runIdentified < 0 && this.toPlay(c.x, c.y).down > 0) this.runIdentified = this.t;
  }

  /** Lancer de passe vers un receveur. */
  throwTo(qb: Agent, target: number, passType: PassType, aimX: number, aimY: number): void {
    if (this.thrown || this.ball.holder !== qb.idx) return;
    const r = this.agents[target];
    const pressure = this.agents.some((d) => d.side !== qb.side && !d.down && dist2(d.x, d.y, qb.x, qb.y) < 2.2);
    const aiSide = this.setup.userSide !== qb.side;
    const throwData = computeThrow(this, qb, r, passType, pressure, aiSide);
    const tx = clamp(throwData.tx + aimX, -1, FIELD.length + 1);
    const ty = clamp(throwData.ty + aimY, -2, W + 2);
    this.thrown = true;
    this.ball.passType = passType;
    this.launchBall(qb, tx, ty, 1.5, throwData.T, 'pass', target, throwData.ex, throwData.ey);
    qb.action = 'throw';
    qb.actionTime = 0;
    this.stats.push({ kind: 'passAtt', passer: qb.player.id });
    this.events.push({ type: 'throw', by: qb.idx, target, passType });
    for (const a of this.agents) a.catchAttempted = false;
    // réaction de la défense au lancer
    for (const a of this.agents) {
      if (a.offense === qb.offense) continue;
      const aiMult = this.setup.userSide === a.side ? 1 : this.setup.difficulty.reaction;
      a.reaction = Math.max(a.reaction, (0.12 + (1 - a.player.attrs.awareness / 100) * 0.35) * aiMult);
    }
    // l'utilisateur prend le receveur visé (attaque) ou le défenseur le plus proche (défense)
    const s = this.setup;
    if (s.userSide === qb.side && !s.lockedPlayerId) this.setUser(target);
    else if (s.userSide !== null && s.userSide !== qb.side && s.autoSwitch && !s.lockedPlayerId) {
      let best = -1;
      let bd = Infinity;
      for (const a of this.agents) {
        if (a.side !== s.userSide || a.down) continue;
        const d = dist2(a.x, a.y, this.ball.tx, this.ball.ty);
        if (d < bd) {
          bd = d;
          best = a.idx;
        }
      }
      if (best >= 0 && best !== this.userAgent) this.setUser(best);
    }
  }

  throwAway(qb: Agent): void {
    if (this.thrown) return;
    const sideY = qb.y < W / 2 ? -4 : W + 4;
    const w = this.toPlay(qb.x, qb.y);
    const tx = this.toWorld(w.down + 12, 0).x;
    this.thrown = true;
    const d = dist2(qb.x, qb.y, tx, sideY);
    this.launchBall(qb, tx, sideY, 1.5, Math.max(0.6, d / 20), 'pass', -1);
    qb.action = 'throw';
    qb.actionTime = 0;
    this.stats.push({ kind: 'passAtt', passer: qb.player.id });
    this.events.push({ type: 'throw', by: qb.idx, target: -1, passType: 'bullet' });
  }

  pitch(qb: Agent, rb: Agent): void {
    const T = 0.4;
    const tx = rb.x + rb.vx * T;
    const ty = rb.y + rb.vy * T;
    this.pitched = true;
    this.launchBall(qb, tx, ty, 1.2, T, 'pitch', rb.idx);
    qb.action = 'throw';
    qb.actionTime = 0;
    this.carrierRole = 'rush';
    if (this.setup.userSide === qb.side && !this.setup.lockedPlayerId) this.setUser(rb.idx);
  }

  bestOpenReceiver(): number {
    const qb = this.qbIdx >= 0 ? this.agents[this.qbIdx] : null;
    if (!qb) return -1;
    let best = -1;
    let bs = -Infinity;
    for (const a of this.agents) {
      if (!a.eligible || a.side !== qb.side || a.down) continue;
      let sep = 20;
      for (const d of this.agents) {
        if (d.side === a.side || d.down) continue;
        sep = Math.min(sep, dist2(a.x, a.y, d.x, d.y));
      }
      const score = sep + this.toPlay(a.x, a.y).down * 0.08;
      if (score > bs) {
        bs = score;
        best = a.idx;
      }
    }
    return best;
  }

  /** Lancement générique du ballon avec temps de vol T vers (tx,ty), hauteur d'arrivée zEnd. */
  launchBall(from: Agent, tx: number, ty: number, zEnd: number, T: number, flight: BallFlight, target: number, ex = 0, ey = 0): void {
    const b = this.ball;
    const z0 = flight === 'snap' ? 0.4 : flight === 'kickoff' || flight === 'fieldGoal' || flight === 'punt' ? 0.3 : 2.0;
    b.state = 'air';
    b.flight = flight;
    b.thrower = from.idx;
    b.target = target;
    b.x = from.x;
    b.y = from.y;
    if (flight === 'snap') {
      b.x = this.losX;
      b.y = this.setup.ballY;
    }
    b.z = z0;
    const fx = tx + ex;
    const fy = ty + ey;
    b.tx = fx;
    b.ty = fy;
    b.vx = (fx - b.x) / T;
    b.vy = (fy - b.y) / T;
    b.vz = (zEnd - z0 + 0.5 * GRAVITY * T * T) / T;
    b.airTime = 0;
    b.flightTime = T;
    b.holder = -1;
    b.lastSide = from.side;
  }

  giveBall(idx: number, handoff: boolean): void {
    const b = this.ball;
    b.state = 'held';
    b.holder = idx;
    b.flight = null;
    const a = this.agents[idx];
    b.lastSide = a.side;
    void handoff;
  }

  // ————————————————————————————————— Coups de pied —————————————————————————————————

  private updateKicking(dt: number, input: SimInput): void {
    const s = this.setup;
    const sub = s.offPlay?.subtype;
    if (s.kind === 'kickoff') {
      if (!this.kicked && this.awaitingKick) {
        const k = this.agents[this.kickerIdx];
        // course d'élan
        const tee = this.toWorld(0, 0);
        const d = dist2(k.x, k.y, tee.x - 0.4 * this.dir, tee.y);
        if (d > 0.3) {
          k.vx = ((tee.x - 0.4 * this.dir - k.x) / d) * 6;
          k.vy = ((tee.y - k.y) / d) * 6;
          k.x += k.vx * dt;
          k.y += k.vy * dt;
          k.stride += 6 * dt * 1.5;
          k.action = 'run';
        }
        this.tryKick(k, input);
      }
      return;
    }
    if (sub === 'punt' || sub === 'fieldGoal') {
      const kickerSlot = sub === 'punt' ? 'P' : 'K';
      const k = this.agents.find((a) => a.offense && a.slot === kickerSlot);
      if (!k || this.kicked) return;
      if (!this.awaitingKick && sub === 'punt' && this.ball.state === 'held' && this.ball.holder === k.idx) {
        this.awaitingKick = true;
        this.kickDeadline = this.t + 0.6;
      }
      if (!this.awaitingKick && sub === 'fieldGoal' && this.ball.state === 'held' && this.ball.holder === this.holderIdx) {
        this.awaitingKick = true;
        this.kickDeadline = this.t + 0.7;
      }
      if (this.awaitingKick) this.tryKick(k, input);
    }
  }

  private tryKick(k: Agent, input: SimInput): void {
    const s = this.setup;
    const userKicking = s.userSide === k.side && s.userKicks;
    let meter: number | null = null;
    if (userKicking) {
      if (input.kickMeter !== null && this.t >= this.kickDeadline * 0.6) meter = input.kickMeter;
      else if (this.t > this.kickDeadline + 3.5) meter = this.rng.range(-0.5, 0.5);
    } else if (this.t >= this.kickDeadline) {
      const acc = k.player.attrs.kickAccuracy;
      meter = this.rng.normal(0, 0.12 + (1 - acc / 100) * 0.35) * (s.userSide === null || s.userSide === k.side ? 1 : s.difficulty.accuracy);
    }
    if (meter === null) return;
    this.performKick(k, clamp(meter, -1, 1));
  }

  private performKick(k: Agent, meter: number): void {
    const s = this.setup;
    const a = k.player.attrs;
    const q = 1 - Math.abs(meter);
    this.kicked = true;
    this.awaitingKick = false;
    k.action = 'kick';
    k.actionTime = 0;
    const sub = s.kind === 'kickoff' ? 'kickoff' : s.offPlay!.subtype;
    if (sub === 'kickoff') {
      const D = (52 + a.kickPower * 0.17) * (0.82 + 0.18 * q) + this.rng.normal(0, 2);
      const lat = meter * 9 + this.rng.normal(0, 3);
      const land = this.toWorld(D, lat);
      const T = 3.6 + a.kickPower / 200;
      const tee = this.toWorld(0, 0);
      this.ball.x = tee.x;
      this.ball.y = tee.y;
      this.launchBallFromSpot(tee.x, tee.y, 0.25, land.x, land.y, 0.9, T, 'kickoff', this.returnerIdx, k.side);
    } else if (sub === 'punt') {
      const D = (34 + a.kickPower * 0.15) * (0.8 + 0.2 * q) + this.rng.normal(0, 3);
      const lat = meter * 8 + this.rng.normal(0, 3);
      const kp = this.toPlay(k.x, k.y);
      const land = this.toWorld(kp.down + D, kp.lat + lat);
      const T = 3.6 + a.kickPower / 220;
      this.launchBallFromSpot(k.x, k.y, 1.0, land.x, land.y, 1.0, T, 'punt', this.returnerIdx, k.side);
      // le retourneur se place
    } else {
      // Field goal / extra point : visée des poteaux au fond de l'en-but adverse
      const postX = this.dir > 0 ? FIELD.length : 0;
      const holder = this.agents[this.holderIdx] ?? k;
      const bx = holder.x;
      const by = holder.y;
      const dist = Math.abs(postX - bx);
      const range = 46 + a.kickPower * 0.2;
      const lateralErr = (meter * 0.07 + this.rng.normal(0, 0.012 + (1 - a.kickAccuracy / 100) * 0.03)) * dist;
      const vh = 24;
      const T = dist / vh;
      // hauteur au passage des poteaux selon la puissance
      const heightAtPosts = 3.3 + (range - dist) * 0.22 + this.rng.normal(0, 0.4);
      const ty = W / 2 + lateralErr + (by - W / 2) * 0.2;
      this.launchBallFromSpot(bx, by, 0.2, postX, ty, heightAtPosts, T, 'fieldGoal', -1, k.side);
      this.stats.push({ kind: 'kick', kicker: k.player.id, fieldGoal: s.kind === 'fieldGoal', good: false });
    }
    this.events.push({ type: 'kick', by: k.idx, flight: this.ball.flight! });
  }

  private launchBallFromSpot(x: number, y: number, z0: number, tx: number, ty: number, zEnd: number, T: number, flight: BallFlight, target: number, side: Side): void {
    const b = this.ball;
    b.state = 'air';
    b.flight = flight;
    b.x = x;
    b.y = y;
    b.z = z0;
    b.tx = tx;
    b.ty = ty;
    b.vx = (tx - x) / T;
    b.vy = (ty - y) / T;
    b.vz = (zEnd - z0 + 0.5 * GRAVITY * T * T) / T;
    b.airTime = 0;
    b.flightTime = T;
    b.holder = -1;
    b.thrower = -1;
    b.target = target;
    b.lastSide = side;
    for (const a of this.agents) a.catchAttempted = false;
  }

  // ————————————————————————————————— Ballon —————————————————————————————————

  private updateBall(dt: number): void {
    const b = this.ball;
    if (b.state === 'held') {
      const h = this.agents[b.holder];
      if (!h) return;
      const f = h.facing;
      b.x = h.x + Math.cos(f) * 0.25;
      b.y = h.y + Math.sin(f) * 0.25;
      b.z = h.down ? 0.25 : 1.15;
      b.vx = h.vx;
      b.vy = h.vy;
      b.vz = 0;
      return;
    }
    if (b.state === 'dead') return;
    if (b.state === 'air') {
      b.airTime += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vz -= GRAVITY * dt;
      b.z += b.vz * dt;
      b.spin += dt * 20;
      if (b.flight === 'fieldGoal') {
        this.checkFieldGoal();
        return;
      }
      this.checkCatches();
      if (b.state !== 'air') return;
      if (b.z <= 0.12) {
        b.z = 0.12;
        this.ballGrounded();
      }
      return;
    }
    if (b.state === 'loose') {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vz -= GRAVITY * dt;
      b.z += b.vz * dt;
      if (b.z < 0.12) {
        b.z = 0.12;
        b.vz = Math.abs(b.vz) * 0.35;
        b.vx *= 0.7;
        b.vy *= 0.7;
      }
      b.vx *= 1 - dt * 0.8;
      b.vy *= 1 - dt * 0.8;
      this.checkRecovery(dt);
      if (this.phase === 'live' && (b.y < 0 || b.y > W || b.x < 0 || b.x > FIELD.length)) {
        // ballon libre sorti : possession à la dernière équipe qui le détenait
        this.events.push({ type: 'outOfBounds', by: -1 });
        this.finish(b.lastSide, clamp(b.x, 0, FIELD.length), 'looseOut');
      }
    }
  }

  private ballGrounded(): void {
    const b = this.ball;
    const flight = b.flight;
    if (flight === 'pass') {
      this.events.push({ type: 'incomplete' });
      this.finishIncomplete();
    } else if (flight === 'pitch' || flight === 'snap') {
      // latérale ou snap manqués : ballon libre
      this.makeLoose(b.lastSide, -1);
    } else if (flight === 'kickoff' || flight === 'punt') {
      this.kickLanded();
    }
  }

  private kickLanded(): void {
    const b = this.ball;
    const recvSide = other(this.offense);
    const goalRecv = this.dir > 0 ? FIELD.goalRight : FIELD.goalLeft; // ligne de but de l'équipe qui reçoit
    const inEZ = (b.x - goalRecv) * this.dir >= 0;
    if (b.y < 0 || b.y > W) {
      this.kickOutOfBounds = true;
      this.finish(recvSide, b.x, 'kickOOB');
      return;
    }
    if (inEZ) {
      this.kickTouchback = true;
      this.events.push({ type: 'touchback' });
      this.finish(recvSide, goalRecv + 5 * this.dir, 'touchback');
      return;
    }
    if (b.flight === 'punt') {
      // punt non capté : roule puis est mort
      const roll = 3 + this.rng.range(0, 6);
      let x = b.x + roll * this.dir;
      if ((x - goalRecv) * this.dir >= 0) {
        this.kickTouchback = true;
        this.events.push({ type: 'touchback' });
        this.finish(recvSide, goalRecv + 5 * this.dir, 'touchback');
        return;
      }
      x = clamp(x, 0, FIELD.length);
      this.finish(recvSide, x, 'puntDowned');
      return;
    }
    // kickoff au sol dans le terrain : ballon libre
    this.makeLoose(this.offense, -1);
  }

  private checkFieldGoal(): void {
    const b = this.ball;
    const postX = this.dir > 0 ? FIELD.length : 0;
    const crossed = (b.x - postX) * this.dir >= 0;
    if (crossed || b.z <= 0.1) {
      const good = crossed && Math.abs(b.y - W / 2) <= FIELD.postHalfWidth && b.z >= FIELD.crossbarHeight;
      this.kickGood = good;
      const ev = this.stats.find((e) => e.kind === 'kick');
      if (ev && ev.kind === 'kick') ev.good = good;
      this.events.push({ type: 'kickResult', good });
      this.phase = 'dead';
      this.ball.state = 'dead';
      this.events.push({ type: 'whistle' });
      const r = emptyResult(this.resultKind(), this.offense, this.spotOf(this.losX));
      r.kickGood = good;
      r.elapsed = this.t;
      r.stats = this.stats;
      r.penalties = this.penalties;
      r.summary = { key: good ? 'play.kickGood' : 'play.kickMiss', params: { dist: Math.round(Math.abs(postX - this.losX) + 7 - 10) } };
      this.result = r;
    }
  }

  private checkCatches(): void {
    const b = this.ball;
    if (b.z > 3.3 || b.z < 0.15) return;
    if (b.flight === 'snap' || b.flight === 'pitch') {
      const t = this.agents[b.target];
      if (t && dist2(t.x, t.y, b.x, b.y) < 1.4 && b.z < 2.6) {
        const muff = b.flight === 'pitch' && this.rng.chance(0.03 + (1 - t.player.attrs.catching / 100) * 0.04);
        if (muff) {
          this.makeLoose(t.side, t.idx);
          return;
        }
        this.giveBall(t.idx, false);
      }
      return;
    }
    if (b.flight === 'kickoff' || b.flight === 'punt') {
      // seul le retourneur (ou un joueur de l'équipe qui reçoit) attrape
      const recvSide = other(this.offense);
      for (const a of this.agents) {
        if (a.side !== recvSide || a.down || a.catchAttempted) continue;
        if (dist2(a.x, a.y, b.x, b.y) > 1.1 || b.z > 2.8) continue;
        a.catchAttempted = true;
        const p = 0.9 + a.player.attrs.catching / 1000;
        if (this.rng.chance(p)) {
          this.giveBall(a.idx, false);
          a.action = 'catch';
          a.actionTime = 0;
          this.carrierRole = 'return';
          this.events.push({ type: 'catch', by: a.idx });
          const goalRecv = this.dir > 0 ? FIELD.goalRight : FIELD.goalLeft;
          const depth = (a.x - goalRecv) * this.dir; // > 0 = dans l'en-but
          if (depth >= 0) this.possessionChangedInEndZone = true;
          if (this.setup.userSide === a.side && !this.setup.lockedPlayerId) this.setUser(a.idx);
          if (b.flight === 'punt' && this.fairCatchSignal) {
            this.events.push({ type: 'fairCatch' });
            this.finish(a.side, a.x, 'fairCatch');
            return;
          }
          if (!a.user && depth > 2.5) {
            // genou à terre dans l'en-but
            this.finish(a.side, a.x, 'kneelTouchback');
            return;
          }
        } else {
          this.events.push({ type: 'drop', by: a.idx });
          this.makeLoose(a.side, a.idx);
        }
        return;
      }
      return;
    }
    // Passe en avant : pas de réception tant que le ballon n'a pas quitté la zone du lanceur
    const thr = this.agents[b.thrower];
    if (b.airTime < 0.18 || (thr && dist2(thr.x, thr.y, b.x, b.y) < 2.5)) return;
    const cands: { a: Agent; d: number }[] = [];
    const throwerSideEarly = thr?.side ?? this.offense;
    for (const a of this.agents) {
      if (a.down || a.catchAttempted || a.engagedWith.length) continue;
      if (a.offense === (this.agents[b.thrower]?.offense ?? true) && !a.eligible) continue;
      const reach = (a.side === throwerSideEarly ? 1.15 : 0.95) + (a.jumpTimer > 0 ? 0.5 : 0) + (a.diveTimer > 0 ? 0.6 : 0);
      const maxZ = a.jumpTimer > 0 ? 3.3 : 2.7;
      const d = dist2(a.x, a.y, b.x, b.y);
      if (d < reach && b.z <= maxZ) cands.push({ a, d });
    }
    if (!cands.length) return;
    const throwerSide = this.agents[b.thrower]?.side ?? this.offense;
    // le receveur visé bénéficie de sa position (il sait où va le ballon)
    cands.sort((p, q) => (p.d - (p.a.idx === b.target ? 0.35 : 0)) - (q.d - (q.a.idx === b.target ? 0.35 : 0)));
    for (const { a, d } of cands) {
      a.catchAttempted = true;
      const aiSide = this.setup.userSide !== a.side;
      const diffC = aiSide ? this.setup.difficulty.catching : 0;
      if (a.side === throwerSide) {
        const contested = this.agents.some((o) => o.side !== a.side && !o.down && dist2(o.x, o.y, a.x, a.y) < 1.1);
        const bulletPenalty = b.passType === 'bullet' ? 0.06 : b.passType === 'lob' ? -0.03 : 0;
        const p = clamp(0.36 + (a.player.attrs.catching / 100) * 0.62 - (contested ? 0.15 : 0) - bulletPenalty - d * 0.06 + diffC + (a.user ? 0.04 : 0), 0.05, 0.97);
        if (this.rng.chance(p)) {
          this.completeCatch(a);
          return;
        }
        this.events.push({ type: 'drop', by: a.idx });
        // le ballon peut rebondir sur les mains
        b.vx *= 0.4;
        b.vy *= 0.4;
        b.vz = Math.abs(b.vz) * 0.2 + 1.5;
      } else {
        const userJump = a.user && a.jumpTimer > 0;
        // un défenseur qui court dans le même sens que le ballon (dos au QB) intercepte rarement
        const facingBall = Math.cos(a.facing) * -b.vx + Math.sin(a.facing) * -b.vy > 0;
        const pInt = clamp(0.01 + (a.player.attrs.catching / 100) * 0.13 + (userJump ? 0.22 : 0) + (a.jumpTimer > 0 ? 0.03 : 0) + (facingBall ? 0.05 : -0.03) - d * 0.05 + diffC, 0.01, 0.4);
        const pDefl = 0.1 + a.player.attrs.awareness / 600;
        const roll = this.rng.next();
        if (roll < pInt) {
          this.interception(a);
          return;
        }
        if (roll < pInt + pDefl) {
          this.events.push({ type: 'deflect', by: a.idx });
          this.stats.push({ kind: 'passDefl', by: a.player.id });
          b.vx = b.vx * 0.2 + this.rng.normal(0, 1.5);
          b.vy = b.vy * 0.2 + this.rng.normal(0, 1.5);
          b.vz = 0.5 + this.rng.range(0, 1.2);
          for (const o of this.agents) if (o.side !== throwerSide) o.catchAttempted = true;
          return;
        }
      }
    }
  }

  private completeCatch(a: Agent): void {
    const inBounds = a.y >= 0 && a.y <= W;
    this.giveBall(a.idx, false);
    a.action = 'catch';
    a.actionTime = 0;
    this.events.push({ type: 'catch', by: a.idx });
    if (!inBounds) {
      this.finishIncomplete();
      return;
    }
    this.completedTo = a.idx;
    this.carrierRole = 'reception';
    if (this.setup.userSide === a.side && !this.setup.lockedPlayerId) this.setUser(a.idx);
    else if (this.setup.userSide !== null && this.setup.userSide !== a.side && this.setup.autoSwitch && !this.setup.lockedPlayerId) this.switchUser();
  }

  private interception(a: Agent): void {
    this.giveBall(a.idx, false);
    a.action = 'catch';
    a.actionTime = 0;
    this.turnover = 'interception';
    this.carrierRole = 'interception';
    this.offenseLostAtSpot = this.spotOf(this.losX);
    const qb = this.agents[this.ball.thrower] ?? this.agents[this.qbIdx];
    this.stats.push({ kind: 'interception', passer: qb ? qb.player.id : '', by: a.player.id });
    if (this.inOwnEndZone(a)) this.possessionChangedInEndZone = true;
    this.events.push({ type: 'interception', by: a.idx });
    this.onPossessionChange(a);
  }

  private onPossessionChange(newCarrier: Agent): void {
    const s = this.setup;
    if (s.userSide === null || s.lockedPlayerId) return;
    if (newCarrier.side === s.userSide) this.setUser(newCarrier.idx);
    else this.switchUser();
  }

  private makeLoose(lastSide: Side, fumbler: number): void {
    const b = this.ball;
    if (b.state === 'held') {
      b.vx = b.vx * 0.5 + this.rng.normal(0, 2.5);
      b.vy = b.vy * 0.5 + this.rng.normal(0, 2.5);
    } else {
      b.vx *= 0.3;
      b.vy *= 0.3;
    }
    b.vz = 1.5;
    b.state = 'loose';
    b.holder = -1;
    b.flight = null;
    b.lastSide = lastSide;
    this.fumbler = fumbler;
    for (const a of this.agents) a.catchAttempted = false;
  }

  private checkRecovery(dt: number): void {
    const b = this.ball;
    if (b.z > 1.2) return;
    let best: Agent | null = null;
    let bd = 1.0;
    for (const a of this.agents) {
      if (a.down && a.diveTimer <= 0) continue;
      const d = dist2(a.x, a.y, b.x, b.y);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    if (!best) return;
    if (!this.rng.chance(dt * (4 + best.player.attrs.awareness / 25))) return;
    const prevSide = b.lastSide;
    this.giveBall(best.idx, false);
    this.events.push({ type: 'recover', by: best.idx });
    if (best.side !== this.offense && this.turnover === 'none') {
      this.turnover = 'fumble';
      this.offenseLostAtSpot = this.offenseLostAtSpot ?? this.spotOf(b.x);
    }
    if (best.side !== prevSide) {
      if (this.fumbler >= 0) this.stats.push({ kind: 'fumbleLost', by: this.agents[this.fumbler].player.id });
      if (this.inOwnEndZone(best)) this.possessionChangedInEndZone = true;
      this.carrierRole = 'recovery';
    }
    // recouvrement : le joueur est plaqué au sol immédiatement s'il plongeait
    this.onPossessionChange(best);
    if (best.down || this.rng.chance(0.55)) {
      best.down = true;
      this.endPlayAtBall('recovered');
    }
  }

  // ————————————————————————————————— Contacts et plaquages —————————————————————————————————

  private resolveEngagements(dt: number): void {
    const c = this.carrier();
    for (const d of this.agents) {
      if (!d.engagedWith.length) continue;
      if (d.down) {
        for (const bi of d.engagedWith) this.agents[bi].blockTarget = -1;
        d.engagedWith = [];
        continue;
      }
      let bp = 0;
      for (const bi of d.engagedWith) bp += this.agents[bi].power * (d.engagedWith.length > 1 ? 0.75 : 1);
      // la paire reste au contact : le bloqueur se place entre le défenseur et le point protégé
      const protect = c && c.side !== d.side ? c : this.qbIdx >= 0 ? this.agents[this.qbIdx] : null;
      for (const bi of d.engagedWith) {
        const b = this.agents[bi];
        const px = protect ? protect.x : this.losX - 3 * this.dir;
        const py = protect ? protect.y : this.setup.ballY;
        const dx = px - d.x;
        const dy = py - d.y;
        const l = len2(dx, dy) || 1;
        const cd = d.radius + b.radius + 0.05;
        const tx = d.x + (dx / l) * cd;
        const ty = d.y + (dy / l) * cd;
        b.x += (tx - b.x) * Math.min(1, dt * 8);
        b.y += (ty - b.y) * Math.min(1, dt * 8);
        b.facing = Math.atan2(d.y - b.y, d.x - b.x);
        b.action = 'block';
      }
      d.action = 'block';
      // poussée : le plus fort fait reculer l'autre
      const diff = d.power - bp;
      const push = clamp(diff / 45, -1.6, 1.4);
      const protectAngle = protect ? Math.atan2(protect.y - d.y, protect.x - d.x) : Math.atan2(0, -this.dir);
      d.x += Math.cos(protectAngle) * push * dt * 1.6;
      d.y += Math.sin(protectAngle) * push * dt * 1.6;
      // libération (shed)
      const nearCarrier = c && c.side !== d.side && dist2(c.x, c.y, d.x, d.y) < 1.8 ? 2.6 : 1;
      const openField = c && c.side !== d.side && this.toPlay(c.x, c.y).down > 3 ? 1.5 : 1;
      const rate = 0.1 * Math.exp(diff / 20) * nearCarrier * openField * (this.thrown ? 0.6 : 1);
      if (this.rng.chance(rate * dt)) {
        const b = this.agents[d.engagedWith[0]];
        d.engagedWith.splice(0, 1);
        d.shedFrom = b.idx;
        d.shedTimer = 0.7;
        b.blockTarget = -1;
        b.stunned = 0.35;
        // holding possible lorsque le bloqueur est battu
        if (!this.holdingCalled && this.setup.rules.penaltiesEnabled && b.offense && this.ball.state !== 'air' && this.rng.chance(0.03 * (1.3 - b.player.attrs.blocking / 100))) {
          this.holdingCalled = true;
          this.penalties.push({ type: 'holding', against: b.side, playerId: b.player.id });
          this.events.push({ type: 'flag', penalty: 'holding' });
        }
      }
    }
  }

  /** Tente d'engager un bloqueur sur un défenseur (appelé par les comportements). */
  tryEngage(b: Agent, d: Agent): boolean {
    if (d.down || b.down || d.engagedWith.includes(b.idx)) return false;
    if (d.shedFrom === b.idx && d.shedTimer > 0) return false;
    if (d.engagedWith.length >= 2) return false;
    if (this.ball.holder === d.idx || this.ball.holder === b.idx) return false;
    if (dist2(b.x, b.y, d.x, d.y) > b.radius + d.radius + 0.3) return false;
    d.engagedWith.push(b.idx);
    b.blockTarget = d.idx;
    this.events.push({ type: 'hit', a: b.idx, b: d.idx, strength: 0.4 });
    return true;
  }

  /** Les bloqueurs « attrapent » tout défenseur qui arrive à leur contact. */
  private autoEngage(): void {
    const c = this.carrier();
    if (!c) return;
    const qbPocket = this.isPassPlay && !this.thrown && !this.scramble && c.idx === this.qbIdx;
    for (const b of this.agents) {
      if (b.side !== c.side || b.idx === c.idx || b.down || b.stunned > 0) continue;
      const kind = b.offAssign?.kind;
      const blockerRole = kind === 'block' || kind === 'lead' || kind === 'screenBlock' || (kind === 'fake' && this.t > 1);
      if (qbPocket && !blockerRole) continue;
      if (!qbPocket && b.idx === this.qbIdx && this.carrierRole === 'rush' && c.idx !== this.qbIdx) continue;
      if (!blockerRole && this.toPlay(c.x, c.y).down < 0 && this.carrierRole === 'rush') continue;
      if (this.agents.some((d) => d.engagedWith.includes(b.idx))) continue;
      for (const d of this.agents) {
        if (d.side === b.side || d.down || d.engagedWith.length >= 2) continue;
        if (dist2(b.x, b.y, d.x, d.y) > b.radius + d.radius + 0.12) continue;
        if (this.tryEngage(b, d)) break;
      }
    }
  }

  private separate(): void {
    const ag = this.agents;
    for (let i = 0; i < ag.length; i++) {
      const a = ag[i];
      for (let j = i + 1; j < ag.length; j++) {
        const b = ag[j];
        if (a.engagedWith.includes(j) || b.engagedWith.includes(i)) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 < 1e-6) continue;
        if (a.down || b.down) continue;
        const d = Math.sqrt(d2);
        const overlap = (min - d) * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        const wa = b.radius / (a.radius + b.radius);
        a.x -= nx * overlap * 2 * wa;
        a.y -= ny * overlap * 2 * wa;
        b.x += nx * overlap * 2 * (1 - wa);
        b.y += ny * overlap * 2 * (1 - wa);
      }
    }
  }

  private checkContacts(): void {
    const c = this.carrier();
    if (!c || c.down) return;
    // le snap/handoff en cours : pas de plaquage du centre
    let tacklers = 0;
    for (const d of this.agents) {
      if (d.side === c.side || d.down && d.diveTimer <= 0) continue;
      if (d.engagedWith.length && d.diveTimer <= 0) continue;
      if (d.tackleCooldown > 0 || d.stunned > 0) continue;
      const reach = d.diveTimer > 0 ? 1.05 : 0.32;
      const dd = dist2(d.x, d.y, c.x, c.y);
      if (dd > d.radius + c.radius + reach) continue;
      tacklers++;
      if (this.attemptTackle(d, c, tacklers)) return;
    }
  }

  private attemptTackle(d: Agent, c: Agent, gang: number): boolean {
    const s = this.setup;
    const aiSide = s.userSide !== d.side;
    const ta = d.player.attrs;
    const ca = c.player.attrs;
    const elusiveness = ca.agility * 0.45 + ca.strength * 0.4 + ca.speed * 0.15;
    const relSpeed = len2(c.vx - d.vx, c.vy - d.vy);
    let p = 0.7 + (ta.tackling - elusiveness) / 120 + (gang - 1) * 0.12 + (d.diveTimer > 0 ? 0.12 : 0) + (aiSide ? s.difficulty.tackle : 0);
    if (c.jukeTimer > 0) p -= 0.38 * (ca.agility / 100);
    if (c.protect) p += 0.04;
    if (relSpeed > 9) p -= 0.05;
    if (c.idx === this.qbIdx && !this.thrown && this.isPassPlay) p += 0.12; // QB dans la poche
    p = clamp(p, 0.08, 0.96);
    this.events.push({ type: 'hit', a: d.idx, b: c.idx, strength: clamp(relSpeed / 10, 0.3, 1) });
    if (!this.rng.chance(p)) {
      d.tackleCooldown = 0.75;
      d.stunned = 0.45;
      if (d.diveTimer > 0) {
        d.diveTimer = 0.01;
      }
      c.vx *= 0.7;
      c.vy *= 0.7;
      this.events.push({ type: 'brokenTackle', by: d.idx, carrier: c.idx });
      return false;
    }
    // Plaquage réussi
    this.lastTackler = d.idx;
    d.action = 'dive';
    d.actionTime = 0;
    d.down = true;
    d.downTimer = 1.2;
    c.down = true;
    c.action = 'down';
    c.actionTime = 0;
    // fumble ?
    const fumbleP = (0.005 + relSpeed * 0.0006) * (1.2 - ca.strength / 120) * (c.protect ? 0.25 : 1) * (d.diveTimer > 0 ? 1.2 : 1);
    if (this.rng.chance(fumbleP)) {
      this.events.push({ type: 'fumble', by: c.idx });
      this.offenseLostAtSpot = c.side === this.offense ? this.spotOf(c.x) : this.offenseLostAtSpot;
      c.down = true;
      this.makeLoose(c.side, c.idx);
      return true;
    }
    if (s.rules.penaltiesEnabled && this.rng.chance(0.004) && c.side === this.offense) {
      this.penalties.push({ type: 'facemask', against: d.side, playerId: d.player.id });
      this.events.push({ type: 'flag', penalty: 'facemask' });
    }
    // progression vers l'avant (chute)
    const cdir = c.side === this.offense ? this.dir : -this.dir;
    const fwd = clamp((c.vx * cdir) / c.maxSpeed, 0, 1) * (0.5 + ca.strength / 90) + (gang > 1 ? 0 : 0.3);
    const endX = c.x + fwd * cdir;
    const sack = c.idx === this.qbIdx && !this.thrown && this.isPassPlay && !this.scramble && this.toPlay(c.x, c.y).down < 0;
    if (sack) {
      this.sackBy = d.idx;
      this.events.push({ type: 'sack', by: d.idx });
    } else this.stats.push({ kind: 'tackle', by: d.player.id });
    this.events.push({ type: 'tackle', by: d.idx, carrier: c.idx });
    this.finish(c.side, endX, 'tackle');
    return true;
  }

  private checkBoundaries(): void {
    const c = this.carrier();
    if (!c) return;
    const cdir = c.side === this.offense ? this.dir : -this.dir;
    const scoreGoal = cdir > 0 ? FIELD.goalRight : FIELD.goalLeft;
    if ((c.x + 0.25 * cdir - scoreGoal) * cdir >= 0 && !(this.isPassPlay && c.idx === this.qbIdx && !this.thrown && !this.scramble && this.toPlay(c.x, c.y).down < 0)) {
      // Touchdown
      this.events.push({ type: 'touchdown', by: c.idx, side: c.side });
      c.action = 'celebrate';
      c.actionTime = 0;
      this.finish(c.side, c.x + 0.5 * cdir, 'touchdown');
      return;
    }
    if (c.y < 0 || c.y > W) {
      this.events.push({ type: 'outOfBounds', by: c.idx });
      this.finish(c.side, c.x, 'outOfBounds');
      return;
    }
    if (c.x < 0 || c.x > FIELD.length) {
      this.finish(c.side, clamp(c.x, 0, FIELD.length), 'outOfBounds');
    }
  }

  inOwnEndZone(a: Agent): boolean {
    const adir = a.side === this.offense ? this.dir : -this.dir;
    const ownGoal = adir > 0 ? FIELD.goalLeft : FIELD.goalRight;
    return (a.x - ownGoal) * adir < 0;
  }

  // ————————————————————————————————— Fin d'action —————————————————————————————————

  /** Position en repère de l'attaque au snap. */
  spotOf(x: number): number {
    const ownGoal = this.dir > 0 ? FIELD.goalLeft : FIELD.goalRight;
    return (x - ownGoal) * this.dir;
  }

  private endPlayAtBall(reason: string): void {
    const c = this.carrier();
    if (c) this.finish(c.side, c.x, reason);
    else this.finish(this.ball.lastSide, this.ball.x, reason);
  }

  private finishIncomplete(): void {
    if (this.phase !== 'live') return;
    this.phase = 'dead';
    this.ball.state = 'dead';
    this.events.push({ type: 'whistle' });
    const r = this.baseResult();
    r.finalPossessor = this.offense;
    r.endSpot = this.spotOf(this.losX);
    r.incomplete = true;
    r.playType = 'pass';
    // interférence de passe déjà détectée ?
    const tgt = this.agents[this.ball.target];
    r.summary = { key: 'play.incomplete', params: { qb: this.nameOf(this.qbIdx), to: tgt ? this.nameOf(tgt.idx) : '' } };
    this.result = r;
  }

  private baseResult(): PlayResult {
    const r = emptyResult(this.resultKind(), this.offense, 0);
    r.elapsed = Math.min(this.t, MAX_PLAY_TIME);
    r.penalties = this.penalties;
    r.stats = this.stats;
    r.playType = this.setup.kind === 'kickoff' || this.setup.kind === 'punt' || this.setup.kind === 'fieldGoal' || this.setup.kind === 'extraPoint' ? 'kick' : this.thrown || this.isPassPlay ? 'pass' : 'run';
    r.turnover = this.turnover;
    r.possessionChangedInEndZone = this.possessionChangedInEndZone;
    r.kickTouchback = this.kickTouchback;
    r.kickOutOfBounds = this.kickOutOfBounds;
    r.fairCatch = this.fairCatchSignal && this.carrierRole === 'return';
    return r;
  }

  nameOf(idx: number): string {
    const a = this.agents[idx];
    return a ? `${a.player.firstName[0]}. ${a.player.lastName}` : '';
  }

  /** Clôt l'action : `possessor` détient le ballon mort au x monde `x`. */
  finish(possessor: Side, x: number, reason: string): void {
    if (this.phase !== 'live') return;
    const c = this.carrier();
    this.phase = 'dead';
    this.deadTime = 0;
    this.ball.state = 'dead';
    if (reason !== 'touchdown') this.events.push({ type: 'whistle' });
    const r = this.baseResult();
    r.finalPossessor = possessor;
    r.endSpot = this.spotOf(x);
    r.outOfBounds = reason === 'outOfBounds' || reason === 'looseOut';
    if (reason === 'fairCatch') r.fairCatch = true;
    if (reason === 'kneelTouchback' || (reason === 'kneel' && this.carrierRole === 'return')) {
      r.kickTouchback = this.setup.kind === 'kickoff' || this.setup.kind === 'punt';
      this.events.push({ type: 'touchback' });
    }
    // interférence de passe : elle prime sur une incomplète
    const gain = Math.round(r.endSpot - this.spotOf(this.losX));
    const carrierId = c?.player.id ?? '';
    if (possessor === this.offense && this.setup.kind !== 'kickoff' && this.setup.kind !== 'punt') {
      // statistiques offensives
      const lostSpot = this.offenseLostAtSpot;
      const yards = Math.round((lostSpot ?? r.endSpot) - this.spotOf(this.losX));
      if (this.completedTo >= 0) {
        const qb = this.agents[this.qbIdx];
        this.stats.push({ kind: 'completion', passer: qb.player.id, receiver: this.agents[this.completedTo].player.id, yards });
      } else if (this.sackBy >= 0) {
        this.stats.push({ kind: 'sack', qb: this.agents[this.qbIdx].player.id, by: this.agents[this.sackBy].player.id, yards });
      } else if (this.carrierRole === 'rush' && c) {
        this.stats.push({ kind: 'rush', runner: carrierId, yards });
      }
      if (reason === 'touchdown' && c) {
        const via = this.completedTo >= 0 ? 'pass' : 'rush';
        this.stats.push({ kind: 'touchdown', scorer: carrierId, passer: via === 'pass' ? this.agents[this.qbIdx].player.id : undefined, via });
      }
      if (this.sackBy >= 0) r.summary = { key: 'play.sack', params: { qb: this.nameOf(this.qbIdx), by: this.nameOf(this.sackBy), yards: gain } };
      else if (this.completedTo >= 0) r.summary = { key: reason === 'touchdown' ? 'play.passTD' : 'play.pass', params: { qb: this.nameOf(this.qbIdx), to: this.nameOf(this.completedTo), yards: gain } };
      else if (c) r.summary = { key: reason === 'touchdown' ? 'play.runTD' : 'play.run', params: { name: this.nameOf(c.idx), yards: gain } };
    } else if (this.setup.kind === 'kickoff' || this.setup.kind === 'punt') {
      if (c && this.carrierRole === 'return') {
        const startSpot = this.spotOf(this.ball.tx);
        this.stats.push({ kind: 'kickReturn', returner: carrierId, yards: Math.max(0, Math.round(startSpot - r.endSpot)) });
        if (reason === 'touchdown') this.stats.push({ kind: 'touchdown', scorer: carrierId, via: 'return' });
      }
      r.summary = { key: this.setup.kind === 'kickoff' ? 'play.kickoff' : 'play.punt', params: { name: c ? this.nameOf(c.idx) : '', spot: Math.round(r.endSpot) } };
      if (r.kickTouchback) r.summary = { key: 'play.touchback' };
      if (r.fairCatch) r.summary = { key: 'play.fairCatch', params: { name: c ? this.nameOf(c.idx) : '' } };
    } else {
      // défense en possession (turnover)
      if (reason === 'touchdown' && c) this.stats.push({ kind: 'touchdown', scorer: carrierId, via: 'return' });
      r.summary = { key: this.turnover === 'interception' ? 'play.interception' : 'play.fumble', params: { name: c ? this.nameOf(c.idx) : '' } };
    }
    // interférence détectée pendant le vol
    r.stats = this.stats;
    r.penalties = this.penalties;
    this.result = r;
    if (reason === 'touchdown') {
      for (const a of this.agents) {
        if (a.side === possessor && dist2(a.x, a.y, x, c?.y ?? a.y) < 12) {
          a.action = 'celebrate';
          a.actionTime = Math.random() * 0.3;
        }
      }
    }
  }

  /** Détection d'interférence de passe pendant le vol (appelée par les comportements défensifs). */
  checkPassInterference(d: Agent, r: Agent): void {
    if (this.piCalled || !this.setup.rules.penaltiesEnabled) return;
    const b = this.ball;
    if (b.state !== 'air' || b.flight !== 'pass' || b.target !== r.idx) return;
    const remaining = b.flightTime - b.airTime;
    if (remaining > 0.7 || remaining < 0) return;
    if (dist2(d.x, d.y, r.x, r.y) > 0.75) return;
    if (this.rng.chance(0.012 * (1.3 - d.player.attrs.awareness / 100))) {
      this.piCalled = true;
      const spot = this.spotOf(r.x);
      this.penalties.push({ type: 'passInterference', against: d.side, spot, playerId: d.player.id });
      this.events.push({ type: 'flag', penalty: 'passInterference' });
    }
  }

  // ————————————————————————————————— Animation —————————————————————————————————

  private updateAnimations(dt: number): void {
    void dt;
    for (const a of this.agents) {
      if (a.down) {
        if (a.action !== 'dive' || a.actionTime > 0.45) a.action = 'down';
        continue;
      }
      if (a.engagedWith.length || (a.blockTarget >= 0 && this.agents[a.blockTarget].engagedWith.includes(a.idx))) {
        a.action = 'block';
        continue;
      }
      if (['throw', 'catch', 'kick', 'juke', 'handoff', 'dive', 'celebrate', 'kneel'].includes(a.action) && a.actionTime < 0.55) continue;
      if (a.action === 'kneel') continue;
      const sp = len2(a.vx, a.vy);
      const backwards = Math.cos(a.facing) * a.vx + Math.sin(a.facing) * a.vy < -0.5;
      a.action = sp < 0.5 ? 'idle' : backwards ? 'backpedal' : 'run';
    }
  }

  private animateDead(dt: number): void {
    for (const a of this.agents) {
      a.actionTime += dt;
      a.vx *= 0.9;
      a.vy *= 0.9;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      const sp = len2(a.vx, a.vy);
      a.stride += sp * dt * 1.5;
      if (a.action === 'celebrate') continue;
      if (a.down) {
        if (a.actionTime > 1.4 && this.deadTime > 1.0) {
          a.down = false;
          a.action = 'idle';
        }
        continue;
      }
      a.action = sp < 0.5 ? 'idle' : 'run';
    }
    // le ballon mort reste au sol au point final
    if (this.ball.state === 'dead' && this.result) {
      const b = this.ball;
      b.z = Math.max(0.12, b.z - dt * 2);
    }
  }

  /** Données utiles à l'interface (cible sélectionnée par l'utilisateur). */
  get userInput(): SimInput {
    return this.lastInput;
  }

  /** Receveurs éligibles (pour les bulles de passe). */
  eligibleReceivers(): Agent[] {
    return this.agents.filter((a) => a.eligible && a.side === this.offense);
  }

  /** Change la cible de passe sélectionnée (cycle). */
  cyclePassTarget(): void {
    const recv = this.eligibleReceivers();
    if (!recv.length) return;
    const i = recv.findIndex((a) => a.idx === this.passTarget);
    this.passTarget = recv[(i + 1) % recv.length].idx;
  }
}
