import { audio } from '../../audio/AudioEngine';
import type { GamePlan } from '../../ai/playcaller';
import { DEFENSIVE_PLAYS, type OffensivePlay } from '../../data/playbook';
import type { Team } from '../../data/types';
import { fieldPosLabel, formatClock, ordinalDown, quarterLabel, t } from '../../i18n';
import { TouchControls, type ButtonSpec } from '../../input/TouchControls';
import { MatchController } from '../../match/MatchController';
import { DEFAULT_RULES, PLAYOFF_RULES, type RulesConfig } from '../../rules/config';
import { other, type Side } from '../../rules/types';
import { openness } from '../../sim/qb';
import type { PassType } from '../../sim/types';
import type { App, Screen } from '../App';
import { el, esc, onAction } from '../dom';
import { defenseDiagram, offenseDiagram } from '../playDiagram';
import { ResultScreen } from './ResultScreen';

export interface MatchConfig {
  home: Team;
  away: Team;
  userSide: Side | null;
  quarterMinutes?: number;
  difficulty?: 'easy' | 'normal' | 'hard';
  lockedPlayerId?: string | null;
  plans?: [GamePlan, GamePlan];
  playoff?: boolean;
  context: 'quick' | 'league' | 'spectator';
  /** Appelé quand l'utilisateur quitte l'écran de résultat. */
  onExit: (mc: MatchController | null, completed: boolean) => void;
  title?: string;
}

const PASS_TYPES: PassType[] = ['touch', 'bullet', 'lob'];

export class MatchScreen implements Screen {
  readonly el: HTMLElement;
  readonly rendersScene = true;
  readonly mc: MatchController;
  private controls: TouchControls;
  private hud: HTMLElement;
  private overlay: HTMLElement;
  private bubbles: HTMLElement;
  private bannerEl: HTMLElement | null = null;
  private bannerTimer = 0;
  private toastEl: HTMLElement | null = null;
  private toastTimer = 0;
  private lastHud = '';
  private overlayKey = '';
  private kickMeter: HTMLElement;
  private kickValue = 0;
  private kickPhase = 0;
  private paused = false;
  private finishTimer = -1;
  private bubbleEls = new Map<number, HTMLElement>();
  private coinCall: 'heads' | 'tails' | null = null;
  private convChoice: 'kick' | 'two' | null = null;
  private selectedCategory: 'run' | 'pass' | 'special' = 'pass';
  private tickerText = '';

  constructor(private app: App, private cfg: MatchConfig) {
    const base: RulesConfig = { ...DEFAULT_RULES, quarterMinutes: cfg.quarterMinutes ?? app.settings.quarterMinutes, penaltiesEnabled: app.settings.penalties };
    const rules = cfg.playoff ? PLAYOFF_RULES(base) : base;
    this.mc = new MatchController(cfg.home, cfg.away, {
      rules,
      difficulty: cfg.difficulty ?? app.settings.difficulty,
      userSide: cfg.userSide,
      autoSwitch: app.settings.autoSwitch,
      userKicks: app.settings.userKicks,
      lockedPlayerId: cfg.lockedPlayerId ?? null,
      plans: cfg.plans,
    });
    app.renderer.setupMatch(cfg.home, cfg.away);
    this.el = el('div', 'screen transparent');
    this.el.style.padding = '0';
    this.hud = el('div', 'hud');
    this.bubbles = el('div', 'hud');
    this.overlay = el('div', 'hud');
    this.kickMeter = el('div', 'kickmeter', `<div class="bar"><div class="cur"></div></div><div class="lbl">${t('kick.tap')}</div>`);
    this.kickMeter.style.display = 'none';
    this.controls = new TouchControls(this.el);
    this.controls.sensitivity = app.settings.sensitivity;
    if (app.settings.leftHanded) this.controls.el.classList.add('left');
    this.el.append(this.hud, this.bubbles, this.kickMeter, this.overlay);
    this.buildHud();
    this.bindEvents();
    audio.stopMusic();
    audio.startCrowd();
    this.mc.start();
  }

