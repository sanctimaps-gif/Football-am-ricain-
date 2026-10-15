import type { Uniform } from '../data/types';
import { esc } from './dom';

/**
 * Éditeur de maillot (style « Kit Designer ») : chaque partie de la tenue a sa couleur.
 * Composant sans état propre : l'écran hôte conserve l'objet `Uniform` et transmet les actions `kit…`.
 */
export type KitPart = 'homeJersey' | 'sleeves' | 'shoulders' | 'collar' | 'numberColor' | 'homePants' | 'socks' | 'cleats' | 'gloves' | 'helmet' | 'stripe' | 'mask' | 'awayJersey' | 'awayPants';

export const KIT_PARTS: [KitPart, string][] = [
  ['homeJersey', 'Maillot'], ['sleeves', 'Manches'], ['shoulders', 'Épaules'], ['collar', 'Col'], ['numberColor', 'Numéros'],
  ['homePants', 'Pantalon'], ['socks', 'Chaussettes'], ['cleats', 'Chaussures'], ['gloves', 'Gants'],
  ['helmet', 'Casque'], ['stripe', 'Bande du casque'], ['mask', 'Grille'], ['awayJersey', 'Maillot extérieur'], ['awayPants', 'Pantalon extérieur'],
];

export const KIT_PALETTE = [
  '#FFFFFF', '#F4F4F4', '#C0C0C0', '#7D8590', '#2E2E2E', '#111111', '#C8102E', '#8A1538', '#E85D04', '#F36C21', '#F5C400', '#D4A017',
  '#2B9348', '#006837', '#00807F', '#4CC9F0', '#4A9FD8', '#0A7EA4', '#1D428A', '#0B3D91', '#0A2240', '#5B2C83', '#F25C54', '#6F4529',
];

/** Valeur effective d'une partie (les parties facultatives reprennent la couleur du maillot ou une valeur par défaut). */
export function kitColor(u: Uniform, part: KitPart): string {
  switch (part) {
    case 'sleeves': return u.sleeves ?? u.homeJersey;
    case 'shoulders': return u.shoulders ?? u.homeJersey;
    case 'collar': return u.collar ?? u.stripe;
    case 'socks': return u.socks ?? u.homeJersey;
    case 'cleats': return u.cleats ?? '#111111';
    case 'gloves': return u.gloves ?? '#1B1B1B';
    case 'mask': return u.mask ?? '#C9CED6';
    default: return u[part];
  }
}

/** Joueur vu de face, toutes les parties colorées. */
export function kitPreviewSvg(u: Uniform, away = false, size = 150): string {
  const c = (p: KitPart) => kitColor(u, p);
  const jersey = away ? u.awayJersey : c('homeJersey');
  const sleeves = away ? u.awayJersey : c('sleeves');
  const shoulders = away ? u.awayJersey : c('shoulders');
  const pants = away ? u.awayPants : c('homePants');
  const num = away ? u.helmet : c('numberColor');
  return `<svg viewBox="0 0 100 150" width="${size * 0.67}" height="${size}" aria-hidden="true">
    <g stroke="#000" stroke-opacity=".35" stroke-width="1.2">
      <rect x="31" y="118" width="12" height="22" rx="4" fill="${c('socks')}"/><rect x="57" y="118" width="12" height="22" rx="4" fill="${c('socks')}"/>
      <rect x="27" y="136" width="18" height="8" rx="3" fill="${c('cleats')}"/><rect x="55" y="136" width="18" height="8" rx="3" fill="${c('cleats')}"/>
      <path d="M30 86 L70 86 L72 122 L54 122 L50 100 L46 122 L28 122 Z" fill="${pants}"/>
      <path d="M14 46 L28 38 L30 72 L18 74 Z" fill="${sleeves}"/><path d="M86 46 L72 38 L70 72 L82 74 Z" fill="${sleeves}"/>
      <circle cx="16" cy="80" r="6" fill="${c('gloves')}"/><circle cx="84" cy="80" r="6" fill="${c('gloves')}"/>
      <path d="M28 36 L72 36 L72 90 L28 90 Z" fill="${jersey}"/>
      <path d="M22 34 Q50 22 78 34 L80 46 L20 46 Z" fill="${shoulders}"/>
      <path d="M42 30 Q50 38 58 30 L58 34 Q50 42 42 34 Z" fill="${c('collar')}"/>
      <circle cx="50" cy="16" r="15" fill="${u.helmet}"/>
      <rect x="47" y="1" width="6" height="16" fill="${u.stripe}"/>
      <path d="M38 20 Q50 30 62 20 M40 25 L60 25" fill="none" stroke="${c('mask')}" stroke-width="2.6" stroke-opacity="1"/>
    </g>
    <text x="50" y="76" text-anchor="middle" font-family="Arial Black, Arial" font-weight="900" font-size="24" fill="${num}" stroke="#000" stroke-opacity=".25" stroke-width=".8">12</text>
  </svg>`;
}

/** Interface de l'éditeur : liste des parties, palette, aperçus domicile/extérieur. */
export function kitEditorHtml(u: Uniform, selected: KitPart): string {
  const parts = KIT_PARTS.map(([k, label]) => `<button class="chip ${k === selected ? 'on' : ''}" data-action="kitpart:${k}" style="min-height:34px"><i style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${kitColor(u, k)};border:1px solid #666;margin-right:4px;vertical-align:-2px"></i>${esc(label)}</button>`).join('');
  const cur = kitColor(u, selected);
  const palette = KIT_PALETTE.map((col) => `<button data-action="kitcolor:${col}" aria-label="${col}" style="width:30px;height:30px;border-radius:8px;background:${col};border:${col.toUpperCase() === cur.toUpperCase() ? '3px solid #ffcc1a' : '1px solid #555'}"></button>`).join('');
  return `<div class="row" style="align-items:flex-start;gap:12px">
    <div class="col grow" style="gap:6px"><div class="row" style="flex-wrap:wrap;gap:5px">${parts}</div>
      <div class="opt-label">Couleur : ${esc(KIT_PARTS.find((x) => x[0] === selected)![1])}</div><div class="row" style="flex-wrap:wrap;gap:4px">${palette}</div></div>
    <div class="col" style="align-items:center;gap:2px;flex:0 0 auto"><div class="row" style="gap:4px">${kitPreviewSvg(u, false, 130)}${kitPreviewSvg(u, true, 130)}</div><div class="muted" style="font-size:12px">Domicile · Extérieur</div></div></div>`;
}

/** Applique une action de l'éditeur. Renvoie la partie sélectionnée (éventuellement modifiée). */
export function applyKitAction(u: Uniform, selected: KitPart, action: string): KitPart {
  const [k, v] = action.split(':');
  if (k === 'kitpart') return v as KitPart;
  if (k === 'kitcolor') (u as unknown as Record<string, string>)[selected] = v;
  return selected;
}
