export interface TeamStats {
  firstDowns: number;
  totalYards: number;
  passAtt: number;
  passComp: number;
  passYds: number;
  passTD: number;
  rushAtt: number;
  rushYds: number;
  rushTD: number;
  sacks: number; // sacks subis
  interceptionsThrown: number;
  fumblesLost: number;
  penalties: number;
  penaltyYds: number;
  punts: number;
  fgMade: number;
  fgAtt: number;
  xpMade: number;
  xpAtt: number;
  twoPtMade: number;
  twoPtAtt: number;
  thirdDownAtt: number;
  thirdDownConv: number;
  timeOfPossession: number;
}

export interface PlayerGameStats {
  passAtt: number; passComp: number; passYds: number; passTD: number; passInt: number;
  rushAtt: number; rushYds: number; rushTD: number;
  rec: number; recYds: number; recTD: number;
  tackles: number; tfl: number; sacks: number; ints: number; passDefl: number; ff: number;
  fgm: number; fga: number; xpm: number; xpa: number;
  kickRetYds: number;
}

export const emptyTeamStats = (): TeamStats => ({
  firstDowns: 0, totalYards: 0, passAtt: 0, passComp: 0, passYds: 0, passTD: 0, rushAtt: 0, rushYds: 0, rushTD: 0,
  sacks: 0, interceptionsThrown: 0, fumblesLost: 0, penalties: 0, penaltyYds: 0, punts: 0, fgMade: 0, fgAtt: 0,
  xpMade: 0, xpAtt: 0, twoPtMade: 0, twoPtAtt: 0, thirdDownAtt: 0, thirdDownConv: 0, timeOfPossession: 0,
});

export const emptyPlayerStats = (): PlayerGameStats => ({
  passAtt: 0, passComp: 0, passYds: 0, passTD: 0, passInt: 0, rushAtt: 0, rushYds: 0, rushTD: 0,
  rec: 0, recYds: 0, recTD: 0, tackles: 0, tfl: 0, sacks: 0, ints: 0, passDefl: 0, ff: 0, fgm: 0, fga: 0, xpm: 0, xpa: 0, kickRetYds: 0,
});

/** Événements statistiques émis par la simulation d'une action. Ils ne sont comptabilisés que si l'action est validée. */
export type StatEvent =
  | { kind: 'passAtt'; passer: string }
  | { kind: 'completion'; passer: string; receiver: string; yards: number }
  | { kind: 'rush'; runner: string; yards: number }
  | { kind: 'sack'; qb: string; by: string | null; yards: number }
  | { kind: 'tackle'; by: string; forLoss?: boolean }
  | { kind: 'forcedFumble'; by: string }
  | { kind: 'interception'; passer: string; by: string }
  | { kind: 'passDefl'; by: string }
  | { kind: 'fumbleLost'; by: string }
  | { kind: 'kick'; kicker: string; fieldGoal: boolean; good: boolean }
  | { kind: 'kickReturn'; returner: string; yards: number }
  | { kind: 'touchdown'; scorer: string; passer?: string; via: 'rush' | 'pass' | 'return' };

/** Score « joueur du match ». */
export function playerImpact(s: PlayerGameStats): number {
  return (
    s.passYds * 0.04 + s.passTD * 4 - s.passInt * 3 + s.rushYds * 0.1 + s.rushTD * 6 + s.recYds * 0.1 + s.recTD * 6 +
    s.rec * 0.5 + s.tackles * 1 + (s.tfl ?? 0) * 1 + (s.ff ?? 0) * 3 + s.sacks * 3 + s.ints * 5 + s.passDefl * 1 + s.fgm * 3 + s.kickRetYds * 0.04
  );
}