  private buildHud(): void {
    const [h, a] = this.mc.teams;
    this.hud.innerHTML = `
      <button class="hud-btn pause" data-action="pause" aria-label="${t('hud.pause')}">❚❚</button>
      <button class="hud-btn to" data-action="timeout">${t('hud.timeout')}</button>
      <button class="hud-btn help" data-action="help">?</button>
      <div class="scorebug">
        <div class="tm home" style="background:${h.colors.primary}"><span class="poss"></span><span>${esc(h.abbr)}</span><span class="sc">0</span></div>
        <div class="mid"><div class="clk">0:00</div><div class="q">QT1</div><div class="tos"></div></div>
        <div class="tm away" style="background:${a.colors.primary}"><span class="poss"></span><span>${esc(a.abbr)}</span><span class="sc">0</span></div>
      </div>
      <div class="downbar"></div>
      <div class="ticker" style="display:none"></div>`;
    onAction(this.hud, (act) => {
      audio.ui();
      if (act === 'pause') this.openPause();
      if (act === 'help') this.openHelp();
      if (act === 'timeout') {
        if (this.mc.userTimeout()) this.toast(t('hud.timeout'));
      }
    });
  }

  private bindEvents(): void {
    const r = this.app.renderer;
    this.mc.bus.on('sim', ({ event: e }) => {
      const sim = this.mc.sim;
      if (!sim) return;
      const pos = (i: number) => sim.agents[i] ?? { x: sim.ball.x, y: sim.ball.y };
      switch (e.type) {
        case 'snap':
          audio.thump(0.6);
          break;
        case 'throw':
          audio.thump(1.3);
          break;
        case 'kick':
          audio.thump(0.8);
          audio.cheer(0.3);
          break;
        case 'catch':
          audio.thump(1.6);
          audio.cheer(0.35);
          r.onEvent('catch', pos(e.by).x, pos(e.by).y);
          break;
        case 'hit':
          if (e.strength > 0.5) audio.hit(e.strength * 0.6);
          break;
        case 'tackle': {
          audio.hit(1);
          const p = pos(e.carrier);
          r.onEvent('tackle', p.x, p.y, 1.2);
          break;
        }
        case 'sack':
          audio.cheer(0.6);
          this.banner('SACK !', false, 1.2);
          break;
        case 'interception':
          audio.cheer(0.9);
          r.onEvent('interception', pos(e.by).x, pos(e.by).y);
          this.banner(t('tag.INTERCEPTION'), true, 1.5);
          break;
        case 'fumble':
          audio.cheer(0.7);
          this.banner('FUMBLE !', true, 1.2);
          break;
        case 'touchdown': {
          const p = pos(e.by);
          r.onEvent('touchdown', p.x, p.y);
          audio.cheer(1);
          audio.fanfare();
          break;
        }
        case 'whistle':
          audio.whistle();
          break;
        case 'flag':
          this.toast(`🚩 ${t(`penalty.${e.penalty}`)}`);
          break;
        case 'juke':
          audio.cheer(0.25);
          break;
        case 'brokenTackle':
          audio.hit(0.5);
          audio.cheer(0.45);
          break;
        case 'kickResult':
          audio.cheer(e.good ? 0.8 : 0.4);
          break;
      }
    });
    this.mc.bus.on('resolved', ({ tags, result }) => {
      const key = result.summary.key;
      const params = result.summary.params;
      this.tickerText = key.startsWith('penalty.') ? t(key) : t(key, params as Record<string, string | number>);
      const big = ['TOUCHDOWN', 'SAFETY', 'FG_GOOD', 'TURNOVER_ON_DOWNS', 'TWO_PT_GOOD', 'GAME_OVER'];
      const shown = tags.find((x) => big.includes(x)) ?? tags.find((x) => ['FIRST_DOWN', 'FG_NO_GOOD', 'XP_GOOD', 'XP_NO_GOOD', 'TWO_PT_FAILED', 'INCOMPLETE', 'TOUCHBACK', 'FAIR_CATCH'].includes(x));
      if (shown) this.banner(t(`tag.${shown}`), big.includes(shown), big.includes(shown) ? 2.4 : 1.3);
      const pen = tags.find((x) => x.startsWith('PENALTY:'));
      if (pen) {
        const [, type, verdict] = pen.split(':');
        this.toast(type === 'offsetting' ? t('penalty.offsetting') : `🚩 ${t(`penalty.${type}`)}${verdict ? ' — ' + t(`penalty.${verdict}`) : ''}`);
      }
      if (tags.includes('FG_GOOD') || tags.includes('XP_GOOD')) audio.cheer(0.8);
    });
    this.mc.bus.on('phase', ({ phase }) => {
      if (phase === 'Halftime') this.banner(t('banner.halftime'), true, 2);
      if (phase === 'QuarterBreak') this.banner(t('banner.quarter', { q: quarterLabel(this.mc.state.quarter - 1) }), false, 2);
      if (phase === 'PlaySelection') {
        this.app.renderer.clearCelebration();
        this.convChoice = null;
      }
      if (phase === 'PreSnap') this.controls.passType = this.controls.passType ?? 'touch';
    });
    this.mc.bus.on('coinToss', (e) => {
      const res = t(e.result === 'heads' ? 'coin.heads' : 'coin.tails');
      if (this.mc.userSide !== null) this.toast(`${res} — ${e.winner === this.mc.userSide ? t('coin.won') : t('coin.lost')}`, 2.5);
    });
    this.mc.bus.on('timeout', (e) => {
      if (e.team !== this.mc.userSide) this.toast(`${t('hud.timeout')} — ${this.mc.teams[e.team].abbr}`);
    });
    this.mc.bus.on('finished', () => {
      this.finishTimer = 2.5;
      audio.cheer(1);
    });
  }

