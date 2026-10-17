import { audio } from '../../audio/AudioEngine';
import { GAME_NAME } from '../../core/config';
import { LESSONS, nextStarter, playName } from '../../coach/academy';
import { t } from '../../i18n';
import type { App, Screen } from '../App';
import { assistantBubble, basicsProgress, needsBasics, portraitImg } from '../coachUi';
import { el, esc, onAction } from '../dom';
import { launchMatch } from './MatchScreen';
import { QuickMatchSetup } from './QuickMatchSetup';
import { SettingsScreen } from './SettingsScreen';
import { menuExtensions, type MenuCategory } from './menuRegistry';

const CATEGORIES: { id: MenuCategory; icon: string; label: string; title: string }[] = [
  { id: 'home', icon: '🏠', label: 'Accueil', title: 'Accueil' },
  { id: 'club', icon: '🛡️', label: 'Club', title: 'Mon club' },
  { id: 'competitions', icon: '🏆', label: 'Compét.', title: 'Compétitions' },
  { id: 'national', icon: '🌍', label: 'National', title: 'Sélections nationales' },
  { id: 'academy', icon: '🎓', label: 'Académie', title: 'Académie tactique' },
  { id: 'challenges', icon: '⚡', label: 'Défis', title: 'Défis' },
  { id: 'women', icon: '♀️', label: 'Femmes', title: 'Football féminin' },
  { id: 'ut', icon: '🃏', label: 'UT', title: 'Ultimate Team' },
];

let lastCategory: MenuCategory = 'home';

/** Trophée doré vectoriel (bannière d'accueil). */
function trophySvg(): string {
  return `<svg viewBox="0 0 120 150" width="100%" height="100%"><defs><linearGradient id="gold" x1="0" x2="1"><stop offset="0" stop-color="#8a5a00"/><stop offset=".35" stop-color="#ffe27a"/><stop offset=".6" stop-color="#f0b400"/><stop offset="1" stop-color="#7a4b00"/></linearGradient></defs>
    <path d="M30 18h60v22c0 22-12 38-30 42-18-4-30-20-30-42z" fill="url(#gold)"/>
    <path d="M30 26c-14 0-18 8-16 16 2 9 10 15 18 17" fill="none" stroke="url(#gold)" stroke-width="6"/>
    <path d="M90 26c14 0 18 8 16 16-2 9-10 15-18 17" fill="none" stroke="url(#gold)" stroke-width="6"/>
    <rect x="53" y="80" width="14" height="22" fill="url(#gold)"/><path d="M38 102h44l6 16H32z" fill="url(#gold)"/><rect x="28" y="118" width="64" height="14" rx="2" fill="#3a2a10"/>
    <ellipse cx="60" cy="40" rx="10" ry="6" fill="#7a4b00" opacity=".55"/><path d="M52 40l8-5 8 5-8 5z" fill="#fff4c2" opacity=".8"/></svg>`;
}

/** Menu principal : barre latérale de catégories, grandes cartes par mode (façon jeux mobiles de football). */
export class MainMenu implements Screen {
  readonly el: HTMLElement;
  private cat: MenuCategory = lastCategory;
  private editing = false;

  constructor(private app: App) {
    this.el = el('div', 'screen home');
    this.el.style.padding = '0';
    onAction(this.el, (a) => this.action(a));
    this.render();
  }

  private card(id: string, icon: string, title: string, sub: string, cls = ''): string {
    return `<button class="mcard ${cls}" data-action="${id}"><span class="mc-ico">${icon}</span><span class="mc-title">${esc(title)}</span><span class="mc-sub">${esc(sub)}</span></button>`;
  }

