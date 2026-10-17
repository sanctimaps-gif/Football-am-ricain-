import type { Volumes } from '../audio/AudioEngine';
import type { Quality } from '../render/Renderer';
import type { Difficulty } from '../sim/types';

export interface Settings {
  language: 'fr' | 'en';
  quarterMinutes: 1 | 3 | 5 | 15;
  difficulty: Difficulty['id'];
  quality: Quality;
  targetFps: 30 | 60;
  penalties: boolean;
  /** L'entraîneur adjoint appelle les actions à la place de l'utilisateur. */
  autoCoach: boolean;
  volumes: Volumes;
  /** Version des réglages (2 : qualité haute adaptative par défaut). */
  version?: number;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'fr',
  quarterMinutes: 3,
  difficulty: 'normal',
  quality: 'high',
  targetFps: 60,
  penalties: true,
  autoCoach: false,
  volumes: { master: 0.8, music: 0.5, sfx: 0.8, crowd: 0.6 },
  version: 2,
};

/** Valide et complète des réglages chargés (valeurs manquantes ou invalides → défaut). */
export function sanitizeSettings(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(typeof raw === 'object' && raw ? (raw as Partial<Settings>) : {}) };
  if (!['fr', 'en'].includes(s.language)) s.language = 'fr';
  if (![1, 3, 5, 15].includes(s.quarterMinutes)) s.quarterMinutes = 3;
  if (!['easy', 'normal', 'hard'].includes(s.difficulty)) s.difficulty = 'normal';
  if (!['low', 'medium', 'high'].includes(s.quality)) s.quality = 'high';
  // anciens réglages : « moyenne » était le défaut, la qualité haute est désormais adaptative
  if (((raw as Partial<Settings> | null)?.version ?? 1) < 2) {
    if (s.quality === 'medium') s.quality = 'high';
    s.version = 2;
  }
  if (![30, 60].includes(s.targetFps)) s.targetFps = 60;
  const v = { ...DEFAULT_SETTINGS.volumes, ...(s.volumes ?? {}) };
  for (const k of Object.keys(v) as (keyof Volumes)[]) {
    v[k] = typeof v[k] === 'number' && isFinite(v[k]) ? Math.min(1, Math.max(0, v[k])) : DEFAULT_SETTINGS.volumes[k];
  }
  s.volumes = v;
  for (const b of ['penalties', 'autoCoach'] as const) s[b] = !!s[b];
  // anciennes options de contrôle des joueurs (supprimées : l'utilisateur est entraîneur)
  const legacy = s as unknown as Record<string, unknown>;
  for (const k of ['camera', 'autoSwitch', 'aimAssist', 'userKicks', 'sensitivity', 'leftHanded', 'playClock', 'simpleControls']) delete legacy[k];
  return s;
}