  // ———————————————————— Boucle ————————————————————

  update(dt: number): void {
    const mc = this.mc;
    const r = this.app.renderer;
    if (!this.paused) {
      const meta = this.controls.consumeMeta();
      if (meta.snap) mc.snap();
      const sim = mc.sim;
      if (meta.target && sim) sim.cyclePassTarget();
      if (meta.passType) {
        const i = PASS_TYPES.indexOf(this.controls.passType);
        this.controls.passType = PASS_TYPES[(i + 1) % PASS_TYPES.length];
        this.controls.setButtons([]);
      }
      const input = this.controls.read(r.screenAxes());
      // aide à la visée : sans assistance, la direction du joystick décale le point visé
      if (input.pass && !this.app.settings.aimAssist) {
        input.aimX = input.moveX * 3;
        input.aimY = input.moveY * 3;
      }
      if (input.passTarget <= -100 && sim) {
        const recv = sim.eligibleReceivers();
        input.passTarget = recv[this.controls.keyboardReceiver]?.idx ?? -1;
      }
      // jauge de coup de pied
      if (sim && sim.awaitingKick && this.userKicking()) {
        this.kickPhase += dt * 2.6;
        this.kickValue = Math.sin(this.kickPhase);
        if (meta.kick) input.kickMeter = this.kickValue;
      }
      if (meta.kick && mc.phase === 'PreSnap' && sim?.setup.kind === 'kickoff') mc.snap();
      this.controls.clearPulses();
      mc.update(dt, input);
    }
    r.update(this.paused ? 0 : dt, mc);
    this.updateHud();
    this.updateOverlay();
    this.updateButtons();
    this.updateBubbles();
    this.updateKickMeter();
    if (this.bannerEl && (this.bannerTimer -= dt) <= 0) {
      this.bannerEl.remove();
      this.bannerEl = null;
    }
    if (this.toastEl && (this.toastTimer -= dt) <= 0) {
      this.toastEl.remove();
      this.toastEl = null;
    }
    if (this.finishTimer > 0 && (this.finishTimer -= dt) <= 0) this.showResults();
  }

  private userKicking(): boolean {
    const sim = this.mc.sim;
    return !!sim && this.mc.userSide === sim.offense && this.app.settings.userKicks;
  }

