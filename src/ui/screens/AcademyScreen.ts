import { audio } from '../../audio/AudioEngine';
import {
  basicsDone, DEMO_STEP, demoController, demoOutcome, findDemoSeed, focusSlots, LESSONS, lessonAvailable, lessonQuiz, nextStarter, playName,
  STARTER_LESSONS, unlock, type Lesson,
} from '../../coach/academy';
import { createDefaultTeams } from '../../data/generator';
import { DEFENSIVE_PLAYS, OFFENSIVE_PLAYS } from '../../data/playbook';
import type { Team } from '../../data/types';
import type { MatchController } from '../../match/MatchController';
import type { App, Screen } from '../App';
import { assistantBubble, basicsProgress } from '../coachUi';
import { el, esc, onAction } from '../dom';
import { defenseDiagram, offenseDiagram } from '../playDiagram';

const LEVEL = ['', 'Base', 'Intermédiaire', 'Avancé'];

const diagramFor = (l: Lesson): string =>
  l.side === 'off' ? offenseDiagram(OFFENSIVE_PLAYS.find((p) => p.id === l.id)!) : defenseDiagram(DEFENSIVE_PLAYS.find((p) => p.id === l.id)!);

/** Académie tactique : liste des leçons (attaque / défense), progression, tutoriels de base obligatoires. */
export class AcademyScreen implements Screen {
  readonly el: HTMLElement;
  private side: 'off' | 'def';

  constructor(private app: App, side: 'off' | 'def' = 'off', private back?: () => void) {
    this.side = side;
    this.el = el('div', 'screen');
    onAction(this.el, (a) => this.action(a));
    this.render();
  }

  private render(): void {
    const u = this.app.profile.unlockedPlays;
    const done = basicsDone(u);
    const next = nextStarter(u);
    const learned = LESSONS.filter((l) => u.includes(l.id)).length;
    const cards = LESSONS.filter((l) => l.side === this.side).map((l) => {
      const ok = u.includes(l.id);
      const avail = lessonAvailable(l, u);
      const state = ok ? '<span class="tag ok">✅ Apprise</span>' : avail ? '<span class="tag go">▶ À apprendre</span>' : '<span class="tag lock">🔒 Après les bases</span>';
      return `<button class="lesson-card ${ok ? 'done' : ''} ${avail ? '' : 'locked'}" data-action="lesson:${l.id}" ${avail ? '' : 'disabled'}>
        <div class="lc-top"><span class="lc-fam">${esc(l.family)}</span>${STARTER_LESSONS.includes(l.id) ? '<span class="tag base">BASE</span>' : `<span class="lc-lvl">${'★'.repeat(l.level)}</span>`}</div>
        <div class="lc-name">${esc(playName(l.id))}</div>
        <div class="lc-diag">${diagramFor(l)}</div>
        <div class="lc-when">${esc(l.whenToUse)}</div>
        ${state}</button>`;
    }).join('');
    const intro = done
      ? assistantBubble(this.app, `Vous connaissez ${learned} tactique${learned > 1 ? 's' : ''} sur ${LESSONS.length}. Chaque nouvelle leçon ajoute une tactique à votre playbook de match.`)
      : assistantBubble(this.app, `Avant votre premier match, apprenons les 4 tactiques de base (${basicsProgress(this.app)}) : 2 en attaque, 2 en défense. Pour chacune : un court texte, l’action au ralenti, puis une question.`,
        next ? `<button class="btn primary" style="margin-top:8px" data-action="lesson:${next}">▶ Leçon suivante : ${esc(playName(next))}</button>` : '');
    this.el.innerHTML = `
      <div class="topbar"><button class="btn ghost" data-action="back">‹ Retour</button><h1>🎓 Académie tactique</h1>
        <div class="row" style="margin-left:auto;gap:6px"><button class="chip ${this.side === 'off' ? 'on' : ''}" data-action="side:off">⚔️ Attaque</button><button class="chip ${this.side === 'def' ? 'on' : ''}" data-action="side:def">🛡️ Défense</button></div></div>
      <div class="scroll grow">${intro}<div class="lesson-grid">${cards}</div></div>`;
  }

  private action(a: string): void {
    audio.ui();
    if (a === 'back') {
      if (this.back) this.back();
      else void import('./MainMenu').then(({ MainMenu }) => this.app.go(new MainMenu(this.app)));
      return;
    }
    if (a.startsWith('side:')) {
      this.side = a.slice(5) as 'off' | 'def';
      this.render();
    }
    if (a.startsWith('lesson:')) {
      const l = LESSONS.find((x) => x.id === a.slice(7));
      if (l) this.app.go(new LessonScreen(this.app, l, () => this.app.go(new AcademyScreen(this.app, l.side, this.back))));
    }
  }
}

type Step = 'read' | 'watch' | 'quiz' | 'done';

