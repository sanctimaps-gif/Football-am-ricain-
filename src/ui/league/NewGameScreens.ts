import { audio } from '../../audio/AudioEngine';
import { createDefaultTeams, createTeamsFor, teamFromTemplate, teamOverall } from '../../data/generator';
import { ALL_CLUBS, displayName, leagueDef, LEAGUES } from '../../data/world';
import { TEAM_TEMPLATES, type TeamTemplate } from '../../data/teams';
import type { LogoShape, Team } from '../../data/types';
import { createLeague, isLeague } from '../../league/league';
import type { League, LeagueMode } from '../../league/types';
import type { App, Screen } from '../App';
import { el, esc, onAction } from '../dom';
import { showConfirm, showMessage } from '../dialog';
import { logoSvg } from '../logo';
import { MainMenu } from '../screens/MainMenu';
import { LeagueHub, MODE_TITLES } from './LeagueHub';

const PALETTE = ['#1B2A6B', '#0A7EA4', '#6B0F2B', '#2E2E2E', '#E85D04', '#F5C400', '#00A6A6', '#8A1538', '#0B3D91', '#5A189A', '#4CC9F0', '#D62828', '#2B9348', '#2A9D8F', '#FFFFFF', '#C0C0C0', '#111111', '#F4A261'];
const SHAPES: LogoShape[] = ['shield', 'circle', 'diamond', 'hexagon', 'star', 'square'];

export function startLeague(app: App, l: League): void {
  const slot = app.saves.freeSlot();
  if (slot === null) {
    app.go(new SavesScreen(app));
    void showMessage('Les 3 emplacements de sauvegarde sont utilisés : supprimez-en un pour commencer une nouvelle partie.');
    return;
  }
  const hub = new LeagueHub(app, l, slot);
  app.go(hub);
  hub.saveNow(); // première sauvegarde automatique
}

/** Choix de la ligue, de l'équipe et du format (championnat, carrière de coach, ligue personnalisée). */
export class TeamPickScreen implements Screen {
  readonly el: HTMLElement;
  private group = 'fra';
  private seed = Date.now() >>> 0;
  private cache = new Map<string, Team[]>();
  private custom = new Set<string>();
  private customStep: 'select' | 'pick' = 'select';
  private pick = 0;
  private weeks = 10;
  private playoff: 2 | 4 = 4;

  constructor(private app: App, private mode: LeagueMode, group?: string) {
    if (group) this.group = group;
    this.el = el('div', 'screen');
    onAction(this.el, (a) => this.action(a));
    this.render();
  }

  private teams(): Team[] {
    const key = this.group === 'custom' ? 'custom:' + [...this.custom].sort().join(',') : this.group;
    let t = this.cache.get(key);
    if (!t) {
      if (this.group === 'custom') {
        t = ALL_CLUBS.filter((x) => this.custom.has(x.id)).map((x) => teamFromTemplate(x, this.seed));
        t.forEach((x, i) => (x.conference = (i % 2) as 0 | 1));
      } else t = createTeamsFor(this.group, this.seed);
      this.cache.set(key, t);
    }
    return t;
  }

  private maxWeeks(): number {
    return Math.max(2, (this.teams().length - 1) * 2);
  }

