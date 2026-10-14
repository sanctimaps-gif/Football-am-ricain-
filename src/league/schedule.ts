import { Rng } from '../core/rng';

export interface ScheduledGame {
  id: string;
  week: number;
  home: string;
  away: string;
  played: boolean;
  score: [number, number] | null;
  overtime: boolean;
  /** Match joué par l'utilisateur (sinon simulé). */
  userPlayed?: boolean;
}

/**
 * Calendrier en round-robin (méthode du cercle), limité à `weeks` journées.
 * Chaque équipe joue au plus un match par semaine ; alternance domicile/extérieur.
 */
export function roundRobin(teamIds: string[], weeks: number, seed = 1): ScheduledGame[][] {
  const rng = new Rng(seed);
  const ids = rng.shuffle([...teamIds]);
  if (ids.length % 2 === 1) ids.push('__bye');
  const n = ids.length;
  const rounds: ScheduledGame[][] = [];
  const fixed = ids[0];
  let rot = ids.slice(1);
  const totalRounds = n - 1;
  const homeCount = new Map<string, number>();
  const lastHome = new Map<string, boolean>();
  for (let r = 0; r < Math.min(weeks, totalRounds * 2); r++) {
    const arr = [fixed, ...rot];
    const games: ScheduledGame[] = [];
    for (let i = 0; i < n / 2; i++) {
      let a = arr[i];
      let b = arr[n - 1 - i];
      if (a === '__bye' || b === '__bye') continue;
      // équilibre domicile/extérieur : l'équipe qui a le moins reçu joue à domicile
      const ha = homeCount.get(a) ?? 0;
      const hb = homeCount.get(b) ?? 0;
      if (hb < ha || (hb === ha && (lastHome.get(a) ?? rng.chance(0.5)))) [a, b] = [b, a];
      homeCount.set(a, (homeCount.get(a) ?? 0) + 1);
      lastHome.set(a, true);
      lastHome.set(b, false);
      games.push({ id: `w${r + 1}-${a}-${b}`, week: r + 1, home: a, away: b, played: false, score: null, overtime: false });
    }
    rounds.push(games);
    rot = [rot[rot.length - 1], ...rot.slice(0, -1)];
  }
  return rounds;
}

export interface StandingRow {
  teamId: string;
  conference: 0 | 1;
  w: number;
  l: number;
  t: number;
  pf: number;
  pa: number;
  confW: number;
  streak: string;
}

export const winPct = (r: StandingRow): number => (r.w + r.t * 0.5) / Math.max(1, r.w + r.l + r.t);

export function computeStandings(teams: { id: string; conference: 0 | 1 }[], schedule: ScheduledGame[][]): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  const confOf = new Map(teams.map((t) => [t.id, t.conference]));
  for (const t of teams) rows.set(t.id, { teamId: t.id, conference: t.conference, w: 0, l: 0, t: 0, pf: 0, pa: 0, confW: 0, streak: '' });
  for (const week of schedule) {
    for (const g of week) {
      if (!g.played || !g.score) continue;
      const h = rows.get(g.home);
      const a = rows.get(g.away);
      if (!h || !a) continue;
      const [hs, as] = g.score;
      h.pf += hs;
      h.pa += as;
      a.pf += as;
      a.pa += hs;
      const sameConf = confOf.get(g.home) === confOf.get(g.away);
      if (hs > as) {
        h.w++;
        a.l++;
        if (sameConf) h.confW++;
        h.streak = streak(h.streak, 'V');
        a.streak = streak(a.streak, 'D');
      } else if (as > hs) {
        a.w++;
        h.l++;
        if (sameConf) a.confW++;
        a.streak = streak(a.streak, 'V');
        h.streak = streak(h.streak, 'D');
      } else {
        h.t++;
        a.t++;
        h.streak = streak(h.streak, 'N');
        a.streak = streak(a.streak, 'N');
      }
    }
  }
  return [...rows.values()];
}

