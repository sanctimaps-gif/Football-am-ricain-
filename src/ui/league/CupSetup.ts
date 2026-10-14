import { audio } from '../../audio/AudioEngine';
import type { TeamTemplate } from '../../data/teams';
import { displayName, leagueDef, LEAGUES } from '../../data/world';
import { createCup, cupDef, CUPS } from '../../league/cups';
import type { App, Screen } from '../App';
import { el, esc, onAction } from '../dom';
import { logoSvg } from '../logo';
import { MainMenu } from '../screens/MainMenu';
import { startLeague } from './NewGameScreens';

/** Coupes et tournois : choix de la compétition puis de l'équipe. */
export class CupSetup implements Screen {
  readonly el: HTMLElement;
  private cup: string | null = null;
  private league = 'usa';
  private team: string | null = null;

  constructor(private app: App) {
    this.el = el('div', 'screen');
    onAction(this.el, (a) => this.action(a));
    this.render();
  }

  private pool(): TeamTemplate[] {
    const def = cupDef(this.cup!);
    return def.national ? leagueDef(this.league).teams : def.pool();
  }

  private render(): void {
    if (!this.cup) {
      this.el.innerHTML = `<div class="topbar"><button class="btn ghost" data-action="back">‹ Retour</button><h1>Coupes & tournois</h1></div>
        <div class="scroll grow"><div class="card-grid">${CUPS.map((c) => `<button class="tile" data-action="cup:${c.id}"><span class="ico">${c.icon}</span>${esc(c.name)}<small>${esc(c.desc)}</small></button>`).join('')}</div></div>`;
      return;
    }
    const def = cupDef(this.cup);
    const pool = this.pool();
    const leagues = def.national ? `<div class="row" style="flex-wrap:wrap;gap:6px">${LEAGUES.map((d) => `<button class="chip ${d.id === this.league ? 'on' : ''}" data-action="league:${d.id}">${d.flag} ${esc(d.short)}</button>`).join('')}</div>` : '';
    this.el.innerHTML = `<div class="topbar"><button class="btn ghost" data-action="list">‹ Coupes</button><h1>${def.icon} ${esc(def.national ? `Coupe de la ${leagueDef(this.league).name}` : def.name)}</h1><button class="btn primary" data-action="start" ${this.team ? '' : 'disabled'}>Commencer ▶</button></div>
      ${leagues}
      <div class="row" style="flex-wrap:wrap;gap:6px"><span class="muted" style="font-size:14px">${esc(def.desc)} Choisissez votre équipe.</span><span class="opt-label">Quart-temps</span>${[1, 3, 5, 15].map((v) => `<button class="chip ${v === this.app.settings.quarterMinutes ? 'on' : ''}" data-action="qm:${v}">${v} min</button>`).join('')}</div>
      <div class="scroll grow" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;align-content:start">${pool.map((x) => `<button class="team-card" style="--c1:${x.primary};--c2:${x.id === this.team ? '#ffcc1a' : x.secondary};min-height:96px;${x.id === this.team ? 'outline:3px solid #ffcc1a' : ''}" data-action="team:${x.id}">${logoSvg({ shape: x.logoShape, glyph: x.glyph, stripes: false }, { primary: x.primary, secondary: x.secondary, accent: x.accent }, 40)}<div class="name" style="font-size:16px">${esc(displayName(x))}</div></button>`).join('')}</div>`;
  }

  private action(a: string): void {
    audio.ui();
    const [k, v] = a.split(':');
    if (k === 'back') return this.app.go(new MainMenu(this.app));
    if (k === 'list') {
      this.cup = null;
      this.team = null;
    }
    if (k === 'cup') {
      this.cup = v;
      this.team = null;
    }
    if (k === 'league') {
      this.league = v;
      this.team = null;
    }
    if (k === 'team') this.team = v;
    if (k === 'qm') {
      this.app.settings.quarterMinutes = Number(v) as 1 | 3 | 5 | 15;
      this.app.saveSettings();
    }
    if (k === 'start' && this.cup && this.team) {
      const l = createCup(this.cup, this.team, { leagueId: this.league, quarterMinutes: this.app.settings.quarterMinutes });
      return startLeague(this.app, l);
    }
    this.render();
  }
}
