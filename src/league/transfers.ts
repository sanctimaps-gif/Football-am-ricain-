import { Rng, hashString } from '../core/rng';
import { buildDepthChart, generatePlayer, salaryFor } from '../data/generator';
import { overall } from '../data/ratings';
import { ALL_POSITIONS, fullName, type Player, type Position, type Team } from '../data/types';
import { displayName } from '../data/world';
import type { MarketResult } from './market';
import { capSpace, tradeValue } from './market';
import { DIVISIONS, ROSTER_MAX, ROSTER_MIN, type League } from './types';

/**
 * Marché des transferts de la carrière de club : achat de joueurs à d'autres clubs contre une indemnité,
 * vente de ses joueurs, liste de joueurs proposés par des clubs étrangers.
 */

const FOREIGN_CLUBS = ['un club étranger', 'un club européen', 'un club asiatique', 'un club sud-américain', 'un club africain', 'un club canadien'];

/** Indemnité de transfert (k$) : note, âge, potentiel, poste. */
export function transferFee(p: Player): number {
  const v = Math.max(5, tradeValue(p) + p.contract.salary / 2500);
  return Math.max(150, Math.round((v * 38) / 50) * 50);
}

/** Joueurs proposés à la vente par des clubs étrangers, niveau adapté à la division. */
export function generateTransferList(l: League, size = 24): Player[] {
  const rng = new Rng(l.seed + l.season * 911 + 77);
  const level = l.pyramid?.level ?? 1;
  const base = level === 3 ? 0.8 : level === 2 ? 0.86 : 0.92;
  const used = new Set<number>();
  const out: Player[] = [];
  for (let i = 0; i < size; i++) {
    const pos = rng.pick(ALL_POSITIONS.filter((x) => x !== 'FB'));
    const q = base + rng.range(-0.04, 0.12);
    const p = generatePlayer(rng, pos, q, `tr${l.season}-${l.nextPlayerId++}`, used);
    used.delete(p.number);
    p.contract = { salary: salaryFor(overall(p), pos), years: rng.int(2, 4) };
    out.push(p);
  }
  return out.sort((a, b) => overall(b) - overall(a));
}

export interface TransferTarget {
  player: Player;
  /** Club vendeur (null : club étranger de la liste des transferts). */
  teamId: string | null;
  seller: string;
  fee: number;
}

/** Recherche de joueurs à acheter (division active + liste des transferts). */
export function searchPlayers(l: League, pos: Position | 'ALL' = 'ALL', maxFee = Infinity): TransferTarget[] {
  const out: TransferTarget[] = [];
  for (const p of l.transferList ?? []) out.push({ player: p, teamId: null, seller: FOREIGN_CLUBS[hashString(p.id) % FOREIGN_CLUBS.length], fee: transferFee(p) });
  for (const t of l.teams) {
    if (t.id === l.userTeamId) continue;
    for (const p of t.roster) if (!p.isUserCreated) out.push({ player: p, teamId: t.id, seller: displayName(t), fee: Math.round((transferFee(p) * 1.15) / 50) * 50 });
  }
  return out.filter((x) => (pos === 'ALL' || x.player.position === pos) && x.fee <= maxFee).sort((a, b) => overall(b.player) - overall(a.player));
}

function renumber(t: Team, p: Player): void {
  const used = new Set(t.roster.filter((x) => x !== p).map((x) => x.number));
  while (used.has(p.number)) p.number = (p.number % 99) + 1;
}

