import type { Volumes } from '../audio/AudioEngine';
import type { CameraMode, Quality } from '../render/Renderer';
import type { Difficulty } from '../sim/types';

export interface Settings {
  language: 'fr' | 'en';
  quarterMinutes: 1 | 3 | 5;
  difficulty: Difficulty['id'];
  quality: Quality;
  targetFps: 30 | 60;
  camera: CameraMode;
  autoSwitch: boolean;
  aimAssist: boolean;
  userKicks: boolean;
  sensitivity: number;
  leftHanded: boolean;
  penalties: boolean;
  volumes: Volumes;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'fr',
  quarterMinutes: 3,
  difficulty: 'normal',
  quality: 'medium',
  targetFps: 60,
  camera: 'behind',
  autoSwitch: true,
  aimAssist: true,
  userKicks: true,
  sensitivity: 1,
  leftHanded: false,
  penalties: true,
  volumes: { master: 0.8, music: 0.5, sfx: 0.8, crowd: 0.6 },
};

/** Valide et complète des réglages chargés (valeurs manquantes ou invalides → défaut). */
export function sanitizeSettings(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(typeof raw === 'object' && raw ? (raw as Partial<Settings>) : {}) };
  if (!['fr', 'en'].includes(s.language)) s.language = 'fr';
  if (![1, 3, 5].includes(s.quarterMinutes)) s.quarterMinutes = 3;
  if (!['easy', 'normal', 'hard'].includes(s.difficulty)) s.difficulty = 'normal';
  if (!['low', 'medium', 'high'].includes(s.quality)) s.quality = 'medium';
  if (![30, 60].includes(s.targetFps)) s.targetFps = 60;
  if (!['behind', 'broadcast'].includes(s.camera)) s.camera = 'behind';
  s.sensitivity = typeof s.sensitivity === 'number' && isFinite(s.sensitivity) ? Math.min(1.5, Math.max(0.5, s.sensitivity)) : 1;
  const v = { ...DEFAULT_SETTINGS.volumes, ...(s.volumes ?? {}) };
  for (const k of Object.keys(v) as (keyof Volumes)[]) {
    v[k] = typeof v[k] === 'number' && isFinite(v[k]) ? Math.min(1, Math.max(0, v[k])) : DEFAULT_SETTINGS.volumes[k];
  }
  s.volumes = v;
  for (const b of ['autoSwitch', 'aimAssist', 'userKicks', 'leftHanded', 'penalties'] as const) s[b] = !!s[b];
  return s;
}
