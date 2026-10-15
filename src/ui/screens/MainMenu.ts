import { audio } from '../../audio/AudioEngine';
import { GAME_NAME } from '../../core/config';
import { t } from '../../i18n';
import type { App, Screen } from '../App';
import { el, esc, onAction } from '../dom';
import { MatchScreen } from './MatchScreen';
import { QuickMatchSetup } from './QuickMatchSetup';
import { SettingsScreen } from './SettingsScreen';
import { menuExtensions } from './menuRegistry';

export class MainMenu implements Screen {
  readonly el: HTMLElement;
  constructor(private app: App) {
    this.el = el('div', 'screen');
    const ext = menuExtensions;
    const tiles = ext.tiles.map((x) => `<button class="tile" data-action="ext:${x.id}"><span class="ico">${x.icon}</span>${esc(x.label())}<small>${esc(x.sub())}</small></button>`).join('');
    this.el.innerHTML = `
      <div class="topbar"><h1>${esc(GAME_NAME)}</h1>
        ${ext.footer.map((x) => `<button class="btn" data-action="ext:${x.id}">${esc(x.label())}</button>`).join('')}
        <button class="btn" data-action="spectator">📺 ${t('menu.spectator')}</button>
        <button class="btn" data-action="settings">⚙ ${t('menu.settings')}</button></div>
      <div class="menu-grid wide">
        <button class="tile hero" data-action="quick"><span class="ico">🏈</span>${t('menu.play')}<small>Choisissez deux équipes et jouez un match complet en 3D.</small></button>
        ${tiles}
      </div>`;
    onAction(this.el, (act) => {
      audio.ui('confirm');
      if (act === 'quick') app.go(new QuickMatchSetup(app));
      else if (act === 'settings') app.go(new SettingsScreen(app, () => app.go(new MainMenu(app))));
      else if (act === 'spectator') this.spectator();
      else if (act.startsWith('ext:')) [...ext.tiles, ...ext.footer].find((x) => x.id === act.slice(4))?.open(app);
    });
  }

  private spectator(): void {
    const app = this.app;
    const teams = app.teams;
    const i = Math.floor(Math.random() * teams.length);
    let j = Math.floor(Math.random() * teams.length);
    if (j === i) j = (i + 1) % teams.length;
    app.go(new MatchScreen(app, { home: teams[i], away: teams[j], userSide: null, context: 'spectator', onExit: () => app.go(new MainMenu(app)) }));
  }
}
