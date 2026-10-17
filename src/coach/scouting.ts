import { FIRST_NAMES, FIRST_NAMES_F, LAST_NAMES } from '../data/names';
import { overall } from '../data/ratings';
import type { Player, Position, Team } from '../data/types';
import { DEFAULT_GAMEPLAN, type GamePlan } from '../ai/playcaller';
import type { ScheduledGame } from '../league/schedule';
import { playName } from './academy';

/**
 * Rapport de l'entraîneur adjoint sur l'adversaire, reçu avant chaque match (façon « aperçu du match suivant »).
 * Tout est déduit des données : effectif, plan de jeu de l'IA, derniers résultats.
 */

export type UnitKey = 'pass' | 'run' | 'oline' | 'rush' | 'cover' | 'kick';

export interface UnitRating {
  key: UnitKey;
  label: string;
  value: number;
}

export interface Advice {
  text: string;
  /** Tactique conseillée (identifiant du playbook). */
  play: string;
  /** L'entraîneur l'a-t-il déjà apprise ? */
  unlocked: boolean;
}

export interface ScoutReport {
  coachName: string;
  /** Derniers résultats, du plus ancien au plus récent : V, N ou D. */
  form: ('V' | 'N' | 'D')[];
  units: UnitRating[];
  /** Style de jeu attendu (phrases). */
  style: string[];
  keyPlayers: { player: Player; ovr: number }[];
  strengths: string[];
  weaknesses: string[];
  advice: Advice[];
  /** Phrase d'ensemble de l'adjoint (comparaison des deux équipes). */
  verdict: string;
}

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Nom (fictif, stable) de l'entraîneur d'une équipe. */
export function coachNameFor(team: Team): string {
  const h = hash(team.id + ':coach');
  const women = team.roster.length > 0 && team.roster.every((p) => p.appearance.female);
  const firsts = women ? FIRST_NAMES_F : FIRST_NAMES;
  return `${firsts[h % firsts.length]} ${LAST_NAMES[(h >>> 8) % LAST_NAMES.length].toUpperCase()}`;
}

/** Titulaires d'un poste selon la profondeur. */
function starters(team: Team, pos: Position, n: number): Player[] {
  const byId = new Map(team.roster.map((p) => [p.id, p]));
  const ids = team.depth[pos] ?? [];
  const list = ids.map((id) => byId.get(id)).filter((p): p is Player => !!p && p.injuryWeeks <= 0);
  const rest = team.roster.filter((p) => p.position === pos && !list.includes(p) && p.injuryWeeks <= 0).sort((a, b) => overall(b) - overall(a));
  return [...list, ...rest].slice(0, n);
}

const avg = (ps: Player[], f: (p: Player) => number = overall): number => (ps.length ? Math.round(ps.reduce((t, p) => t + f(p), 0) / ps.length) : 40);

/** Notes des unités (0-99). */
export function unitRatings(team: Team): UnitRating[] {
  const qb = starters(team, 'QB', 1);
  const wr = [...starters(team, 'WR', 3), ...starters(team, 'TE', 1)];
  const rb = starters(team, 'RB', 1);
  const ol = [...starters(team, 'OT', 2), ...starters(team, 'OG', 2), ...starters(team, 'C', 1)];
  const dl = [...starters(team, 'DE', 2), ...starters(team, 'DT', 2)];
  const db = [...starters(team, 'CB', 3), ...starters(team, 'FS', 1), ...starters(team, 'SS', 1)];
  const lb = starters(team, 'LB', 3);
  const k = [...starters(team, 'K', 1), ...starters(team, 'P', 1)];
  return [
    { key: 'pass', label: 'Jeu de passe', value: Math.round(avg(qb) * 0.55 + avg(wr) * 0.45) },
    { key: 'run', label: 'Jeu de course', value: Math.round(avg(rb) * 0.6 + avg(ol) * 0.4) },
    { key: 'oline', label: 'Ligne offensive', value: avg(ol) },
    { key: 'rush', label: 'Pression sur le QB', value: Math.round(avg(dl) * 0.7 + avg(lb) * 0.3) },
    { key: 'cover', label: 'Couverture', value: Math.round(avg(db) * 0.75 + avg(lb) * 0.25) },
    { key: 'kick', label: 'Équipes spéciales', value: avg(k) },
  ];
}

/** Forme : derniers matchs joués par l'équipe dans le calendrier. */
export function recentForm(teamId: string, schedule: ScheduledGame[][], n = 6): ('V' | 'N' | 'D')[] {
  const out: ('V' | 'N' | 'D')[] = [];
  for (const week of schedule) {
    for (const g of week) {
      if (!g.played || !g.score || (g.home !== teamId && g.away !== teamId)) continue;
      const mine = g.home === teamId ? g.score[0] : g.score[1];
      const theirs = g.home === teamId ? g.score[1] : g.score[0];
      out.push(mine > theirs ? 'V' : mine === theirs ? 'N' : 'D');
    }
  }
  return out.slice(-n);
}