  private updateHud(): void {
    const s = this.mc.state;
    const [h, a] = this.mc.teams;
    const clock = formatClock(this.mc.displayClock());
    const poss = s.nextKind === 'kickoff' ? other(s.possession) : s.possession;
    const own = this.mc.teams[s.possession];
    const opp = this.mc.teams[other(s.possession)];
    let down = '';
    if (s.nextKind === 'scrimmage') {
      const dist = s.ballOn + s.toGo >= 100 ? t('goal') : String(s.toGo);
      down = `${ordinalDown(s.down)} & ${dist} · ${fieldPosLabel(s.ballOn, own.abbr, opp.abbr)}`;
    } else if (s.nextKind === 'conversion') down = t('select.conversion');
    else down = 'KICKOFF';
    const key = `${s.score[0]}|${s.score[1]}|${clock}|${s.quarter}|${poss}|${down}|${s.timeouts.join()}|${this.tickerText}`;
    if (key === this.lastHud) return;
    this.lastHud = key;
    const sc = this.hud.querySelectorAll('.sc');
    sc[0].textContent = String(s.score[0]);
    sc[1].textContent = String(s.score[1]);
    const pd = this.hud.querySelectorAll('.poss');
    pd[0].classList.toggle('on', poss === 0);
    pd[1].classList.toggle('on', poss === 1);
    this.hud.querySelector('.clk')!.textContent = clock;
    this.hud.querySelector('.q')!.textContent = quarterLabel(s.quarter);
    const tos = (side: Side) => [0, 1, 2].map((i) => `<i class="${i < s.timeouts[side] ? '' : 'used'}"></i>`).join('');
    this.hud.querySelector('.tos')!.innerHTML = `<span style="display:flex;gap:3px">${tos(0)}</span>&nbsp;<span style="display:flex;gap:3px">${tos(1)}</span>`;
    (this.hud.querySelector('.downbar') as HTMLElement).textContent = down;
    const tk = this.hud.querySelector('.ticker') as HTMLElement;
    tk.style.display = this.tickerText ? '' : 'none';
    tk.textContent = this.tickerText;
    void h;
    void a;
  }

  private updateButtons(): void {
    const mc = this.mc;
    const sim = mc.sim;
    const specs: ButtonSpec[] = [];
    const showControls = !this.paused && ['PreSnap', 'LivePlay', 'PassInFlight'].includes(mc.phase) && mc.userSide !== null;
    this.controls.setVisible(showControls);
    const toBtn = this.hud.querySelector('.hud-btn.to') as HTMLElement;
    toBtn.style.display = mc.phase === 'PlaySelection' && mc.userSide !== null && mc.state.timeouts[mc.userSide] > 0 ? '' : 'none';
    if (!showControls || !sim) {
      this.controls.setButtons([]);
      return;
    }
    const userOff = mc.userSide === sim.offense;
    const u = sim.userAgent >= 0 ? sim.agents[sim.userAgent] : null;
    const kind = sim.setup.kind;
    if (mc.phase === 'PreSnap') {
      if (kind === 'kickoff') {
        if (userOff) specs.push({ id: 'kick', label: t('btn.kick'), big: true });
      } else if (userOff) {
        specs.push({ id: 'snap', label: t('btn.snap'), big: true });
        if (sim.isPassPlay) {
          specs.push({ id: 'passType', label: t(`pass.${this.controls.passType}`) });
          specs.push({ id: 'target', label: t('btn.target') });
        }
      } else specs.push({ id: 'switch', label: t('btn.switch'), accent: true });
      this.controls.setButtons(specs);
      return;
    }
    if (sim.awaitingKick && userOff && this.app.settings.userKicks) {
      specs.push({ id: 'kick', label: t('btn.kick'), big: true });
      this.controls.setButtons(specs);
      return;
    }
    const b = sim.ball;
    const hasBall = !!u && b.state === 'held' && b.holder === u.idx;
    if (hasBall && u) {
      const qbPocket = u.idx === sim.qbIdx && sim.isPassPlay && !sim.thrown && !sim.scramble && sim.toPlay(u.x, u.y).down <= 0;
      const option = sim.setup.offPlay?.subtype === 'option' && u.idx === sim.qbIdx && !sim.pitched;
      if (qbPocket) {
        specs.push({ id: 'pass', label: t('btn.pass'), big: true });
        specs.push({ id: 'target', label: t('btn.target') });
        specs.push({ id: 'passType', label: t(`pass.${this.controls.passType}`) });
        specs.push({ id: 'sprint', label: t('btn.sprint'), hold: true });
      } else {
        if (option) specs.push({ id: 'pass', label: t('btn.pitch'), big: true });
        specs.push({ id: 'sprint', label: t('btn.sprint'), hold: true, big: !option });
        specs.push({ id: 'juke', label: t('btn.juke') });
        const traffic = sim.agents.some((d) => d.side !== u.side && !d.down && Math.hypot(d.x - u.x, d.y - u.y) < 2.2);
        if (sim.carrierRole === 'return' && sim.inOwnEndZone(u)) specs.push({ id: 'dive', label: t('btn.kneel') });
        else if (traffic) specs.push({ id: 'protect', label: t('btn.protect'), hold: true });
        else specs.push({ id: 'dive', label: t('btn.dive') });
      }
    } else if (u && (kind === 'kickoff' || kind === 'punt') && u.side !== sim.offense && !sim.carrier()) {
      // retour de coup de pied : le retourneur se place
      if (b.state === 'air' && b.flight === 'punt' && u.idx === sim.returnerIdx) specs.push({ id: 'fairCatch', label: t('btn.fairCatch'), accent: true });
      specs.push({ id: 'sprint', label: t('btn.sprint'), hold: true, big: true });
    } else if (u) {
      const ballAir = b.state === 'air';
      if (ballAir && (b.flight === 'punt') && u.idx === sim.returnerIdx) specs.push({ id: 'fairCatch', label: t('btn.fairCatch'), accent: true });
      specs.push({ id: 'sprint', label: t('btn.sprint'), hold: true, big: true });
      if (u.side === sim.offense && !(sim.carrier() && sim.carrier()!.side !== u.side)) {
        if (ballAir) specs.push({ id: 'jump', label: t('btn.jump') });
        specs.push({ id: 'switch', label: t('btn.switch') });
      } else {
        specs.push({ id: 'tackle', label: t('btn.tackle'), accent: true });
        specs.push({ id: ballAir ? 'jump' : 'contain', label: ballAir ? t('btn.intercept') : t('btn.contain'), hold: !ballAir });
        specs.push({ id: 'switch', label: t('btn.switch') });
      }
    }
    this.controls.setButtons(specs);
  }