/** Une leçon : lecture, action au ralenti (vue 3D), question de compréhension, déblocage. */
export class LessonScreen implements Screen {
  readonly el: HTMLElement;
  rendersScene = false;
  private step: Step = 'read';
  private mc: MatchController | null = null;
  private teams: [Team, Team];
  private seed = 0;
  private acc = 0;
  private slow = 0.3;
  private labels = new Map<number, HTMLElement>();
  private labelLayer: HTMLElement;
  private caption: HTMLElement;
  private lastKey = -1;
  private ended = false;
  private wrong = -1;

  constructor(private app: App, private lesson: Lesson, private back: () => void) {
    this.el = el('div', 'screen lesson');
    this.labelLayer = el('div', 'hud');
    this.caption = el('div', 'lesson-caption');
    const tm = createDefaultTeams(7, 2);
    this.teams = [tm[0], tm[1]];
    onAction(this.el, (a) => this.action(a));
    this.render();
  }

  private render(): void {
    const l = this.lesson;
    this.rendersScene = this.step === 'watch';
    this.el.classList.toggle('transparent', this.step === 'watch');
    if (this.step === 'read') {
      this.el.innerHTML = `
        <div class="topbar"><button class="btn ghost" data-action="back">‹ Académie</button><h1>${esc(playName(l.id))}</h1><span class="chip">${l.side === 'off' ? '⚔️ Attaque' : '🛡️ Défense'} · ${esc(l.family)} · ${LEVEL[l.level]}</span></div>
        <div class="lesson-read scroll grow">
          <div class="lr-diag">${diagramFor(l)}</div>
          <div class="lr-text">
            <p class="lead">${esc(l.text)}</p>
            <div class="lr-box"><b>Quand l’utiliser</b><div>${esc(l.whenToUse)}</div></div>
            <div class="lr-box warn"><b>Point faible</b><div>${esc(l.weakness)}</div></div>
            <div class="lr-box"><b>À regarder pendant le ralenti</b><ol>${l.keys.map((k) => `<li>${esc(k)}</li>`).join('')}</ol></div>
            <button class="btn primary big" data-action="watch">▶ Voir l’action au ralenti</button>
          </div>
        </div>`;
    } else if (this.step === 'watch') {
      this.el.innerHTML = `
        <div class="lesson-top"><button class="btn ghost" data-action="back">‹ Académie</button><b>${esc(playName(l.id))}</b> <span class="muted">— ralenti</span>
          <div class="row" style="margin-left:auto;gap:6px">${[0.15, 0.3, 0.6, 1].map((v) => `<button class="chip ${v === this.slow ? 'on' : ''}" data-action="slow:${v}">×${v}</button>`).join('')}</div></div>`;
      this.el.append(this.labelLayer, this.caption);
      this.renderCaption();
    } else if (this.step === 'quiz') {
      const q = lessonQuiz(l);
      this.el.innerHTML = `
        <div class="topbar"><button class="btn ghost" data-action="back">‹ Académie</button><h1>Question</h1></div>
        <div class="scroll grow quiz">
          ${assistantBubble(this.app, q.question)}
          <div class="answers">${q.answers.map((a, i) => `<button class="btn answer ${this.wrong === i ? 'wrong' : ''}" data-action="answer:${i}">${esc(a)}</button>`).join('')}</div>
          ${this.wrong >= 0 ? `<div class="lr-box warn">Pas tout à fait. Relisez : ${esc(l.text)}</div>` : ''}
          <div class="row" style="gap:8px"><button class="btn" data-action="rewatch">↺ Revoir le ralenti</button><button class="btn" data-action="reread">📖 Relire le texte</button></div>
        </div>`;
    } else {
      const u = this.app.profile.unlockedPlays;
      const next = nextStarter(u);
      const msg = next
        ? `Tactique apprise : « ${playName(l.id)} » est dans votre playbook. Tutoriels de base : ${basicsProgress(this.app)}.`
        : basicsDone(u) && STARTER_LESSONS.includes(l.id)
          ? `Bravo, les 4 tactiques de base sont apprises : vous pouvez diriger votre premier match ! Les autres tactiques se débloquent ici, une par une.`
          : `Tactique apprise : « ${playName(l.id)} » est désormais disponible en match.`;
      this.el.innerHTML = `
        <div class="topbar"><h1>✅ Tactique apprise</h1></div>
        <div class="scroll grow quiz">${assistantBubble(this.app, msg)}
          <div class="row" style="gap:8px;margin-top:12px">${next ? `<button class="btn primary big" data-action="next:${next}">▶ Leçon suivante : ${esc(playName(next))}</button>` : ''}<button class="btn ${next ? '' : 'primary big'}" data-action="back">Retour à l’académie</button></div></div>`;
    }
  }

  private startDemo(): void {
    if (!this.seed) this.seed = findDemoSeed(this.lesson, this.teams[0], this.teams[1]);
    this.mc = demoController(this.lesson, this.teams[0], this.teams[1], this.seed);
    this.app.renderer.setupMatch(this.teams[0], this.teams[1]);
    this.app.renderer.cameraMode = 'behind';
    this.acc = 0;
    this.ended = false;
    this.lastKey = -1;
    this.labels.clear();
    this.labelLayer.innerHTML = '';
  }

