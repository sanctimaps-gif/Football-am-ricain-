import { audio } from '../../audio/AudioEngine';
import { teamOverall } from '../../data/generator';
import { displayName, LEAGUES } from '../../data/world';
import type { Team } from '../../data/types';
import { t } from '../../i18n';
import type { Side } from '../../rules/types';
import type { App, Screen } from '../App';
import { el, esc, onAction } from '../dom';
import { logoSvg } from '../logo';
import { MainMenu } from './MainMenu';
import { MatchScreen } from './MatchScreen';

/** Ligues proposées au match rapide (+ sélections nationales). */
export const TEAM_GROUPS: { id: string; label: string; flag: string }[] = [
  ...LEAGUES.map((l) => ({ id: l.id, label: l.short, flag: l.flag })),
  { id: 'nations', label: 'Nations', flag: '🏳️' },
  { id: 'nationsF', label: 'Nations F', flag: '♀️' },
];

/** Sélection des équipes et options du match rapide. */
export class QuickMatchSetup implements Screen {
  readonly el: HTMLElement;
  private sel = { home: { g: 0, i: 0 }, away: { g: 0, i: 1 } };
  private control: Side | null = 0;

  constructor(private app: App) {
    this.el = el('div', 'screen');
    onAction(this.el, (act) => this.action(act));
    this.render();
  }

  private team(side: 'home' | 'away'): Team {
    const s = this.sel[side];
    return this.app.teamsOf(TEAM_GROUPS[s.g].id)[s.i];
  }

  private card(side: 'home' | 'away'): string {
    const tm = this.team(side);
    const g = TEAM_GROUPS[this.sel[side].g];
    return `<div class="team-card" style="--c1:${tm.colors.primary};--c2:${tm.colors.secondary}">
      <button class="nav l" data-action="${side}:-1" aria-label="précédente">‹</button><button class="nav r" data-action="${side}:1" aria-label="suivante">›</button>
      <div class="opt-label">${side === 'home' ? t('common.home') : t('common.away')}</div>
      <button class="chip" data-action="${side}League" style="min-height:32px">${g.flag} ${esc(g.label)} ▾</button>
      ${logoSvg(tm.logo, tm.colors, 76)}
      <div class="name">${esc(displayName(tm))}</div><div class="city">${esc(tm.stadium.name)}</div>
      <div class="ovr">${t('common.ovr')} ${teamOverall(tm)}</div></div>`;
  }

  private render(): void {
    const s = this.app.settings;
    const chips = <T extends string | number>(name: string, vals: T[], cur: T, label: (v: T) => string) =>
      vals.map((v) => `<button class="chip ${v === cur ? 'on' : ''}" data-action="${name}:${v}">${label(v)}</button>`).join('');
    this.el.innerHTML = `
      <div class="topbar"><button class="btn ghost" data-action="back">‹ ${t('common.back')}</button><h1>${t('setup.title')}</h1><button class="btn primary" data-action="start">${t('common.start')} ▶</button></div>
      <div class="team-pick">
        ${this.card('home')}
        <div class="vs-col">
          <div class="opt-label">${t('setup.control')}</div>
          <div class="opt-row">${chips('ctl', ['0', '1'], String(this.control), (v) => esc(v === '0' ? this.team('home').abbr : this.team('away').abbr))}</div>
          <div class="opt-label">${t('setup.difficulty')}</div>
          <div class="opt-row">${chips('diff', ['easy', 'normal', 'hard'], s.difficulty, (v) => t(`diff.${v}`))}</div>
          <div class="opt-label">${t('setup.quarter')}</div>
          <div class="opt-row">${chips('qm', [1, 3, 5, 15], s.quarterMinutes, (v) => t('setup.minutes', { n: v }))}</div>
        </div>
        ${this.card('away')}
      </div>`;
  }

  private action(act: string): void {
    audio.ui();
    const s = this.app.settings;
    const [k, v] = act.split(':');
    if (k === 'back') return this.app.go(new MainMenu(this.app));
    if (k === 'home' || k === 'away') {
      const sel = this.sel[k];
      const n = this.app.teamsOf(TEAM_GROUPS[sel.g].id).length;
      const other = this.sel[k === 'home' ? 'away' : 'home'];
      do sel.i = (sel.i + Number(v) + n) % n;
      while (other.g === sel.g && other.i === sel.i);
    }
    if (k === 'homeLeague' || k === 'awayLeague') {
      const side = k === 'homeLeague' ? 'home' : 'away';
      const sel = this.sel[side];
      const other = this.sel[side === 'home' ? 'away' : 'home'];
      sel.g = (sel.g + 1) % TEAM_GROUPS.length;
      sel.i = other.g === sel.g && other.i === 0 ? 1 : 0;
    }
    if (k === 'ctl') this.control = Number(v) as Side;
    if (k === 'diff') s.difficulty = v as typeof s.difficulty;
    if (k === 'qm') s.quarterMinutes = Number(v) as 1 | 3 | 5 | 15;
    if (k === 'diff' || k === 'qm') this.app.saveSettings();
    if (k === 'start') {
      audio.ui('confirm');
      const app = this.app;
      app.go(new MatchScreen(app, {
        home: this.team('home'), away: this.team('away'), userSide: this.control, context: 'quick',
        onExit: () => app.go(new MainMenu(app)),
      }));
      return;
    }
    this.render();
  }
}
