import type { Position } from './types';

/**
 * Repère « action » : `down` = yards vers l'avant depuis la ligne de scrimmage (négatif = derrière la ligne côté attaque),
 * `lat` = écart latéral au ballon, positif vers la droite de l'attaque (vue face au terrain adverse).
 */
export interface Spot {
  down: number;
  lat: number;
}

export type FormationId =
  | 'shotgun' | 'shotgunTrips' | 'singleback' | 'iform' | 'goalLine' | 'punt' | 'fieldGoal' | 'kneel';

export interface FormationSlot extends Spot {
  slot: string;
  pos: Position;
  /** Index dans la profondeur de poste (0 = titulaire). */
  depthIndex?: number;
}

const OL = (down = -0.6): FormationSlot[] => [
  { slot: 'LT', pos: 'OT', down, lat: -2.8, depthIndex: 0 },
  { slot: 'LG', pos: 'OG', down, lat: -1.4, depthIndex: 0 },
  { slot: 'C', pos: 'C', down: -0.4, lat: 0, depthIndex: 0 },
  { slot: 'RG', pos: 'OG', down, lat: 1.4, depthIndex: 1 },
  { slot: 'RT', pos: 'OT', down, lat: 2.8, depthIndex: 1 },
];

export const FORMATIONS: Record<FormationId, FormationSlot[]> = {
  shotgun: [
    ...OL(),
    { slot: 'QB', pos: 'QB', down: -5, lat: 0 },
    { slot: 'RB', pos: 'RB', down: -5, lat: 1.3 },
    { slot: 'X', pos: 'WR', down: -0.6, lat: -20, depthIndex: 0 },
    { slot: 'Z', pos: 'WR', down: -1.3, lat: 19, depthIndex: 1 },
    { slot: 'H', pos: 'WR', down: -1.3, lat: -9, depthIndex: 2 },
    { slot: 'Y', pos: 'TE', down: -1.1, lat: 4.4 },
  ],
  shotgunTrips: [
    ...OL(),
    { slot: 'QB', pos: 'QB', down: -5, lat: 0 },
    { slot: 'RB', pos: 'RB', down: -5, lat: -1.3 },
    { slot: 'X', pos: 'WR', down: -0.6, lat: -20, depthIndex: 0 },
    { slot: 'Z', pos: 'WR', down: -0.6, lat: 20, depthIndex: 1 },
    { slot: 'H', pos: 'WR', down: -1.3, lat: 14, depthIndex: 2 },
    { slot: 'Y', pos: 'TE', down: -1.3, lat: 8 },
  ],
  singleback: [
    ...OL(),
    { slot: 'QB', pos: 'QB', down: -1.1, lat: 0 },
    { slot: 'RB', pos: 'RB', down: -6.5, lat: 0 },
    { slot: 'X', pos: 'WR', down: -0.6, lat: -19, depthIndex: 0 },
    { slot: 'Z', pos: 'WR', down: -1.3, lat: 18, depthIndex: 1 },
    { slot: 'H', pos: 'WR', down: -1.3, lat: -8, depthIndex: 2 },
    { slot: 'Y', pos: 'TE', down: -0.6, lat: 4.3 },
  ],
  iform: [
    ...OL(),
    { slot: 'QB', pos: 'QB', down: -1.1, lat: 0 },
    { slot: 'FB', pos: 'FB', down: -4, lat: 0 },
    { slot: 'RB', pos: 'RB', down: -6.8, lat: 0 },
    { slot: 'X', pos: 'WR', down: -0.6, lat: -19, depthIndex: 0 },
    { slot: 'Z', pos: 'WR', down: -1.3, lat: 18, depthIndex: 1 },
    { slot: 'Y', pos: 'TE', down: -0.6, lat: 4.3 },
  ],
  goalLine: [
    ...OL(),
    { slot: 'QB', pos: 'QB', down: -1.1, lat: 0 },
    { slot: 'FB', pos: 'FB', down: -4, lat: 0 },
    { slot: 'RB', pos: 'RB', down: -6.5, lat: 0 },
    { slot: 'Y', pos: 'TE', down: -0.6, lat: 4.3 },
    { slot: 'Y2', pos: 'TE', down: -0.6, lat: -4.3, depthIndex: 1 },
    { slot: 'X', pos: 'WR', down: -0.6, lat: -14, depthIndex: 0 },
  ],
  punt: [
    ...OL(),
    { slot: 'P', pos: 'P', down: -14, lat: 0 },
    { slot: 'PP', pos: 'FB', down: -6, lat: 0.8 },
    { slot: 'GL', pos: 'WR', down: -0.6, lat: -21, depthIndex: 2 },
    { slot: 'GR', pos: 'WR', down: -0.6, lat: 21, depthIndex: 3 },
    { slot: 'WL', pos: 'TE', down: -1.0, lat: -4.2, depthIndex: 1 },
    { slot: 'WR2', pos: 'LB', down: -1.0, lat: 4.2, depthIndex: 3 },
  ],
  fieldGoal: [
    ...OL(),
    { slot: 'H', pos: 'P', down: -7, lat: 0 },
    { slot: 'K', pos: 'K', down: -9.2, lat: -1.6 },
    { slot: 'WL', pos: 'TE', down: -0.8, lat: -4.2, depthIndex: 0 },
    { slot: 'WR2', pos: 'TE', down: -0.8, lat: 4.2, depthIndex: 1 },
    { slot: 'EL', pos: 'TE', down: -1.4, lat: -5.4, depthIndex: 2 },
    { slot: 'ER', pos: 'OG', down: -1.4, lat: 5.4, depthIndex: 2 },
  ],
  kneel: [
    ...OL(),
    { slot: 'QB', pos: 'QB', down: -1.1, lat: 0 },
    { slot: 'RB', pos: 'RB', down: -6, lat: 0 },
    { slot: 'FB', pos: 'FB', down: -3, lat: -1.5 },
    { slot: 'Y', pos: 'TE', down: -0.6, lat: 4.3 },
    { slot: 'Y2', pos: 'TE', down: -0.6, lat: -4.3, depthIndex: 1 },
    { slot: 'X', pos: 'WR', down: -1.5, lat: 2, depthIndex: 0 },
  ],
};

