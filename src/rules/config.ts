/**
 * Règlement de compétition centralisé. Basé sur un règlement de type « pro »
 * (4 quarts-temps, PAT à 15 yards, conversion à 2 points au 2 yards, kickoff du 35,
 * touchback au 25), avec durée de quart-temps adaptée au jeu mobile.
 */
export interface RulesConfig {
  quarterMinutes: 1 | 3 | 5 | number;
  quarters: number;
  timeoutsPerHalf: number;
  kickoffSpot: number; // yards depuis la ligne de but de l'équipe qui botte
  safetyFreeKickSpot: number;
  kickoffTouchbackSpot: number; // depuis la ligne de but de l'équipe qui reçoit
  puntTouchbackSpot: number;
  kickoffOutOfBoundsSpot: number;
  extraPointSpot: number; // distance de la ligne de but adverse
  twoPointSpot: number;
  /** Secondes de jeu écoulées entre deux actions quand le chrono tourne (pour un quart-temps de 15 min). */
  runoffSecondsPer15: number;
  overtime: {
    enabled: boolean;
    /** Égalité permise après une prolongation en saison régulière. */
    allowTie: boolean;
    /** Durée en fraction d'un quart-temps (10/15 en pro). */
    lengthRatio: number;
  };
  penaltiesEnabled: boolean;
}

export const DEFAULT_RULES: RulesConfig = {
  quarterMinutes: 3,
  quarters: 4,
  timeoutsPerHalf: 3,
  kickoffSpot: 35,
  safetyFreeKickSpot: 20,
  kickoffTouchbackSpot: 25,
  puntTouchbackSpot: 20,
  kickoffOutOfBoundsSpot: 40,
  extraPointSpot: 15,
  twoPointSpot: 2,
  runoffSecondsPer15: 28,
  overtime: { enabled: true, allowTie: true, lengthRatio: 2 / 3 },
  penaltiesEnabled: true,
};

export const PLAYOFF_RULES = (base: RulesConfig): RulesConfig => ({
  ...base,
  overtime: { ...base.overtime, enabled: true, allowTie: false },
});

export const runoffSeconds = (r: RulesConfig): number => Math.max(2, Math.round((r.runoffSecondsPer15 * r.quarterMinutes) / 15));
export const quarterSeconds = (r: RulesConfig): number => Math.round(r.quarterMinutes * 60);
export const overtimeSeconds = (r: RulesConfig): number => Math.round(quarterSeconds(r) * r.overtime.lengthRatio);
