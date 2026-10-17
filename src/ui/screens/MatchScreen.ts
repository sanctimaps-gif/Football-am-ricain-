import type { GameState } from '../../rules/types';
import { isLight } from '../../data/generator';
import { audio } from '../../audio/AudioEngine';
import type { GamePlan } from '../../ai/playcaller';
import { FIELD } from '../../core/config';
import { FORMATIONS, OFFENSIVE_PLAYS, type DefensivePlay, type OffensivePlay } from '../../data/playbook';
import { fullName, type Team } from '../../data/types';
import { fieldPosLabel, formatClock, ordinalDown, quarterLabel, t } from '../../i18n';
import { MatchController } from '../../match/MatchController';
import { DEFAULT_RULES, PLAYOFF_RULES, type RulesConfig } from '../../rules/config';
import { playerImpact } from '../../rules/stats';
import { other, type Side } from '../../rules/types';
import { selectPersonnel } from '../../sim/personnel';
import { lessonById, LESSONS, playName } from '../../coach/academy';
import { adviceLine, type ScoutReport } from '../../coach/scouting';
import type { App, Screen } from '../App';
import { assistantBubble, assistantLine, matchPlaybook, needsBasics } from '../coachUi';
import { el, esc, onAction } from '../dom';
import { showConfirm, showMessage } from '../dialog';
import { defenseDiagram, offenseDiagram } from '../playDiagram';
import { ResultScreen } from './ResultScreen';

export interface MatchConfig {
  home: Team;
  away: Team;
  /** Équipe entraînée par l'utilisateur (null = spectateur). */
  userSide: Side | null;
  quarterMinutes?: number;
  difficulty?: 'easy' | 'normal' | 'hard';
  plans?: [GamePlan, GamePlan];
  playoff?: boolean;
  context: 'quick' | 'league' | 'spectator' | 'challenge';
  /** Situation de départ imposée (défis) : appliquée une fois, sans pile ou face. */
  setup?: (s: GameState) => void;
  /** Livre de jeu restreint (Ultimate Team), croisé avec les tactiques apprises. */
  playbook?: { off: string[]; def: string[] };
  /** Fin anticipée (Arena). */
  endCheck?: (s: GameState) => boolean;
  /** Appelé quand l'utilisateur quitte l'écran de résultat. */
  onExit: (mc: MatchController | null, completed: boolean) => void;
  title?: string;
  /** Rapport d'avant-match sur l'adversaire (repris dans l'aperçu). */
  report?: ScoutReport;
}

type Panel = 'call' | 'overview' | 'plan' | 'stats' | 'notes' | null;

const PANELS: { id: Exclude<Panel, null>; icon: string; label: string }[] = [
  { id: 'call', icon: '📋', label: 'Appel' },
  { id: 'overview', icon: '👁️', label: 'Aperçu' },
  { id: 'plan', icon: '🧠', label: 'Plan' },
  { id: 'stats', icon: '📊', label: 'Stats' },
  { id: 'notes', icon: '⭐', label: 'Notes' },
];

const FORMATION_LABEL: Record<string, string> = { shotgun: 'Shotgun', shotgunTrips: 'Shotgun Trips', singleback: 'Sous le centre', iform: 'I-Form', goalLine: 'Goal Line', punt: 'Punt', fieldGoal: 'Field goal', kneel: 'Victory' };

/**
 * Lance un match : l'entraîneur doit d'abord avoir suivi les 4 tutoriels de base.
 * Retourne false (et prévient l'utilisateur) si ce n'est pas le cas.
 */
export function launchMatch(app: App, cfg: MatchConfig): boolean {
  if (cfg.userSide !== null && needsBasics(app)) {
    void showMessage('Avant votre premier match, suivez les 4 tutoriels de base de l’académie tactique (2 en attaque, 2 en défense) : vous ne pouvez appeler que les tactiques apprises.').then(() =>
      import('./AcademyScreen').then(({ AcademyScreen }) => app.go(new AcademyScreen(app))));
    return false;
  }
  app.go(new MatchScreen(app, cfg));
  return true;
}

/**
 * Match vu comme à la télévision : l'utilisateur est l'entraîneur. Avant chaque action, il appelle une tactique
 * (parmi celles apprises à l'académie) et peut donner une consigne ; les joueurs sont tous dirigés par l'IA.
 */
export class MatchScreen implements Screen {
  readonly el: HTMLElement;
  readonly rendersScene = true;
  readonly mc: MatchController;
  private hud: HTMLElement;
  private overlay: HTMLElement;
  private panelEl: HTMLElement;
  private nav: HTMLElement;
  private commentary: HTMLElement;
  private bannerEl: HTMLElement | null = null;
  private bannerTimer = 0;
  private toastEl: HTMLElement | null = null;
  private toastTimer = 0;
  private lastHud = '';
  private overlayKey = '';
  private panel: Panel = null;
  private panelKey = '';
  private panelTimer = 0;
  private paused = false;
  private finishTimer = -1;
  private coinCall: 'heads' | 'tails' | null = null;
  private selectedCategory: 'run' | 'pass' | 'special' = 'pass';
  private selectedPlay: string | null = null;
  private priority: string | null = null;
  private speed = 1;
  private callLog: string[] = [];
  private readonly book: { off: string[]; def: string[] } | undefined;

