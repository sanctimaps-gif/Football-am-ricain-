import { Rng, hashString } from '../core/rng';
import { generatePlayer, ROSTER_TEMPLATE, teamFromTemplate } from '../data/generator';
import { DEFENSIVE_PLAYS, OFFENSIVE_PLAYS } from '../data/playbook';
import { overallFor } from '../data/ratings';
import type { TeamTemplate } from '../data/teams';
import type { Attributes, LogoShape, Player, Position, Team, Uniform } from '../data/types';
import { ALL_CLUBS } from '../data/world';

/**
 * Ultimate Team (hors ligne) : collection de cartes de joueurs, composition, traits, évolutions, packs,
 * playbook à budget et progression. Toutes les monnaies se gagnent en jouant : aucun achat réel.
 */

export type Rarity = 'bronze' | 'silver' | 'gold' | 'elite' | 'legend';
export const RARITY_LABEL: Record<Rarity, string> = { bronze: 'Bronze', silver: 'Argent', gold: 'Or', elite: 'Élite', legend: 'Légende' };
export const RARITY_COLOR: Record<Rarity, string> = { bronze: '#a0703c', silver: '#9aa5b1', gold: '#d4a017', elite: '#4cc9f0', legend: '#c084fc' };

export interface Trait {
  id: string;
  name: string;
  /** Attributs améliorés (+2 par niveau). */
  attrs: (keyof Attributes)[];
  positions: Position[];
}

export const TRAITS: Trait[] = [
  { id: 'canon', name: 'Bras canon', attrs: ['throwPower'], positions: ['QB'] },
  { id: 'sniper', name: 'Précision chirurgicale', attrs: ['throwAccuracy'], positions: ['QB'] },
  { id: 'coolHead', name: 'Sang-froid', attrs: ['throwAccuracy', 'awareness'], positions: ['QB'] },
  { id: 'hands', name: 'Mains sûres', attrs: ['catching'], positions: ['WR', 'TE', 'RB', 'FB'] },
  { id: 'routes', name: 'Tracés parfaits', attrs: ['agility', 'awareness'], positions: ['WR', 'TE'] },
  { id: 'deepThreat', name: 'Menace profonde', attrs: ['speed'], positions: ['WR', 'TE', 'RB'] },
  { id: 'burst', name: 'Démarrage explosif', attrs: ['acceleration'], positions: ['RB', 'WR', 'CB', 'DE', 'LB'] },
  { id: 'juke', name: 'Roi de la feinte', attrs: ['agility'], positions: ['RB', 'WR', 'QB'] },
  { id: 'bulldozer', name: 'Bulldozer', attrs: ['strength', 'stamina'], positions: ['RB', 'FB', 'TE'] },
  { id: 'wall', name: 'Mur', attrs: ['blocking'], positions: ['OT', 'OG', 'C', 'TE', 'FB'] },
  { id: 'anchor', name: 'Ancre', attrs: ['strength'], positions: ['OT', 'OG', 'C', 'DT'] },
  { id: 'protector', name: 'Protecteur', attrs: ['blocking', 'awareness'], positions: ['OT', 'OG', 'C'] },
  { id: 'qbHunter', name: 'Chasseur de QB', attrs: ['speed', 'strength'], positions: ['DE', 'LB', 'DT'] },
  { id: 'runStopper', name: 'Stoppeur', attrs: ['tackling'], positions: ['DT', 'DE', 'LB', 'SS'] },
  { id: 'hitter', name: 'Gros plaqueur', attrs: ['tackling', 'strength'], positions: ['LB', 'SS', 'FS'] },
  { id: 'shutdown', name: 'Verrou', attrs: ['speed', 'awareness'], positions: ['CB'] },
  { id: 'ballhawk', name: 'Intercepteur', attrs: ['catching', 'awareness'], positions: ['CB', 'FS', 'SS', 'LB'] },
  { id: 'centerField', name: 'Centre-terrain', attrs: ['speed', 'awareness'], positions: ['FS', 'SS'] },
  { id: 'motor', name: 'Moteur', attrs: ['stamina'], positions: ['DE', 'DT', 'LB', 'RB', 'WR', 'CB'] },
  { id: 'leader', name: 'Leader', attrs: ['awareness'], positions: ['QB', 'C', 'LB', 'FS', 'SS', 'TE'] },
  { id: 'bigLeg', name: 'Pied puissant', attrs: ['kickPower'], positions: ['K', 'P'] },
  { id: 'iceVeins', name: 'Pied précis', attrs: ['kickAccuracy'], positions: ['K', 'P'] },
];