  private render(): void {
    const chips = <T extends string | number>(k: string, vals: T[], cur: T, f: (v: T) => string) => vals.map((v) => `<button class="chip ${v === cur ? 'on' : ''}" data-action="${k}:${v}">${f(v)}</button>`).join('');
    const leagues = LEAGUES.map((d) => `<button class="chip ${d.id === this.group ? 'on' : ''}" data-action="league:${d.id}">${d.flag} ${esc(d.short)}</button>`).join('') + `<button class="chip ${this.group === 'custom' ? 'on' : ''}" data-action="league:custom">✏️ Personnalisée</button>`;
    const selecting = this.group === 'custom' && this.customStep === 'select';
    let grid: string;
    if (selecting) {
      grid = LEAGUES.map((d) => `<div class="opt-label" style="grid-column:1/-1">${d.flag} ${esc(d.name)}</div>` + d.teams.map((x) => `<button class="team-card" style="--c1:${x.primary};--c2:${this.custom.has(x.id) ? '#ffcc1a' : x.secondary};min-height:84px;${this.custom.has(x.id) ? 'outline:3px solid #ffcc1a' : ''}" data-action="toggle:${x.id}">${logoSvg({ shape: x.logoShape, glyph: x.glyph, stripes: false }, { primary: x.primary, secondary: x.secondary, accent: x.accent }, 34)}<div class="city" style="font-size:14px;text-align:center">${esc(displayName(x))}</div></button>`).join('')).join('');
    } else {
      const teams = this.teams();
      if (this.pick >= teams.length) this.pick = 0;
      grid = teams.map((tm, i) => `<button class="team-card" style="--c1:${tm.colors.primary};--c2:${i === this.pick ? '#ffcc1a' : tm.colors.secondary};min-height:120px;${i === this.pick ? 'outline:3px solid #ffcc1a' : ''}" data-action="pick:${i}">${logoSvg(tm.logo, tm.colors, 46)}<div class="name" style="font-size:17px">${esc(displayName(tm))}</div><div class="ovr">GÉN ${teamOverall(tm)}</div></button>`).join('');
    }
    const weekOpts = [6, 8, 10, 11, 14, 17].filter((w) => w <= this.maxWeeks());
    if (!weekOpts.includes(this.weeks)) this.weeks = weekOpts.includes(10) ? 10 : weekOpts[weekOpts.length - 1];
    const title = this.mode === 'season' ? 'Championnats' : MODE_TITLES[this.mode];
    const primary = selecting ? `<button class="btn primary" data-action="customNext">Suivant (${this.custom.size}) ▶</button>` : '<button class="btn primary" data-action="start">Commencer ▶</button>';
    this.el.innerHTML = `<div class="topbar"><button class="btn ghost" data-action="back">‹ Retour</button><h1>${title}</h1>${primary}</div>
      <div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:4px">${leagues}</div>
      ${selecting ? '<div class="muted" style="font-size:14px">Ligue personnalisée : touchez 6 à 20 clubs de n’importe quelle ligue, puis « Suivant » pour choisir le vôtre.</div>' : `<div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:6px"><span class="opt-label">Semaines</span>${chips('weeks', weekOpts, this.weeks, (v) => String(v))}<span class="opt-label">Playoffs</span>${chips('po', [2, 4], this.playoff, (v) => `${v * 2} équipes`)}<span class="opt-label">Quart-temps</span>${chips('qm', [1, 3, 5, 15], this.app.settings.quarterMinutes, (v) => `${v} min`)}${this.group === 'custom' ? '<button class="chip" data-action="customEdit">✏️ Modifier la sélection</button>' : ''}</div>`}
      <div class="scroll grow" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;align-content:start">${grid}</div>`;
  }

  private action(a: string): void {
    audio.ui();
    const [k, v] = a.split(':');
    if (k === 'back') return this.app.go(new MainMenu(this.app));
    if (k === 'league') {
      this.group = v;
      this.pick = 0;
      if (v !== 'custom') this.weeks = leagueDef(v).defaultWeeks;
      else this.customStep = this.custom.size >= 6 ? 'pick' : 'select';
    }
    if (k === 'toggle') {
      if (this.custom.has(v)) this.custom.delete(v);
      else if (this.custom.size < 20) this.custom.add(v);
      else void showMessage('20 clubs maximum.');
    }
    if (k === 'customNext') {
      if (this.custom.size < 6) return void showMessage('Choisissez au moins 6 clubs.');
      this.customStep = 'pick';
      this.pick = 0;
    }
    if (k === 'customEdit') this.customStep = 'select';
    if (k === 'pick') this.pick = Number(v);
    if (k === 'weeks') this.weeks = Number(v);
    if (k === 'po') this.playoff = Number(v) as 2 | 4;
    if (k === 'qm') {
      this.app.settings.quarterMinutes = Number(v) as 1 | 3 | 5 | 15;
      this.app.saveSettings();
    }
    if (k === 'start') {
      const teams = this.teams();
      const playoff = teams.length < 8 ? 2 : this.playoff;
      const l = createLeague({ mode: this.mode, userTeamId: teams[this.pick].id, teams, seed: this.seed, weeks: this.weeks, playoffTeams: playoff, quarterMinutes: this.app.settings.quarterMinutes, name: this.group === 'custom' ? 'Ligue personnalisée' : leagueDef(this.group).name });
      l.leagueId = this.group;
      l.conferenceNames = this.group === 'custom' ? ['Conférence A', 'Conférence B'] : leagueDef(this.group).conferenceNames;
      return startLeague(this.app, l);
    }
    this.render();
  }
}

/** Création d'une franchise personnalisée (nom, couleurs, logo, maillots). */
export class FranchiseCreator implements Screen {
  readonly el: HTMLElement;
  private d = { city: 'Avignon', name: 'Aigles', abbr: 'AVI', primary: '#0B3D91', secondary: '#F5C400', accent: '#FFFFFF', shape: 'shield' as LogoShape, glyph: 'A', stadium: 'Stade des Papes', awayJersey: '#F4F4F4', stripes: true };

