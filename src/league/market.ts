import { buildDepthChart, salaryFor } from '../data/generator';
import { overall } from '../data/ratings';
import { fullName, type Player, type Team } from '../data/types';
import { teamById } from './league';
import { ROSTER_MAX, ROSTER_MIN, type League } from './types';

export const payroll = (t: Team): number => t.roster.reduce((s, p) => s + p.contract.salary, 0);

export function capSpace(l: League, teamId: string): number {
  const f = l.finances[teamId];
  return (f?.salaryCap ?? 200000) - payroll(teamById(l, teamId));
}

export type MarketResult = { ok: true; message: string } | { ok: false; reason: string };

/** Valeur d'échange d'un joueur (note, âge, potentiel, contrat). */
export function tradeValue(p: Player): number {
  const ovr = overall(p);
  const ageF = p.age <= 25 ? 1.15 : p.age <= 29 ? 1 : p.age <= 32 ? 0.8 : 0.55;
  const qbF = p.position === 'QB' ? 1.6 : p.position === 'K' || p.position === 'P' ? 0.5 : 1;
  return Math.pow(Math.max(0, ovr - 45), 1.6) * ageF * qbF + (p.potential - ovr) * 2 - p.contract.salary / 2500;
}

/** Signature d'un agent libre : vérifie le plafond salarial, la trésorerie et la taille d'effectif. */
export function signFreeAgent(l: League, teamId: string, playerId: string, salary: number, years: number): MarketResult {
  const p = l.freeAgents.find((x) => x.id === playerId);
  if (!p) return { ok: false, reason: 'Joueur introuvable.' };
  const t = teamById(l, teamId);
  if (t.roster.length >= ROSTER_MAX) return { ok: false, reason: `Effectif complet (${ROSTER_MAX} joueurs maximum).` };
  if (salary < Math.round(p.contract.salary * 0.9)) return { ok: false, reason: `Offre refusée : ${fullName(p)} demande au moins ${Math.round(p.contract.salary * 0.9)} k$.` };
  if (salary > capSpace(l, teamId)) return { ok: false, reason: 'Plafond salarial dépassé.' };
  const f = l.finances[teamId];
  const bonus = salary * 0.25;
  if (f && f.cash < bonus) return { ok: false, reason: 'Trésorerie insuffisante pour la prime de signature.' };
  if (f) f.cash -= bonus;
  l.freeAgents.splice(l.freeAgents.indexOf(p), 1);
  p.contract = { salary, years: Math.max(1, Math.min(5, years)) };
  const used = new Set(t.roster.map((x) => x.number));
  while (used.has(p.number)) p.number = (p.number % 99) + 1;
  t.roster.push(p);
  t.depth = buildDepthChart(t.roster);
  l.news.unshift(`✍️ ${t.abbr} signe ${fullName(p)} (${p.position}).`);
  return { ok: true, message: `${fullName(p)} a signé pour ${years} an(s) à ${salary} k$/an.` };
}

export function releasePlayer(l: League, teamId: string, playerId: string): MarketResult {
  const t = teamById(l, teamId);
  const p = t.roster.find((x) => x.id === playerId);
  if (!p) return { ok: false, reason: 'Joueur introuvable.' };
  if (p.isUserCreated) return { ok: false, reason: 'Impossible de libérer votre joueur de carrière.' };
  if (t.roster.length <= ROSTER_MIN) return { ok: false, reason: `Effectif minimum : ${ROSTER_MIN} joueurs.` };
  const f = l.finances[teamId];
  const deadMoney = p.contract.salary * 0.5;
  if (f && f.cash < deadMoney) return { ok: false, reason: 'Trésorerie insuffisante pour payer l’indemnité.' };
  if (f) f.cash -= deadMoney;
  t.roster.splice(t.roster.indexOf(p), 1);
  t.depth = buildDepthChart(t.roster);
  l.freeAgents.push(p);
  return { ok: true, message: `${fullName(p)} libéré (indemnité ${Math.round(deadMoney)} k$).` };
}

/** Prolongation de contrat : le joueur accepte si l'offre est à la hauteur de sa valeur. */
export function extendContract(l: League, teamId: string, playerId: string, salary: number, years: number): MarketResult {
  const t = teamById(l, teamId);
  const p = t.roster.find((x) => x.id === playerId);
  if (!p) return { ok: false, reason: 'Joueur introuvable.' };
  const asking = salaryFor(overall(p), p.position);
  if (salary < asking * 0.95) return { ok: false, reason: `${fullName(p)} demande au moins ${Math.round(asking * 0.95)} k$/an.` };
  const delta = salary - p.contract.salary;
  if (delta > capSpace(l, teamId)) return { ok: false, reason: 'Plafond salarial dépassé.' };
  p.contract = { salary, years: Math.max(1, Math.min(5, years)) };
  return { ok: true, message: `Contrat prolongé : ${years} an(s), ${salary} k$/an.` };
}

