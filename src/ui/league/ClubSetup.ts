import { audio } from '../../audio/AudioEngine';
import { overall } from '../../data/ratings';
import { fullName, type Player } from '../../data/types';
import { displayName, leagueDef, LEAGUES } from '../../data/world';
import { createClubCareer, KEEP_PLAYERS, originalSquad } from '../../league/pyramid';
import { DIVISIONS } from '../../league/types';
import type { TeamTemplate } from '../../data/teams';
import type { LogoShape, Uniform } from '../../data/types';
import { applyKitAction, KIT_PALETTE, kitEditorHtml, type KitPart } from '../KitDesigner';
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
  private step: 'mode' | 'club' | 'keep' | 'identity' | 'kit' = 'mode';
  private id = { city: 'Springfield', name: 'Storm', abbr: 'SPR', primary: '#0B3D91', secondary: '#F5C400', shape: 'shield' as LogoShape, glyph: 'S' };
  private uniform: Uniform = this.defaultUniform();
  private kitPart: KitPart = 'homeJersey';
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

  private defaultUniform(): Uniform {
    const d = this.id ?? { primary: '#0B3D91', secondary: '#F5C400' };
    return { helmet: d.primary, homeJersey: d.primary, awayJersey: '#F4F4F4', homePants: d.secondary, awayPants: d.primary, numberColor: d.secondary, stripe: d.secondary };
  }

  private render(): void {
    const def = leagueDef(this.league);
    const leagueChips = LEAGUES.map((d) => `<button class="chip ${d.id === this.league ? 'on' : ''}" data-action="league:${d.id}">${d.flag} ${esc(d.short)}</button>`).join('');
    if (this.step === 'mode') {
      this.el.innerHTML = `<div class="topbar"><button class="btn ghost" data-action="back">‹ Retour</button><h1>Carrière de club</h1></div>
        <div class="row grow" style="gap:12px;align-items:stretch;min-height:0">
          <button class="tile grow" data-action="mode:existing"><span class="ico">🏟️</span>Reprendre un club existant<small>Un club connu repart de la ${DIVISIONS[3].name} avec seulement ${KEEP_PLAYERS} joueurs de son effectif. À vous de le ramener au sommet.</small></button>
          <button class="tile grow" data-action="mode:create"><span class="ico">✏️</span>Créer mon club<small>Choisissez le pays d'origine, le nom, le logo et chaque partie du maillot. Premiers matchs contre les clubs locaux.</small></button>
        </div>
        <div class="muted" style="font-size:13px;margin-top:6px">Dans chaque division, les 4 premiers jouent les playoffs : seul le vainqueur monte. Entre les saisons, un tournoi oppose votre club à des clubs d'autres régions du monde.</div>`;
      return;
    }
    if (this.step === 'identity') {
      const d = this.id;
      const pal = (k: 'primary' | 'secondary') => KIT_PALETTE.map((c) => `<button data-action="${k}:${c}" aria-label="${c}" style="width:28px;height:28px;border-radius:7px;background:${c};border:${d[k] === c ? '3px solid #ffcc1a' : '1px solid #555'}"></button>`).join('');
      this.el.innerHTML = `<div class="topbar"><button class="btn ghost" data-action="toMode">‹ Retour</button><h1>Créer mon club</h1><button class="btn primary" data-action="toKit">Maillot ▶</button></div>
        <div class="row grow" style="align-items:stretch;gap:12px;min-height:0">
          <div class="panel scroll grow col">
            <div class="opt-label">Pays d'origine (ligue)</div><div class="row" style="flex-wrap:wrap;gap:6px">${leagueChips}</div>
            <div class="row"><input type="text" data-field="city" value="${esc(d.city)}" placeholder="Ville" maxlength="16"><input type="text" data-field="name" value="${esc(d.name)}" placeholder="Nom" maxlength="14"><input type="text" data-field="abbr" value="${esc(d.abbr)}" placeholder="ABR" maxlength="3" style="width:80px"></div>
            <div class="row"><span class="opt-label">Logo</span>${(['shield', 'circle', 'diamond', 'hexagon', 'star', 'square'] as LogoShape[]).map((x) => `<button class="chip ${x === d.shape ? 'on' : ''}" data-action="shape:${x}">${x}</button>`).join('')}<input type="text" data-field="glyph" value="${esc(d.glyph)}" maxlength="2" style="width:70px"></div>
            <div class="opt-label">Couleur principale</div><div class="row" style="flex-wrap:wrap;gap:4px">${pal('primary')}</div>
            <div class="opt-label">Couleur secondaire</div><div class="row" style="flex-wrap:wrap;gap:4px">${pal('secondary')}</div>
          </div>
          <div class="panel col" style="width:30%;align-items:center;justify-content:center">${logoSvg({ shape: d.shape, glyph: d.glyph || '?', stripes: false }, { primary: d.primary, secondary: d.secondary, accent: '#FFFFFF' }, 96)}<div style="font-size:20px;font-weight:900;text-align:center">${esc(d.city)} ${esc(d.name)}</div><div class="muted">${def.flag} ${esc(def.name)}</div></div>
        </div>`;
      this.el.querySelectorAll('input[data-field]').forEach((inp) => inp.addEventListener('change', () => {
        const f = (inp as HTMLInputElement).dataset.field as 'city' | 'name' | 'abbr' | 'glyph';
        const v = (inp as HTMLInputElement).value.trim();
        this.id[f] = f === 'abbr' ? v.toUpperCase().slice(0, 3) : f === 'glyph' ? v.slice(0, 2) : v.slice(0, 16);
        this.render();
      }));
      return;
    }
    if (this.step === 'kit') {
      this.el.innerHTML = `<div class="topbar"><button class="btn ghost" data-action="toIdentity">‹ Identité</button><h1>Maillot — ${esc(this.id.city)} ${esc(this.id.name)}</h1><button class="btn primary" data-action="startCustom">Fonder le club ▶</button></div>
        <div class="row" style="flex-wrap:wrap;gap:6px"><span class="opt-label">Saison</span>${[9, 18].map((w) => `<button class="chip ${w === this.weeks ? 'on' : ''}" data-action="weeks:${w}">${w === 9 ? 'Matchs simples (9)' : 'Aller-retour (18)'}</button>`).join('')}<span class="opt-label">Quart-temps</span>${[1, 3, 5, 15].map((v) => `<button class="chip ${v === this.app.settings.quarterMinutes ? 'on' : ''}" data-action="qm:${v}">${v} min</button>`).join('')}</div>
        <div class="panel scroll grow">${kitEditorHtml(this.uniform, this.kitPart)}</div>`;
      return;
    }
    if (this.step === 'club') {
      this.el.innerHTML = `<div class="topbar"><button class="btn ghost" data-action="toMode">‹ Retour</button><h1>Reprendre un club</h1><button class="btn primary" data-action="next" ${this.club ? '' : 'disabled'}>Suivant ▶</button></div>
        <div class="row" style="flex-wrap:wrap;gap:6px">${leagueChips}</div>
        <div class="muted" style="font-size:14px;margin:4px 0">Même un grand club repart de la <b>${DIVISIONS[3].name}</b> avec seulement ${KEEP_PLAYERS} joueurs de son effectif. Top 4 en playoffs : seul le vainqueur monte.</div>
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
    if (k === 'mode') this.step = v === 'create' ? 'identity' : 'club';
    if (k === 'toMode') this.step = 'mode';
    if (k === 'toIdentity') this.step = 'identity';
    if (k === 'toKit') {
      if (!this.id.city || !this.id.name || this.id.abbr.length < 2) return void showMessage('Renseignez la ville, le nom et une abréviation (2-3 lettres).');
      this.uniform = this.defaultUniform();
      this.step = 'kit';
    }
    if (k === 'primary' || k === 'secondary') this.id[k] = v;
    if (k === 'shape') this.id.shape = v as LogoShape;
    if (k === 'kitpart' || k === 'kitcolor') this.kitPart = applyKitAction(this.uniform, this.kitPart, a);
    if (k === 'startCustom') {
      const d = this.id;
      const template: TeamTemplate = { id: 'custom-club', city: d.city, name: d.name, abbr: d.abbr, conference: 0, primary: d.primary, secondary: d.secondary, accent: '#FFFFFF', logoShape: d.shape, glyph: d.glyph || d.city[0], stadium: `Stade de ${d.city}`, capacity: 15000, tier: 0.8 };
      const l = createClubCareer({ leagueId: this.league, custom: { template, uniform: { ...this.uniform } }, keepIds: [], weeks: this.weeks, quarterMinutes: this.app.settings.quarterMinutes });
      return startLeague(this.app, l);
    }
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
