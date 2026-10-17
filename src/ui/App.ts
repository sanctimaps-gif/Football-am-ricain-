import { audio } from '../audio/AudioEngine';
import { createTeamsFor, createDefaultTeams } from '../data/generator';
import type { Team } from '../data/types';
import { setLanguage } from '../i18n';
import { GameRenderer } from '../render/Renderer';
import { SaveManager, type Profile } from '../save/SaveManager';
import type { Settings } from '../save/settings';
import { LocalStore } from '../save/storage';
import { el } from './dom';

export interface Screen {
  el: HTMLElement;
  /** Le screen dessine-t-il lui-même la scène 3D (match) ? */
  rendersScene?: boolean;
  update?(dt: number): void;
  destroy?(): void;
  onResize?(): void;
}

/** Application : boucle principale, navigation entre écrans, services partagés. */
export class App {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  renderer: GameRenderer;
  readonly saves: SaveManager;
  settings: Settings;
  profile: Profile;
  /** Équipes de la ligue par défaut (match rapide, mode spectateur). */
  readonly teams: Team[];
  private teamCache = new Map<string, Team[]>();
  private screen: Screen | null = null;
  private last = performance.now();
  private acc = 0;
  private fpsEl: HTMLElement;
  private frames = 0;
  private fpsTime = 0;
  private skipped = 0;
  showFps = new URLSearchParams(location.search).has('fps');
  /** Exposé pour les tests automatisés. */
  measuredFps = 0;

  /** Équipes d'une ligue (générées une fois par session, effectifs déterministes). */
  teamsOf(groupId: string): Team[] {
    let t = this.teamCache.get(groupId);
    if (!t) {
      t = groupId === 'fra' ? this.teams : createTeamsFor(groupId, 1);
      this.teamCache.set(groupId, t);
    }
    return t;
  }

  constructor(root: HTMLElement, canvas: HTMLCanvasElement) {
    this.root = root;
    this.canvas = canvas;
    this.saves = new SaveManager(new LocalStore());
    this.settings = this.saves.loadSettings();
    // surcharge de test : ?quality=low (non sauvegardée)
    const q = new URLSearchParams(location.search).get('quality');
    if (q === 'low' || q === 'medium' || q === 'high') this.settings.quality = q;
    this.profile = this.saves.loadProfile();
    setLanguage(this.settings.language);
    audio.volumes = { ...this.settings.volumes };
    this.teams = createDefaultTeams(1);
    this.renderer = new GameRenderer(canvas, this.settings.quality);
    this.renderer.cameraMode = 'broadcast';
    this.renderer.setupMatch(this.teams[0], this.teams[1]);
    this.fpsEl = el('div', 'fps');
    document.body.appendChild(this.fpsEl);
    const rot = el('div', 'rotate', '<div class="ph"></div><div>Tournez votre téléphone en mode paysage</div>');
    document.body.appendChild(rot);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    // déverrouillage audio + plein écran paysage au premier contact
    const unlock = () => {
      audio.unlock();
      audio.applyVolumes();
    };
    window.addEventListener('pointerdown', unlock, { once: false });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) (this.screen as { onHidden?: () => void } | null)?.onHidden?.();
    });
    requestAnimationFrame((t) => this.frame(t));
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.resize(w, h);
    this.screen?.onResize?.();
  }

  /** Recrée le moteur de rendu (changement de qualité graphique). */
  rebuildRenderer(): void {
    this.renderer.dispose();
    const fresh = this.canvas.cloneNode() as HTMLCanvasElement;
    this.canvas.replaceWith(fresh);
    (this as { canvas: HTMLCanvasElement }).canvas = fresh;
    this.renderer = new GameRenderer(fresh, this.settings.quality);
    this.renderer.cameraMode = 'broadcast';
    this.renderer.setupMatch(this.teams[0], this.teams[1]);
    this.resize();
  }

  saveSettings(): void {
    this.saves.saveSettings(this.settings);
    setLanguage(this.settings.language);
    audio.volumes = { ...this.settings.volumes };
    audio.applyVolumes();
    this.renderer.cameraMode = 'broadcast';
  }

  saveProfile(): void {
    this.saves.saveProfile(this.profile);
  }

  get current(): Screen | null {
    return this.screen;
  }

  go(screen: Screen): void {
    if (this.screen) {
      this.screen.destroy?.();
      this.screen.el.remove();
    }
    this.screen = screen;
    this.root.appendChild(screen.el);
  }

  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const elapsed = Math.max(0, (now - this.last) / 1000);
    const dtRaw = Math.min(0.1, elapsed);
    this.last = now;
    // limitation à 30 FPS si demandé
    if (this.settings.targetFps === 30) {
      this.acc += dtRaw;
      if (this.acc < 1 / 31) {
        this.skipped += elapsed;
        return;
      }
    } else this.acc = dtRaw;
    const dt = Math.min(0.1, this.acc);
    this.acc = 0;
    this.frames++;
    // cadence mesurée en temps réel (dt est plafonné pour la simulation, pas pour la mesure)
    this.fpsTime += this.settings.targetFps === 30 ? elapsed + this.skipped : elapsed;
    this.skipped = 0;
    if (this.fpsTime >= 1) {
      this.measuredFps = Math.round(this.frames / this.fpsTime);
      if (this.showFps) this.fpsEl.textContent = `${this.measuredFps} FPS · ×${this.renderer.pixelRatio.toFixed(2)}`;
      if (!document.hidden) this.renderer.adapt(this.measuredFps, this.settings.targetFps);
      this.frames = 0;
      this.fpsTime = 0;
    }
    try {
      if (this.screen?.rendersScene) this.screen.update?.(dt);
      else {
        this.screen?.update?.(dt);
        this.renderer.renderMenu(dt);
      }
    } catch (e) {
      console.error(e);
    }
  }
}