export type RouteId =
  | 'go' | 'slant' | 'out' | 'dig' | 'post' | 'corner' | 'curl' | 'flat' | 'wheel' | 'drag'
  | 'seam' | 'hitch' | 'comeback' | 'screen' | 'swing' | 'angle' | 'fade' | 'block';

export interface RouteDef {
  /** Points relatifs : down vers l'avant, out vers la ligne de touche la plus proche du joueur. */
  points: { down: number; out: number }[];
  /** Après le dernier point : continuer tout droit ou s'arrêter (se démarquer). */
  end: 'continue' | 'settle';
}

export const ROUTES: Record<RouteId, RouteDef> = {
  go: { points: [{ down: 35, out: 0 }], end: 'continue' },
  fade: { points: [{ down: 10, out: 2 }, { down: 35, out: 4 }], end: 'continue' },
  slant: { points: [{ down: 2, out: 0 }, { down: 8, out: -6 }], end: 'continue' },
  out: { points: [{ down: 6, out: 0 }, { down: 6, out: 9 }], end: 'settle' },
  dig: { points: [{ down: 11, out: 0 }, { down: 11, out: -12 }], end: 'continue' },
  post: { points: [{ down: 11, out: 0 }, { down: 26, out: -9 }], end: 'continue' },
  corner: { points: [{ down: 11, out: 0 }, { down: 22, out: 9 }], end: 'continue' },
  curl: { points: [{ down: 11, out: 0 }, { down: 9.5, out: -1 }], end: 'settle' },
  flat: { points: [{ down: 1, out: 4 }, { down: 3, out: 10 }], end: 'settle' },
  wheel: { points: [{ down: 1, out: 4 }, { down: 4, out: 9 }, { down: 28, out: 10 }], end: 'continue' },
  drag: { points: [{ down: 2.5, out: -2 }, { down: 4, out: -20 }], end: 'continue' },
  seam: { points: [{ down: 30, out: 0.5 }], end: 'continue' },
  hitch: { points: [{ down: 5.5, out: 0 }, { down: 4.5, out: 0 }], end: 'settle' },
  comeback: { points: [{ down: 15, out: 0 }, { down: 12.5, out: 3 }], end: 'settle' },
  screen: { points: [{ down: -1.5, out: 3 }, { down: -1, out: 7 }], end: 'settle' },
  swing: { points: [{ down: -0.5, out: 4 }, { down: 1, out: 9 }], end: 'settle' },
  angle: { points: [{ down: 3, out: 3 }, { down: 6, out: -3 }], end: 'continue' },
  block: { points: [], end: 'settle' },
};

