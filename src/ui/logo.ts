import type { Logo, TeamColors } from '../data/types';
import { esc } from './dom';

/** Logo vectoriel original construit à partir de formes et d'un glyphe. */
export function logoSvg(logo: Logo, colors: TeamColors, size = 56): string {
  const { primary, secondary, accent } = colors;
  let shape = '';
  switch (logo.shape) {
    case 'circle':
      shape = `<circle cx="50" cy="50" r="44" fill="${primary}" stroke="${secondary}" stroke-width="7"/>`;
      break;
    case 'diamond':
      shape = `<polygon points="50,4 96,50 50,96 4,50" fill="${primary}" stroke="${secondary}" stroke-width="7"/>`;
      break;
    case 'hexagon':
      shape = `<polygon points="50,4 92,27 92,73 50,96 8,73 8,27" fill="${primary}" stroke="${secondary}" stroke-width="7"/>`;
      break;
    case 'star':
      shape = `<polygon points="50,4 62,36 96,38 69,59 79,93 50,74 21,93 31,59 4,38 38,36" fill="${primary}" stroke="${secondary}" stroke-width="6"/>`;
      break;
    case 'square':
      shape = `<rect x="8" y="8" width="84" height="84" rx="14" fill="${primary}" stroke="${secondary}" stroke-width="7"/>`;
      break;
    default:
      shape = `<path d="M50 4 L92 16 L88 58 Q80 84 50 96 Q20 84 12 58 L8 16 Z" fill="${primary}" stroke="${secondary}" stroke-width="7"/>`;
  }
  const stripes = logo.stripes ? `<rect x="20" y="70" width="60" height="6" fill="${accent}" opacity=".8"/>` : '';
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">${shape}${stripes}<text x="50" y="${logo.glyph.length > 1 ? 63 : 67}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="${logo.glyph.length > 1 ? 34 : 46}" fill="${secondary}" stroke="${accent}" stroke-width="1.5">${esc(logo.glyph)}</text></svg>`;
}