  constructor(private app: App) {
    this.el = el('div', 'screen');
    onAction(this.el, (a) => this.action(a));
    this.render();
  }

  private jerseySvg(color: string, num: string, numColor: string): string {
    return `<svg viewBox="0 0 100 100" width="90" height="90"><path d="M30 10 L42 6 Q50 14 58 6 L70 10 L90 28 L80 42 L72 36 L72 92 L28 92 L28 36 L20 42 L10 28 Z" fill="${color}" stroke="#000" stroke-opacity=".3" stroke-width="2"/>${this.d.stripes ? `<rect x="10" y="28" width="16" height="5" fill="${this.d.secondary}" transform="rotate(40 18 30)"/><rect x="74" y="28" width="16" height="5" fill="${this.d.secondary}" transform="rotate(-40 82 30)"/>` : ''}<text x="50" y="68" text-anchor="middle" font-family="Arial Black" font-size="30" fill="${numColor}" stroke="${this.d.accent}" stroke-width="1">${num}</text></svg>`;
  }

  private render(): void {
    const d = this.d;
    const colorRow = (k: 'primary' | 'secondary' | 'accent' | 'awayJersey') => `<div class="row" style="flex-wrap:wrap;gap:4px">${PALETTE.map((c) => `<button data-action="${k}:${c}" style="width:30px;height:30px;border-radius:8px;background:${c};border:${d[k] === c ? '3px solid #ffcc1a' : '1px solid #555'}" aria-label="${c}"></button>`).join('')}</div>`;
    this.el.innerHTML = `<div class="topbar"><button class="btn ghost" data-action="back">‹ Retour</button><h1>Créer ma franchise</h1><button class="btn primary" data-action="create">Fonder le club ▶</button></div>
      <div class="row grow" style="align-items:stretch;gap:12px;min-height:0">
        <div class="panel scroll grow col">
          <div class="row"><input type="text" data-field="city" value="${esc(d.city)}" placeholder="Ville" maxlength="16"><input type="text" data-field="name" value="${esc(d.name)}" placeholder="Nom" maxlength="16"><input type="text" data-field="abbr" value="${esc(d.abbr)}" placeholder="ABR" maxlength="3" style="width:80px"></div>
          <div class="row"><input type="text" data-field="stadium" value="${esc(d.stadium)}" placeholder="Stade" maxlength="24"><input type="text" data-field="glyph" value="${esc(d.glyph)}" placeholder="Lettre du logo" maxlength="2" style="width:120px"></div>
          <div class="opt-label">Couleur principale</div>${colorRow('primary')}
          <div class="opt-label">Couleur secondaire</div>${colorRow('secondary')}
          <div class="opt-label">Couleur d’accent</div>${colorRow('accent')}
          <div class="opt-label">Maillot extérieur</div>${colorRow('awayJersey')}
          <div class="opt-label">Forme du logo</div><div class="row" style="flex-wrap:wrap">${SHAPES.map((s) => `<button class="chip ${s === d.shape ? 'on' : ''}" data-action="shape:${s}">${s}</button>`).join('')}<button class="chip ${d.stripes ? 'on' : ''}" data-action="stripes">Bandes</button></div>
        </div>
        <div class="panel col" style="width:34%;align-items:center;justify-content:center">
          ${logoSvg({ shape: d.shape, glyph: d.glyph || '?', stripes: d.stripes }, { primary: d.primary, secondary: d.secondary, accent: d.accent }, 110)}
          <div style="font-size:24px;font-weight:900">${esc(d.city)} ${esc(d.name)}</div>
          <div class="row">${this.jerseySvg(d.primary, '12', d.secondary)}${this.jerseySvg(d.awayJersey, '12', d.primary)}</div>
          <div class="muted" style="font-size:13px">Votre club remplace l’équipe la plus faible de la ligue.</div>
        </div></div>`;
    this.el.querySelectorAll('input[data-field]').forEach((inp) => inp.addEventListener('change', () => {
      const f = (inp as HTMLInputElement).dataset.field as 'city' | 'name' | 'abbr' | 'stadium' | 'glyph';
      this.d[f] = (inp as HTMLInputElement).value.trim().slice(0, f === 'abbr' ? 3 : 24);
      if (f === 'abbr') this.d.abbr = this.d.abbr.toUpperCase();
      this.render();
    }));
  }

