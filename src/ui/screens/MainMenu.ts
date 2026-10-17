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
      return `${welcome}<div class="mcards">
        ${resume ? this.card('resume', '▶️', `Reprendre : ${resume.title}`, `Saison ${resume.season} · semaine ${resume.week}`, 'hero') : ''}
        ${this.card('quick', '📺', t('menu.play'), 'Choisissez deux équipes et dirigez le match depuis le banc, comme à la télévision.', resume ? '' : 'hero')}
        ${this.card('academy', '🎓', 'Académie tactique', `Apprenez une tactique : texte, action au ralenti, question (${app.profile.unlockedPlays.length}/${LESSONS.length}).`)}
        ${this.card('spectator', '🍿', t('menu.spectator'), 'Regardez un match entre deux équipes au hasard.')}
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
        <h2 class="cat-title">${esc(cat.title)}</h2>
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
