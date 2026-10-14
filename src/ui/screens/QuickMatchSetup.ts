import { audio } from '../../audio/AudioEngine';
import { teamOverall } from '../../data/generator';
import { t } from '../../i18n';
import type { Side } from '../../rules/types';
import type { App, Screen } from '../App';
import { el, esc, onAction } from '../dom';
import { logoSvg } from '../logo';
import { MainMenu } from './MainMenu';
import { MatchScreen } from './MatchScreen';

/** Sélection des équipes et options du match rapide. */
export class QuickMatchSetup implements Screen {
  readonly el: HTMLElement;
  private home = 0;
  private away = 1;
  private control: Side | null = 0;

  constructor(private app: App) {
    this.el = el('div', 'screen');
    this.render();
  }

  private card(idx: number, side: 'home' | 'away'): string {
    const tm = this.app.teams[idx];
    return `<div class="team-card" style="--c1:${tm.colors.primary};--c2:${tm.colors.secondary}">
      <button class="nav l" data-action="${side}:-1">‹</button><button class="nav r" data-action="${side}:1">›</button>
      <div class="opt-label">${side === 'home' ? t('common.home') : t('common.away')}</div>
      ${logoSvg(tm.logo, tm.colors, 84)}
      <div class="name">${esc(tm.name)}</div><div class="city">${esc(tm.city)} · ${esc(tm.stadium.name)}</div>
      <div class="ovr">${t('common.ovr')} ${teamOverall(tm)}</div></div>`;
  }

  private render(): void {
    const s = this.app.settings;
    const chips = <T extends string | number>(name: string, vals: T[], cur: T, label: (v: T) => string) =>
      vals.map((v) => `<button class="chip ${v === cur ? 'on' : ''}" data-action="${name}:${v}">${label(v)}</button>`).join('');
    this.el.innerHTML = `
      <div class="topbar"><button class="btn ghost" data-action="back">‹ ${t('common.back')}</button><h1>${t('setup.title')}</h1><button class="btn primary" data-action="start">${t('common.start')} ▶</button></div>
      <div class="team-pick">
        ${this.card(this.home, 'home')}
        <div class="vs-col">
          <div class="opt-label">${t('setup.control')}</div>
          <div class="opt-row">${chips('ctl', ['0', '1'], String(this.control), (v) => (v === '0' ? this.app.teams[this.home].abbr : this.app.teams[this.away].abbr))}</div>
          <div class="opt-label">${t('setup.difficulty')}</div>
          <div class="opt-row">${chips('diff', ['easy', 'normal', 'hard'], s.difficulty, (v) => t(`diff.${v}`))}</div>
          <div class="opt-label">${t('setup.quarter')}</div>
          <div class="opt-row">${chips('qm', [1, 3, 5], s.quarterMinutes, (v) => t('setup.minutes', { n: v }))}</div>
        </div>
        ${this.card(this.away, 'away')}
      </div>`;
    onAction(this.el, (act) => {
      audio.ui();
      const [k, v] = act.split(':');
      const n = this.app.teams.length;
      if (k === 'back') return this.app.go(new MainMenu(this.app));
      if (k === 'home') {
        do this.home = (this.home + Number(v) + n) % n;
        while (this.home === this.away);
      }
      if (k === 'away') {
        do this.away = (this.away + Number(v) + n) % n;
        while (this.away === this.home);
      }
      if (k === 'ctl') this.control = Number(v) as Side;
      if (k === 'diff') s.difficulty = v as typeof s.difficulty;
      if (k === 'qm') s.quarterMinutes = Number(v) as 1 | 3 | 5;
      if (k === 'diff' || k === 'qm') this.app.saveSettings();
      if (k === 'start') {
        audio.ui('confirm');
        const app = this.app;
        app.go(new MatchScreen(app, {
          home: app.teams[this.home], away: app.teams[this.away], userSide: this.control, context: 'quick',
          onExit: () => app.go(new MainMenu(app)),
        }));
        return;
      }
      this.render();
    });
  }
}
