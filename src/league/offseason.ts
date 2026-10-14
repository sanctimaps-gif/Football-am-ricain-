import { Rng } from '../core/rng';
import { buildDepthChart, generatePlayer, salaryFor } from '../data/generator';
import { overall, overallFor } from '../data/ratings';
import { ALL_POSITIONS, fullName, type Attributes, type Player, type Position, type Team } from '../data/types';
import { roundRobin } from './schedule';
import { seasonMvp, standings, teamById } from './league';
import { POSITION_NEEDS, ROSTER_MIN, type League } from './types';

/** Attributs qui progressent selon le poste. */
const GROWTH: Record<Position, (keyof Attributes)[]> = {
  QB: ['throwAccuracy', 'throwPower', 'awareness'], RB: ['speed', 'agility', 'strength', 'catching'], FB: ['blocking', 'strength'],
  WR: ['catching', 'speed', 'agility'], TE: ['catching', 'blocking', 'strength'], C: ['blocking', 'strength', 'awareness'],
  OG: ['blocking', 'strength'], OT: ['blocking', 'strength', 'agility'], DE: ['strength', 'tackling', 'speed'],
  DT: ['strength', 'tackling'], LB: ['tackling', 'awareness', 'speed'], CB: ['speed', 'agility', 'awareness', 'catching'],
  FS: ['awareness', 'speed', 'tackling'], SS: ['tackling', 'awareness'], K: ['kickPower', 'kickAccuracy'], P: ['kickPower', 'kickAccuracy'],
};

export const growthAttrs = (pos: Position): (keyof Attributes)[] => GROWTH[pos];

/** Progression ou déclin d'un joueur en fin de saison (âge, potentiel, expérience, installations). */
export function developPlayer(p: Player, rng: Rng, trainingLevel: number): number {
  const before = overall(p);
  const age = p.age;
  let delta: number;
  if (age <= 24) delta = rng.range(1, 4.5);
  else if (age <= 28) delta = rng.range(0, 2.5);
  else if (age <= 31) delta = rng.range(-1.5, 1);
  else delta = rng.range(-4, -0.5);
  delta += Math.min(3, p.xp / 120) + (trainingLevel - 2) * 0.5;
  const room = p.potential - before;
  if (delta > 0) delta = Math.min(delta, Math.max(0.3, room));
  const keys = GROWTH[p.position];
  for (const k of keys) p.attrs[k] = Math.max(20, Math.min(99, Math.round(p.attrs[k] + delta * rng.range(0.6, 1.4))));
  if (age >= 30) {
    p.attrs.speed = Math.max(20, p.attrs.speed - rng.int(0, 2));
    p.attrs.acceleration = Math.max(20, p.attrs.acceleration - rng.int(0, 2));
  }
  p.xp = 0;
  p.age++;
  return overall(p) - before;
}

export function generateDraftClass(l: League, size: number): Player[] {
  const rng = new Rng(l.seed + l.season * 333);
  const out: Player[] = [];
  const used = new Set<number>();
  const positions: Position[] = [];
  for (const pos of ALL_POSITIONS) for (let i = 0; i < Math.max(1, Math.round(POSITION_NEEDS[pos] / 2)); i++) positions.push(pos);
  for (let i = 0; i < size; i++) {
    const pos = positions[i % positions.length];
    const q = rng.range(0.78, 0.98);
    const p = generatePlayer(rng, pos, q, `dr${l.season}-${l.nextPlayerId++}`, used);
    p.age = rng.int(21, 23);
    p.potential = Math.min(99, overall(p) + rng.int(4, 22));
    p.contract = { salary: Math.max(750, Math.round(salaryFor(overall(p), pos) * 0.6)), years: 3 };
    used.delete(p.number);
    out.push(p);
  }
  return out.sort((a, b) => scoutValue(b) - scoutValue(a));
}

export const scoutValue = (p: Player): number => overall(p) * 0.6 + p.potential * 0.4 - Math.max(0, p.age - 24) * 1.5;