  constructor(private app: App, private cfg: MatchConfig) {
    const base: RulesConfig = { ...DEFAULT_RULES, quarterMinutes: cfg.quarterMinutes ?? app.settings.quarterMinutes, penaltiesEnabled: app.settings.penalties };
    const rules = cfg.playoff ? PLAYOFF_RULES(base) : base;
    this.book = cfg.userSide !== null ? matchPlaybook(app, cfg.playbook) : undefined;
    this.mc = new MatchController(cfg.home, cfg.away, {
      rules,
      difficulty: cfg.difficulty ?? app.settings.difficulty,
      userSide: cfg.userSide,
      plans: cfg.plans,
      playbook: this.book,
      endCheck: cfg.endCheck,
    });
    this.mc.autoCoach = cfg.userSide !== null && app.settings.autoCoach;
    app.renderer.setupMatch(cfg.home, cfg.away);
    app.renderer.cameraMode = 'broadcast';
    this.el = el('div', 'screen transparent coach-match');
    this.el.style.padding = '0';
    this.hud = el('div', 'hud');
    this.overlay = el('div', 'hud');
    this.panelEl = el('div', 'cpanel');
    this.panelEl.style.display = 'none';
    this.nav = el('div', 'cnav');
    this.commentary = el('div', 'commentary', '<span class="mic">🎙️</span><span class="txt"></span>');
    this.el.append(this.hud, this.commentary, this.panelEl, this.nav, this.overlay);
    this.buildHud();
    this.buildNav();
    this.bindEvents();
    audio.stopMusic();
    audio.startCrowd();
    audio.cheer(0.8);
    if (cfg.setup) {
      const setup = cfg.setup;
      this.mc.practiceHook = (s) => {
        this.mc.practiceHook = null;
        setup(s);
      };
    }
    this.mc.start();
    if (cfg.setup && this.mc.phase === 'CoinToss') this.mc.resolveCoinToss('heads');
    this.banner(`${cfg.away.abbr} @ ${cfg.home.abbr}`, true, 2.2);
    this.say(`Bienvenue au ${cfg.home.stadium.name} pour ${cfg.away.city} – ${cfg.home.city}${cfg.title ? ' (' + cfg.title + ')' : ''}.`);
  }

  private get coaching(): boolean {
    return this.mc.userSide !== null;
  }

  private buildHud(): void {
    const [h, a] = this.mc.teams;
    const col = (tm: Team) => (isLight(tm.colors.primary) ? tm.colors.secondary : tm.colors.primary);
    this.hud.innerHTML = `
      <div class="scorebug">
        <div class="tm home" style="background:${col(h)}"><span class="poss"></span><span>${esc(h.abbr)}</span><span class="sc">0</span></div>
        <div class="mid"><div class="clk">0:00</div><div class="q">QT1</div><div class="tos"></div></div>
        <div class="tm away" style="background:${col(a)}"><span class="poss"></span><span>${esc(a.abbr)}</span><span class="sc">0</span></div>
      </div>
      <div class="downbar"></div>
      <div class="ctopright">
        ${this.coaching ? `<button class="chip ${this.mc.autoCoach ? 'on' : ''}" data-action="auto">🤖 Adjoint auto</button>` : ''}
        <button class="chip" data-action="speed">×1</button>
        <button class="hud-btn pause" data-action="pause" aria-label="${t('hud.pause')}">❚❚</button>
      </div>`;
    onAction(this.hud, (act, target) => {
      audio.ui();
      if (act === 'pause') this.openPause();
      if (act === 'speed') {
        this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1;
        target.textContent = `×${this.speed}`;
      }
      if (act === 'auto') {
        this.mc.autoCoach = !this.mc.autoCoach;
        this.app.settings.autoCoach = this.mc.autoCoach;
        this.app.saveSettings();
        target.classList.toggle('on', this.mc.autoCoach);
        this.toast(this.mc.autoCoach ? 'L’adjoint appelle les actions (vous pouvez reprendre la main à tout moment).' : 'Vous appelez les actions.');
        if (this.mc.autoCoach && this.panel === 'call') this.setPanel(null);
      }
    });
  }

  private buildNav(): void {
    const items = PANELS.filter((p) => this.coaching || p.id !== 'call' && p.id !== 'plan');
    this.nav.innerHTML = items.map((p) => `<button class="cnav-btn" data-action="panel:${p.id}"><span class="ico">${p.icon}</span><span>${p.label}</span></button>`).join('');
    onAction(this.nav, (act) => {
      audio.ui();
      const id = act.slice(6) as Exclude<Panel, null>;
      this.setPanel(this.panel === id ? null : id);
    });
  }