export interface Card {
  id: string;
  player: Player;
  /** Postes jouables (2 pour une carte double). */
  positions: Position[];
  rarity: Rarity;
  traits: { id: string; level: number }[];
  evo: number;
  program: string;
}

export type Slot =
  | 'QB' | 'RB' | 'WR1' | 'WR2' | 'WR3' | 'TE' | 'LT' | 'LG' | 'C' | 'RG' | 'RT'
  | 'DE1' | 'DT1' | 'DT2' | 'DE2' | 'LB1' | 'LB2' | 'LB3' | 'CB1' | 'CB2' | 'FS' | 'SS' | 'K' | 'P';

export const SLOT_POS: Record<Slot, Position> = {
  QB: 'QB', RB: 'RB', WR1: 'WR', WR2: 'WR', WR3: 'WR', TE: 'TE', LT: 'OT', LG: 'OG', C: 'C', RG: 'OG', RT: 'OT',
  DE1: 'DE', DT1: 'DT', DT2: 'DT', DE2: 'DE', LB1: 'LB', LB2: 'LB', LB3: 'LB', CB1: 'CB', CB2: 'CB', FS: 'FS', SS: 'SS', K: 'K', P: 'P',
};
export const OFF_SLOTS: Slot[] = ['QB', 'RB', 'WR1', 'WR2', 'WR3', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'];
export const DEF_SLOTS: Slot[] = ['DE1', 'DT1', 'DT2', 'DE2', 'LB1', 'LB2', 'LB3', 'CB1', 'CB2', 'FS', 'SS'];
export const ST_SLOTS: Slot[] = ['K', 'P'];
export const ALL_SLOTS: Slot[] = [...OFF_SLOTS, ...DEF_SLOTS, ...ST_SLOTS];

const DUAL: [Position, Position][] = [['WR', 'TE'], ['TE', 'FB'], ['RB', 'FB'], ['CB', 'FS'], ['FS', 'SS'], ['LB', 'DE'], ['DE', 'DT'], ['OG', 'C'], ['OT', 'OG'], ['LB', 'SS'], ['RB', 'WR']];

export interface UTState {
  version: 1;
  seed: number;
  name: string;
  abbr: string;
  colors: { primary: string; secondary: string };
  logo: { shape: LogoShape; glyph: string };
  uniform: Uniform;
  coins: number;
  gems: number;
  trainingPoints: number;
  xp: number;
  cards: Card[];
  lineup: Partial<Record<Slot, string>>;
  playbook: { off: string[]; def: string[] };
  daily: { date: string; done: string[] };
  journey: number;
  arena: { best: number; week: number; weekBest: number; attempts: number };
  vs: { rating: number; wins: number; losses: number };
  pass: { claimed: number[] };
  events: Record<string, string[]>;
  nextId: number;
  matches: { w: number; l: number; t: number };
}

// ———————————————————— Cartes ————————————————————

export const rarityOf = (ovr: number): Rarity => (ovr >= 90 ? 'legend' : ovr >= 85 ? 'elite' : ovr >= 78 ? 'gold' : ovr >= 70 ? 'silver' : 'bronze');

/** Joueur effectif d'une carte (traits et évolutions appliqués), au poste demandé. */
export function effectivePlayer(c: Card, pos: Position = c.positions[0], synergy = 0): Player {
  const attrs = { ...c.player.attrs };
  for (const t of c.traits) {
    const def = TRAITS.find((x) => x.id === t.id);
    if (def) for (const a of def.attrs) attrs[a] = Math.min(99, attrs[a] + 2 * t.level);
  }
  if (c.evo) for (const a of Object.keys(attrs) as (keyof Attributes)[]) if (attrs[a] >= 50) attrs[a] = Math.min(99, attrs[a] + c.evo);
  if (synergy) attrs.awareness = Math.min(99, attrs.awareness + synergy);
  return { ...c.player, position: pos, attrs };
}

export const cardOvr = (c: Card, pos: Position = c.positions[0]): number => overallFor(effectivePlayer(c, pos).attrs, pos);

/** Génère une carte proche d'une note visée. */
export function makeCard(rng: Rng, ut: Pick<UTState, 'nextId'>, pos: Position, target: number, program = 'Base', dualChance = 0.12): Card {
  let q = target / 74;
  let best: Player | null = null;
  for (let i = 0; i < 14; i++) {
    const p = generatePlayer(rng, pos, q, `ut-c${ut.nextId}`, new Set());
    const o = overallFor(p.attrs, pos);
    if (!best || Math.abs(o - target) < Math.abs(overallFor(best.attrs, pos) - target)) best = p;
    if (Math.abs(o - target) <= 1) break;
    q *= target / o;
  }
  ut.nextId++;
  const p = best!;
  p.age = rng.int(22, 32);
  const dual = DUAL.filter(([a, b]) => a === pos || b === pos);
  const positions: Position[] = [pos];
  if (dual.length && rng.chance(dualChance)) {
    const pair = rng.pick(dual);
    positions.push(pair[0] === pos ? pair[1] : pair[0]);
  }
  const card: Card = { id: p.id, player: p, positions, rarity: 'bronze', traits: [], evo: 0, program };
  card.rarity = rarityOf(cardOvr(card));
  return card;
}

const POS_WEIGHTS: [Position, number][] = [['QB', 3], ['RB', 4], ['WR', 8], ['TE', 3], ['OT', 4], ['OG', 4], ['C', 2], ['DE', 4], ['DT', 4], ['LB', 6], ['CB', 6], ['FS', 2], ['SS', 2], ['K', 1], ['P', 1], ['FB', 1]];
function randomPos(rng: Rng): Position {
  const total = POS_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = rng.range(0, total);
  for (const [p, w] of POS_WEIGHTS) if ((r -= w) <= 0) return p;
  return 'WR';
}

// ———————————————————— Création ————————————————————

const STARTER_OVR: Partial<Record<Slot, number>> = { QB: 68, RB: 66, WR1: 67, TE: 64, LT: 65, DE1: 66, LB1: 66, CB1: 67, FS: 64, K: 66 };

export function createUT(name = 'Mon Équipe', seed = Date.now() >>> 0): UTState {
  const rng = new Rng(seed);
  const ut: UTState = {
    version: 1, seed, name, abbr: name.replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X'),
    colors: { primary: '#5B2C83', secondary: '#F5C400' }, logo: { shape: 'shield', glyph: name[0]?.toUpperCase() ?? 'U' },
    uniform: { helmet: '#5B2C83', homeJersey: '#5B2C83', awayJersey: '#F4F4F4', homePants: '#F5C400', awayPants: '#5B2C83', numberColor: '#F5C400', stripe: '#F5C400' },
    coins: 5000, gems: 300, trainingPoints: 10, xp: 0, cards: [], lineup: {},
    playbook: { off: [], def: [] }, daily: { date: '', done: [] }, journey: 0,
    arena: { best: 0, week: 0, weekBest: 0, attempts: 0 }, vs: { rating: 1000, wins: 0, losses: 0 }, pass: { claimed: [] },
    events: {}, nextId: 1, matches: { w: 0, l: 0, t: 0 },
  };
  // effectif de départ : un titulaire par poste + quelques remplaçants
  for (const slot of ALL_SLOTS) {
    const c = makeCard(rng, ut, SLOT_POS[slot], (STARTER_OVR[slot] ?? 62) + rng.int(-2, 2), 'Départ', 0.05);
    ut.cards.push(c);
    ut.lineup[slot] = c.id;
  }
  for (let i = 0; i < 8; i++) ut.cards.push(makeCard(rng, ut, randomPos(rng), rng.int(56, 64), 'Départ'));
  ut.playbook = defaultPlaybook(ut);
  return ut;
}

export function isUT(d: unknown): d is UTState {
  const x = d as UTState;
  return !!x && x.version === 1 && Array.isArray(x.cards) && typeof x.coins === 'number' && !!x.lineup && !!x.playbook;
}

// ———————————————————— Niveau et playbook à budget ————————————————————

export const levelOf = (xp: number): number => Math.min(50, Math.floor(Math.sqrt(xp / 120)) + 1);
export const nextLevelXp = (level: number): number => (level * level) * 120;
export const playbookBudget = (ut: UTState): number => 50 + levelOf(ut.xp) * 6;

const OFF_COST: Record<string, number> = { inside: 4, outside: 5, option: 7, sneak: 3, short: 5, medium: 6, deep: 8, screen: 6, playAction: 8 };
export function playCost(id: string): number {
  const o = OFFENSIVE_PLAYS.find((p) => p.id === id);
  if (o) return o.category === 'special' ? 0 : OFF_COST[o.subtype] ?? 6;
  const d = DEFENSIVE_PLAYS.find((p) => p.id === id);
  if (d) return d.tags.includes('blitz') ? 7 : d.coverage === 'cover0' || d.coverage === 'cover1' ? 6 : 5;
  return 0;
}

export const playbookCost = (ut: UTState): number => [...ut.playbook.off, ...ut.playbook.def].reduce((s, id) => s + playCost(id), 0);

function defaultPlaybook(ut: UTState): { off: string[]; def: string[] } {
  void ut;
  return { off: ['insideZone', 'outsideZone', 'quickSlants', 'hitchFlat', 'goalLineDive'], def: ['43cover2', '43cover3', '43runStop', 'nickelMan', 'goalLineD'] };
}

/** Ajoute/retire une action du playbook en respectant le budget. Renvoie un message d'erreur éventuel. */
export function togglePlay(ut: UTState, id: string, defense: boolean): string | null {
  const book = defense ? ut.playbook.def : ut.playbook.off;
  const i = book.indexOf(id);
  if (i >= 0) {
    if (book.length <= 2) return 'Gardez au moins 2 actions.';
    book.splice(i, 1);
    return null;
  }
  if (playbookCost(ut) + playCost(id) > playbookBudget(ut)) return `Budget dépassé (${playbookCost(ut)} + ${playCost(id)} > ${playbookBudget(ut)}). Montez de niveau pour l'augmenter.`;
  book.push(id);
  return null;
}

// ———————————————————— Composition et équipe de match ————————————————————

export const cardById = (ut: UTState, id: string | undefined): Card | undefined => (id ? ut.cards.find((c) => c.id === id) : undefined);

/** Synergie : chaque carte double alignée donne +1 en lecture du jeu à tous les titulaires (max +5). */
export function synergy(ut: UTState): number {
  return Math.min(5, ALL_SLOTS.filter((s) => (cardById(ut, ut.lineup[s])?.positions.length ?? 0) > 1).length);
}

export function teamOvr(ut: UTState): number {
  const vals = ALL_SLOTS.map((s) => {
    const c = cardById(ut, ut.lineup[s]);
    return c ? cardOvr(c, SLOT_POS[s]) : 40;
  });
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/** Cartes pouvant occuper un emplacement (poste principal ou second poste d'une carte double). */
export const eligibleFor = (ut: UTState, slot: Slot): Card[] =>
  ut.cards.filter((c) => c.positions.includes(SLOT_POS[slot])).sort((a, b) => cardOvr(b, SLOT_POS[slot]) - cardOvr(a, SLOT_POS[slot]));

export function setLineup(ut: UTState, slot: Slot, cardId: string): void {
  // une carte ne peut occuper qu'un emplacement : échange si elle est déjà titulaire ailleurs
  const prev = ut.lineup[slot];
  for (const s of ALL_SLOTS) if (ut.lineup[s] === cardId) ut.lineup[s] = prev;
  ut.lineup[slot] = cardId;
}

/** Équipe jouable : titulaires aux bons postes, remplaçants, compléments générés pour les postes manquants. */
export function utTeam(ut: UTState): Team {
  const syn = synergy(ut);
  const roster: Player[] = [];
  const depth: Team['depth'] = {};
  const used = new Set<string>();
  for (const s of ALL_SLOTS) {
    const c = cardById(ut, ut.lineup[s]);
    if (!c || used.has(c.id)) continue;
    used.add(c.id);
    const p = effectivePlayer(c, SLOT_POS[s], syn);
    roster.push(p);
    (depth[p.position] ??= []).push(p.id);
  }
  for (const c of ut.cards) {
    if (used.has(c.id)) continue;
    used.add(c.id);
    const p = effectivePlayer(c);
    roster.push(p);
    (depth[p.position] ??= []).push(p.id);
  }
  // compléments (remplaçants de base) pour respecter l'effectif type
  const rng = new Rng(ut.seed + 17);
  const numbers = new Set(roster.map((p) => p.number));
  let n = 0;
  for (const pos of Object.keys(ROSTER_TEMPLATE) as Position[]) {
    while ((depth[pos]?.length ?? 0) < ROSTER_TEMPLATE[pos]) {
      const p = generatePlayer(rng, pos, 0.82, `ut-fill${n++}`, numbers);
      roster.push(p);
      (depth[pos] ??= []).push(p.id);
    }
  }
  // numéros uniques
  const seen = new Set<number>();
  for (const p of roster) {
    while (seen.has(p.number)) p.number = (p.number % 99) + 1;
    seen.add(p.number);
  }
  return {
    id: 'ut-team', city: ut.name, name: '', abbr: ut.abbr, conference: 0,
    colors: { primary: ut.colors.primary, secondary: ut.colors.secondary, accent: '#FFFFFF' },
    logo: { shape: ut.logo.shape, glyph: ut.logo.glyph, stripes: false },
    uniform: { ...ut.uniform }, stadium: { name: `${ut.name} Arena`, capacity: 60000, standColor: ut.colors.primary, roof: false },
    roster, depth,
  };
}

/** Adversaire IA de niveau donné (note visée ≈ 50 + 30 × tier). */
export function opponentTeam(seed: number, tier: number, avoid = ''): Team {
  const rng = new Rng(seed);
  let tpl: TeamTemplate = rng.pick(ALL_CLUBS);
  if (tpl.abbr === avoid) tpl = rng.pick(ALL_CLUBS);
  return teamFromTemplate({ ...tpl, tier }, seed);
}

/** Niveau d'adversaire qui correspond à une note d'équipe. */
export const tierForOvr = (ovr: number): number => Math.max(0.7, Math.min(1.25, 1 + (ovr - 72) / 30));

// ———————————————————— Boutique, vente, traits, évolutions ————————————————————

export interface PackDef {
  id: string;
  name: string;
  cost: { coins?: number; gems?: number };
  count: number;
  /** Notes minimale/maximale et carte garantie. */
  range: [number, number];
  guaranteed?: number;
  desc: string;
}

export const PACKS: PackDef[] = [
  { id: 'pro', name: 'Pack Pro', cost: { coins: 2500 }, count: 5, range: [60, 78], desc: '5 cartes 60-78' },
  { id: 'gold', name: 'Pack Or', cost: { coins: 9000 }, count: 3, range: [74, 84], guaranteed: 78, desc: '3 cartes 74-84, une Or garantie' },
  { id: 'elite', name: 'Pack Élite', cost: { gems: 400 }, count: 4, range: [72, 87], guaranteed: 82, desc: '4 cartes 72-87, une 82+ garantie' },
  { id: 'legend', name: 'Pack Légende', cost: { gems: 1200 }, count: 3, range: [80, 93], guaranteed: 88, desc: '3 cartes 80-93, une Élite garantie' },
];

/** Ouverture d'un pack : débite la monnaie et ajoute les cartes. Les probabilités sont uniformes dans la plage affichée. */
export function openPack(ut: UTState, packId: string, free = false): Card[] | string {
  const def = PACKS.find((p) => p.id === packId);
  if (!def) return 'Pack inconnu.';
  if (!free) {
    if ((def.cost.coins ?? 0) > ut.coins) return 'Pièces insuffisantes.';
    if ((def.cost.gems ?? 0) > ut.gems) return 'Gemmes insuffisantes.';
    ut.coins -= def.cost.coins ?? 0;
    ut.gems -= def.cost.gems ?? 0;
  }
  const rng = new Rng(ut.seed + ut.nextId * 7919);
  const out: Card[] = [];
  for (let i = 0; i < def.count; i++) {
    const target = i === 0 && def.guaranteed ? rng.int(def.guaranteed, def.range[1]) : rng.int(def.range[0], def.range[1]);
    out.push(makeCard(rng, ut, randomPos(rng), target, def.name));
  }
  ut.cards.push(...out);
  return out;
}

export const sellValue = (c: Card): number => Math.round((Math.max(0, cardOvr(c) - 50) ** 2 * 3 + 100) / 10) * 10;

export function sellCard(ut: UTState, id: string): string {
  if (ALL_SLOTS.some((s) => ut.lineup[s] === id)) return 'Retirez d’abord cette carte de la composition.';
  const c = cardById(ut, id);
  if (!c) return 'Carte introuvable.';
  ut.cards.splice(ut.cards.indexOf(c), 1);
  const v = sellValue(c);
  ut.coins += v;
  return `Carte vendue : +${v} pièces.`;
}

export const traitCost = (level: number): number => 2 + level * 2;

export function upgradeTrait(ut: UTState, cardId: string, traitId: string): string {
  const c = cardById(ut, cardId);
  const t = TRAITS.find((x) => x.id === traitId);
  if (!c || !t) return 'Introuvable.';
  if (!t.positions.some((p) => c.positions.includes(p))) return 'Trait incompatible avec ce poste.';
  const cur = c.traits.find((x) => x.id === traitId);
  const level = cur?.level ?? 0;
  if (level >= 3) return 'Niveau maximum atteint.';
  if (!cur && c.traits.length >= 3) return 'Maximum 3 traits par carte.';
  const cost = traitCost(level);
  if (ut.trainingPoints < cost) return `Il faut ${cost} points d'entraînement.`;
  ut.trainingPoints -= cost;
  if (cur) cur.level++;
  else c.traits.push({ id: traitId, level: 1 });
  c.rarity = rarityOf(cardOvr(c));
  return `${t.name} niveau ${level + 1} (GÉN ${cardOvr(c)}).`;
}

/** Évolution (EVO) : sacrifie 2 cartes du même poste et des points d'entraînement pour améliorer une carte. */
export function evolveCard(ut: UTState, cardId: string, fodder: string[]): string {
  const c = cardById(ut, cardId);
  if (!c) return 'Carte introuvable.';
  if (c.evo >= 3) return 'Évolution maximale atteinte.';
  const f = fodder.map((id) => cardById(ut, id)).filter((x): x is Card => !!x && x.id !== cardId);
  if (f.length < 2) return 'Choisissez 2 cartes à sacrifier.';
  if (f.some((x) => !x.positions.includes(c.positions[0]))) return 'Les cartes sacrifiées doivent jouer au même poste.';
  if (f.some((x) => ALL_SLOTS.some((s) => ut.lineup[s] === x.id))) return 'Une carte sacrifiée est titulaire.';
  const cost = 5 + c.evo * 5;
  if (ut.trainingPoints < cost) return `Il faut ${cost} points d'entraînement.`;
  ut.trainingPoints -= cost;
  for (const x of f) ut.cards.splice(ut.cards.indexOf(x), 1);
  const before = cardOvr(c);
  c.evo++;
  c.rarity = rarityOf(cardOvr(c));
  return `Évolution ${c.evo}/3 : GÉN ${before} → ${cardOvr(c)}.`;
}

// ———————————————————— Récompenses et progression ————————————————————

export interface Reward {
  coins?: number;
  gems?: number;
  tp?: number;
  xp?: number;
  pack?: string;
  card?: { ovr: number; program: string };
}

export function grant(ut: UTState, r: Reward): string[] {
  const out: string[] = [];
  if (r.coins) { ut.coins += r.coins; out.push(`+${r.coins} pièces`); }
  if (r.gems) { ut.gems += r.gems; out.push(`+${r.gems} gemmes`); }
  if (r.tp) { ut.trainingPoints += r.tp; out.push(`+${r.tp} points d'entraînement`); }
  if (r.xp) {
    const before = levelOf(ut.xp);
    ut.xp += r.xp;
    out.push(`+${r.xp} XP`);
    if (levelOf(ut.xp) > before) out.push(`⭐ Niveau ${levelOf(ut.xp)} ! Budget du playbook : ${playbookBudget(ut)}`);
  }
  if (r.pack) {
    const cards = openPack(ut, r.pack, true);
    if (Array.isArray(cards)) out.push(`${PACKS.find((p) => p.id === r.pack)?.name} : ${cards.map((c) => `${c.positions.join('/')} ${cardOvr(c)}`).join(', ')}`);
  }
  if (r.card) {
    const rng = new Rng(ut.seed + ut.nextId * 31);
    const c = makeCard(rng, ut, randomPos(rng), r.card.ovr, r.card.program, 0.4);
    ut.cards.push(c);
    out.push(`Carte ${r.card.program} : ${c.player.firstName} ${c.player.lastName} (${c.positions.join('/')} ${cardOvr(c)})`);
  }
  return out;
}

export const rewardText = (r: Reward): string => [r.coins && `${r.coins} 🪙`, r.gems && `${r.gems} 💎`, r.tp && `${r.tp} 🏋️`, r.xp && `${r.xp} XP`, r.pack && PACKS.find((p) => p.id === r.pack)?.name, r.card && `carte ${r.card.ovr}`].filter(Boolean).join(' · ');

/** Récompense d'un match selon le résultat. */
export const matchReward = (won: boolean, tied: boolean, points: number): Reward => ({ coins: (won ? 600 : tied ? 350 : 220) + points * 8, xp: won ? 120 : 60 });

// ———————————————————— Situations de jeu (défis, parcours, Arena, VS) ————————————————————

export interface Scenario {
  id: string;
  title: string;
  desc: string;
  /** Niveau de l'adversaire (voir opponentTeam). */
  tier: number;
  quarter: number;
  clock: number;
  score: [number, number];
  possession: 'user' | 'cpu';
  ballOn: number;
  timeouts: [number, number];
  reward: Reward;
  /** Type d'objectif : gagner le match, ou marquer pendant le drive (Arena). */
  goal: 'win' | 'drive';
}

const SITUATIONS: Omit<Scenario, 'id' | 'tier' | 'reward' | 'goal'>[] = [
  { title: 'Drive de la victoire', desc: 'Menés de 4 points, 2:00 à jouer depuis vos 25 yards.', quarter: 4, clock: 120, score: [20, 24], possession: 'user', ballOn: 25, timeouts: [2, 3] },
  { title: 'Défense héroïque', desc: '3 points d’avance, l’adversaire attaque depuis ses 35 yards, 1:30 à jouer.', quarter: 4, clock: 90, score: [17, 14], possession: 'cpu', ballOn: 35, timeouts: [2, 2] },
  { title: 'Remontée', desc: 'Menés 10-21, 4:00 à jouer, ballon sur vos 30 yards.', quarter: 4, clock: 240, score: [10, 21], possession: 'user', ballOn: 30, timeouts: [3, 3] },
  { title: 'Match éclair', desc: 'Égalité 0-0, 3:00 à jouer : le premier qui marque prend l’avantage.', quarter: 4, clock: 180, score: [0, 0], possession: 'user', ballOn: 25, timeouts: [2, 2] },
  { title: 'Ligne de but', desc: '4 points d’avance, 1st & goal adverse sur vos 6 yards, 0:45 à jouer.', quarter: 4, clock: 45, score: [24, 20], possession: 'cpu', ballOn: 94, timeouts: [1, 1] },
  { title: 'Field goal ou rien', desc: 'Menés de 2 points, 0:50 à jouer depuis le milieu du terrain.', quarter: 4, clock: 50, score: [21, 23], possession: 'user', ballOn: 50, timeouts: [1, 2] },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Madden Base : 3 défis quotidiens de difficulté croissante (même liste pour toute la journée). */
export function dailyChallenges(ut: UTState, now = new Date()): Scenario[] {
  const date = iso(now);
  const h = hashString(date);
  const base = tierForOvr(teamOvr(ut));
  return [['Rookie', -0.08, 1], ['Pro', 0, 1.6], ['All-Pro', 0.08, 2.4]].map(([label, d, k], i) => {
    const s = SITUATIONS[(h + i * 2) % SITUATIONS.length];
    return { ...s, id: `daily-${date}-${i}`, title: `${label} · ${s.title}`, tier: base + (d as number), goal: 'win' as const, reward: { coins: Math.round(450 * (k as number)), tp: Math.round(3 * (k as number)), xp: Math.round(90 * (k as number)) } };
  });
}

export function refreshDaily(ut: UTState, now = new Date()): void {
  const date = iso(now);
  if (ut.daily.date !== date) ut.daily = { date, done: [] };
}

/** Journeys : parcours de 30 étapes, chaque étape débloque la suivante. */
export const JOURNEY_LENGTH = 30;
export function journeyStage(n: number): Scenario {
  const s = SITUATIONS[(n - 1) % SITUATIONS.length];
  const reward: Reward = n === 30 ? { card: { ovr: 92, program: 'Légende du parcours' }, gems: 300, xp: 400 }
    : n % 10 === 0 ? { pack: n === 10 ? 'elite' : 'legend', xp: 250 }
      : n % 5 === 0 ? { gems: 120, coins: 1500, xp: 180 }
        : { coins: 400 + n * 40, tp: 2, xp: 100 };
  return { ...s, id: `journey-${n}`, title: `Étape ${n} · ${s.title}`, tier: 0.8 + n * 0.012, goal: 'win', reward };
}

/** Arena : un drive depuis vos 25 yards, 2:30 au chrono. Score = points marqués × 10 + bonus de temps. */
export function arenaScenario(ut: UTState): Scenario {
  return { id: 'arena', title: 'Arena — drive chronométré', desc: 'Marquez le plus de points possible sur un seul drive (2:30).', tier: tierForOvr(teamOvr(ut)) + 0.04, quarter: 4, clock: 150, score: [0, 0], possession: 'user', ballOn: 25, timeouts: [1, 3], goal: 'drive', reward: {} };
}

export const arenaPoints = (userPts: number, clockLeft: number): number => userPts * 10 + (userPts >= 6 ? Math.round(clockLeft / 3) : 0);
export const arenaReward = (pts: number): Reward => ({ gems: pts >= 100 ? 60 : pts >= 70 ? 40 : pts >= 30 ? 20 : 5, coins: 200 + pts * 5, xp: 80 });
export const weekOf = (now = Date.now()): number => Math.floor(now / (7 * 24 * 3600 * 1000));

/** Classement local de la semaine : rivaux IA fictifs aux scores déterministes. */
export function arenaLeaderboard(ut: UTState, week = weekOf()): { name: string; pts: number; me?: boolean }[] {
  const rng = new Rng(week * 131 + 7);
  const names = ['Iron Wolves', 'Blue Comets', 'Desert Kings', 'Night Owls', 'Red Rockets', 'Thunder Bay', 'Gold Rush', 'Steel City', 'Ocean Riders'];
  const rows: { name: string; pts: number; me?: boolean }[] = names.map((name) => ({ name, pts: rng.int(20, 125) }));
  rows.push({ name: ut.name, pts: ut.arena.week === week ? ut.arena.weekBest : 0, me: true });
  return rows.sort((a, b) => b.pts - a.pts);
}

export function recordArena(ut: UTState, pts: number, week = weekOf()): void {
  if (ut.arena.week !== week) ut.arena = { ...ut.arena, week, weekBest: 0 };
  ut.arena.attempts++;
  ut.arena.best = Math.max(ut.arena.best, pts);
  ut.arena.weekBest = Math.max(ut.arena.weekBest, pts);
}

/** VS : match éclair de 4 minutes contre un rival IA de votre cote. */
export function vsScenario(ut: UTState): Scenario {
  return { id: 'vs', title: 'VS — match éclair', desc: '4:00 à jouer, 0-0, vous recevez sur vos 25 yards. Le rival est choisi selon votre cote.', tier: tierForOvr(teamOvr(ut)) + (ut.vs.rating - 1000) / 2500, quarter: 4, clock: 240, score: [0, 0], possession: 'user', ballOn: 25, timeouts: [2, 2], goal: 'win', reward: { coins: 700, gems: 15, xp: 140 } };
}

export function recordVs(ut: UTState, won: boolean): number {
  const delta = won ? 25 : -15;
  ut.vs.rating = Math.max(500, ut.vs.rating + delta);
  if (won) ut.vs.wins++;
  else ut.vs.losses++;
  return delta;
}

// ———————————————————— Field Pass (parcours gratuit) ————————————————————

export const PASS_LEVELS = 30;
export const passLevel = (ut: UTState): number => Math.min(PASS_LEVELS, Math.floor(ut.xp / 300));
export function passReward(level: number): Reward {
  if (level === 30) return { card: { ovr: 91, program: 'Field Pass' }, gems: 200 };
  if (level % 10 === 0) return { pack: 'legend' };
  if (level % 5 === 0) return { pack: 'elite' };
  if (level % 3 === 0) return { gems: 50 };
  return { coins: 500 + level * 30, tp: 1 };
}

export function claimPass(ut: UTState, level: number): string[] | string {
  if (level > passLevel(ut)) return 'Niveau du pass pas encore atteint.';
  if (ut.pass.claimed.includes(level)) return 'Déjà récupéré.';
  ut.pass.claimed.push(level);
  return grant(ut, passReward(level));
}

// ———————————————————— Événements saisonniers ————————————————————

export interface SeasonEvent {
  id: string;
  name: string;
  icon: string;
  desc: string;
  challenges: Scenario[];
  /** Récompense après les 3 défis. */
  reward: Reward;
}

const EVENT_BY_MONTH: [string, string, string][] = [
  ['Playoffs', '🏆', 'Les matchs à élimination directe : chaque possession compte.'],
  ['Grande Finale', '🏈', 'La plus grande affiche de l’année.'],
  ['Pro Bowl', '⭐', 'Les meilleurs joueurs de la saison réunis.'],
  ['Draft', '📋', 'Les futurs talents arrivent : défis des rookies.'],
  ['Draft', '📋', 'Les futurs talents arrivent : défis des rookies.'],
  ['Camp d’entraînement', '🏋️', 'Préparez la saison : défis techniques.'],
  ['Camp d’entraînement', '🏋️', 'Préparez la saison : défis techniques.'],
  ['Pré-saison', '🌅', 'Les premiers matchs de préparation.'],
  ['Coup d’envoi', '🚀', 'Le début de la saison régulière.'],
  ['Saison régulière', '📅', 'Les grandes rivalités de la saison.'],
  ['Saison régulière', '📅', 'Les grandes rivalités de la saison.'],
  ['Fêtes de fin d’année', '🎄', 'Les matchs des fêtes.'],
];

/** Événement du mois en cours (renouvelé chaque mois), avec 3 défis et une carte d'événement. */
export function currentEvent(ut: UTState, now = new Date()): SeasonEvent {
  const [name, icon, desc] = EVENT_BY_MONTH[now.getMonth()];
  const id = `ev-${now.getFullYear()}-${now.getMonth() + 1}`;
  const h = hashString(id);
  const base = tierForOvr(teamOvr(ut));
  const challenges = [0, 1, 2].map((i) => {
    const s = SITUATIONS[(h + i * 3) % SITUATIONS.length];
    return { ...s, id: `${id}-${i}`, title: `${name} · ${s.title}`, tier: base + i * 0.04, goal: 'win' as const, reward: { coins: 600 + i * 300, xp: 120 } };
  });
  return { id, name, icon, desc, challenges, reward: { card: { ovr: 86, program: name }, gems: 100 } };
}