function streak(cur: string, r: string): string {
  if (cur.startsWith(r)) return `${r}${Number(cur.slice(1)) + 1}`;
  return `${r}1`;
}

/**
 * Tri du classement : % de victoires, puis confrontation directe (si deux équipes), différence de points, points marqués.
 */
export function sortStandings(rows: StandingRow[], schedule: ScheduledGame[][]): StandingRow[] {
  const h2h = (a: string, b: string): number => {
    let s = 0;
    for (const w of schedule) for (const g of w) {
      if (!g.played || !g.score) continue;
      if (g.home === a && g.away === b) s += Math.sign(g.score[0] - g.score[1]);
      if (g.home === b && g.away === a) s += Math.sign(g.score[1] - g.score[0]);
    }
    return s;
  };
  return [...rows].sort((x, y) => {
    const d = winPct(y) - winPct(x);
    if (Math.abs(d) > 1e-9) return d;
    const hh = h2h(y.teamId, x.teamId);
    if (hh !== 0) return hh;
    const pd = y.pf - y.pa - (x.pf - x.pa);
    if (pd !== 0) return pd;
    return y.pf - x.pf || x.teamId.localeCompare(y.teamId);
  });
}

export interface PlayoffGame {
  id: string;
  round: number;
  home: string;
  away: string;
  played: boolean;
  score: [number, number] | null;
  winner: string | null;
  label: string;
}

/** Tableau : top N de chaque conférence ; demi-finales et finales de conférence, puis finale du championnat. */
export function seedPlayoffs(standings: StandingRow[], schedule: ScheduledGame[][], perConf: 2 | 4): PlayoffGame[] {
  const games: PlayoffGame[] = [];
  for (const conf of [0, 1] as const) {
    const seeds = sortStandings(standings.filter((r) => r.conference === conf), schedule).slice(0, perConf).map((r) => r.teamId);
    if (perConf === 4) {
      games.push({ id: `c${conf}-sf1`, round: 1, home: seeds[0], away: seeds[3], played: false, score: null, winner: null, label: `Demi-finale de conférence ${conf + 1}` });
      games.push({ id: `c${conf}-sf2`, round: 1, home: seeds[1], away: seeds[2], played: false, score: null, winner: null, label: `Demi-finale de conférence ${conf + 1}` });
    } else {
      games.push({ id: `c${conf}-f`, round: 1, home: seeds[0], away: seeds[1], played: false, score: null, winner: null, label: `Finale de conférence ${conf + 1}` });
    }
  }
  return games;
}

/** Génère le tour suivant quand le tour courant est terminé. Renvoie les nouveaux matchs (vide si rien à créer). */
export function advancePlayoffs(games: PlayoffGame[], seedOrder: string[]): PlayoffGame[] {
  const maxRound = Math.max(...games.map((g) => g.round));
  const cur = games.filter((g) => g.round === maxRound);
  if (cur.some((g) => !g.played)) return [];
  const rank = (id: string) => seedOrder.indexOf(id);
  const better = (a: string, b: string) => (rank(a) <= rank(b) ? [a, b] : [b, a]);
  if (cur.length === 4) {
    const out: PlayoffGame[] = [];
    for (const conf of [0, 1]) {
      const ws = cur.filter((g) => g.id.startsWith(`c${conf}-`)).map((g) => g.winner!);
      const [h, a] = better(ws[0], ws[1]);
      out.push({ id: `c${conf}-f`, round: maxRound + 1, home: h, away: a, played: false, score: null, winner: null, label: `Finale de conférence ${conf + 1}` });
    }
    return out;
  }
  if (cur.length === 2) {
    const [h, a] = better(cur[0].winner!, cur[1].winner!);
    return [{ id: 'final', round: maxRound + 1, home: h, away: a, played: false, score: null, winner: null, label: 'Finale du championnat' }];
  }
  return [];
}