  private setPanel(p: Panel): void {
    this.panel = p;
    this.panelKey = '';
    this.panelEl.style.display = p ? '' : 'none';
    this.nav.querySelectorAll('.cnav-btn').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.action === `panel:${p}`));
    if (!p) this.panelEl.innerHTML = '';
  }

  private say(text: string): void {
    (this.commentary.querySelector('.txt') as HTMLElement).textContent = text;
  }

  private bindEvents(): void {
    const r = this.app.renderer;
    this.mc.bus.on('sim', ({ event: e }) => {
      const sim = this.mc.sim;
      if (!sim) return;
      const pos = (i: number) => sim.agents[i] ?? { x: sim.ball.x, y: sim.ball.y };
      const nameOf = (i: number) => (sim.agents[i] ? sim.agents[i].player.lastName.toUpperCase() : '');
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
          if (sim.setup.kind === 'kickoff') this.say('Coup d’envoi.');
          break;
        case 'catch':
          audio.thump(1.6);
          audio.cheer(0.35);
          r.onEvent('catch', pos(e.by).x, pos(e.by).y);
          this.say(`Réception de ${nameOf(e.by)} !`);
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
      this.say(key.startsWith('penalty.') ? t(key) : t(key, params as Record<string, string | number>));
      const big = ['TOUCHDOWN', 'SAFETY', 'FG_GOOD', 'TURNOVER_ON_DOWNS', 'TWO_PT_GOOD', 'GAME_OVER'];
      const shown = tags.find((x) => big.includes(x)) ?? tags.find((x) => ['FIRST_DOWN', 'FG_NO_GOOD', 'XP_GOOD', 'XP_NO_GOOD', 'TWO_PT_FAILED', 'INCOMPLETE', 'TOUCHBACK', 'FAIR_CATCH'].includes(x));
      if (shown) this.banner(t(`tag.${shown}`), big.includes(shown), big.includes(shown) ? 2.4 : 1.3);
      else if (tags.includes('TWO_MINUTE_WARNING')) this.banner(t('tag.TWO_MINUTE_WARNING'), false, 1.8);
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
        this.selectedPlay = null;
        this.priority = null;
      }
      if (phase === 'PreSnap' && this.mc.sim && this.mc.sim.setup.kind !== 'kickoff') this.announceCalls();
    });
    this.mc.bus.on('coinToss', (e) => {
      if (this.cfg.setup && this.mc.state.quarter <= 4) return;
      const res = t(e.result === 'heads' ? 'coin.heads' : 'coin.tails');
      if (this.mc.userSide !== null) this.toast(`${res} — ${e.winner === this.mc.userSide ? t('coin.won') : t('coin.lost')}`, 2.5);
    });
    this.mc.bus.on('timeout', (e) => {
      this.toast(`${t('hud.timeout')} — ${this.mc.teams[e.team].abbr}`);
    });
    this.mc.bus.on('finished', () => {
      this.finishTimer = 2.5;
      audio.cheer(1);
    });
  }

  /** Commentaire de l'appel de l'entraîneur (l'appel adverse reste secret, comme à la télévision). */
  private announceCalls(): void {
    const mc = this.mc;
    if (mc.userSide === null) return;
    const off = mc.state.possession === mc.userSide;
    const call = off ? mc.offCall : mc.defCall;
    if (!call) return;
    const who = mc.autoCoach ? 'L’adjoint' : 'Vous';
    this.say(`${who} : « ${call.name} »${off && mc.offCall?.progression && this.lastPriority ? ` — priorité ${this.lastPriority}` : ''}.`);
    this.callLog.unshift(call.name);
    this.callLog = this.callLog.slice(0, 6);
    this.lastPriority = null;
  }

  private lastPriority: string | null = null;

  // ———————————————————— Boucle ————————————————————

  update(dt: number): void {
    const mc = this.mc;
    const r = this.app.renderer;
    const waitingCall = this.waitingForCall();
    const step = this.paused ? 0 : dt * (waitingCall ? 1 : this.speed);
    if (!this.paused) mc.update(step);
    r.update(step, mc);
    this.updateHud();
    this.updateOverlay();
    this.updatePanel(dt);
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

  /** L'entraîneur doit-il appeler une action maintenant ? */
  private waitingForCall(): boolean {
    const mc = this.mc;
    if (mc.userSide === null || mc.autoCoach || mc.phase !== 'PlaySelection') return false;
    const off = mc.state.possession === mc.userSide;
    return off ? !mc.offCall : !mc.defCall;
  }

  private updateHud(): void {
    const s = this.mc.state;
    const clock = formatClock(this.mc.displayClock());
    const poss = s.nextKind === 'kickoff' ? other(s.possession) : s.possession;
    const own = this.mc.teams[s.possession];
    const opp = this.mc.teams[other(s.possession)];
    let down = '';
    if (s.nextKind === 'scrimmage') {
      const dist = s.ballOn + s.toGo >= 100 ? t('goal') : String(s.toGo);
      down = `${ordinalDown(s.down)} & ${dist} · ${fieldPosLabel(s.ballOn, own.abbr, opp.abbr)}`;
    } else if (s.nextKind === 'conversion') down = t('select.conversion');
    else down = 'Coup d’envoi';
    const phaseTxt = this.waitingForCall() ? ' · 📋 À vous d’appeler' : ['LivePlay', 'PassInFlight'].includes(this.mc.phase) ? ' · Action en cours' : '';
    const key = `${s.score[0]}|${s.score[1]}|${clock}|${s.quarter}|${poss}|${down}|${phaseTxt}|${s.timeouts.join()}`;
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
    (this.hud.querySelector('.downbar') as HTMLElement).textContent = down + phaseTxt;
  }

  // ———————————————————— Toss et panneau d'appel automatique ————————————————————

  private updateOverlay(): void {
    const mc = this.mc;
    let key = '';
    if (this.paused) key = 'paused';
    else if (mc.phase === 'CoinToss' && mc.userSide !== null) key = `coin:${this.coinCall ?? ''}`;
    if (key !== this.overlayKey) {
      this.overlayKey = key;
      if (key !== 'paused') this.overlay.innerHTML = '';
      if (key.startsWith('coin')) this.renderCoin();
    }
    // le panneau d'appel s'ouvre tout seul quand l'entraîneur doit décider
    if (this.waitingForCall() && this.panel !== 'call' && !this.paused) this.setPanel('call');
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

  // ———————————————————— Panneaux ————————————————————

  private updatePanel(dt: number): void {
    if (!this.panel) return;
    const mc = this.mc;
    const s = mc.state;
    let key = this.panel;
    if (this.panel === 'call') {
      const off = s.possession === mc.userSide;
      key += `:${this.waitingForCall()}:${off}:${s.nextKind}:${s.down}:${s.ballOn}:${this.selectedCategory}:${this.selectedPlay}:${this.priority}:${mc.conversionType}:${s.timeouts.join()}:${mc.autoCoach}`;
    } else if (this.panel === 'plan') {
      key += `:${mc.autoCoach}`;
    } else {
      // panneaux d'information : rafraîchis 4 fois par seconde
      this.panelTimer -= dt;
      if (this.panelTimer > 0) {
        if (this.panel === 'overview') this.drawMiniMap();
        return;
      }
      this.panelTimer = 0.25;
      key += `:${s.playNumber}:${s.score.join()}:${Math.floor(mc.displayClock())}`;
    }
    if (key === this.panelKey) {
      if (this.panel === 'overview') this.drawMiniMap();
      return;
    }
    this.panelKey = key;
    const close = '<button class="cpanel-close" data-action="close" aria-label="Fermer">✕</button>';
    let html = '';
    switch (this.panel) {
      case 'call': html = this.callPanel(); break;
      case 'overview': html = this.overviewPanel(); break;
      case 'plan': html = this.planPanel(); break;
      case 'stats': html = this.statsPanel(); break;
      case 'notes': html = this.notesPanel(); break;
    }
    this.panelEl.innerHTML = close + html;
    this.panelEl.classList.toggle('call', this.panel === 'call');
    this.panelEl.onclick = null;
    onActionOnce(this.panelEl, (act, target) => this.onPanelAction(act, target));
    this.panelEl.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((inp) => {
      inp.oninput = () => {
        const side = mc.userSide;
        if (side === null) return;
        const plan = { ...mc.plans[side] };
        plan[inp.dataset.plan as keyof GamePlan] = Number(inp.value);
        mc.plans[side] = plan;
      };
    });
    if (this.panel === 'overview') this.drawMiniMap();
  }

  private onPanelAction(act: string, _target: HTMLElement): void {
    const mc = this.mc;
    audio.ui('click');
    if (act === 'close') return this.setPanel(null);
    if (act.startsWith('cat:')) {
      this.selectedCategory = act.slice(4) as 'run' | 'pass' | 'special';
      this.selectedPlay = null;
    } else if (act.startsWith('pick:')) {
      this.selectedPlay = act.slice(5);
      this.priority = null;
    } else if (act.startsWith('prio:')) {
      this.priority = act.slice(5) || null;
    } else if (act === 'suggest') {
      const off = mc.state.possession === mc.userSide;
      const p = off ? mc.suggestOffense() : mc.suggestDefense();
      this.selectedPlay = p.id;
      if ('category' in p) this.selectedCategory = p.category;
    } else if (act === 'confirm' && this.selectedPlay) {
      audio.ui('confirm');
      const off = mc.state.possession === mc.userSide;
      if (off) {
        mc.priorityTarget = this.priority;
        this.lastPriority = this.priority ? this.slotLabel(this.selectedPlay, this.priority) : null;
        mc.selectOffense(this.selectedPlay);
      } else mc.selectDefense(this.selectedPlay);
      this.setPanel(null);
    } else if (act === 'xp' || act === 'two') {
      audio.ui('confirm');
      mc.chooseConversion(act === 'xp' ? 'kick' : 'two');
      if (act === 'xp') this.setPanel(null);
      else this.selectedCategory = 'pass';
    } else if (act === 'timeout') {
      if (mc.userTimeout()) this.toast(t('hud.timeout'));
    } else if (act === 'auto') {
      mc.autoCoach = !mc.autoCoach;
      this.app.settings.autoCoach = mc.autoCoach;
      this.app.saveSettings();
      this.hud.querySelector('[data-action=auto]')?.classList.toggle('on', mc.autoCoach);
    } else if (act === 'academy') {
      this.toast('Les nouvelles tactiques s’apprennent à l’académie (menu principal).', 3);
    }
    this.panelKey = '';
  }

  /** Joueur (nom) qui occupera un slot de la formation de l'action. */
  private slotLabel(playId: string, slot: string): string {
    const mc = this.mc;
    const side = mc.userSide ?? 0;
    const play = OFF_BY_ID.get(playId);
    if (!play) return slot;
    const pers = selectPersonnel(mc.teams[side], FORMATIONS[play.formation]);
    const p = pers.get(slot);
    return p ? `${p.position} ${p.lastName.toUpperCase()}` : slot;
  }

  private situation(): string {
    const mc = this.mc;
    const s = mc.state;
    const own = mc.teams[s.possession];
    const opp = mc.teams[other(s.possession)];
    if (s.nextKind === 'conversion') return t('select.conversion');
    return `${ordinalDown(s.down)} & ${s.ballOn + s.toGo >= 100 ? t('goal') : s.toGo} · ${fieldPosLabel(s.ballOn, own.abbr, opp.abbr)} · ${quarterLabel(s.quarter)} ${formatClock(s.clock)} · ${s.score[0]}-${s.score[1]}`;
  }

  private callPanel(): string {
    const mc = this.mc;
    const s = mc.state;
    if (mc.userSide === null) return '';
    const off = s.possession === mc.userSide;
    if (!this.waitingForCall()) {
      return `<h2>Appel de l’action</h2>
        ${assistantBubble(this.app, mc.autoCoach ? 'J’appelle les actions pour vous. Reprenez la main quand vous voulez.' : 'Action en cours. Vous appellerez la prochaine dès le coup de sifflet.')}
        <div class="row" style="margin-top:10px"><button class="btn ${mc.autoCoach ? 'primary' : ''}" data-action="auto">${mc.autoCoach ? 'Reprendre la main' : 'Confier à l’adjoint'}</button></div>
        ${this.callLog.length ? `<div class="muted" style="margin-top:10px">Derniers appels : ${this.callLog.map(esc).join(' · ')}</div>` : ''}`;
    }
    // conversion : extra point ou 2 points
    if (off && s.nextKind === 'conversion' && !mc.conversionType) {
      return `<h2>Conversion</h2>${assistantBubble(this.app, 'Touchdown ! Extra point (1 pt, quasi assuré) ou tentative à 2 points ?')}
        <div class="row" style="margin-top:12px;gap:12px"><button class="btn primary big" data-action="xp">${t('select.xp')}</button><button class="btn big" data-action="two">${t('select.two')}</button></div>`;
    }
    const suggestion = off ? mc.suggestOffense() : mc.suggestDefense();
    const lesson = lessonById(suggestion.id);
    const advice = lesson ? `Je propose « ${suggestion.name} » : ${lesson.whenToUse.charAt(0).toLowerCase()}${lesson.whenToUse.slice(1)}` : `Je propose « ${suggestion.name} ».`;
    let tabs = '';
    let cards = '';
    const unknown = LESSONS.filter((l) => l.side === (off ? 'off' : 'def') && !(off ? this.book!.off : this.book!.def).includes(l.id)).length;
    if (off) {
      const plays = mc.offensePlaysForUser();
      const cats: ('run' | 'pass' | 'special')[] = s.nextKind === 'conversion' ? ['pass', 'run'] : ['pass', 'run', 'special'];
      if (!cats.includes(this.selectedCategory)) this.selectedCategory = 'pass';
      tabs = cats.map((c) => `<button class="chip ${c === this.selectedCategory ? 'on' : ''}" data-action="cat:${c}">${t(`cat.${c}`)}</button>`).join('');
      const list = plays.filter((p) => p.category === this.selectedCategory);
      cards = list.length ? list.map((p) => this.offCard(p)).join('') : '<div class="muted">Aucune tactique apprise dans cette famille.</div>';
    } else {
      tabs = `<span class="chip on">${t('cat.defense')}</span>`;
      cards = mc.defensePlaysForUser().map((p) => this.defCard(p)).join('');
    }
    // consigne : receveur prioritaire pour une passe
    let consigne = '';
    const sel = this.selectedPlay ? OFF_BY_ID.get(this.selectedPlay) : undefined;
    if (off && sel?.progression?.length && sel.category === 'pass') {
      consigne = `<div class="consigne"><span class="muted">Consigne au QB :</span>
        <button class="chip ${this.priority === null ? 'on' : ''}" data-action="prio:">Lire la défense</button>
        ${sel.progression.slice(0, 4).map((slot) => `<button class="chip ${this.priority === slot ? 'on' : ''}" data-action="prio:${slot}">Viser ${esc(this.slotLabel(sel.id, slot))}</button>`).join('')}</div>`;
    }
    const selName = this.selectedPlay ? playName(this.selectedPlay) : '';
    return `<div class="call-head"><h2>${off ? 'Attaque' : 'Défense'} — ${esc(this.situation())}</h2>
        ${mc.state.timeouts[mc.userSide] > 0 ? `<button class="chip" data-action="timeout">⏱ ${t('hud.timeout')} (${mc.state.timeouts[mc.userSide]})</button>` : ''}</div>
      ${assistantLine(this.app, advice, `<button class="chip" data-action="suggest">Suivre</button>`)}
      <div class="call-row"><div class="row tabs">${tabs}</div>
        ${this.selectedPlay ? `<button class="btn primary" data-action="confirm">Appeler « ${esc(selName)} »</button>` : '<span class="muted small">Choisissez une tactique ↓</span>'}</div>
      <div class="playcards">${cards}</div>
      ${consigne}
      ${unknown ? `<div class="muted small">🔒 ${unknown} tactique${unknown > 1 ? 's' : ''} à apprendre à l’académie tactique.</div>` : ''}`;
  }

  private offCard(p: OffensivePlay): string {
    const s = this.mc.state;
    let disabled = false;
    if (p.subtype === 'kneel' && s.nextKind !== 'scrimmage') disabled = true;
    if (p.subtype === 'punt' && s.nextKind === 'conversion') disabled = true;
    let extra = '';
    if (p.subtype === 'fieldGoal' && s.nextKind === 'scrimmage') extra = ` · ${100 - s.ballOn + 17} yds`;
    const when = lessonById(p.id)?.whenToUse ?? p.description;
    return `<button class="playcard ${this.selectedPlay === p.id ? 'sel' : ''}" data-action="pick:${p.id}" ${disabled ? 'disabled style="opacity:.4"' : ''}><div class="pn">${esc(p.name)}</div><div class="pf">${FORMATION_LABEL[p.formation] ?? ''}${extra}</div>${offenseDiagram(p)}<div class="pd">${esc(when)}</div></button>`;
  }

  private defCard(p: DefensivePlay): string {
    const when = lessonById(p.id)?.whenToUse ?? p.description;
    return `<button class="playcard ${this.selectedPlay === p.id ? 'sel' : ''}" data-action="pick:${p.id}"><div class="pn">${esc(p.name)}</div><div class="pf">${p.tags.join(' · ')}</div>${defenseDiagram(p)}<div class="pd">${esc(when)}</div></button>`;
  }

  private overviewPanel(): string {
    const mc = this.mc;
    const s = mc.state;
    const [h, a] = mc.teams;
    const ts = s.teamStats;
    const top = ts[0].timeOfPossession + ts[1].timeOfPossession;
    const poss0 = top > 0 ? Math.round((ts[0].timeOfPossession / top) * 100) : 50;
    const ring = (label: string, v0: number, v1: number) => {
      const tot = v0 + v1;
      const f = tot > 0 ? v0 / tot : 0.5;
      return `<div class="ring"><div class="lbl">${label}</div><div class="rr"><span>${v0}</span><svg viewBox="0 0 36 36" width="46" height="46"><circle cx="18" cy="18" r="15" fill="none" stroke="${a.colors.primary}" stroke-width="4"/><circle cx="18" cy="18" r="15" fill="none" stroke="${h.colors.primary}" stroke-width="4" stroke-dasharray="${(f * 94.2).toFixed(1)} 94.2" transform="rotate(-90 18 18)"/></svg><span>${v1}</span></div></div>`;
    };
    const comments = this.assistantComments();
    return `<h2>${esc(h.abbr)} ${s.score[0]} – ${s.score[1]} ${esc(a.abbr)}</h2>
      <div class="overview">
        <div>
          <div class="possbar"><span>${poss0} %</span><span class="muted">Possession</span><span>${100 - poss0} %</span></div>
          <div class="possline"><i style="width:${poss0}%;background:${h.colors.primary}"></i><i style="width:${100 - poss0}%;background:${a.colors.primary}"></i></div>
          <div class="rings">
            ${ring('Yards', ts[0].totalYards, ts[1].totalYards)}
            ${ring('1ers downs', ts[0].firstDowns, ts[1].firstDowns)}
            ${ring('Passes réussies', ts[0].passComp, ts[1].passComp)}
            ${ring('Courses', ts[0].rushAtt, ts[1].rushAtt)}
            ${ring('Pertes de balle', ts[0].interceptionsThrown + ts[0].fumblesLost, ts[1].interceptionsThrown + ts[1].fumblesLost)}
            ${ring('Pénalités', ts[0].penalties, ts[1].penalties)}
          </div>
        </div>
        <div>
          <canvas class="minimap" width="300" height="140"></canvas>
          ${assistantBubble(this.app, comments[0], comments.slice(1).map((c) => `<div class="muted small" style="margin-top:4px">• ${esc(c)}</div>`).join(''))}
        </div>
      </div>`;
  }

  /** Remarques de l'adjoint selon le déroulement du match (et le rapport d'avant-match). */
  private assistantComments(): string[] {
    const mc = this.mc;
    const side = mc.userSide ?? 0;
    const opp = other(side);
    const ts = mc.state.teamStats;
    const out: string[] = [];
    const sc = mc.scouting[opp];
    const tot = sc.passes + sc.runs;
    if (tot >= 4) {
      const pr = Math.round((sc.passes / tot) * 100);
      out.push(pr >= 60 ? `Ils lancent beaucoup (${pr} % de passes) : une zone profonde ou un blitz peut les gêner.` : pr <= 40 ? `Ils courent beaucoup (${100 - pr} % de courses) : chargeons la boîte contre la course.` : 'Leur attaque reste équilibrée : variez les couvertures.');
    }
    const me = ts[side];
    if (me.rushAtt >= 4) {
      const ypc = me.rushYds / me.rushAtt;
      out.push(ypc >= 4.5 ? `Notre course fonctionne (${ypc.toFixed(1)} yds par course) : continuons.` : ypc < 3 ? `La course ne passe pas (${ypc.toFixed(1)} yds) : essayons les passes rapides.` : `Course correcte (${ypc.toFixed(1)} yds par course).`);
    }
    if (me.passAtt >= 4) {
      const pct = Math.round((me.passComp / me.passAtt) * 100);
      out.push(pct < 50 ? `Seulement ${pct} % de passes réussies : visons plus court.` : `${pct} % de passes réussies.`);
    }
    if (me.sacks >= 2) out.push(`Déjà ${me.sacks} sacks subis : passes rapides ou écrans contre leur pression.`);
    if (this.cfg.report && out.length < 2) out.push(...this.cfg.report.advice.slice(0, 2).map(adviceLine));
    if (!out.length) out.push('Début de match : observons leurs tendances avant d’ajuster.');
    return out.slice(0, 4);
  }

  private drawMiniMap(): void {
    const c = this.panelEl.querySelector('canvas.minimap') as HTMLCanvasElement | null;
    const sim = this.mc.sim;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    const W = c.width;
    const H = c.height;
    g.fillStyle = '#1d5a2a';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = 1;
    const sx = (x: number) => (x / FIELD.length) * W;
    const sy = (y: number) => (y / FIELD.width) * H;
    for (let yd = 10; yd <= 110; yd += 10) {
      g.beginPath();
      g.moveTo(sx(yd), 0);
      g.lineTo(sx(yd), H);
      g.stroke();
    }
    g.strokeRect(0.5, 0.5, W - 1, H - 1);
    if (!sim) return;
    const [h, a] = this.mc.teams;
    for (const ag of sim.agents) {
      g.fillStyle = ag.side === 0 ? h.colors.primary : a.colors.primary;
      g.strokeStyle = '#fff';
      g.beginPath();
      g.arc(sx(ag.x), sy(ag.y), 3.4, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.fillStyle = '#c8ff3d';
    g.beginPath();
    g.arc(sx(sim.ball.x), sy(sim.ball.y), 2.6, 0, Math.PI * 2);
    g.fill();
  }

  private planPanel(): string {
    const mc = this.mc;
    if (mc.userSide === null) return '';
    const p = mc.plans[mc.userSide];
    const sl = (k: keyof GamePlan, label: string, left: string, right: string) => `<div class="setting"><label>${label}</label><div class="row" style="gap:8px;align-items:center"><span class="muted small">${left}</span><input type="range" min="0.15" max="0.9" step="0.05" value="${p[k]}" data-plan="${k}"><span class="muted small">${right}</span></div></div>`;
    return `<h2>Plan de jeu</h2>
      ${assistantBubble(this.app, 'Ces consignes guident mes conseils et mes appels quand je prends la main.')}
      ${sl('passRatio', 'Équilibre course / passe', 'Course', 'Passe')}
      ${sl('aggression', 'Prise de risque (4e down, blitz)', 'Prudent', 'Agressif')}
      ${sl('deepShots', 'Passes longues', 'Rarement', 'Souvent')}
      <div class="row" style="margin-top:10px"><button class="btn ${mc.autoCoach ? 'primary' : ''}" data-action="auto">${mc.autoCoach ? '🤖 L’adjoint appelle — reprendre la main' : '🤖 Confier les appels à l’adjoint'}</button></div>`;
  }

  private statsPanel(): string {
    const mc = this.mc;
    const [h, a] = mc.teams;
    const [x, y] = mc.state.teamStats;
    const row = (label: string, v0: string | number, v1: string | number) => `<tr><td>${v0}</td><th>${label}</th><td>${v1}</td></tr>`;
    const third = (s: typeof x) => `${s.thirdDownConv}/${s.thirdDownAtt}`;
    return `<h2>Statistiques</h2><table class="stattable"><tr><td><b>${esc(h.abbr)}</b></td><th></th><td><b>${esc(a.abbr)}</b></td></tr>
      ${row('Yards totaux', x.totalYards, y.totalYards)}
      ${row('Passes (réussies/tentées)', `${x.passComp}/${x.passAtt}`, `${y.passComp}/${y.passAtt}`)}
      ${row('Yards à la passe', x.passYds, y.passYds)}
      ${row('Courses', x.rushAtt, y.rushAtt)}
      ${row('Yards à la course', x.rushYds, y.rushYds)}
      ${row('1ers downs', x.firstDowns, y.firstDowns)}
      ${row('3e down', third(x), third(y))}
      ${row('Sacks subis', x.sacks, y.sacks)}
      ${row('Interceptions lancées', x.interceptionsThrown, y.interceptionsThrown)}
      ${row('Fumbles perdus', x.fumblesLost, y.fumblesLost)}
      ${row('Pénalités (yards)', `${x.penalties} (${x.penaltyYds})`, `${y.penalties} (${y.penaltyYds})`)}
      ${row('Field goals', `${x.fgMade}/${x.fgAtt}`, `${y.fgMade}/${y.fgAtt}`)}
      ${row('Temps de possession', formatClock(x.timeOfPossession), formatClock(y.timeOfPossession))}
      </table>`;
  }

  private notesPanel(): string {
    const mc = this.mc;
    const side = mc.userSide ?? 0;
    const team = mc.teams[side];
    const st = mc.state.playerStats;
    const rows = team.roster
      .filter((p) => st[p.id])
      .map((p) => {
        const s = st[p.id];
        const grade = Math.max(4, Math.min(10, 6 + playerImpact(s) * 0.35));
        const parts: string[] = [];
        if (s.passAtt) parts.push(`${s.passComp}/${s.passAtt} ${s.passYds} yds`);
        if (s.rushAtt) parts.push(`${s.rushAtt} crs ${s.rushYds} yds`);
        if (s.rec) parts.push(`${s.rec} réc ${s.recYds} yds`);
        if (s.tackles) parts.push(`${s.tackles} plaq.`);
        if (s.sacks) parts.push(`${s.sacks} sack${s.sacks > 1 ? 's' : ''}`);
        if (s.ints) parts.push(`${s.ints} int.`);
        const tds = s.passTD + s.rushTD + s.recTD;
        if (tds) parts.push(`${tds} TD`);
        return { p, grade, line: parts.join(' · ') };
      })
      .sort((x, y) => y.grade - x.grade)
      .slice(0, 14);
    if (!rows.length) return `<h2>Notes des joueurs</h2><div class="muted">Les notes apparaissent après les premières actions.</div>`;
    return `<h2>Notes des joueurs — ${esc(team.abbr)}</h2><div class="notes">${rows.map((r) => `<div class="note"><span class="g ${r.grade >= 7.5 ? 'hi' : r.grade < 5.5 ? 'lo' : ''}">${r.grade.toFixed(1)}</span><span class="pos">${r.p.position}</span><span class="nm">${esc(fullName(r.p))}</span><span class="muted small">${esc(r.line)}</span></div>`).join('')}</div>`;
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
    m.innerHTML = `<div class="box"><h2>${t('pause.title')}</h2>
      <div class="actions"><button class="btn primary" data-action="resume">${t('pause.resume')}</button>
      <button class="btn danger" data-action="quit">${t('pause.quit')}</button></div></div>`;
    onAction(m, (act) => {
      audio.ui();
      if (act === 'resume') this.closePause();
      if (act === 'quit') {
        void showConfirm(t('pause.quitConfirm'), t('pause.quit'), t('common.cancel')).then((ok) => {
          if (ok) this.exit(false);
        });
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
  }
}

const OFF_BY_ID = new Map<string, OffensivePlay>(OFFENSIVE_PLAYS.map((p) => [p.id, p]));

/** Délégation de clics remplacée à chaque rendu du panneau (évite d'empiler les écouteurs). */
function onActionOnce(root: HTMLElement, fn: (act: string, target: HTMLElement) => void): void {
  root.onclick = (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!t || !root.contains(t) || (t as HTMLButtonElement).disabled) return;
    fn(t.dataset.action!, t);
  };
}