/** Proposition d'échange : l'IA accepte si la valeur reçue compense, sous contraintes de plafond et d'effectif. */
export function evaluateTrade(l: League, fromTeam: string, toTeam: string, give: string[], get: string[]): MarketResult {
  if (!give.length && !get.length) return { ok: false, reason: 'Échange vide.' };
  const a = teamById(l, fromTeam);
  const b = teamById(l, toTeam);
  const gp = give.map((id) => a.roster.find((p) => p.id === id)).filter((p): p is Player => !!p);
  const rp = get.map((id) => b.roster.find((p) => p.id === id)).filter((p): p is Player => !!p);
  if (gp.length !== give.length || rp.length !== get.length) return { ok: false, reason: 'Joueur introuvable.' };
  if (gp.some((p) => p.isUserCreated)) return { ok: false, reason: 'Votre joueur de carrière ne peut pas être échangé.' };
  const sizeA = a.roster.length - gp.length + rp.length;
  const sizeB = b.roster.length - rp.length + gp.length;
  if (sizeA < ROSTER_MIN || sizeB < ROSTER_MIN || sizeA > ROSTER_MAX || sizeB > ROSTER_MAX) return { ok: false, reason: `Les effectifs doivent rester entre ${ROSTER_MIN} et ${ROSTER_MAX} joueurs.` };
  const salA = gp.reduce((s, p) => s + p.contract.salary, 0);
  const salB = rp.reduce((s, p) => s + p.contract.salary, 0);
  if (salB - salA > capSpace(l, fromTeam)) return { ok: false, reason: 'Votre plafond salarial ne permet pas cet échange.' };
  if (salA - salB > capSpace(l, toTeam)) return { ok: false, reason: `${b.abbr} n'a pas l'espace salarial nécessaire.` };
  const valueIn = gp.reduce((s, p) => s + tradeValue(p), 0);
  const valueOut = rp.reduce((s, p) => s + tradeValue(p), 0);
  if (valueIn < valueOut * 1.08) return { ok: false, reason: `${b.abbr} refuse : valeur insuffisante (${Math.round(valueIn)} contre ${Math.round(valueOut)}).` };
  return { ok: true, message: `${b.abbr} accepte l'échange.` };
}

export function executeTrade(l: League, fromTeam: string, toTeam: string, give: string[], get: string[]): MarketResult {
  const ev = evaluateTrade(l, fromTeam, toTeam, give, get);
  if (!ev.ok) return ev;
  const a = teamById(l, fromTeam);
  const b = teamById(l, toTeam);
  for (const id of give) {
    const p = a.roster.find((x) => x.id === id)!;
    a.roster.splice(a.roster.indexOf(p), 1);
    b.roster.push(p);
  }
  for (const id of get) {
    const p = b.roster.find((x) => x.id === id)!;
    b.roster.splice(b.roster.indexOf(p), 1);
    a.roster.push(p);
  }
  for (const t of [a, b]) {
    const used = new Set<number>();
    for (const p of t.roster) {
      while (used.has(p.number)) p.number = (p.number % 99) + 1;
      used.add(p.number);
    }
    t.depth = buildDepthChart(t.roster);
  }
  l.news.unshift(`🔁 Échange entre ${a.abbr} et ${b.abbr}.`);
  return ev;
}

/** Amélioration des installations (franchise). */
export function upgradeFacility(l: League, teamId: string, kind: 'training' | 'medical' | 'stadium'): MarketResult {
  const f = l.finances[teamId];
  if (!f) return { ok: false, reason: 'Finances indisponibles.' };
  const lvl = f.facilities[kind];
  if (lvl >= 5) return { ok: false, reason: 'Niveau maximum atteint.' };
  const cost = 8000 * lvl;
  if (f.cash < cost) return { ok: false, reason: `Coût ${cost / 1000} M$ : trésorerie insuffisante.` };
  f.cash -= cost;
  f.facilities[kind]++;
  if (kind === 'stadium') {
    const t = teamById(l, teamId);
    t.stadium.capacity = Math.round(t.stadium.capacity * 1.08);
  }
  return { ok: true, message: `Installation améliorée (niveau ${f.facilities[kind]}).` };
}

export const facilityCost = (level: number): number => 8000 * level;
