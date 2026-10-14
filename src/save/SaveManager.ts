import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from './settings';
import type { KeyValueStore } from './storage';

export const SAVE_VERSION = 1;
const PREFIX = 'gd.';

export interface SlotMeta {
  slot: number;
  kind: 'season' | 'coach' | 'franchise' | 'playerCareer';
  title: string;
  teamId: string;
  season: number;
  week: number;
  updatedAt: number;
}

interface Envelope<T> {
  version: number;
  savedAt: number;
  data: T;
}

export interface QuickMatchRecord {
  date: number;
  home: string;
  away: string;
  score: [number, number];
  userSide: 0 | 1 | null;
}

export interface Profile {
  quickMatches: QuickMatchRecord[];
  tutorialDone: string[];
}

/** Migrations : version N → N+1. Ajouter une entrée à chaque changement de schéma. */
const MIGRATIONS: Record<number, (data: unknown) => unknown> = {
  // 1: (d) => ({ ...d, nouveauChamp: valeurParDefaut }),
};

export function migrate<T>(env: Envelope<unknown>): T {
  let data = env.data;
  for (let v = env.version; v < SAVE_VERSION; v++) {
    const m = MIGRATIONS[v];
    if (m) data = m(data);
  }
  return data as T;
}

/** Gestionnaire de sauvegardes versionnées (réglages, profil, emplacements de carrière). */
export class SaveManager {
  constructor(private store: KeyValueStore) {}

  private read<T>(key: string): T | null {
    const raw = this.store.get(PREFIX + key);
    if (!raw) return null;
    try {
      const env = JSON.parse(raw) as Envelope<unknown>;
      if (typeof env !== 'object' || env === null || typeof env.version !== 'number' || !('data' in env)) return null;
      if (env.version > SAVE_VERSION) {
        console.warn(`Sauvegarde ${key} créée par une version plus récente`);
        return null;
      }
      return migrate<T>(env);
    } catch (e) {
      console.warn(`Sauvegarde ${key} corrompue`, e);
      return null;
    }
  }

  private write<T>(key: string, data: T): void {
    const env: Envelope<T> = { version: SAVE_VERSION, savedAt: Date.now(), data };
    this.store.set(PREFIX + key, JSON.stringify(env));
  }

  loadSettings(): Settings {
    return sanitizeSettings(this.read<Settings>('settings') ?? DEFAULT_SETTINGS);
  }

  saveSettings(s: Settings): void {
    this.write('settings', sanitizeSettings(s));
  }

  loadProfile(): Profile {
    const p = this.read<Profile>('profile');
    return {
      quickMatches: Array.isArray(p?.quickMatches) ? p!.quickMatches.slice(-50) : [],
      tutorialDone: Array.isArray(p?.tutorialDone) ? p!.tutorialDone : [],
    };
  }

  saveProfile(p: Profile): void {
    this.write('profile', p);
  }

  listSlots(): SlotMeta[] {
    const out: SlotMeta[] = [];
    for (let i = 1; i <= 3; i++) {
      const m = this.read<SlotMeta>(`slot${i}.meta`);
      if (m && typeof m.slot === 'number') out.push(m);
    }
    return out;
  }

  saveSlot<T>(meta: SlotMeta, data: T): void {
    this.write(`slot${meta.slot}.data`, data);
    this.write(`slot${meta.slot}.meta`, { ...meta, updatedAt: Date.now() });
  }

  loadSlot<T>(slot: number, validate: (d: unknown) => d is T): T | null {
    const d = this.read<unknown>(`slot${slot}.data`);
    if (d === null) return null;
    return validate(d) ? d : null;
  }

  deleteSlot(slot: number): void {
    this.store.remove(`${PREFIX}slot${slot}.data`);
    this.store.remove(`${PREFIX}slot${slot}.meta`);
  }

  freeSlot(): number | null {
    const used = new Set(this.listSlots().map((m) => m.slot));
    for (let i = 1; i <= 3; i++) if (!used.has(i)) return i;
    return null;
  }
}
