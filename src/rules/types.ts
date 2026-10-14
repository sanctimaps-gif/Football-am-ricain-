import type { PlayerGameStats, StatEvent, TeamStats } from './stats';

export type Side = 0 | 1; // 0 = domicile, 1 = extérieur
export const other = (s: Side): Side => (s === 0 ? 1 : 0);

export type NextKind = 'kickoff' | 'scrimmage' | 'conversion';

export type PenaltyType =
  | 'falseStart' | 'offside' | 'delayOfGame' | 'holding' | 'passInterference' | 'facemask'
  | 'roughingThePasser' | 'intentionalGrounding' | 'unsportsmanlike';

export interface PenaltyCall {
  type: PenaltyType;
  against: Side;
  /** Emplacement de la faute (repère de l'attaque au snap) : interférence défensive, passe volontairement au sol. */
  spot?: number;
  playerId?: string;
}

export type ResultKind = 'scrimmage' | 'kickoff' | 'punt' | 'fieldGoal' | 'extraPoint' | 'kneel';

/** Faits physiques d'une action, rapportés par la simulation. Le moteur de règles en déduit tout le reste. */
export interface PlayResult {
  kind: ResultKind;
  playType: 'run' | 'pass' | 'kick' | 'kneel';
  elapsed: number;
  /** Équipe qui détient le ballon au moment où il devient mort. */
  finalPossessor: Side;
  /** Position finale du ballon, en yards depuis la ligne de but de l'équipe qui avait le ballon au snap (peut être <0 ou >100). */
  endSpot: number;
  incomplete: boolean;
  outOfBounds: boolean;
  /** Le changement de possession a eu lieu dans l'en-but (interception/récupération/réception de coup de pied) → touchback possible. */
  possessionChangedInEndZone: boolean;
  /** Coup de pied mort dans l'en-but ou au-delà sans retour. */
  kickTouchback: boolean;
  kickOutOfBounds: boolean;
  fairCatch: boolean;
  kickGood: boolean;
  turnover: 'none' | 'interception' | 'fumble';
  preSnapPenalty: PenaltyCall | null;
  penalties: PenaltyCall[];
  stats: StatEvent[];
  /** Clé i18n de résumé + paramètres. */
  summary: { key: string; params?: Record<string, string | number> };
}

export const emptyResult = (kind: ResultKind, possessor: Side, spot: number): PlayResult => ({
  kind,
  playType: kind === 'scrimmage' ? 'run' : kind === 'kneel' ? 'kneel' : 'kick',
  elapsed: 0,
  finalPossessor: possessor,
  endSpot: spot,
  incomplete: false,
  outOfBounds: false,
  possessionChangedInEndZone: false,
  kickTouchback: false,
  kickOutOfBounds: false,
  fairCatch: false,
  kickGood: false,
  turnover: 'none',
  preSnapPenalty: null,
  penalties: [],
  stats: [],
  summary: { key: 'play.generic' },
});

export interface OvertimeState {
  firstPossessor: Side;
  possessionsCompleted: number;
}

export interface PlayLogEntry {
  n: number;
  quarter: number;
  clock: number;
  offense: Side;
  down: number;
  toGo: number;
  ballOn: number;
  summary: PlayResult['summary'];
  tags: string[];
  score: [number, number];
}

export interface GameState {
  quarter: number; // 1..4, 5+ = prolongation
  clock: number;
  score: [number, number];
  possession: Side;
  ballOn: number;
  down: number;
  toGo: number;
  timeouts: [number, number];
  nextKind: NextKind;
  clockRunning: boolean;
  openingKicker: Side;
  ot: OvertimeState | null;
  needsCoinToss: boolean;
  finished: boolean;
  winner: Side | null;
  teamStats: [TeamStats, TeamStats];
  playerStats: Record<string, PlayerGameStats>;
  sideOf: Record<string, Side>;
  log: PlayLogEntry[];
  playNumber: number;
  /** Indicateur de période terminée lors de la dernière résolution (pour l'interface). */
  lastPeriodEnded: 'none' | 'quarter' | 'half' | 'regulation' | 'overtime';
  /** Two-minute warning déjà donné : [2e quart-temps, 4e quart-temps]. */
  twoMinuteWarned: [boolean, boolean];
  /** Recul du prochain coup d'envoi (comportement antisportif après un score). */
  kickoffPenalty: number;
}