/** Fin de saison : bilan, récompenses, finances, coach, progression, contrats, retraites, draft. */
export function endSeason(l: League): string[] {
  const report: string[] = [];
  const rng = new Rng(l.seed + l.season * 17);
  const st = standings(l);
  const userRow = st.find((r) => r.teamId === l.userTeamId);
  const finalGame = l.playoffs.find((g) => g.id === 'final');
  const mvp = seasonMvp(l);
  l.history.unshift({
    season: l.season,
    champion: l.champion ?? '',
    runnerUp: finalGame ? (finalGame.winner === finalGame.home ? finalGame.away : finalGame.home) : '',
    mvp: mvp ? { id: mvp.player.id, name: fullName(mvp.player), teamId: mvp.team.id } : null,
    userRecord: userRow ? { w: userRow.w, l: userRow.l, t: userRow.t } : null,
  });
  if (mvp) report.push(`MVP de la saison : ${fullName(mvp.player)} (${mvp.team.abbr})`);
  // records de saison
  for (const t of l.teams) for (const p of t.roster) {
    const s = l.seasonStats[p.id];
    if (!s) continue;
    if (!l.records.passYdsSeason || s.passYds > l.records.passYdsSeason.value) l.records.passYdsSeason = { value: s.passYds, name: fullName(p), season: l.season };
    if (!l.records.rushYdsSeason || s.rushYds > l.records.rushYdsSeason.value) l.records.rushYdsSeason = { value: s.rushYds, name: fullName(p), season: l.season };
    p.history.push({ ...s });
  }
  for (const r of st) if (!l.records.bestSeason || r.w > l.records.bestSeason.w) l.records.bestSeason = { w: r.w, teamId: r.teamId, season: l.season };
  // évaluation du coach par la direction
  if (l.coach && userRow) {
    const madePlayoffs = l.playoffs.some((g) => g.home === l.userTeamId || g.away === l.userTeamId);
    const champion = l.champion === l.userTeamId;
    const diff = userRow.w - l.coach.objectives.wins;
    l.coach.security = Math.max(0, Math.min(100, l.coach.security + diff * 9 + (madePlayoffs ? 10 : -5) + (champion ? 30 : 0) - (l.coach.objectives.playoffs && !madePlayoffs ? 20 : 0)));
    l.coach.reputation = Math.max(0, Math.min(100, l.coach.reputation + diff * 3 + (madePlayoffs ? 5 : 0) + (champion ? 15 : 0)));
    l.coach.seasons.push({ season: l.season, teamId: l.userTeamId, w: userRow.w, l: userRow.l, t: userRow.t, playoffs: madePlayoffs, champion });
    report.push(`Confiance de la direction : ${Math.round(l.coach.security)}/100 · Réputation : ${Math.round(l.coach.reputation)}/100`);
    if (l.coach.security < 15 && l.mode === 'coach') {
      l.coach.fired = true;
      report.push('❌ La direction vous a licencié. Choisissez un nouveau club parmi les offres.');
    }
    l.coach.objectives = { wins: Math.min(l.weeks, Math.ceil(l.weeks * (0.4 + l.coach.reputation / 250))), playoffs: l.coach.reputation > 60 };
  }
  // finances de fin de saison
  for (const t of l.teams) {
    const f = l.finances[t.id];
    if (!f) continue;
    if (t.id === l.userTeamId) report.push(`Finances : recettes ${Math.round(f.seasonRevenue / 1000)} M$, dépenses ${Math.round(f.seasonExpenses / 1000)} M$, trésorerie ${Math.round(f.cash / 1000)} M$`);
    f.seasonRevenue = 0;
    f.seasonExpenses = 0;
    if (t.id !== l.userTeamId) f.cash = Math.max(f.cash, 30000);
  }
  // progression, contrats et retraites
  const retired: string[] = [];
  for (const t of l.teams) {
    const training = l.finances[t.id]?.facilities.training ?? 2;
    for (const p of [...t.roster]) {
      const d = developPlayer(p, rng, training);
      if (t.id === l.userTeamId && Math.abs(d) >= 3) report.push(`${d > 0 ? '📈' : '📉'} ${fullName(p)} (${p.position}) ${d > 0 ? '+' : ''}${d} GÉN`);
      p.contract.years--;
      p.injuryWeeks = 0;
      const retire = (p.age >= 35 && rng.chance(0.6)) || (p.age >= 33 && overall(p) < 60 && rng.chance(0.5));
      if (retire && !p.isUserCreated) {
        t.roster.splice(t.roster.indexOf(p), 1);
        retired.push(`${fullName(p)} (${t.abbr})`);
        continue;
      }
      if (p.contract.years <= 0) {
        const keep = t.id !== l.userTeamId && overall(p) >= 62 && rng.chance(0.75);
        if (keep || p.isUserCreated) p.contract = { salary: salaryFor(overall(p), p.position), years: rng.int(1, 4) };
        else {
          t.roster.splice(t.roster.indexOf(p), 1);
          p.contract = { salary: salaryFor(overall(p), p.position), years: rng.int(1, 3) };
          l.freeAgents.push(p);
          if (t.id === l.userTeamId) report.push(`Fin de contrat : ${fullName(p)} devient agent libre.`);
        }
      }
    }
    t.depth = buildDepthChart(t.roster);
  }
  if (retired.length) report.push(`Retraites : ${retired.slice(0, 6).join(', ')}${retired.length > 6 ? '…' : ''}`);
  // draft : ordre inverse du classement (le champion choisit en dernier)
  const order = [...st].reverse().map((r) => r.teamId);
  if (l.champion) {
    order.splice(order.indexOf(l.champion), 1);
    order.push(l.champion);
  }
  l.draftOrder = order;
  l.draftPick = 0;
  l.draftClass = generateDraftClass(l, l.teams.length * l.draftRounds + 12);
  l.phase = 'draft';
  return report;
}

