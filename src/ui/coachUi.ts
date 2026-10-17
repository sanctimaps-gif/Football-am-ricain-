import { basicsDone, coachPlaybook, STARTER_LESSONS } from '../coach/academy';
import type { App } from './App';
import { esc } from './dom';

/** Portrait d'entraîneur (photos sans logo, dossier public/coach). */
export function portraitUrl(i: number): string {
  const base = (globalThis as { __ASSET_BASE?: string }).__ASSET_BASE ?? './';
  return `${base}coach/coach${((i % 4) + 4) % 4}.jpg`;
}

export const portraitImg = (i: number, size = 56, cls = 'portrait'): string =>
  `<img class="${cls}" src="${portraitUrl(i)}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px" onerror="this.style.visibility='hidden'">`;

/** L'entraîneur adjoint a toujours un autre visage que l'entraîneur principal. */
export const assistantPortrait = (app: App): number => (app.profile.coach.portrait + 1) % 4;

/** Tactiques de l'entraîneur pour un match : celles apprises, éventuellement restreintes (Ultimate Team). */
export function matchPlaybook(app: App, restrict?: { off: string[]; def: string[] }): { off: string[]; def: string[] } {
  const known = coachPlaybook(app.profile.unlockedPlays);
  if (!restrict) return known;
  const off = restrict.off.filter((id) => known.off.includes(id));
  const def = restrict.def.filter((id) => known.def.includes(id));
  return { off: off.length ? off : known.off, def: def.length ? def : known.def };
}

/** Avant le premier match, les 4 tutoriels de base sont obligatoires. */
export function needsBasics(app: App): boolean {
  return !basicsDone(app.profile.unlockedPlays);
}

export const basicsProgress = (app: App): string => `${STARTER_LESSONS.filter((id) => app.profile.unlockedPlays.includes(id)).length}/${STARTER_LESSONS.length}`;

/** Bulle « entraîneur adjoint » (portrait + texte). */
export const assistantBubble = (app: App, text: string, extra = ''): string =>
  `<div class="assistant">${portraitImg(assistantPortrait(app), 64)}<div class="said"><div class="who">Entraîneur adjoint</div><div>${esc(text)}</div>${extra}</div></div>`;

/** Variante compacte sur une ligne (panneau d'appel). */
export const assistantLine = (app: App, text: string, extra = ''): string =>
  `<div class="assistant compact">${portraitImg(assistantPortrait(app), 38)}<div class="said">${esc(text)}</div>${extra}</div>`;
