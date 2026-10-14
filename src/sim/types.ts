import type { DefensivePlay, OffAssign, OffensivePlay } from '../data/playbook';
import type { Player, Position } from '../data/types';
import type { RulesConfig } from '../rules/config';
import type { Side } from '../rules/types';

export type AnimAction =
  | 'stance' | 'idle' | 'run' | 'block' | 'throw' | 'catch' | 'dive' | 'down' | 'celebrate'
  | 'kick' | 'juke' | 'handoff' | 'kneel' | 'backpedal' | 'hold';

export type DefAssignKind = 'rush' | 'man' | 'zone' | 'spy';

export interface Agent {
  idx: number;
  side: Side;
  slot: string;
  player: Player;
  pos: Position;
  offense: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  maxSpeed: number;
  accel: number;
  radius: number;
  power: number; // force de blocage / de rush
  // assignations
  offAssign: OffAssign | null;
  defAssign: DefAssignKind | null;
  route: { x: number; y: number }[];
  routeIdx: number;
  routeEnd: 'continue' | 'settle';
  routeDelay: number;
  zoneX: number;
  zoneY: number;
  manTarget: number;
  // interactions
  blockTarget: number;
  engagedWith: number[];
  shedFrom: number;
  shedTimer: number;
  tackleCooldown: number;
  stunned: number;
  down: boolean;
  downTimer: number;
  reaction: number;
  /** Délai de lecture d'une course (s). */
  readDelay: number;
  diveTimer: number;
  jukeTimer: number;
  jukeCooldown: number;
  jumpTimer: number;
  protect: boolean;
  catchAttempted: boolean;
  eligible: boolean;
  user: boolean;
  sprinting: boolean;
  // animation
  action: AnimAction;
  actionTime: number;
  stride: number; // phase de foulée cumulée
  fatigue: number; // 0 (frais) .. 1
}

export type BallState = 'held' | 'air' | 'loose' | 'dead';
export type BallFlight = 'snap' | 'pass' | 'pitch' | 'kickoff' | 'punt' | 'fieldGoal';
export type PassType = 'bullet' | 'touch' | 'lob';

export interface Ball {
  state: BallState;
  holder: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  flight: BallFlight | null;
  thrower: number;
  target: number;
  tx: number;
  ty: number;
  airTime: number;
  flightTime: number;
  passType: PassType;
  lastSide: Side;
  spin: number;
}

export interface SimInput {
  moveX: number; // direction monde souhaitée (déjà corrigée par la caméra)
  moveY: number;
  sprint: boolean;
  pass: boolean; // impulsion
  passTarget: number; // index d'agent ou -1 pour la cible sélectionnée
  passType: PassType;
  aimX: number; // décalage de visée manuelle (monde), 0 si assistance
  aimY: number;
  switchPlayer: boolean;
  juke: boolean;
  dive: boolean;
  tackle: boolean;
  jump: boolean;
  contain: boolean;
  protect: boolean;
  fairCatch: boolean;
  kickMeter: number | null; // valeur du kick meter [-1,1] si l'utilisateur a frappé
}

export const emptyInput = (): SimInput => ({
  moveX: 0, moveY: 0, sprint: false, pass: false, passTarget: -1, passType: 'touch', aimX: 0, aimY: 0,
  switchPlayer: false, juke: false, dive: false, tackle: false, jump: false, contain: false, protect: false,
  fairCatch: false, kickMeter: null,
});

export type SimEvent =
  | { type: 'snap' }
  | { type: 'handoff'; to: number }
  | { type: 'throw'; by: number; target: number; passType: PassType }
  | { type: 'catch'; by: number }
  | { type: 'drop'; by: number }
  | { type: 'interception'; by: number }
  | { type: 'deflect'; by: number }
  | { type: 'hit'; a: number; b: number; strength: number }
  | { type: 'tackle'; by: number; carrier: number }
  | { type: 'brokenTackle'; by: number; carrier: number }
  | { type: 'juke'; by: number }
  | { type: 'fumble'; by: number }
  | { type: 'recover'; by: number }
  | { type: 'touchdown'; by: number; side: Side }
  | { type: 'safety' }
  | { type: 'incomplete' }
  | { type: 'outOfBounds'; by: number }
  | { type: 'kick'; by: number; flight: BallFlight }
  | { type: 'kickResult'; good: boolean }
  | { type: 'whistle' }
  | { type: 'flag'; penalty: string }
  | { type: 'sack'; by: number }
  | { type: 'switch'; to: number }
  | { type: 'touchback' }
  | { type: 'fairCatch' };

export interface Difficulty {
  id: 'easy' | 'normal' | 'hard';
  /** Multiplicateur du temps de réaction de l'IA. */
  reaction: number;
  /** Bonus de plaquage de l'IA. */
  tackle: number;
  /** Multiplicateur d'erreur des passes de l'IA. */
  accuracy: number;
  /** Bonus de réception de l'IA. */
  catching: number;
  /** Bonus de puissance de blocage/rush de l'IA. */
  power: number;
}

export const DIFFICULTIES: Record<Difficulty['id'], Difficulty> = {
  easy: { id: 'easy', reaction: 1.45, tackle: -0.14, accuracy: 1.45, catching: -0.1, power: -8 },
  normal: { id: 'normal', reaction: 1.0, tackle: 0, accuracy: 1.0, catching: 0, power: 0 },
  hard: { id: 'hard', reaction: 0.72, tackle: 0.09, accuracy: 0.8, catching: 0.06, power: 6 },
};

export type SimKind = 'scrimmage' | 'kickoff' | 'punt' | 'fieldGoal' | 'extraPoint' | 'twoPoint';

export interface PlaySetup {
  kind: SimKind;
  offense: Side; // équipe qui a le ballon au snap (ou qui botte)
  dir: 1 | -1; // direction d'attaque de l'offense
  losX: number; // x monde de la ligne de scrimmage (ou du point de kickoff)
  ballY: number;
  lineToGainX: number;
  offPlay: OffensivePlay | null;
  defPlay: DefensivePlay | null;
  offPlayers: Map<string, Player>; // slot → joueur
  defPlayers: Map<string, Player>;
  userSide: Side | null;
  /** Joueur verrouillé (carrière de joueur). */
  lockedPlayerId: string | null;
  /** Défenseur initialement contrôlé (index de slot défensif), sinon automatique. */
  userDefSlot: string | null;
  difficulty: Difficulty;
  rules: RulesConfig;
  seed: number;
  /** Contexte de situation pour l'IA (gestion du chrono). */
  situation: { trailingLate: boolean; leadingLate: boolean; down: number; toGo: number };
  fatigue: Map<string, number>;
  autoSwitch: boolean;
  /** L'utilisateur gère le kick meter (sinon automatique). */
  userKicks: boolean;
}