export type OffAssign =
  | { kind: 'block' }
  | { kind: 'route'; route: RouteId; delay?: number }
  | { kind: 'carry' }
  | { kind: 'lead' }
  | { kind: 'qb' }
  | { kind: 'fake' }
  | { kind: 'screenBlock' }
  | { kind: 'kick' }
  | { kind: 'hold' }
  | { kind: 'cover' };

export type OffCategory = 'run' | 'pass' | 'special';
export type OffSubtype =
  | 'inside' | 'outside' | 'option' | 'sneak' | 'short' | 'medium' | 'deep' | 'screen' | 'playAction'
  | 'punt' | 'fieldGoal' | 'kneel';

export interface OffensivePlay {
  id: string;
  name: string;
  category: OffCategory;
  subtype: OffSubtype;
  formation: FormationId;
  /** Assignations par slot ; slots non listés = blocage. */
  assign: Record<string, OffAssign>;
  /** Point visé par le porteur (repère action) pour les courses. */
  runAim?: Spot;
  handoffTo?: string;
  /** Ordre de lecture des receveurs. */
  progression?: string[];
  description: string;
}

const R = (route: RouteId, delay = 0): OffAssign => ({ kind: 'route', route, delay });

export const OFFENSIVE_PLAYS: OffensivePlay[] = [
  // ——— Courses ———
  {
    id: 'insideZone', name: 'Inside Zone', category: 'run', subtype: 'inside', formation: 'singleback',
    assign: { QB: { kind: 'qb' }, RB: { kind: 'carry' }, X: { kind: 'block' }, Z: { kind: 'block' }, H: { kind: 'block' }, Y: { kind: 'block' } },
    handoffTo: 'RB', runAim: { down: 4, lat: 1.5 }, description: 'Course intérieure entre guard et tackle.',
  },
  {
    id: 'powerI', name: 'Power I', category: 'run', subtype: 'inside', formation: 'iform',
    assign: { QB: { kind: 'qb' }, RB: { kind: 'carry' }, FB: { kind: 'lead' }, X: { kind: 'block' }, Z: { kind: 'block' }, Y: { kind: 'block' } },
    handoffTo: 'RB', runAim: { down: 4, lat: -1.6 }, description: 'Course de puissance derrière le fullback.',
  },
  {
    id: 'outsideZone', name: 'Outside Zone', category: 'run', subtype: 'outside', formation: 'shotgun',
    assign: { QB: { kind: 'qb' }, RB: { kind: 'carry' }, X: { kind: 'block' }, Z: { kind: 'block' }, H: { kind: 'block' }, Y: { kind: 'block' } },
    handoffTo: 'RB', runAim: { down: 2, lat: 8 }, description: 'Course extérieure vers le bord du terrain.',
  },
  {
    id: 'tossSweep', name: 'Toss Sweep', category: 'run', subtype: 'outside', formation: 'iform',
    assign: { QB: { kind: 'qb' }, RB: { kind: 'carry' }, FB: { kind: 'lead' }, X: { kind: 'block' }, Z: { kind: 'block' }, Y: { kind: 'block' } },
    handoffTo: 'RB', runAim: { down: 1, lat: -10 }, description: 'Balayage côté faible avec fullback en éclaireur.',
  },
  {
    id: 'readOption', name: 'Option', category: 'run', subtype: 'option', formation: 'shotgun',
    assign: { QB: { kind: 'carry' }, RB: { kind: 'route', route: 'swing' }, X: { kind: 'block' }, Z: { kind: 'block' }, H: { kind: 'block' }, Y: { kind: 'block' } },
    runAim: { down: 2, lat: 6 }, description: 'Le QB court vers l’extérieur et peut latéraliser au RB.',
  },
  {
    id: 'qbSneak', name: 'QB Sneak', category: 'run', subtype: 'sneak', formation: 'goalLine',
    assign: { QB: { kind: 'carry' }, RB: { kind: 'block' }, FB: { kind: 'block' }, X: { kind: 'block' }, Y: { kind: 'block' }, Y2: { kind: 'block' } },
    runAim: { down: 3, lat: 0.4 }, description: 'Plongeon du QB derrière le centre. Idéal en 4e et 1.',
  },
  {
    id: 'goalLineDive', name: 'Dive', category: 'run', subtype: 'inside', formation: 'goalLine',
    assign: { QB: { kind: 'qb' }, RB: { kind: 'carry' }, FB: { kind: 'lead' }, X: { kind: 'block' }, Y: { kind: 'block' }, Y2: { kind: 'block' } },
    handoffTo: 'RB', runAim: { down: 3, lat: 0.8 }, description: 'Course plein centre en courte distance.',
  },
  // ——— Passes ———
  {
    id: 'quickSlants', name: 'Slants', category: 'pass', subtype: 'short', formation: 'shotgun',
    assign: { QB: { kind: 'qb' }, RB: { kind: 'block' }, X: R('slant'), Z: R('slant'), H: R('hitch'), Y: R('flat') },
    progression: ['X', 'Z', 'H', 'Y'], description: 'Passe courte rapide : slants à l’extérieur.',
  },
  {
    id: 'hitchFlat', name: 'Hitch & Flat', category: 'pass', subtype: 'short', formation: 'shotgunTrips',
    assign: { QB: { kind: 'qb' }, RB: R('swing'), X: R('hitch'), Z: R('hitch'), H: R('out'), Y: R('flat') },
    progression: ['Z', 'Y', 'X', 'H', 'RB'], description: 'Passes courtes contre une couverture en retrait.',
  },
  {
    id: 'meshDrag', name: 'Mesh', category: 'pass', subtype: 'short', formation: 'shotgun',
    assign: { QB: { kind: 'qb' }, RB: R('flat'), X: R('drag'), Z: R('drag', 0.2), H: R('curl'), Y: R('seam') },
    progression: ['X', 'Z', 'RB', 'H', 'Y'], description: 'Croisements courts pour battre la défense individuelle.',
  },
  {
    id: 'curlFlat', name: 'Curl Flat', category: 'pass', subtype: 'medium', formation: 'singleback',
    assign: { QB: { kind: 'qb' }, RB: R('flat'), X: R('curl'), Z: R('curl'), H: R('dig'), Y: R('angle') },
    progression: ['X', 'RB', 'H', 'Z', 'Y'], description: 'Passe intermédiaire : crochets et sortie en flat.',
  },
  {
    id: 'digsOut', name: 'Dig Out', category: 'pass', subtype: 'medium', formation: 'shotgunTrips',
    assign: { QB: { kind: 'qb' }, RB: { kind: 'block' }, X: R('dig'), Z: R('out'), H: R('dig'), Y: R('seam') },
    progression: ['H', 'Z', 'X', 'Y'], description: 'Routes à 10-12 yards pour convertir les 3e et long.',
  },
  {
    id: 'fourVerts', name: 'Four Verticals', category: 'pass', subtype: 'deep', formation: 'shotgun',
    assign: { QB: { kind: 'qb' }, RB: { kind: 'block' }, X: R('go'), Z: R('go'), H: R('seam'), Y: R('seam') },
    progression: ['H', 'Y', 'X', 'Z'], description: 'Passe longue : quatre receveurs en profondeur.',
  },
  {
    id: 'postCorner', name: 'Post Corner', category: 'pass', subtype: 'deep', formation: 'singleback',
    assign: { QB: { kind: 'qb' }, RB: { kind: 'block' }, X: R('post'), Z: R('corner'), H: R('curl'), Y: R('flat') },
    progression: ['X', 'Z', 'H', 'Y'], description: 'Passe longue en diagonale contre la zone.',
  },
  {
    id: 'rbScreen', name: 'RB Screen', category: 'pass', subtype: 'screen', formation: 'shotgun',
    assign: { QB: { kind: 'qb' }, RB: R('screen', 0.9), X: R('go'), Z: R('go'), H: R('slant'), Y: { kind: 'block' }, LG: { kind: 'screenBlock' }, C: { kind: 'screenBlock' }, RG: { kind: 'screenBlock' } },
    progression: ['RB', 'H'], description: 'Screen : la ligne laisse passer le rush et escorte le RB.',
  },
  {
    id: 'paBoot', name: 'Play-Action Deep', category: 'pass', subtype: 'playAction', formation: 'iform',
    assign: { QB: { kind: 'qb' }, RB: { kind: 'fake' }, FB: R('flat', 0.4), X: R('post'), Z: R('go'), Y: R('corner') },
    progression: ['X', 'Y', 'Z', 'FB'], description: 'Fausse remise puis passe profonde.',
  },
  {
    id: 'paCross', name: 'Play-Action Cross', category: 'pass', subtype: 'playAction', formation: 'singleback',
    assign: { QB: { kind: 'qb' }, RB: { kind: 'fake' }, X: R('dig'), Z: R('post'), H: R('drag'), Y: R('corner') },
    progression: ['X', 'Y', 'H', 'Z'], description: 'Fausse remise et croisements intermédiaires.',
  },
  {
    id: 'tePop', name: 'TE Pop', category: 'pass', subtype: 'short', formation: 'goalLine',
    assign: { QB: { kind: 'qb' }, RB: { kind: 'fake' }, FB: R('flat'), Y: R('angle'), Y2: R('flat'), X: R('fade') },
    progression: ['Y', 'X', 'FB', 'Y2'], description: 'Passe courte au tight end près de la ligne de but.',
  },
  // ——— Équipes spéciales ———
  {
    id: 'punt', name: 'Punt', category: 'special', subtype: 'punt', formation: 'punt',
    assign: { P: { kind: 'kick' }, GL: { kind: 'cover' }, GR: { kind: 'cover' } },
    description: 'Dégagement au pied.',
  },
  {
    id: 'fieldGoal', name: 'Field Goal', category: 'special', subtype: 'fieldGoal', formation: 'fieldGoal',
    assign: { K: { kind: 'kick' }, H: { kind: 'hold' } },
    description: 'Tentative de field goal (3 points) ou extra point.',
  },
  {
    id: 'kneel', name: 'Genou à terre', category: 'special', subtype: 'kneel', formation: 'kneel',
    assign: { QB: { kind: 'qb' } },
    description: 'Le QB pose le genou pour écouler le chrono.',
  },
];