  private updateBubbles(): void {
    const mc = this.mc;
    const sim = mc.sim;
    const show = sim && mc.userSide === sim.offense && sim.isPassPlay && !sim.thrown && !this.paused &&
      ((mc.phase === 'LivePlay' && sim.userAgent === sim.qbIdx && sim.ball.holder === sim.qbIdx && !sim.scramble) || mc.phase === 'PreSnap');
    if (!show || !sim) {
      if (this.bubbleEls.size) {
        this.bubbles.innerHTML = '';
        this.bubbleEls.clear();
      }
      return;
    }
    const recv = sim.eligibleReceivers();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const qb = sim.agents[sim.qbIdx];
    const live = mc.phase === 'LivePlay';
    if (live && sim.passTarget < 0) sim.passTarget = sim.bestOpenReceiver();
    recv.forEach((a, i) => {
      let b = this.bubbleEls.get(a.idx);
      if (!b) {
        b = el('button', 'bubble', String(i + 1));
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.mc.phase === 'LivePlay') this.controls.throwTo(a.idx);
          else sim.passTarget = a.idx;
        });
        this.bubbles.appendChild(b);
        this.bubbleEls.set(a.idx, b);
      }
      const p = this.app.renderer.project(a.x, a.y, 2.6, w, h);
      b.style.display = p.visible ? '' : 'none';
      b.style.left = `${p.x}px`;
      b.style.top = `${p.y}px`;
      b.classList.toggle('passive', !live);
      b.classList.toggle('sel', sim.passTarget === a.idx);
      if (live && qb) b.classList.toggle('covered', openness(sim, qb, a) < 1.5);
    });
  }

  private updateKickMeter(): void {
    const sim = this.mc.sim;
    const show = !!sim && sim.awaitingKick && this.userKicking() && !this.paused;
    this.kickMeter.style.display = show ? '' : 'none';
    if (show) (this.kickMeter.querySelector('.cur') as HTMLElement).style.left = `${50 + this.kickValue * 50}%`;
  }

  // ———————————————————— Superpositions (toss, choix d'action) ————————————————————

  private updateOverlay(): void {
    const mc = this.mc;
    let key = '';
    if (this.paused) key = 'paused';
    else if (mc.phase === 'CoinToss' && mc.userSide !== null) key = `coin:${this.coinCall ?? ''}`;
    else if (mc.phase === 'PlaySelection' && mc.userSide !== null) {
      const off = mc.state.possession === mc.userSide;
      const pending = off ? !mc.offCall : !mc.defCall;
      if (!pending) key = 'waiting';
      else if (off && mc.state.nextKind === 'conversion' && !this.convChoice) key = 'conv';
      else key = `select:${off ? 'o' : 'd'}:${this.selectedCategory}:${mc.state.nextKind}:${mc.state.down}`;
    }
    if (key === this.overlayKey) return;
    this.overlayKey = key;
    if (key === 'paused') return;
    this.overlay.innerHTML = '';
    if (!key || key === 'waiting') return;
    if (key.startsWith('coin')) this.renderCoin();
    else if (key === 'conv') this.renderConversion();
    else this.renderPlaycall(key.split(':')[1] === 'o');
  }

  private renderCoin(): void {
    const box = el('div', 'modal');
    if (!this.coinCall) {
      box.innerHTML = `<div class="box"><h2>${t('phase.coinToss')}</h2><div class="muted">${t('coin.call')}</div><div class="actions"><button class="btn primary" data-action="heads">${t('coin.heads')}</button><button class="btn primary" data-action="tails">${t('coin.tails')}</button></div></div>`;
    } else {
      box.innerHTML = `<div class="box"><h2>${t('phase.coinToss')}</h2><div class="muted">Si vous gagnez :</div><div class="actions"><button class="btn primary" data-action="receive">${t('coin.receive')}</button><button class="btn" data-action="kick">${t('coin.kick')}</button></div></div>`;
    }
    onAction(box, (act) => {
      audio.ui('confirm');
      if (act === 'heads' || act === 'tails') this.coinCall = act;
      else {
        this.mc.resolveCoinToss(this.coinCall ?? 'heads', act === 'kick' ? 'kick' : 'receive');
        this.coinCall = null;
      }
    });
    this.overlay.appendChild(box);
  }

  private renderConversion(): void {
    const box = el('div', 'playcall');
    box.innerHTML = `<div class="head"><div class="title">${t('select.conversion')}</div></div>
      <div class="row" style="justify-content:center;flex:1">
        <button class="btn primary" style="font-size:22px;padding:24px" data-action="kick">${t('select.xp')}</button>
        <button class="btn" style="font-size:22px;padding:24px" data-action="two">${t('select.two')}</button>
      </div>`;
    onAction(box, (act) => {
      audio.ui('confirm');
      this.convChoice = act as 'kick' | 'two';
      this.mc.chooseConversion(this.convChoice);
      if (act === 'two') this.selectedCategory = 'pass';
    });
    this.overlay.appendChild(box);
  }

  private renderPlaycall(offense: boolean): void {
    const mc = this.mc;
    const box = el('div', 'playcall');
    const s = mc.state;
    let cards = '';
    let tabs = '';
    if (offense) {
      const plays = mc.offensePlaysForUser();
      const cats: ('run' | 'pass' | 'special')[] = s.nextKind === 'conversion' ? ['pass', 'run'] : ['pass', 'run', 'special'];
      if (!cats.includes(this.selectedCategory)) this.selectedCategory = 'pass';
      tabs = cats.map((c) => `<button class="chip ${c === this.selectedCategory ? 'on' : ''}" data-action="cat:${c}">${t(`cat.${c}`)}</button>`).join('');
      const list = plays.filter((p) => p.category === this.selectedCategory);
      cards = list.map((p) => this.offCard(p)).join('');
    } else {
      tabs = `<span class="chip on">${t('cat.defense')}</span>`;
      cards = DEFENSIVE_PLAYS.map((p) => `<button class="playcard" data-action="def:${p.id}"><div class="pn">${esc(p.name)}</div><div class="pf">${p.tags.join(' · ')}</div>${defenseDiagram(p)}<div class="pd">${esc(p.description)}</div></button>`).join('');
    }
    const own = mc.teams[s.possession];
    const opp = mc.teams[other(s.possession)];
    const sit = s.nextKind === 'scrimmage' ? `${ordinalDown(s.down)} & ${s.ballOn + s.toGo >= 100 ? t('goal') : s.toGo} · ${fieldPosLabel(s.ballOn, own.abbr, opp.abbr)}` : t('select.conversion');
    box.innerHTML = `<div class="head"><div class="title">${offense ? t('select.offense') : t('select.defense')} — ${sit}</div>${tabs}</div><div class="playcards">${cards}</div>`;
    onAction(box, (act) => {
      audio.ui('click');
      if (act.startsWith('cat:')) {
        this.selectedCategory = act.slice(4) as 'run' | 'pass' | 'special';
        this.overlayKey = '';
      } else if (act.startsWith('off:')) {
        audio.ui('confirm');
        mc.selectOffense(act.slice(4));
      } else if (act.startsWith('def:')) {
        audio.ui('confirm');
        mc.selectDefense(act.slice(4));
      }
    });
    this.overlay.appendChild(box);
  }

  private offCard(p: OffensivePlay): string {
    const s = this.mc.state;
    let disabled = false;
    if (p.subtype === 'kneel' && s.nextKind !== 'scrimmage') disabled = true;
    if (p.subtype === 'punt' && s.nextKind === 'conversion') disabled = true;
    const form = { shotgun: 'Shotgun', shotgunTrips: 'Shotgun Trips', singleback: 'Sous le centre', iform: 'I-Form', goalLine: 'Goal Line', punt: 'Punt', fieldGoal: 'Field goal', kneel: 'Victory' }[p.formation];
    let extra = '';
    if (p.subtype === 'fieldGoal' && s.nextKind === 'scrimmage') extra = ` · ${100 - s.ballOn + 17} yds`;
    return `<button class="playcard" data-action="off:${p.id}" ${disabled ? 'disabled style="opacity:.4"' : ''}><div class="pn">${esc(p.name)}</div><div class="pf">${form}${extra}</div>${offenseDiagram(p)}<div class="pd">${esc(p.description)}</div></button>`;
  }

  // ———————————————————— Bannières, pause, résultat ————————————————————

  private banner(text: string, big: boolean, time: number): void {
    this.bannerEl?.remove();
    this.bannerEl = el('div', `banner${big ? ' big' : ''}`, esc(text));
    this.hud.appendChild(this.bannerEl);
    this.bannerTimer = time;
  }

  private toast(text: string, time = 2): void {
    this.toastEl?.remove();
    this.toastEl = el('div', 'toast', esc(text));
    this.el.appendChild(this.toastEl);
    this.toastTimer = time;
  }

  onHidden(): void {
    if (!this.paused && this.mc.phase !== 'MatchFinished') this.openPause();
  }

  private openPause(): void {
    if (this.paused) return;
    this.paused = true;
    this.mc.paused = true;
    this.overlayKey = 'paused';
    this.overlay.innerHTML = '';
    const m = el('div', 'modal');
    const st = this.app.settings;
    m.innerHTML = `<div class="box"><h2>${t('pause.title')}</h2>
      <div class="actions"><button class="btn primary" data-action="resume">${t('pause.resume')}</button>
      <button class="btn" data-action="help">${t('pause.help')}</button>
      <button class="btn" data-action="cam">${t('settings.camera')} : ${t(`settings.camera.${st.camera}`)}</button>
      <button class="btn danger" data-action="quit">${t('pause.quit')}</button></div></div>`;
    onAction(m, (act) => {
      audio.ui();
      if (act === 'resume') this.closePause();
      if (act === 'help') {
        this.closePause();
        this.openHelp();
      }
      if (act === 'cam') {
        st.camera = st.camera === 'behind' ? 'broadcast' : 'behind';
        this.app.saveSettings();
        this.closePause();
        this.openPause();
      }
      if (act === 'quit') {
        if (confirm(t('pause.quitConfirm'))) this.exit(false);
      }
    });
    this.overlay.appendChild(m);
  }

  private closePause(): void {
    this.paused = false;
    this.mc.paused = false;
    this.overlayKey = '';
    this.overlay.innerHTML = '';
  }

  private openHelp(): void {
    const wasPaused = this.paused;
    this.paused = true;
    this.mc.paused = true;
    this.overlayKey = 'paused';
    this.overlay.innerHTML = '';
    const m = el('div', 'modal', `<div class="box"><h2>${t('help.title')}</h2><div class="helptext scroll">${esc(t('help.text'))}</div><div class="actions"><button class="btn primary" data-action="close">${t('common.close')}</button></div></div>`);
    onAction(m, () => {
      if (wasPaused) {
        this.paused = false;
        this.openPause();
      } else this.closePause();
    });
    this.overlay.appendChild(m);
  }

  private showResults(): void {
    this.finishTimer = -1;
    audio.stopCrowd();
    this.app.go(new ResultScreen(this.app, this.mc, this.cfg));
  }

  private exit(completed: boolean): void {
    audio.stopCrowd();
    this.cfg.onExit(completed ? this.mc : null, completed);
  }

  destroy(): void {
    this.mc.bus.clear();
    this.controls.setVisible(false);
    this.controls.dispose();
  }
}
