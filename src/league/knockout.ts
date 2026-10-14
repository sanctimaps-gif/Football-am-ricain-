import { computeStandings, sortStandings, type PlayoffGame, type ScheduledGame } from './schedule';

/** Nom du tour selon le nombre d'équipes encore en lice. */
export function roundName(teams: number): string {
  if (teams <= 2) return 'Finale';
  if (teams <= 4) return 'Demi-finale';
  if (teams <= 8) return 'Quart de finale';
  if (teams <= 16) return 'Huitième de finale';
  return `Tour à ${teams}`;
}

/** Ordre de tableau classique (1 contre N, les deux meilleurs ne se croisent qu'en finale). */
export function bracketOrder(n: number): number[] {
  let order = [1];
  while (order.length < n) {
    const size = order.length * 2;
    order = order.flatMap((s) => [s, size + 1 - s]);
  }
  return order;
}

function game(id: string, round: number, home: string, away: string, label: string): PlayoffGame {
  return { id, round, home, away, played: false, score: null, winner: null, label };
}

/** Premier tour d'un tableau à élimination directe à partir d'une liste de têtes de série (puissance de 2). */
export function seededKnockout(seeds: string[]): PlayoffGame[] {
  const n = seeds.length;
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error('Le tableau doit compter 2, 4, 8, 16 ou 32 équipes');
  const order = bracketOrder(n);
  const games: PlayoffGame[] = [];
  for (let i = 0; i < n; i += 2) {
    const id = n === 2 ? 'final' : `ko1-${i / 2}`;
    games.push(game(id, 1, seeds[order[i] - 1], seeds[order[i + 1] - 1], roundName(n)));
  }
  return games;
}

/** Tableau constitué de paires déjà formées (ex. A1–B2, B1–A2 après une phase de groupes). */
export function pairedKnockout(pairs: [string, string][]): PlayoffGame[] {
  const n = pairs.length * 2;
  return pairs.map(([h, a], i) => game(n === 2 ? 'final' : `ko1-${i}`, 1, h, a, roundName(n)));
}

/**
 * Tour suivant : les vainqueurs des matchs 2k et 2k+1 du dernier tour se rencontrent.
 * Renvoie une liste vide si le tour n'est pas terminé ou si la finale est jouée.
 */
export function nextKnockoutRound(games: PlayoffGame[]): PlayoffGame[] {
  if (!games.length) return [];
  const maxRound = Math.max(...games.map((g) => g.round));
  const cur = games.filter((g) => g.round === maxRound);
  if (cur.some((g) => !g.played) || cur.length < 2) return [];
  const out: PlayoffGame[] = [];
  const teams = cur.length;
  for (let i = 0; i < cur.length; i += 2) {
    const id = teams === 2 ? 'final' : `ko${maxRound + 1}-${i / 2}`;
    out.push(game(id, maxRound + 1, cur[i].winner!, cur[i + 1].winner!, roundName(teams)));
  }
  return out;
}

/** Plus grande puissance de 2 inférieure ou égale à n. */
export const pow2Floor = (n: number): number => 2 ** Math.floor(Math.log2(Math.max(2, n)));

/**
 * Tableau final après une phase de groupes : le 1er d'un groupe affronte le 2e du groupe voisin
 * (2 groupes : A1–B2, B1–A2 ; 4 groupes : A1–B2, C1–D2, B1–A2, D1–C2).
 */
export function knockoutFromGroups(groups: string[][], schedule: ScheduledGame[][]): PlayoffGame[] {
  const ranked = groups.map((g) => sortStandings(computeStandings(g.map((id) => ({ id, conference: 0 as const })), schedule), schedule).map((r) => r.teamId));
  const pairs: [string, string][] = [];
  if (ranked.length === 1) pairs.push([ranked[0][0], ranked[0][1]]);
  else if (ranked.length === 2) pairs.push([ranked[0][0], ranked[1][1]], [ranked[1][0], ranked[0][1]]);
  else {
    for (let i = 0; i < ranked.length; i += 2) pairs.push([ranked[i][0], ranked[i + 1][1]]);
    for (let i = 0; i < ranked.length; i += 2) pairs.push([ranked[i + 1][0], ranked[i][1]]);
  }
  return pairedKnockout(pairs);
}