  /** Étape de lecture courante (0 : mise en place, 1 : début de l'action, 2 : suite). */
  private keyIndex(): number {
    const mc = this.mc;
    if (!mc || !mc.sim) return 0;
    if (mc.phase === 'PreSnap') return 0;
    return mc.sim.t < 1.1 ? 1 : 2;
  }

  private renderCaption(): void {
    const l = this.lesson;
    const k = this.keyIndex();
    let result = '';
    if (this.ended && this.mc) {
      const o = demoOutcome(this.mc);
      if (o) {
        const res = o.turnover ? 'perte de balle' : o.incomplete ? 'passe incomplète' : o.td ? 'touchdown !' : `${o.gain >= 0 ? '+' : ''}${Math.round(o.gain)} yards`;
        result = `<div class="lc-result">Résultat : <b>${res}</b></div>
          <div class="row" style="gap:8px"><button class="btn" data-action="replay">↺ Revoir</button><button class="btn primary" data-action="toquiz">Continuer ▶</button></div>`;
      }
    }
    this.caption.innerHTML = `<ol>${l.keys.map((x, i) => `<li class="${i === k && !this.ended ? 'cur' : i < k || this.ended ? 'past' : ''}">${esc(x)}</li>`).join('')}</ol>${result}`;
  }

  private updateLabels(): void {
    const mc = this.mc;
    const sim = mc?.sim;
    if (!sim) return;
    const marks = focusSlots(this.lesson);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const offenseSide = sim.offense;
    for (const m of marks) {
      const a = sim.agents.find((x) => x.slot === m.slot && (x.side === offenseSide) === m.offense);
      if (!a) continue;
      let b = this.labels.get(a.idx);
      if (!b) {
        b = el('div', `focus-label ${m.offense ? 'off' : 'def'}`, esc(m.label));
        this.labelLayer.appendChild(b);
        this.labels.set(a.idx, b);
      }
      const p = this.app.renderer.project(a.x, a.y, 2.9, w, h);
      b.style.display = p.visible ? '' : 'none';
      b.style.left = `${Math.min(w - 40, Math.max(40, p.x))}px`;
      b.style.top = `${Math.min(h - 20, Math.max(50, p.y))}px`;
    }
  }

  update(dt: number): void {
    const mc = this.mc;
    // hors ralenti, l'application dessine elle-même le fond de menu
    if (this.step !== 'watch' || !mc) return;
    if (!this.ended) {
      this.acc += dt * this.slow;
      let n = 0;
      while (this.acc >= DEMO_STEP && n++ < 20) {
        this.acc -= DEMO_STEP;
        mc.update(DEMO_STEP);
        if (mc.phase === 'BallDead' || mc.phase === 'PlayReview') {
          this.ended = true;
          audio.whistle();
          break;
        }
      }
    }
    this.app.renderer.update(this.ended ? dt * 0.2 : dt * this.slow, mc);
    this.updateLabels();
    const k = this.ended ? 99 : this.keyIndex();
    if (k !== this.lastKey) {
      this.lastKey = k;
      this.renderCaption();
    }
  }

  private action(a: string): void {
    audio.ui();
    if (a === 'back') {
      this.app.renderer.cameraMode = 'broadcast';
      this.back();
      return;
    }
    if (a === 'watch' || a === 'rewatch' || a === 'replay') {
      this.step = 'watch';
      this.render();
      this.startDemo();
      return;
    }
    if (a === 'reread') {
      this.step = 'read';
      this.wrong = -1;
      this.render();
      return;
    }
    if (a.startsWith('slow:')) {
      this.slow = Number(a.slice(5));
      this.el.querySelectorAll('[data-action^="slow:"]').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.action === a));
      return;
    }
    if (a === 'toquiz') {
      this.step = 'quiz';
      this.wrong = -1;
      this.app.renderer.cameraMode = 'broadcast';
      this.render();
      return;
    }
    if (a.startsWith('answer:')) {
      const i = Number(a.slice(7));
      const q = lessonQuiz(this.lesson);
      if (i === q.correct) {
        audio.ui('confirm');
        this.app.profile.unlockedPlays = unlock(this.app.profile.unlockedPlays, this.lesson.id);
        this.app.saveProfile();
        this.step = 'done';
      } else {
        audio.ui('back');
        this.wrong = i;
      }
      this.render();
      return;
    }
    if (a.startsWith('next:')) {
      const l = LESSONS.find((x) => x.id === a.slice(5));
      if (l) this.app.go(new LessonScreen(this.app, l, this.back));
    }
  }

  destroy(): void {
    this.mc?.bus.clear();
    this.app.renderer.cameraMode = 'broadcast';
  }
}
