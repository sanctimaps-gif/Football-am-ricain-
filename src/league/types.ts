import type { GamePlan } from '../ai/playcaller';
import type { Player, Position, SeasonStatLine, Team } from '../data/types';
import type { PlayoffGame, ScheduledGame } from './schedule';

export type LeagueMode = 'season' | 'coach' | 'franchise' | 'playerCareer';
export type LeaguePhase = 'regular' | 'playoffs' | 'offseason' | 'draft' | 'done';

export interface Facilities {
  training: number; // 1..5 : progression des joueurs
  medical: number; // 1..5 : durée des blessures
  stadium: number; // 1..5 : affluence et recettes
}

export interface Finance {
  /** Trésorerie en milliers $. */
  cash: number;
  salaryCap: number;
  ticketPrice: number; // $
  fanSupport: number; // 0..100
  facilities: Facilities;
  seasonRevenue: number;
  seasonExpenses: number;
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
}

export const ROSTER_MIN = 45;
export const ROSTER_MAX = 55;
export const SALARY_CAP = 200000; // milliers $ (200 M$)

export const POSITION_NEEDS: Record<Position, number> = {
  QB: 3, RB: 3, FB: 1, WR: 6, TE: 3, C: 2, OG: 4, OT: 4, DE: 4, DT: 4, LB: 6, CB: 5, FS: 2, SS: 2, K: 1, P: 1,
};