// ——— Défense ———

export type DefFront = '43' | '34' | 'nickel' | 'dime' | 'goalLine';
export type Coverage = 'cover0' | 'cover1' | 'cover2' | 'cover3' | 'cover4';

export interface DefensivePlay {
  id: string;
  name: string;
  front: DefFront;
  coverage: Coverage;
  /** Slots qui blitzent. */
  blitz: string[];
  runFocus: boolean;
  description: string;
  tags: ('man' | 'zone' | 'blitz' | 'run' | 'deep' | 'short')[];
}

export interface DefSlot extends Spot {
  slot: string;
  pos: Position;
  depthIndex?: number;
  role: 'dl' | 'lb' | 'cb' | 's';
}

export const DEF_FRONTS: Record<DefFront, DefSlot[]> = {
  '43': [
    { slot: 'LE', pos: 'DE', down: 1, lat: -3.6, role: 'dl', depthIndex: 0 },
    { slot: 'LDT', pos: 'DT', down: 1, lat: -0.8, role: 'dl', depthIndex: 0 },
    { slot: 'RDT', pos: 'DT', down: 1, lat: 1.0, role: 'dl', depthIndex: 1 },
    { slot: 'RE', pos: 'DE', down: 1, lat: 3.8, role: 'dl', depthIndex: 1 },
    { slot: 'WLB', pos: 'LB', down: 4.8, lat: -4.2, role: 'lb', depthIndex: 0 },
    { slot: 'MLB', pos: 'LB', down: 5, lat: 0, role: 'lb', depthIndex: 1 },
    { slot: 'SLB', pos: 'LB', down: 4.8, lat: 4.2, role: 'lb', depthIndex: 2 },
    { slot: 'LCB', pos: 'CB', down: 6, lat: -19, role: 'cb', depthIndex: 0 },
    { slot: 'RCB', pos: 'CB', down: 6, lat: 19, role: 'cb', depthIndex: 1 },
    { slot: 'FS', pos: 'FS', down: 13, lat: -6, role: 's' },
    { slot: 'SS', pos: 'SS', down: 12, lat: 6, role: 's' },
  ],
  '34': [
    { slot: 'LE', pos: 'DE', down: 1, lat: -2.6, role: 'dl', depthIndex: 0 },
    { slot: 'NT', pos: 'DT', down: 1, lat: 0, role: 'dl', depthIndex: 0 },
    { slot: 'RE', pos: 'DE', down: 1, lat: 2.6, role: 'dl', depthIndex: 1 },
    { slot: 'LOLB', pos: 'LB', down: 1.2, lat: -5.2, role: 'lb', depthIndex: 3 },
    { slot: 'WLB', pos: 'LB', down: 4.8, lat: -2, role: 'lb', depthIndex: 0 },
    { slot: 'MLB', pos: 'LB', down: 4.8, lat: 2, role: 'lb', depthIndex: 1 },
    { slot: 'ROLB', pos: 'LB', down: 1.2, lat: 5.4, role: 'lb', depthIndex: 2 },
    { slot: 'LCB', pos: 'CB', down: 6, lat: -19, role: 'cb', depthIndex: 0 },
    { slot: 'RCB', pos: 'CB', down: 6, lat: 19, role: 'cb', depthIndex: 1 },
    { slot: 'FS', pos: 'FS', down: 13, lat: -6, role: 's' },
    { slot: 'SS', pos: 'SS', down: 12, lat: 6, role: 's' },
  ],
  nickel: [
    { slot: 'LE', pos: 'DE', down: 1, lat: -3.6, role: 'dl', depthIndex: 0 },
    { slot: 'LDT', pos: 'DT', down: 1, lat: -0.8, role: 'dl', depthIndex: 0 },
    { slot: 'RDT', pos: 'DT', down: 1, lat: 1.0, role: 'dl', depthIndex: 1 },
    { slot: 'RE', pos: 'DE', down: 1, lat: 3.8, role: 'dl', depthIndex: 1 },
    { slot: 'WLB', pos: 'LB', down: 5, lat: -2.5, role: 'lb', depthIndex: 0 },
    { slot: 'MLB', pos: 'LB', down: 5, lat: 2.5, role: 'lb', depthIndex: 1 },
    { slot: 'LCB', pos: 'CB', down: 6, lat: -19, role: 'cb', depthIndex: 0 },
    { slot: 'RCB', pos: 'CB', down: 6, lat: 19, role: 'cb', depthIndex: 1 },
    { slot: 'NB', pos: 'CB', down: 5, lat: -9, role: 'cb', depthIndex: 2 },
    { slot: 'FS', pos: 'FS', down: 13, lat: -6, role: 's' },
    { slot: 'SS', pos: 'SS', down: 12, lat: 6, role: 's' },
  ],
  dime: [
    { slot: 'LE', pos: 'DE', down: 1, lat: -3.6, role: 'dl', depthIndex: 0 },
    { slot: 'LDT', pos: 'DT', down: 1, lat: -0.8, role: 'dl', depthIndex: 0 },
    { slot: 'RDT', pos: 'DT', down: 1, lat: 1.0, role: 'dl', depthIndex: 1 },
    { slot: 'RE', pos: 'DE', down: 1, lat: 3.8, role: 'dl', depthIndex: 1 },
    { slot: 'MLB', pos: 'LB', down: 5.5, lat: 0, role: 'lb', depthIndex: 0 },
    { slot: 'LCB', pos: 'CB', down: 7, lat: -19, role: 'cb', depthIndex: 0 },
    { slot: 'RCB', pos: 'CB', down: 7, lat: 19, role: 'cb', depthIndex: 1 },
    { slot: 'NB', pos: 'CB', down: 6, lat: -9, role: 'cb', depthIndex: 2 },
    { slot: 'DB', pos: 'CB', down: 6, lat: 9, role: 'cb', depthIndex: 3 },
    { slot: 'FS', pos: 'FS', down: 15, lat: -7, role: 's' },
    { slot: 'SS', pos: 'SS', down: 14, lat: 7, role: 's' },
  ],
  goalLine: [
    { slot: 'LE', pos: 'DE', down: 1, lat: -4, role: 'dl', depthIndex: 0 },
    { slot: 'LDT', pos: 'DT', down: 1, lat: -1.4, role: 'dl', depthIndex: 0 },
    { slot: 'NT', pos: 'DT', down: 1, lat: 0.2, role: 'dl', depthIndex: 2 },
    { slot: 'RDT', pos: 'DT', down: 1, lat: 1.6, role: 'dl', depthIndex: 1 },
    { slot: 'RE', pos: 'DE', down: 1, lat: 4.2, role: 'dl', depthIndex: 1 },
    { slot: 'WLB', pos: 'LB', down: 3, lat: -3, role: 'lb', depthIndex: 0 },
    { slot: 'MLB', pos: 'LB', down: 3, lat: 0, role: 'lb', depthIndex: 1 },
    { slot: 'SLB', pos: 'LB', down: 3, lat: 3, role: 'lb', depthIndex: 2 },
    { slot: 'LCB', pos: 'CB', down: 3, lat: -14, role: 'cb', depthIndex: 0 },
    { slot: 'RCB', pos: 'CB', down: 3, lat: 14, role: 'cb', depthIndex: 1 },
    { slot: 'SS', pos: 'SS', down: 6, lat: 3, role: 's' },
  ],
};