export interface ScoutInput {
  opponent: Team;
  user: Team;
  plan?: GamePlan;
  schedule?: ScheduledGame[][];
  unlocked: string[];
}

export function scoutOpponent(o: ScoutInput): ScoutReport {
  const opp = o.opponent;
  const plan = o.plan ?? DEFAULT_GAMEPLAN;
  const units = unitRatings(opp);
  const mine = unitRatings(o.user);
  const u = Object.fromEntries(units.map((x) => [x.key, x.value])) as Record<UnitKey, number>;
  const m = Object.fromEntries(mine.map((x) => [x.key, x.value])) as Record<UnitKey, number>;
  const style: string[] = [];
  // tendance de jeu : plan de l'IA, corrigée par la qualité relative passe / course de l'effectif
  const passLean = plan.passRatio + (u.pass - u.run) / 100;
  if (passLean > 0.58) style.push('Équipe qui lance beaucoup : attendez-vous à des passes dès le 1er down.');
  else if (passLean < 0.46) style.push('Équipe de course : elle cherche à user votre défense au sol.');
  else style.push('Attaque équilibrée entre la course et la passe.');
  if (plan.aggression > 0.62) style.push('Coach agressif : il tente souvent les 4e downs et blitze volontiers.');
  else if (plan.aggression < 0.38) style.push('Coach prudent : il dégage et prend les points quand il le peut.');
  if (plan.deepShots > 0.55) style.push('Elle aime les passes longues : gardez un safety en profondeur.');

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const sorted = [...units].sort((a, b) => b.value - a.value);
  for (const x of sorted.slice(0, 2)) strengths.push(`${x.label} (${x.value})`);
  for (const x of sorted.slice(-2).reverse()) weaknesses.push(`${x.label} (${x.value})`);

  const keyPlayers = [...opp.roster].filter((p) => p.injuryWeeks <= 0).map((p) => ({ player: p, ovr: overall(p) })).sort((a, b) => b.ovr - a.ovr).slice(0, 3);

  const set = new Set(o.unlocked);
  const advice: Advice[] = [];
  const add = (text: string, play: string) => {
    if (!advice.some((a) => a.play === play)) advice.push({ text, play, unlocked: set.has(play) });
  };
  // attaque : exploiter leurs faiblesses avec nos forces
  if (u.cover < u.rush - 3 || m.pass - u.cover >= 6) add('Leur couverture est en difficulté : lancez en profondeur.', 'fourVerts');
  if (u.rush >= m.oline + 4) add('Leur pression sur le QB est forte : passes rapides et écrans pour la neutraliser.', u.rush >= m.oline + 9 ? 'rbScreen' : 'quickSlants');
  if (m.run - u.rush >= 4) add('Votre jeu de course domine leur ligne : appuyez-vous sur la course intérieure.', 'insideZone');
  if (u.cover >= 70 && u.rush < 65) add('Couverture solide mais peu de pression : prenez le temps des routes intermédiaires.', 'curlFlat');
  if (plan.aggression > 0.6) add('Ils blitzent souvent : les croisements courts battent l’individuelle.', 'meshDrag');
  // défense : contrer leur style
  if (passLean > 0.58) add('Ils lancent beaucoup : une zone profonde limitera les gros gains.', plan.deepShots > 0.55 ? 'nickelQuarters' : '43cover3');
  else if (passLean < 0.46) add('Ils courent beaucoup : mettez huit joueurs près de la ligne.', '43runStop');
  if (u.oline < m.rush - 4) add('Leur ligne offensive est faible : le blitz peut faire mal.', 'nickelBlitz');
  if (!advice.length) add('Équipes proches : variez les appels pour rester imprévisible.', 'paCross');

  const diff = Math.round(units.reduce((t, x) => t + x.value, 0) / units.length - mine.reduce((t, x) => t + x.value, 0) / mine.length);
  const verdict = diff >= 4
    ? `${opp.city} est plus fort sur le papier (+${diff}). Il faudra des appels précis et éviter les pertes de balle.`
    : diff <= -4
      ? `Nous sommes favoris (${diff}). Restons disciplinés et imposons notre rythme.`
      : 'Match très équilibré sur le papier : les choix de l’entraîneur feront la différence.';

  return {
    coachName: coachNameFor(opp),
    form: o.schedule ? recentForm(opp.id, o.schedule) : [],
    units,
    style,
    keyPlayers,
    strengths,
    weaknesses,
    advice: advice.slice(0, 4),
    verdict,
  };
}

/** Texte court d'un conseil, avec rappel de l'académie si la tactique n'est pas apprise. */
export const adviceLine = (a: Advice): string => `${a.text} → ${playName(a.play)}${a.unlocked ? '' : ' (à apprendre à l’académie)'}`;
