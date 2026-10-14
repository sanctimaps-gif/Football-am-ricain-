import type { Team } from './types';

export interface TeamTemplate {
  id: string;
  city: string;
  name: string;
  abbr: string;
  conference: 0 | 1;
  primary: string;
  secondary: string;
  accent: string;
  logoShape: Team['logo']['shape'];
  glyph: string;
  stadium: string;
  capacity: number;
  /** Niveau général de l'équipe (0.85 faible → 1.1 forte). */
  tier: number;
}

/** Franchises fictives originales de la ligue (aucune licence réelle). */
export const TEAM_TEMPLATES: TeamTemplate[] = [
  { id: 'lyn', city: 'Lyon', name: 'Lynx', abbr: 'LYN', conference: 0, primary: '#1B2A6B', secondary: '#F2B705', accent: '#FFFFFF', logoShape: 'shield', glyph: 'L', stadium: 'Arène de Gerland', capacity: 52000, tier: 1.05 },
  { id: 'mar', city: 'Marseille', name: 'Mistral', abbr: 'MAR', conference: 0, primary: '#0A7EA4', secondary: '#FFFFFF', accent: '#0B1D2E', logoShape: 'circle', glyph: 'M', stadium: 'Stade du Vieux-Port', capacity: 61000, tier: 1.0 },
  { id: 'bdx', city: 'Bordeaux', name: 'Barons', abbr: 'BDX', conference: 0, primary: '#6B0F2B', secondary: '#D9B26F', accent: '#FFFFFF', logoShape: 'shield', glyph: 'B', stadium: 'Parc des Chartrons', capacity: 44000, tier: 0.95 },
  { id: 'lil', city: 'Lille', name: 'Loups', abbr: 'LIL', conference: 0, primary: '#2E2E2E', secondary: '#E63946', accent: '#F1FAEE', logoShape: 'hexagon', glyph: 'W', stadium: 'Grand Stade du Nord', capacity: 50000, tier: 1.0 },
  { id: 'tls', city: 'Toulouse', name: 'Titans', abbr: 'TLS', conference: 0, primary: '#E85D04', secondary: '#1D1D1D', accent: '#FFFFFF', logoShape: 'diamond', glyph: 'T', stadium: 'Stadium Rose', capacity: 48000, tier: 1.08 },
  { id: 'nts', city: 'Nantes', name: 'Navigateurs', abbr: 'NTS', conference: 0, primary: '#F5C400', secondary: '#006837', accent: '#111111', logoShape: 'circle', glyph: 'N', stadium: 'Stade de l\'Erdre', capacity: 39000, tier: 0.9 },
  { id: 'nce', city: 'Nice', name: 'Nautiles', abbr: 'NCE', conference: 0, primary: '#00A6A6', secondary: '#F25C54', accent: '#FFFFFF', logoShape: 'star', glyph: 'N', stadium: 'Baie des Anges Arena', capacity: 36000, tier: 0.88 },
  { id: 'str', city: 'Strasbourg', name: 'Cigognes', abbr: 'STR', conference: 0, primary: '#8A1538', secondary: '#C0C0C0', accent: '#FFFFFF', logoShape: 'square', glyph: 'S', stadium: 'Stade du Rhin', capacity: 42000, tier: 0.97 },
  { id: 'mtl', city: 'Montréal', name: 'Blizzard', abbr: 'MTL', conference: 1, primary: '#0B3D91', secondary: '#9BD3F2', accent: '#FFFFFF', logoShape: 'hexagon', glyph: 'B', stadium: 'Dôme Mont-Royal', capacity: 58000, tier: 1.06 },
  { id: 'bru', city: 'Bruxelles', name: 'Brigands', abbr: 'BRU', conference: 1, primary: '#5A189A', secondary: '#FFD60A', accent: '#FFFFFF', logoShape: 'shield', glyph: 'B', stadium: 'Stade de l\'Atomium', capacity: 47000, tier: 0.98 },
  { id: 'gva', city: 'Genève', name: 'Glaciers', abbr: 'GVA', conference: 1, primary: '#4CC9F0', secondary: '#14213D', accent: '#FFFFFF', logoShape: 'diamond', glyph: 'G', stadium: 'Arène du Léman', capacity: 35000, tier: 0.9 },
  { id: 'qbc', city: 'Québec', name: 'Corsaires', abbr: 'QBC', conference: 1, primary: '#003049', secondary: '#D62828', accent: '#FCBF49', logoShape: 'circle', glyph: 'C', stadium: 'Stade des Plaines', capacity: 45000, tier: 1.02 },
  { id: 'dkr', city: 'Dakar', name: 'Dunes', abbr: 'DKR', conference: 1, primary: '#F4A261', secondary: '#264653', accent: '#FFFFFF', logoShape: 'star', glyph: 'D', stadium: 'Stade de la Corniche', capacity: 50000, tier: 0.94 },
  { id: 'abj', city: 'Abidjan', name: 'Comètes', abbr: 'ABJ', conference: 1, primary: '#FF7F11', secondary: '#2B9348', accent: '#FFFFFF', logoShape: 'hexagon', glyph: 'C', stadium: 'Lagune Arena', capacity: 55000, tier: 1.0 },
  { id: 'cas', city: 'Casablanca', name: 'Cobras', abbr: 'CAS', conference: 1, primary: '#2A9D8F', secondary: '#E9C46A', accent: '#1D1D1D', logoShape: 'diamond', glyph: 'C', stadium: 'Stade Atlantique', capacity: 60000, tier: 1.04 },
  { id: 'ren', city: 'Rennes', name: 'Rapaces', abbr: 'REN', conference: 1, primary: '#C1121F', secondary: '#FDF0D5', accent: '#003049', logoShape: 'shield', glyph: 'R', stadium: 'Stade de la Vilaine', capacity: 40000, tier: 0.92 },
];

export const CONFERENCE_NAMES = ['Conférence Atlantique', 'Conférence Horizon'];
