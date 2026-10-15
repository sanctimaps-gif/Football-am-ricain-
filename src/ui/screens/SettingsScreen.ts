import { audio } from '../../audio/AudioEngine';
import { t } from '../../i18n';
import type { Settings } from '../../save/settings';
import type { App, Screen } from '../App';
import { el, onAction } from '../dom';

type BoolKey = 'autoSwitch' | 'aimAssist' | 'userKicks' | 'leftHanded' | 'penalties' | 'playClock' | 'simpleControls';

export class SettingsScreen implements Screen {
  readonly el: HTMLElement;
  constructor(private app: App, private back: () => void) {
    this.el = el('div', 'screen');
    this.render();
  }

  private render(): void {
    const s = this.app.settings;
    const choice = <T extends string | number>(key: string, label: string, vals: T[], cur: T, fmt: (v: T) => string) =>
      `<div class="setting"><label>${label}</label><div class="opt-row">${vals.map((v) => `<button class="chip ${v === cur ? 'on' : ''}" data-action="${key}:${v}">${fmt(v)}</button>`).join('')}</div></div>`;
    const toggle = (key: BoolKey, label: string) => `<div class="setting"><label>${label}</label><button class="toggle ${s[key] ? 'on' : ''}" data-action="toggle:${key}" aria-label="${label}"></button></div>`;
    const slider = (key: string, label: string, val: number, min = 0, max = 1, step = 0.05) => `<div class="setting"><label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-slider="${key}"></div>`;
    this.el.innerHTML = `
      <div class="topbar"><button class="btn ghost" data-action="back">‹ ${t('common.back')}</button><h1>${t('settings.title')}</h1></div>
      <div class="row grow" style="align-items:stretch;gap:12px;min-height:0">
        <div class="panel scroll grow">
          ${choice('lang', t('settings.language'), ['fr', 'en'], s.language, (v) => (v === 'fr' ? 'Français' : 'English'))}
          ${choice('qm', t('setup.quarter'), [1, 3, 5, 15], s.quarterMinutes, (v) => t('setup.minutes', { n: v }))}
          ${choice('diff', t('setup.difficulty'), ['easy', 'normal', 'hard'], s.difficulty, (v) => t(`diff.${v}`))}
          ${choice('cam', t('settings.camera'), ['behind', 'broadcast'], s.camera, (v) => t(`settings.camera.${v}`))}
          ${toggle('autoSwitch', t('settings.autoSwitch'))}
          ${toggle('aimAssist', t('settings.aimAssist'))}
          ${toggle('userKicks', t('settings.userKicks'))}
          ${toggle('leftHanded', t('settings.leftHanded'))}
          ${toggle('penalties', t('settings.penalties'))}
          ${toggle('playClock', t('settings.playClock'))}
          ${toggle('simpleControls', t('settings.simpleControls'))}
          ${slider('sensitivity', t('settings.sensitivity'), s.sensitivity, 0.5, 1.5, 0.05)}
        </div>
        <div class="panel scroll grow">
          ${choice('q', t('settings.quality'), ['low', 'medium', 'high'], s.quality, (v) => t(`q.${v}`))}
          ${choice('fps', t('settings.fps'), [30, 60], s.targetFps, (v) => String(v))}
          ${slider('master', t('settings.master'), s.volumes.master)}
          ${slider('music', t('settings.music'), s.volumes.music)}
          ${slider('sfx', t('settings.sfx'), s.volumes.sfx)}
          ${slider('crowd', t('settings.crowd'), s.volumes.crowd)}
        </div>
      </div>`;
    onAction(this.el, (act) => {
      audio.ui();
      const [k, v] = act.split(':');
      if (k === 'back') return this.back();
      if (k === 'lang') s.language = v as Settings['language'];
      if (k === 'qm') s.quarterMinutes = Number(v) as Settings['quarterMinutes'];
      if (k === 'diff') s.difficulty = v as Settings['difficulty'];
      if (k === 'cam') s.camera = v as Settings['camera'];
      if (k === 'fps') s.targetFps = Number(v) as Settings['targetFps'];
      if (k === 'toggle') s[v as BoolKey] = !s[v as BoolKey];
      if (k === 'q' && s.quality !== v) {
        s.quality = v as Settings['quality'];
        this.app.saveSettings();
        this.app.rebuildRenderer();
      }
      this.app.saveSettings();
      this.render();
    });
    this.el.querySelectorAll('input[type=range]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const key = (inp as HTMLInputElement).dataset.slider!;
        const val = Number((inp as HTMLInputElement).value);
        if (key === 'sensitivity') s.sensitivity = val;
        else s.volumes[key as keyof Settings['volumes']] = val;
        this.app.saveSettings();
      });
    });
  }
}
