import { en } from './en';
import { fr } from './fr';

export type Dict = Record<string, string>;
const DICTS: Record<string, Dict> = { fr, en };
let current: Dict = fr;
let currentLang = 'fr';

export function setLanguage(lang: 'fr' | 'en'): void {
  currentLang = lang;
  current = DICTS[lang] ?? fr;
}

export const language = (): string => currentLang;

/** Traduction avec paramètres {nom}. Repli sur le français puis sur la clé. */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = current[key] ?? fr[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export const ordinalDown = (d: number): string => t(`down.${Math.min(4, Math.max(1, d))}`);

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function quarterLabel(q: number): string {
  return q <= 4 ? t('quarter.n', { n: q }) : t('quarter.ot', { n: q - 4 > 1 ? q - 4 : '' });
}

/** Position du ballon façon « ADV 35 » / « PROPRE 20 ». */
export function fieldPosLabel(ballOn: number, ownAbbr: string, oppAbbr: string): string {
  if (ballOn === 50) return '50';
  return ballOn < 50 ? `${ownAbbr} ${ballOn}` : `${oppAbbr} ${100 - ballOn}`;
}
