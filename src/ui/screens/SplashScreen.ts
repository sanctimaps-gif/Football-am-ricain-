import { audio } from '../../audio/AudioEngine';
import { GAME_NAME, GAME_VERSION } from '../../core/config';
import { t } from '../../i18n';
import type { App, Screen } from '../App';
import { el, esc } from '../dom';
import { MainMenu } from './MainMenu';

export class SplashScreen implements Screen {
  readonly el: HTMLElement;
  constructor(app: App) {
    const [a, ...b] = GAME_NAME.split(' ');
    this.el = el('div', 'screen splash', `<div class="logo-big">${esc(b.join(' ') || a)}<span>${esc(b.length ? a : '')}</span></div><div class="muted" style="margin-top:6px">Football américain · v${GAME_VERSION}</div><div class="tap">${t('menu.tapToStart')}</div>`);
    this.el.addEventListener('pointerup', async () => {
      audio.unlock();
      audio.startMusic();
      // plein écran + verrouillage paysage quand c'est possible (mobile)
      try {
        if (matchMedia('(pointer: coarse)').matches && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
          await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape');
        }
      } catch {
        /* non supporté : l'écran « tournez votre téléphone » prend le relais */
      }
      app.go(new MainMenu(app));
    }, { once: true });
  }
}
