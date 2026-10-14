import { audio } from '../../audio/AudioEngine';
import { overall } from '../../data/ratings';
import { fullName, type Player } from '../../data/types';
import { displayName, leagueDef, LEAGUES } from '../../data/world';
import { createClubCareer, KEEP_PLAYERS, originalSquad } from '../../league/pyramid';
import { DIVISIONS } from '../../league/types';
import type { App, Screen } from '../App';
import { showMessage } from '../dialog';
import { el, esc, onAction, ovrClass } from '../dom';
import { logoSvg } from '../logo';
import { MainMenu } from '../screens/MainMenu';
import { startLeague } from './NewGameScreens';

/**
 * Carrière de club : choix du pays/ligue, du club, puis des 3 joueurs conservés.
 * Le club repart de la troisième division (10 équipes, les 4 premiers montent).
 */
export class ClubSetup implements Screen {
  readonly el: HTMLElement;
  private step: 'club' | 'keep' = 'club';
  private league = 'usa';
  private club: string | null = null;
  private keep: string[] = [];
  private squad: Player[] = [];
  private weeks = 9;

  constructor(private app: App) {
    this.el = el('div', 'screen');
    onAction(this.el, (a) => this.action(a));
    this.render();
  }

  private render(): void {
    const def = leagueDef(this.league);
    if (this.step === 'club') {
      this.el.innerHTML = `<div class="topbar"><button class="btn ghost" data-action="back">‹ Retour</button><h1>Carrière de club — choisissez votre club</h1><button class="btn primary" data-action="next" ${this.club ? '' : 'disabled'}>Suivant ▶</button></div>
        <div class="row" style="flex-wrap:wrap;gap:6px">${LEAGUES.map((d) => `<button class="chip ${d.id === this.league ? 'on' : ''}" data-action="league:${d.id}">${d.flag} ${esc(d.short)}</button>`).join('')}</div>
        <div class="muted" style="font-size:14px;margin:4px 0">Même un grand club repart de la <b>${DIVISIONS[3].name}</b> avec seulement ${KEEP_PLAYERS} joueurs de son effectif. Les 4 premiers montent en ${DIVISIONS[2].name}, puis les 3 premiers en ${DIVISIONS[1].name}.</div>
        <div class="scroll grow" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;align-content:start">${def.teams.map((x) => `<button class="team-card" style="--c1:${x.primary};--c2:${x.id === this.club ? '#ffcc1a' : x.secondary};min-height:100px;${x.id === this.club ? 'outline:3px solid #ffcc1a' : ''}" data-action="club:${x.id}">${logoSvg({ shape: x.logoShape, glyph: x.glyph, stripes: false }, { primary: x.primary, secondary: x.secondary, accent: x.accent }, 42)}<div class="name" style="font-size:16px">${esc(displayName(x))}</div></button>`).join('')}</div>`;
      return;
    }
    const tpl = def.teams.find((x) => x.id === this.club)!;
    const rows = this.squad.slice(0, 30).map((p) => {
      const on = this.keep.includes(p.id);
      return `<div class="list-item" data-action="keep:${p.id}" style="${on ? 'background:rgba(255,204,26,.2)' : ''}"><span class="ovr-badge ${ovrClass(overall(p))}">${overall(p)}</span><b style="width:34px;text-align:center">${p.position}</b><span class="grow">#${p.number} ${esc(fullName(p))}</span><span class="muted" style="font-size:13px">${p.age} ans · pot. ${p.potential}</span><span class="chip ${on ? 'on' : ''}" style="min-height:30px">${on ? 'Gardé ✓' : 'Garder'}</span></div>`;
    }).join('');
    this.el.innerHTML = `<div class="topbar"><button class="btn ghost" data-action="prev">‹ Club</button><h1>${esc(displayName(tpl))} — ${KEEP_PLAYERS} joueurs à garder</h1><button class="btn primary" data-action="start">Commencer ▶</button></div>
      <div class="row" style="flex-wrap:wrap;gap:6px"><span class="opt-label">Saison</span>${[9, 18].map((w) => `<button class="chip ${w === this.weeks ? 'on' : ''}" data-action="weeks:${w}">${w === 9 ? 'Matchs simples (9)' : 'Aller-retour (18)'}</button>`).join('')}<span class="opt-label">Quart-temps</span>${[1, 3, 5, 15].map((v) => `<button class="chip ${v === this.app.settings.quarterMinutes ? 'on' : ''}" data-action="qm:${v}">${v} min</button>`).join('')}<span class="muted">${this.keep.length}/${KEEP_PLAYERS} choisis</span></div>
      <div class="panel scroll grow">${rows}</div>`;
  }

  private action(a: string): void {
    audio.ui();
    const [k, v] = a.split(':');
    if (k === 'back') return this.app.go(new MainMenu(this.app));
    if (k === 'league') {
      this.league = v;
      this.club = null;
    }
    if (k === 'club') this.club = v;
    if (k === 'next' && this.club) {
      this.squad = originalSquad(this.club, 1);
      this.keep = this.squad.slice(0, KEEP_PLAYERS).map((p) => p.id);
      this.step = 'keep';
    }
    if (k === 'prev') this.step = 'club';
    if (k === 'keep') {
      if (this.keep.includes(v)) this.keep = this.keep.filter((x) => x !== v);
      else if (this.keep.length < KEEP_PLAYERS) this.keep.push(v);
      else void showMessage(`Vous ne pouvez garder que ${KEEP_PLAYERS} joueurs : retirez-en un d’abord.`);
    }
    if (k === 'weeks') this.weeks = Number(v);
    if (k === 'qm') {
      this.app.settings.quarterMinutes = Number(v) as 1 | 3 | 5 | 15;
      this.app.saveSettings();
    }
    if (k === 'start' && this.club) {
      const l = createClubCareer({ leagueId: this.league, clubId: this.club, keepIds: this.keep, weeks: this.weeks, quarterMinutes: this.app.settings.quarterMinutes });
      return startLeague(this.app, l);
    }
    this.render();
  }
}