/** Équipe qui choisit au rang actuel de la draft. */
export const draftOnClock = (l: League): string | null => {
  const total = l.draftOrder.length * l.draftRounds;
  if (l.draftPick >= total) return null;
  const round = Math.floor(l.draftPick / l.draftOrder.length);
  const idx = l.draftPick % l.draftOrder.length;
  // ordre serpentin sur les tours pairs
  return round % 2 === 0 ? l.draftOrder[idx] : l.draftOrder[l.draftOrder.length - 1 - idx];
};

/** Besoin d'un poste dans un effectif (pour les choix de l'IA). */
export function needScore(team: Team, pos: Position): number {
  const have = team.roster.filter((p) => p.position === pos);
  const shortage = POSITION_NEEDS[pos] - have.length;
  const bestOvr = have.length ? Math.max(...have.map((p) => overallFor(p.attrs, pos))) : 40;
  return shortage * 6 + (75 - bestOvr) * 0.4;
}

export function draftPlayer(l: League, teamId: string, playerId: string): Player {
  const i = l.draftClass.findIndex((p) => p.id === playerId);
  if (i < 0) throw new Error('Joueur indisponible');
  const p = l.draftClass.splice(i, 1)[0];
  const t = teamById(l, teamId);
  const used = new Set(t.roster.map((x) => x.number));
  while (used.has(p.number)) p.number = (p.number % 99) + 1;
  t.roster.push(p);
  t.depth = buildDepthChart(t.roster);
  const round = Math.floor(l.draftPick / l.draftOrder.length) + 1;
  l.news.unshift(`Draft (tour ${round}) : ${t.abbr} choisit ${fullName(p)} (${p.position}, GÉN ${overall(p)}).`);
  l.draftPick++;
  return p;
}

/** L'IA choisit jusqu'à ce que ce soit le tour de l'utilisateur (ou fin de draft). */
export function runAiDraft(l: League, stopAtUser = true): void {
  let guard = 0;
  while (guard++ < 500) {
    const team = draftOnClock(l);
    if (!team) return;
    if (stopAtUser && team === l.userTeamId) return;
    const t = teamById(l, team);
    const pick = [...l.draftClass].sort((a, b) => scoutValue(b) + needScore(t, b.position) - (scoutValue(a) + needScore(t, a.position)))[0];
    if (!pick) return;
    draftPlayer(l, team, pick.id);
  }
}

/** Nouvelle saison : complète les effectifs, régénère le calendrier. */
export function startNewSeason(l: League): void {
  const rng = new Rng(l.seed + l.season * 55);
  // les équipes IA complètent leur effectif avec des agents libres
  for (const t of l.teams) {
    if (t.id === l.userTeamId) continue;
    trimRoster(t);
    while (t.roster.length < ROSTER_MIN + 4 && l.freeAgents.length) {
      const pos = [...ALL_POSITIONS].sort((a, b) => needScore(t, b) - needScore(t, a))[0];
      const cand = l.freeAgents.filter((p) => p.position === pos).sort((a, b) => overall(b) - overall(a))[0] ?? l.freeAgents.sort((a, b) => overall(b) - overall(a))[0];
      l.freeAgents.splice(l.freeAgents.indexOf(cand), 1);
      t.roster.push(cand);
    }
    t.depth = buildDepthChart(t.roster);
  }
  // agents libres générés si besoin pour garder un marché
  const used = new Set<number>();
  while (l.freeAgents.length < 30) {
    const pos = rng.pick(ALL_POSITIONS);
    const p = generatePlayer(rng, pos, rng.range(0.82, 0.95), `fa${l.season}-${l.nextPlayerId++}`, used);
    used.delete(p.number);
    l.freeAgents.push(p);
  }
  l.draftClass = [];
  l.season++;
  l.week = 1;
  l.phase = 'regular';
  l.champion = null;
  l.playoffs = [];
  l.seasonStats = {};
  l.schedule = roundRobin(l.teams.map((t) => t.id), l.weeks, l.seed + l.season);
  l.news.unshift(`Début de la saison ${l.season}.`);
  l.news = l.news.slice(0, 40);
}

/** Retire les joueurs les plus faibles si l'effectif dépasse le maximum (équipes IA). */
export function trimRoster(t: Team, max = 53): void {
  while (t.roster.length > max) {
    const counts = new Map<Position, number>();
    for (const p of t.roster) counts.set(p.position, (counts.get(p.position) ?? 0) + 1);
    const candidates = t.roster.filter((p) => (counts.get(p.position) ?? 0) > POSITION_NEEDS[p.position] && !p.isUserCreated);
    const worst = (candidates.length ? candidates : t.roster.filter((p) => !p.isUserCreated)).sort((a, b) => overall(a) - overall(b))[0];
    if (!worst) return;
    t.roster.splice(t.roster.indexOf(worst), 1);
  }
}