/** Achat d'un joueur : indemnité payée au vendeur, salaire repris, contrôle de l'effectif et du budget. */
export function buyPlayer(l: League, playerId: string): MarketResult {
  const target = searchPlayers(l).find((x) => x.player.id === playerId);
  if (!target) return { ok: false, reason: 'Joueur introuvable sur le marché.' };
  const me = l.teams.find((t) => t.id === l.userTeamId)!;
  const f = l.finances[l.userTeamId];
  const p = target.player;
  if (me.roster.length >= ROSTER_MAX) return { ok: false, reason: `Effectif complet (${ROSTER_MAX} joueurs maximum) : vendez ou libérez un joueur.` };
  if (f.cash < target.fee) return { ok: false, reason: `Trésorerie insuffisante : indemnité ${Math.round(target.fee)} k$.` };
  if (p.contract.salary > capSpace(l, l.userTeamId)) return { ok: false, reason: 'Plafond salarial dépassé.' };
  if (target.teamId) {
    const seller = l.teams.find((t) => t.id === target.teamId)!;
    const samePos = seller.roster.filter((x) => x.position === p.position).length;
    if (seller.roster.length <= ROSTER_MIN || samePos <= 1) return { ok: false, reason: `${seller.abbr} refuse de vendre : effectif trop juste à ce poste.` };
    seller.roster.splice(seller.roster.indexOf(p), 1);
    seller.depth = buildDepthChart(seller.roster);
    l.finances[seller.id].cash += target.fee;
  } else {
    l.transferList!.splice(l.transferList!.indexOf(p), 1);
  }
  f.cash -= target.fee;
  f.seasonExpenses += target.fee;
  renumber(me, p);
  me.roster.push(p);
  me.depth = buildDepthChart(me.roster);
  l.news.unshift(`💸 Transfert : ${fullName(p)} (${p.position}, GÉN ${overall(p)}) rejoint ${me.abbr} pour ${Math.round(target.fee)} k$.`);
  return { ok: true, message: `${fullName(p)} a signé ! Indemnité : ${Math.round(target.fee)} k$.` };
}

export interface SaleOffer {
  buyerId: string | null;
  buyer: string;
  fee: number;
}

/** Meilleure offre reçue pour un joueur (clubs de la division ayant besoin du poste et les moyens, sinon un club étranger). */
export function saleOffer(l: League, playerId: string): SaleOffer | null {
  const me = l.teams.find((t) => t.id === l.userTeamId)!;
  const p = me.roster.find((x) => x.id === playerId);
  if (!p || p.isUserCreated) return null;
  const rng = new Rng(l.seed + hashString(playerId) + l.week * 13 + l.season * 101);
  const base = transferFee(p);
  let best: SaleOffer = { buyerId: null, buyer: FOREIGN_CLUBS[hashString(playerId + l.season) % FOREIGN_CLUBS.length], fee: Math.round((base * 0.75) / 50) * 50 };
  for (const t of l.teams) {
    if (t.id === me.id || t.roster.length >= ROSTER_MAX) continue;
    const bestAtPos = Math.max(0, ...t.roster.filter((x) => x.position === p.position).map(overall));
    if (overall(p) <= bestAtPos) continue;
    const fee = Math.round((base * rng.range(0.85, 1.08)) / 50) * 50;
    if ((l.finances[t.id]?.cash ?? 0) < fee) continue;
    if (fee > best.fee) best = { buyerId: t.id, buyer: displayName(t), fee };
  }
  return best;
}

export function sellPlayer(l: League, playerId: string): MarketResult {
  const me = l.teams.find((t) => t.id === l.userTeamId)!;
  const p = me.roster.find((x) => x.id === playerId);
  if (!p) return { ok: false, reason: 'Joueur introuvable.' };
  if (p.isUserCreated) return { ok: false, reason: 'Impossible de vendre votre joueur de carrière.' };
  if (me.roster.length <= ROSTER_MIN) return { ok: false, reason: `Effectif minimum : ${ROSTER_MIN} joueurs.` };
  const offer = saleOffer(l, playerId)!;
  me.roster.splice(me.roster.indexOf(p), 1);
  me.depth = buildDepthChart(me.roster);
  const f = l.finances[me.id];
  f.cash += offer.fee;
  f.seasonRevenue += offer.fee;
  if (offer.buyerId) {
    const b = l.teams.find((t) => t.id === offer.buyerId)!;
    l.finances[b.id].cash -= offer.fee;
    renumber(b, p);
    b.roster.push(p);
    b.depth = buildDepthChart(b.roster);
  }
  l.news.unshift(`💰 ${fullName(p)} vendu à ${offer.buyer} pour ${Math.round(offer.fee)} k$.`);
  return { ok: true, message: `${fullName(p)} vendu à ${offer.buyer} pour ${Math.round(offer.fee)} k$.` };
}

/** Budget transferts indicatif selon la division. */
export const divisionLabel = (l: League): string => (l.pyramid ? DIVISIONS[l.pyramid.level].name : '');