export const DEFENSIVE_PLAYS: DefensivePlay[] = [
  { id: '43cover2', name: '4-3 Cover 2', front: '43', coverage: 'cover2', blitz: [], runFocus: false, tags: ['zone', 'short'], description: 'Zone à deux safeties profonds, corners dans les flats.' },
  { id: '43cover3', name: '4-3 Cover 3', front: '43', coverage: 'cover3', blitz: [], runFocus: false, tags: ['zone', 'deep'], description: 'Zone en trois tiers profonds.' },
  { id: '43cover1', name: '4-3 Cover 1 (individuelle)', front: '43', coverage: 'cover1', blitz: [], runFocus: false, tags: ['man'], description: 'Défense individuelle avec un safety libre.' },
  { id: '43runStop', name: '4-3 Stop course', front: '43', coverage: 'cover1', blitz: ['SS'], runFocus: true, tags: ['run', 'man'], description: '8 joueurs dans la boîte contre la course.' },
  { id: '34cover3', name: '3-4 Cover 3', front: '34', coverage: 'cover3', blitz: ['ROLB'], runFocus: false, tags: ['zone'], description: '3-4 avec OLB qui charge, zone en trois tiers.' },
  { id: '34blitz', name: '3-4 Blitz Cover 0', front: '34', coverage: 'cover0', blitz: ['LOLB', 'ROLB', 'MLB', 'FS'], runFocus: false, tags: ['blitz', 'man'], description: 'Blitz massif, couverture individuelle sans safety.' },
  { id: 'nickelMan', name: 'Nickel Man', front: 'nickel', coverage: 'cover1', blitz: [], runFocus: false, tags: ['man', 'short'], description: 'Cinq défensives backs en individuelle.' },
  { id: 'nickelBlitz', name: 'Nickel Blitz', front: 'nickel', coverage: 'cover1', blitz: ['NB', 'MLB'], runFocus: false, tags: ['blitz', 'man'], description: 'Blitz du nickelback et du linebacker.' },
  { id: 'nickelQuarters', name: 'Nickel Cover 4', front: 'nickel', coverage: 'cover4', blitz: [], runFocus: false, tags: ['zone', 'deep'], description: 'Couverture profonde en quarts de terrain.' },
  { id: 'dimeDeep', name: 'Dime Prevent', front: 'dime', coverage: 'cover4', blitz: [], runFocus: false, tags: ['zone', 'deep'], description: 'Six défenseurs arrière : empêche la passe longue.' },
  { id: 'goalLineD', name: 'Goal Line', front: 'goalLine', coverage: 'cover0', blitz: ['MLB'], runFocus: true, tags: ['run', 'short', 'man'], description: 'Courte distance : 5 linemen, tout le monde près de la ligne.' },
];

export const playById = (id: string): OffensivePlay => {
  const p = OFFENSIVE_PLAYS.find((x) => x.id === id);
  if (!p) throw new Error(`Action inconnue : ${id}`);
  return p;
};
export const defPlayById = (id: string): DefensivePlay => {
  const p = DEFENSIVE_PLAYS.find((x) => x.id === id);
  if (!p) throw new Error(`Défense inconnue : ${id}`);
  return p;
};
