export type Position =
  | 'QB' | 'RB' | 'FB' | 'WR' | 'TE' | 'C' | 'OG' | 'OT'
  | 'DE' | 'DT' | 'LB' | 'CB' | 'FS' | 'SS' | 'K' | 'P';

export const ALL_POSITIONS: Position[] = ['QB', 'RB', 'FB', 'WR', 'TE', 'C', 'OG', 'OT', 'DE', 'DT', 'LB', 'CB', 'FS', 'SS', 'K', 'P'];
export const OFFENSE_POSITIONS: Position[] = ['QB', 'RB', 'FB', 'WR', 'TE', 'C', 'OG', 'OT'];
export const DEFENSE_POSITIONS: Position[] = ['DE', 'DT', 'LB', 'CB', 'FS', 'SS'];

/** Attributs 0-99. Tous sont utilisés par la simulation (voir sim/). */
export interface Attributes {
  speed: number;
  acceleration: number;
  agility: number;
  strength: number;
  tackling: number;
  throwAccuracy: number;
  throwPower: number;
  catching: number;
  blocking: number;
  stamina: number;
  awareness: number;
  kickPower: number;
  kickAccuracy: number;
}

export interface Appearance {
  skinTone: number; // 0..5
  heightCm: number;
  weightKg: number;
  visor: boolean;
}

export interface Contract {
  salary: number; // milliers $ / saison
  years: number; // saisons restantes
}

export interface SeasonStatLine {
  season: number;
  teamId: string;
  games: number;
  passAtt: number; passComp: number; passYds: number; passTD: number; passInt: number;
  rushAtt: number; rushYds: number; rushTD: number;
  rec: number; recYds: number; recTD: number;
  tackles: number; sacks: number; ints: number;
  fgm: number; fga: number;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  number: number;
  age: number;
  attrs: Attributes;
  potential: number; // 40..99
  contract: Contract;
  appearance: Appearance;
  injuryWeeks: number;
  xp: number; // expérience accumulée (progression)
  history: SeasonStatLine[];
  isUserCreated?: boolean;
}

export interface TeamColors {
  primary: string;
  secondary: string;
  accent: string;
}

export type LogoShape = 'shield' | 'circle' | 'diamond' | 'hexagon' | 'star' | 'square';
export interface Logo {
  shape: LogoShape;
  glyph: string; // 1-2 caractères
  stripes: boolean;
}

export interface Uniform {
  helmet: string;
  homeJersey: string;
  awayJersey: string;
  homePants: string;
  awayPants: string;
  numberColor: string;
  stripe: string;
}

export interface Stadium {
  name: string;
  capacity: number;
  standColor: string;
  roof: boolean;
}

export interface Team {
  id: string;
  city: string;
  name: string;
  abbr: string;
  conference: 0 | 1;
  colors: TeamColors;
  logo: Logo;
  uniform: Uniform;
  stadium: Stadium;
  roster: Player[];
  /** Profondeur de poste : ids ordonnés par poste. */
  depth: Partial<Record<Position, string[]>>;
  custom?: boolean;
  licensed?: false; // architecture : seules des équipes fictives sont livrées
}

export const fullName = (p: Player): string => `${p.firstName} ${p.lastName}`;