  private content(): string {
    const app = this.app;
    const tiles = menuExtensions.tiles.filter((x) => x.category === this.cat);
    const extCards = tiles.map((x) => this.card(`ext:${x.id}`, x.icon, x.label(), x.sub())).join('');
    if (this.cat === 'home') {
      const slots = app.saves.listSlots().sort((a, b) => b.updatedAt - a.updatedAt);
      const resume = slots[0];
      const basics = needsBasics(app);
      const next = nextStarter(app.profile.unlockedPlays);
      const welcome = basics
        ? assistantBubble(app, `Bienvenue, coach ! Avant votre premier match, apprenons les 4 tactiques de base à l’académie (${basicsProgress(app)}). Vous ne pourrez appeler en match que les tactiques apprises.`,
          next ? `<button class="btn primary" style="margin-top:6px" data-action="lesson:${next}">▶ Commencer : ${esc(playName(next))}</button>` : '')
        : assistantBubble(app, `Vous maîtrisez ${app.profile.unlockedPlays.length} tactique${app.profile.unlockedPlays.length > 1 ? 's' : ''} sur ${LESSONS.length}. Le matchday vous attend.`);
      void welcome;
      return `<div class="fl-home">
        <button class="fl-hero" data-action="ext:nationsCup">
          <div class="fl-hero-title">COUPE DES NATIONS<span>2026</span></div>
          <div class="fl-trophy">${trophySvg()}</div>
          <div class="fl-go">🏈 GO !</div>
        </button>
        <button class="fl-card fl-academy" data-action="${basics && next ? `lesson:${next}` : 'academy'}">
          <span class="fl-label">${basics ? 'TUTORIEL' : 'ACADÉMIE'}</span>
          <span class="fl-art">🎓</span>
          <span class="fl-sub">${basics ? `Tutoriels de base ${basicsProgress(app)} — obligatoires avant le 1er match` : `${app.profile.unlockedPlays.length}/${LESSONS.length} tactiques apprises`}</span>
          ${basics ? '<span class="fl-badge">!</span>' : ''}
        </button>
        <button class="fl-card fl-career" data-action="${resume ? 'resume' : 'ext:club'}">
          ${resume ? '' : '<span class="fl-new">NEW</span>'}
          <span class="fl-label">${resume ? 'REPRENDRE' : 'CARRIÈRE DE CLUB'}</span>
          <span class="fl-art">${resume ? '▶️' : '🏟️'}</span>
          <span class="fl-sub">${resume ? esc(`${resume.title} · saison ${resume.season}, semaine ${resume.week}`) : 'Entraîneur et investisseur : de la D3 à la D1'}</span>
        </button>
        <button class="fl-card fl-match" data-action="quick"><span class="fl-label">MATCH</span><span class="fl-art">🤝</span></button>
        <button class="fl-card fl-tv" data-action="spectator"><span class="fl-label">TV</span><span class="fl-art">📺</span></button>
        <button class="fl-card fl-shop" data-action="shop"><span class="fl-label">BOUTIQUE</span><span class="fl-art">🎁</span></button>
        <button class="fl-card fl-team" data-action="ext:coach"><span class="fl-label">CARRIÈRE D’ENTRAÎNEUR</span><span class="fl-art">📋</span></button>
      </div>`;
    }
    if (this.cat === 'academy') {
      return `${assistantBubble(app, needsBasics(app) ? `Tutoriels de base : ${basicsProgress(app)}. Ils sont obligatoires avant votre premier match.` : 'Chaque tactique apprise rejoint votre playbook de match.')}<div class="mcards">${extCards}</div>`;
    }
    return `<div class="mcards">${extCards}</div>`;
  }

