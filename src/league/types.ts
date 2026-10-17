import type { GamePlan } from '../ai/playcaller';
import type { TeamTemplate } from '../data/teams';
import type { Player, Position, SeasonStatLine, Team } from '../data/types';
import type { PlayoffGame, ScheduledGame } from './schedule';

export type LeagueMode = 'season' | 'coach' | 'franchise' | 'playerCareer' | 'club' | 'cup';
export type LeaguePhase = 'regular' | 'playoffs' | 'offseason' | 'draft' | 'done';

export interface Facilities {
  training: number; // 1..5 : progression des joueurs
  medical: number; // 1..5 : durée des blessures
  stadium: number; // 1..5 : avantage à domicile et recettes
  /** 1..5 : capacité (sièges supplémentaires). Absent dans les anciennes sauvegardes = 1. */
  seats?: number;
  /** 1..5 : boutique du club (revenu hebdomadaire). Absent = 1. */
  shop?: number;
}

export type FacilityKind = 'stadium' | 'seats' | 'shop' | 'medical' | 'training';

export interface Finance {
  /** Trésorerie en milliers $. */
  cash: number;
  salaryCap: number;
  ticketPrice: number; // $
  fanSupport: number; // 0..100
  facilities: Facilities;
  seasonRevenue: number;
  seasonExpenses: number;
  /** Diplômes (gagnés en jouant, servent aux constructions). */
  diplomas?: number;
  /** Trousses de secours (soignent un blessé immédiatement). */
  kits?: number;
  /** Construction en cours (une à la fois). */
  building?: { kind: FacilityKind; level: number; weeksLeft: number } | null;
}

export interface CoachState {
  name: string;
  reputation: number; // 0..100
  security: number; // 0..100 : confiance de la direction
  objectives: { wins: number; playoffs: boolean };
  fired: boolean;
  seasons: { season: number; teamId: string; w: number; l: number; t: number; playoffs: boolean; champion: boolean }[];
}

export interface CareerGoal {
  key: 'yards' | 'tds' | 'tackles' | 'starts' | 'catches' | 'ints' | 'fg';
  target: number;
  progress: number;
}

export interface CareerState {
  playerId: string;
  skillPoints: number;
  trainedWeek: number;
  goals: CareerGoal[];
  awards: string[];
  draft: { round: number; pick: number; teamId: string } | null;
}

export interface SeasonSummary {
  season: number;
  champion: string;
  runnerUp: string;
  mvp: { id: string; name: string; teamId: string } | null;
  userRecord: { w: number; l: number; t: number } | null;
}

export interface LeagueRecords {
  mostPointsGame: { value: number; teamId: string; season: number } | null;
  bestSeason: { w: number; teamId: string; season: number } | null;
  passYdsSeason: { value: number; name: string; season: number } | null;
  rushYdsSeason: { value: number; name: string; season: number } | null;
}

export type DivisionLevel = 1 | 2 | 3;

export interface DivisionInfo {
  level: DivisionLevel;
  name: string;
  /** Montées (vainqueur des playoffs) et relégations (derniers du classement). */
  promote: number;
  relegate: number;
  /** Playoffs pour le titre (première division). */
  playoffs: boolean;
  /** Part des revenus (droits TV, sponsors) par rapport à la première division. */
  incomeFactor: number;
}

/** Pyramide de la carrière de club : seule la division de l'utilisateur est jouée en détail. */
export interface Pyramid {
  leagueId: string;
  level: DivisionLevel;
  /** Membres de chaque division (ids d'équipes). */
  members: Record<DivisionLevel, string[]>;
  /** Modèles des équipes hors de la division active (effectif régénéré quand elles la rejoignent). */
  templates: Record<string, TeamTemplate>;
  log: { season: number; level: DivisionLevel; rank: number; moved: 'up' | 'down' | 'stay' }[];
}

/** Coupe ou tournoi (élimination directe, éventuellement précédée de groupes). */
export interface CupState {
  id: string;
  name: string;
  icon: string;
  groups: string[][] | null;
}

export interface League {
  version: 1;
  id: string;
  name: string;
  mode: LeagueMode;
  seed: number;
  season: number;
  week: number; // 1-based
  phase: LeaguePhase;
  weeks: number;
  playoffTeams: 2 | 4;
  quarterMinutes: number;
  teams: Team[];
  userTeamId: string;
  schedule: ScheduledGame[][];
  playoffs: PlayoffGame[];
  champion: string | null;
  seasonStats: Record<string, SeasonStatLine>;
  history: SeasonSummary[];
  records: LeagueRecords;
  finances: Record<string, Finance>;
  plans: Record<string, GamePlan>;
  freeAgents: Player[];
  draftClass: Player[];
  draftOrder: string[];
  draftPick: number;
  draftRounds: number;
  coach: CoachState | null;
  career: CareerState | null;
  news: string[];
  nextPlayerId: number;
  /** Ligue régionale d'origine (world.ts). */
  leagueId?: string;
  conferenceNames?: [string, string];
  pyramid?: Pyramid;
  cup?: CupState;
  /** Joueurs proposés par des clubs étrangers (carrière de club). */
  transferList?: Player[];
  /** Tournoi intersaison contre des clubs d'autres régions du monde (carrière de club). */
  interseason?: InterseasonCup | null;
  /** Trophées remportés par le club de l'utilisateur. */
  trophies?: string[];
}

export interface InterseasonCup {
  name: string;
  season: number;
  /** Adversaires (modèles d'équipes d'autres ligues) ; l'utilisateur joue avec son effectif. */
  opponents: TeamTemplate[];
  games: PlayoffGame[];
  /** Primes (k$) : vainqueur, finaliste. */
  prize: [number, number];
  done: boolean;
}

export const ROSTER_MIN = 45;
export const ROSTER_MAX = 55;
export const SALARY_CAP = 200000; // milliers $ (200 M$)

export const POSITION_NEEDS: Record<Position, number> = {
  QB: 3, RB: 3, FB: 1, WR: 6, TE: 3, C: 2, OG: 4, OT: 4, DE: 4, DT: 4, LB: 6, CB: 5, FS: 2, SS: 2, K: 1, P: 1,
};

/**
 * Pyramide de la carrière de club : 3 divisions de 10 équipes. Dans chaque division, les 4 premiers jouent des
 * playoffs (demi-finales, finale) : seul le vainqueur monte. Le dernier descend.
 */
export const DIVISIONS: Record<DivisionLevel, DivisionInfo> = {
  1: { level: 1, name: 'Première division', promote: 0, relegate: 1, playoffs: true, incomeFactor: 1 },
  2: { level: 2, name: 'Deuxième division', promote: 1, relegate: 1, playoffs: true, incomeFactor: 0.5 },
  3: { level: 3, name: 'Troisième division', promote: 1, relegate: 0, playoffs: true, incomeFactor: 0.3 },
};
export const DIVISION_SIZE = 10;