  private action(a: string): void {
    audio.ui();
    const [k, v] = a.split(':');
    const d = this.d;
    if (k === 'back') return this.app.go(new MainMenu(this.app));
    if (k === 'primary' || k === 'secondary' || k === 'accent' || k === 'awayJersey') d[k] = v;
    if (k === 'shape') d.shape = v as LogoShape;
    if (k === 'stripes') d.stripes = !d.stripes;
    if (k === 'create') {
      if (!d.city || !d.name || d.abbr.length < 2) return void showMessage('Renseignez la ville, le nom et une abréviation (2-3 lettres).');
      const seed = Date.now() >>> 0;
      const teams = createDefaultTeams(seed);
      const weakest = [...teams].sort((x, y) => teamOverall(x) - teamOverall(y))[0];
      const tpl: TeamTemplate = { id: 'custom', city: d.city, name: d.name, abbr: d.abbr, conference: weakest.conference, primary: d.primary, secondary: d.secondary, accent: d.accent, logoShape: d.shape, glyph: d.glyph || d.name[0], stadium: d.stadium || `Stade de ${d.city}`, capacity: 40000, tier: 0.96 };
      const custom = teamFromTemplate(tpl, seed);
      custom.custom = true;
      custom.logo.stripes = d.stripes;
      custom.uniform.awayJersey = d.awayJersey;
      if (TEAM_TEMPLATES.some((x) => x.abbr === d.abbr)) custom.abbr = `${d.abbr.slice(0, 2)}X`;
      teams[teams.indexOf(weakest)] = custom;
      const l = createLeague({ mode: 'franchise', userTeamId: 'custom', teams, seed, quarterMinutes: this.app.settings.quarterMinutes });
      l.news.unshift(`Fondation du club ${d.city} ${d.name} !`);
      return startLeague(this.app, l);
    }
    this.render();
  }
}

/** Sauvegardes et reprise de partie. */
export class SavesScreen implements Screen {
  readonly el: HTMLElement;
  constructor(private app: App) {
    this.el = el('div', 'screen');
    onAction(this.el, (a) => this.action(a));
    this.render();
  }

  private render(): void {
    const slots = this.app.saves.listSlots();
    const rows = [1, 2, 3].map((i) => {
      const m = slots.find((s) => s.slot === i);
      return `<div class="list-item"><b style="width:90px">Emplacement ${i}</b><span class="grow">${m ? `${esc(m.title)} · Saison ${m.season} · Semaine ${m.week} · ${new Date(m.updatedAt).toLocaleString('fr-FR')}` : '<span class="muted">Vide</span>'}</span>${m ? `<button class="btn primary" data-action="load:${i}">Continuer</button><button class="btn danger" data-action="del:${i}">Supprimer</button>` : ''}</div>`;
    }).join('');
    const qm = this.app.profile.quickMatches.slice(-6).reverse().map((q) => `<div class="list-item">${new Date(q.date).toLocaleDateString('fr-FR')} · ${esc(q.home.toUpperCase())} ${q.score[0]} – ${q.score[1]} ${esc(q.away.toUpperCase())}</div>`).join('');
    this.el.innerHTML = `<div class="topbar"><button class="btn ghost" data-action="back">‹ Retour</button><h1>Sauvegardes</h1></div>
      <div class="panel scroll grow">${rows}<div class="opt-label" style="margin-top:10px">Derniers matchs rapides</div>${qm || '<div class="muted">Aucun.</div>'}</div>`;
  }

  private action(a: string): void {
    audio.ui();
    const [k, v] = a.split(':');
    if (k === 'back') return this.app.go(new MainMenu(this.app));
    if (k === 'load') {
      const l = this.app.saves.loadSlot(Number(v), isLeague);
      if (!l) return void showMessage('Sauvegarde illisible ou incompatible.');
      return this.app.go(new LeagueHub(this.app, l, Number(v)));
    }
    if (k === 'del') {
      void showConfirm('Supprimer définitivement cette sauvegarde ?', 'Supprimer', 'Annuler').then((ok) => {
        if (ok) this.app.saves.deleteSlot(Number(v));
        this.render();
      });
      return;
    }
    this.render();
  }
}

/** Reprend la partie de l'emplacement donné (ou ouvre l'écran des sauvegardes si elle est illisible). */
export function resumeSlot(app: App, slot: number): void {
  const l = app.saves.loadSlot(slot, isLeague);
  if (l) app.go(new LeagueHub(app, l, slot));
  else app.go(new SavesScreen(app));
}
