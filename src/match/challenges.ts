import { Rng } from '../core/rng';
import { ALL_CLUBS } from '../data/world';
import type { GameState, Side } from '../rules/types';

/**
 * Défis « Moment » : une situation de fin de match à renverser. Tous les défis se jouent en quarts-temps de
 * 15 min (chrono réel) et sont gagnés si l'utilisateur remporte le match. Les étoiles dépendent de la difficulté.
 */
export interface Challenge {
  id: string;
  icon: string;
  title: string;
  desc: string;
  /** Groupe d'équipes (ligue ou « nations », vide = déduit de l'id) et identifiants des équipes à domicile / à l'extérieur. */
  group: string;
  home: string;
  away: string;
  userSide: Side;
  quarter: number;
  clock: number;
  score: [number, number];
  /** Équipe qui a le ballon. */
  possession: 'user' | 'cpu';
  /** Position du ballon, en yards depuis la ligne de but de l'équipe qui attaque. */
  ballOn: number;
  down: number;
  toGo: number;
  timeouts: [number, number];
  /** Événement de la semaine (renouvelé chaque semaine). */
  weekly?: boolean;
}

export const CHALLENGES: Challenge[] = [
  { id: 'drive', icon: '⏱️', title: 'Le drive de la victoire', desc: 'Menés de 4 points, 1:52 à jouer, ballon sur vos 25 yards. Il faut un touchdown.', group: 'usa', home: 'us-kcr', away: 'us-buf', userSide: 0, quarter: 4, clock: 112, score: [20, 24], possession: 'user', ballOn: 25, down: 1, toGo: 10, timeouts: [2, 3] },
  { id: 'goalLine', icon: '🧱', title: 'Tenir la ligne de but', desc: '4 points d’avance, l’adversaire a un 1st & goal sur vos 4 yards, 0:38 à jouer.', group: 'usa', home: 'us-phi', away: 'us-dal', userSide: 0, quarter: 4, clock: 38, score: [27, 23], possession: 'cpu', ballOn: 96, down: 1, toGo: 4, timeouts: [1, 1] },
  { id: 'kick', icon: '🦶', title: 'Le coup de pied de la gagne', desc: 'Égalité 17-17, 0:09 à jouer, 4th & 7 sur les 28 yards adverses.', group: 'usa', home: 'us-gbg', away: 'us-chi', userSide: 0, quarter: 4, clock: 9, score: [17, 17], possession: 'user', ballOn: 72, down: 4, toGo: 7, timeouts: [0, 2] },
  { id: 'comeback', icon: '🔥', title: 'Remontée fantastique', desc: 'Menés 14-28, 5:00 à jouer, ballon sur vos 20 yards. Deux touchdowns nécessaires.', group: 'usa', home: 'us-det', away: 'us-sfr', userSide: 0, quarter: 4, clock: 300, score: [14, 28], possession: 'user', ballOn: 20, down: 1, toGo: 10, timeouts: [3, 3] },
  { id: 'noTimeout', icon: '🚫', title: 'Sans temps mort', desc: 'Menés 10-13, 0:58 à jouer, aucun temps mort, ballon sur vos 35 yards.', group: 'eur', home: 'eu-mad', away: 'eu-ber', userSide: 0, quarter: 4, clock: 58, score: [10, 13], possession: 'user', ballOn: 35, down: 1, toGo: 10, timeouts: [0, 2] },
  { id: 'closeOut', icon: '🔒', title: 'Fermer le match', desc: '4 points d’avance, 2:40 à jouer : empêchez l’adversaire de marquer depuis ses 30 yards.', group: 'asi', home: 'as-tky', away: 'as-osk', userSide: 0, quarter: 4, clock: 160, score: [24, 20], possession: 'cpu', ballOn: 30, down: 1, toGo: 10, timeouts: [2, 3] },
  { id: 'nations', icon: '🌍', title: 'Finale de la Coupe des Nations', desc: 'La France est menée 21-24 par les États-Unis, 3:10 à jouer, ballon sur ses 40 yards.', group: 'nations', home: 'nt-usa', away: 'nt-fra', userSide: 1, quarter: 4, clock: 190, score: [24, 21], possession: 'user', ballOn: 40, down: 1, toGo: 10, timeouts: [2, 3] },
  { id: 'womenFinal', icon: '♀️', title: 'Finale de la Coupe du monde féminine', desc: 'Le Canada mène 17-14 face aux États-Unis : 1:25 à jouer, ballon sur les 30 yards américains.', group: 'nationsF', home: 'ntw-can', away: 'ntw-usa', userSide: 1, quarter: 4, clock: 85, score: [17, 14], possession: 'user', ballOn: 30, down: 1, toGo: 10, timeouts: [1, 2] },
  { id: 'underdog', icon: '🐜', title: 'L’exploit du petit poucet', desc: 'Nantes, plus faible, est mené 17-21 par Toulouse : 4:20 à jouer depuis ses 15 yards.', group: 'fra', home: 'tls', away: 'nts', userSide: 1, quarter: 4, clock: 260, score: [21, 17], possession: 'user', ballOn: 15, down: 1, toGo: 10, timeouts: [3, 3] },
];

/** Numéro de semaine (depuis 1970) pour l'événement hebdomadaire. */
export const weekNumber = (now = Date.now()): number => Math.floor(now / (7 * 24 * 3600 * 1000));

/** Événement de la semaine : une situation tirée au sort, la même pour tout le monde pendant une semaine. */
export function weeklyChallenge(week = weekNumber()): Challenge {
  const rng = new Rng(week * 7919 + 13);
  const clubs = ALL_CLUBS;
  const a = rng.pick(clubs);
  let b = rng.pick(clubs);
  while (b.id === a.id) b = rng.pick(clubs);
  const behind = rng.pick([3, 4, 6, 7, 8]);
  const clock = rng.int(50, 200);
  const ballOn = rng.int(15, 45);
  const base = rng.int(10, 24);
  return {
    id: `week-${week}`, icon: '📅', title: 'Événement de la semaine', weekly: true,
    desc: `${a.city} ${a.name} est mené de ${behind} points par ${b.city} ${b.name} : ${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')} à jouer, ballon sur ses ${ballOn} yards.`,
    group: '', home: b.id, away: a.id, userSide: 1, quarter: 4, clock,
    score: [base + behind, base], possession: 'user', ballOn, down: 1, toGo: 10, timeouts: [rng.int(1, 3), rng.int(0, 3)],
  };
}

/** Applique la situation du défi à l'état du match (côté utilisateur = c.userSide). */
export function applyChallenge(c: Challenge, s: GameState): void {
  s.quarter = c.quarter;
  s.clock = c.clock;
  s.score = [c.score[0], c.score[1]];
  s.possession = c.possession === 'user' ? c.userSide : ((1 - c.userSide) as Side);
  s.ballOn = c.ballOn;
  s.down = c.down;
  s.toGo = Math.min(c.toGo, 100 - c.ballOn);
  s.timeouts = [c.timeouts[0], c.timeouts[1]];
  s.nextKind = 'scrimmage';
  s.clockRunning = false;
  s.needsCoinToss = false;
  s.finished = false;
  if (c.clock <= 120 && (c.quarter === 2 || c.quarter === 4)) s.twoMinuteWarned = [c.quarter === 2, c.quarter === 4];
}

/** Défi réussi ? (victoire de l'utilisateur) */
export const challengeWon = (c: Challenge, s: GameState): boolean => s.finished && s.winner === c.userSide;

export const STARS: Record<'easy' | 'normal' | 'hard', number> = { easy: 1, normal: 2, hard: 3 };