  private render(): void {
    const app = this.app;
    const coach = app.profile.coach;
    const cat = CATEGORIES.find((c) => c.id === this.cat)!;
    const editor = this.editing
      ? `<div class="modal"><div class="box"><h2>Votre entraîneur</h2>
          <div class="row" style="gap:8px;justify-content:center">${[0, 1, 2, 3].map((i) => `<button class="pick-portrait ${coach.portrait === i ? 'on' : ''}" data-action="portrait:${i}">${portraitImg(i, 72)}</button>`).join('')}</div>
          <input type="text" data-field="coachName" value="${esc(coach.name)}" maxlength="24" placeholder="Nom de l’entraîneur" style="margin-top:10px">
          <div class="actions"><button class="btn primary" data-action="closeEdit">OK</button></div></div></div>`
      : '';
    this.el.classList.toggle('is-home', this.cat === 'home');
    this.el.innerHTML = `
      <nav class="sidenav">${CATEGORIES.map((c) => `<button class="sn-btn ${c.id === this.cat ? 'on' : ''}" data-action="cat:${c.id}"><span class="ico">${c.icon}</span><span>${c.label}</span>${c.id === 'academy' && needsBasics(app) ? '<i class="dot"></i>' : ''}</button>`).join('')}</nav>
      <div class="home-main">
        <div class="home-top">
          <button class="coach-chip" data-action="editCoach">${portraitImg(coach.portrait, 40)}<span><b>${esc(coach.name)}</b><small>Entraîneur</small></span></button>
          <h1 class="game-title">${esc(GAME_NAME)}</h1>
          <div class="row" style="margin-left:auto;gap:6px">
            ${menuExtensions.footer.filter((x) => x.id !== 'resume').map((x) => `<button class="icon-btn" data-action="ext:${x.id}" aria-label="${esc(x.label())}">${x.icon}</button>`).join('')}
            <button class="icon-btn" data-action="settings" aria-label="${t('menu.settings')}">⚙️</button>
          </div>
        </div>
        ${this.cat === 'home' ? '' : `<h2 class="cat-title">${esc(cat.title)}</h2>`}
        <div class="scroll grow">${this.content()}</div>
      </div>${editor}`;
    const inp = this.el.querySelector('input[data-field=coachName]') as HTMLInputElement | null;
    if (inp) inp.addEventListener('change', () => {
      const v = inp.value.trim().slice(0, 24);
      if (v) {
        app.profile.coach.name = v;
        app.saveProfile();
      }
    });
  }

  private action(act: string): void {
    const app = this.app;
    audio.ui('confirm');
    if (act.startsWith('cat:')) {
      this.cat = act.slice(4) as MenuCategory;
      lastCategory = this.cat;
      this.render();
      return;
    }
    if (act === 'quick') return app.go(new QuickMatchSetup(app));
    if (act === 'shop') return void import('../ut/UTHub').then(({ UTHub }) => UTHub.open(app, 'store'));
    if (act === 'settings') return app.go(new SettingsScreen(app, () => app.go(new MainMenu(app))));
    if (act === 'spectator') return this.spectator();
    if (act === 'academy') return void import('./AcademyScreen').then(({ AcademyScreen }) => app.go(new AcademyScreen(app)));
    if (act.startsWith('lesson:')) {
      const l = LESSONS.find((x) => x.id === act.slice(7));
      if (l) void import('./AcademyScreen').then(({ AcademyScreen, LessonScreen }) => app.go(new LessonScreen(app, l, () => app.go(new AcademyScreen(app, l.side)))));
      return;
    }
    if (act === 'resume') {
      menuExtensions.footer.find((x) => x.id === 'resume')?.open(app);
      return;
    }
    if (act === 'editCoach') {
      this.editing = true;
      this.render();
      return;
    }
    if (act.startsWith('portrait:')) {
      const inp = this.el.querySelector('input[data-field=coachName]') as HTMLInputElement | null;
      if (inp?.value.trim()) app.profile.coach.name = inp.value.trim().slice(0, 24);
      app.profile.coach.portrait = Number(act.slice(9));
      app.saveProfile();
      this.render();
      return;
    }
    if (act === 'closeEdit') {
      const inp = this.el.querySelector('input[data-field=coachName]') as HTMLInputElement | null;
      if (inp?.value.trim()) app.profile.coach.name = inp.value.trim().slice(0, 24);
      app.saveProfile();
      this.editing = false;
      this.render();
      return;
    }
    if (act.startsWith('ext:')) [...menuExtensions.tiles, ...menuExtensions.footer].find((x) => x.id === act.slice(4))?.open(app);
  }

  private spectator(): void {
    const app = this.app;
    const teams = app.teams;
    const i = Math.floor(Math.random() * teams.length);
    let j = Math.floor(Math.random() * teams.length);
    if (j === i) j = (i + 1) % teams.length;
    launchMatch(app, { home: teams[i], away: teams[j], userSide: null, context: 'spectator', onExit: () => app.go(new MainMenu(app)) });
  }
}
