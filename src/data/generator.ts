import { Rng, hashString } from '../core/rng';
import { FIRST_NAMES, FIRST_NAMES_F, LAST_NAMES } from './names';
import { overallFor } from './ratings';
import { TEAM_TEMPLATES, type TeamTemplate } from './teams';
import { leagueDef, NATIONS, NATIONS_W } from './world';
import type { Attributes, Player, Position, Team } from './types';

type AttrProfile = Partial<Record<keyof Attributes, number>>;

/** Moyennes d'attributs par poste (avant facteur de niveau). */
const PROFILES: Record<Position, AttrProfile> = {
  QB: { speed: 62, acceleration: 64, agility: 62, strength: 55, tackling: 25, throwAccuracy: 78, throwPower: 80, catching: 40, blocking: 25, awareness: 74 },
  RB: { speed: 84, acceleration: 85, agility: 82, strength: 66, tackling: 35, throwAccuracy: 30, throwPower: 35, catching: 66, blocking: 45, awareness: 66 },
  FB: { speed: 66, acceleration: 66, agility: 58, strength: 76, tackling: 45, catching: 58, blocking: 74, awareness: 62 },
  WR: { speed: 86, acceleration: 84, agility: 82, strength: 52, tackling: 28, catching: 80, blocking: 42, awareness: 66 },
  TE: { speed: 72, acceleration: 70, agility: 64, strength: 72, tackling: 40, catching: 70, blocking: 68, awareness: 64 },
  C: { speed: 50, acceleration: 54, agility: 50, strength: 82, tackling: 35, catching: 30, blocking: 80, awareness: 70 },
  OG: { speed: 50, acceleration: 54, agility: 50, strength: 84, tackling: 35, catching: 28, blocking: 79, awareness: 64 },
  OT: { speed: 54, acceleration: 56, agility: 56, strength: 82, tackling: 35, catching: 28, blocking: 80, awareness: 64 },
  DE: { speed: 74, acceleration: 76, agility: 68, strength: 78, tackling: 76, catching: 35, blocking: 40, awareness: 64 },
  DT: { speed: 60, acceleration: 64, agility: 56, strength: 86, tackling: 76, catching: 30, blocking: 45, awareness: 62 },
  LB: { speed: 74, acceleration: 75, agility: 68, strength: 72, tackling: 79, catching: 55, blocking: 45, awareness: 72 },
  CB: { speed: 87, acceleration: 86, agility: 84, strength: 52, tackling: 62, catching: 62, blocking: 30, awareness: 70 },
  FS: { speed: 82, acceleration: 80, agility: 76, strength: 60, tackling: 70, catching: 62, blocking: 32, awareness: 74 },
  SS: { speed: 80, acceleration: 79, agility: 72, strength: 66, tackling: 76, catching: 56, blocking: 36, awareness: 72 },
  K: { speed: 50, acceleration: 50, agility: 50, strength: 45, tackling: 20, catching: 30, blocking: 20, awareness: 55, kickPower: 82, kickAccuracy: 80 },
  P: { speed: 50, acceleration: 50, agility: 50, strength: 45, tackling: 20, catching: 30, blocking: 20, awareness: 55, kickPower: 82, kickAccuracy: 74 },
};

const NUMBER_RANGES: Record<Position, [number, number][]> = {
  QB: [[1, 19]], RB: [[20, 49]], FB: [[30, 49]], WR: [[10, 19], [80, 89]], TE: [[80, 89], [40, 49]],
  C: [[50, 79]], OG: [[60, 79]], OT: [[60, 79]], DE: [[90, 99], [50, 59]], DT: [[90, 99], [70, 79]],
  LB: [[50, 59], [40, 49]], CB: [[20, 39]], FS: [[20, 49]], SS: [[20, 49]], K: [[1, 9]], P: [[1, 9]],
};

const BODY: Record<Position, [number, number]> = {
  // [taille cm, poids kg]
  QB: [191, 101], RB: [180, 97], FB: [185, 111], WR: [185, 91], TE: [196, 114], C: [191, 136], OG: [193, 141],
  OT: [198, 143], DE: [196, 122], DT: [191, 140], LB: [188, 109], CB: [180, 86], FS: [183, 93], SS: [183, 96], K: [180, 84], P: [185, 90],
};

export const ROSTER_TEMPLATE: Record<Position, number> = {
  QB: 3, RB: 3, FB: 1, WR: 6, TE: 3, C: 2, OG: 4, OT: 4, DE: 4, DT: 4, LB: 6, CB: 5, FS: 2, SS: 2, K: 1, P: 1,
};

const POSITION_SALARY: Partial<Record<Position, number>> = { QB: 2.4, DE: 1.3, OT: 1.2, WR: 1.15, CB: 1.15, K: 0.4, P: 0.35, FB: 0.6 };

export function salaryFor(ovr: number, pos: Position): number {
  const base = Math.max(0, ovr - 55);
  return Math.round(Math.max(750, 600 + base * base * 6 * (POSITION_SALARY[pos] ?? 1)) / 10) * 10;
}

const clampAttr = (v: number) => Math.max(20, Math.min(99, Math.round(v)));

export function generateAttributes(rng: Rng, pos: Position, quality: number): Attributes {
  const prof = PROFILES[pos];
  const get = (k: keyof Attributes, dflt: number) => clampAttr(((prof[k] ?? dflt) + rng.normal(0, 6)) * quality);
  return {
    speed: get('speed', 60),
    acceleration: get('acceleration', 60),
    agility: get('agility', 60),
    strength: get('strength', 60),
    tackling: get('tackling', 40),
    throwAccuracy: get('throwAccuracy', 30),
    throwPower: get('throwPower', 35),
    catching: get('catching', 40),
    blocking: get('blocking', 40),
    stamina: get('stamina', 75),
    awareness: get('awareness', 60),
    kickPower: get('kickPower', 30),
    kickAccuracy: get('kickAccuracy', 30),
  };
}

export function generatePlayer(rng: Rng, pos: Position, quality: number, id: string, usedNumbers: Set<number>, female = false): Player {
  const attrs = generateAttributes(rng, pos, quality);
  const ranges = NUMBER_RANGES[pos];
  let number = 0;
  for (let tries = 0; tries < 60; tries++) {
    const r = rng.pick(ranges);
    const n = rng.int(r[0], r[1]);
    if (!usedNumbers.has(n)) {
      number = n;
      break;
    }
  }
  if (!number) for (let n = 1; n < 100; n++) if (!usedNumbers.has(n)) { number = n; break; }
  usedNumbers.add(number);
  const [h, w] = BODY[pos];
  const age = rng.int(21, 33);
  const ovr = overallFor(attrs, pos);
  return {
    id,
    firstName: rng.pick(female ? FIRST_NAMES_F : FIRST_NAMES),
    lastName: rng.pick(LAST_NAMES),
    position: pos,
    number,
    age,
    attrs,
    potential: Math.min(99, Math.max(ovr, Math.round(ovr + rng.range(0, 14) * (age < 25 ? 1.4 : age < 29 ? 0.7 : 0.2)))),
    contract: { salary: salaryFor(ovr, pos), years: rng.int(1, 5) },
    appearance: {
      skinTone: rng.int(0, 5),
      heightCm: Math.round(h - (female ? 12 : 0) + rng.normal(0, 4)),
      weightKg: Math.round(w * (female ? 0.78 : 1) + rng.normal(0, 5)),
      visor: rng.chance(0.3),
      ...(female ? { female: true, hair: rng.int(0, 5) } : {}),
    },
    injuryWeeks: 0,
    xp: 0,
    history: [],
  };
}

export function buildDepthChart(roster: Player[]): Team['depth'] {
  const depth: Team['depth'] = {};
  for (const p of roster) {
    (depth[p.position] ??= []).push(p.id);
  }
  const byId = new Map(roster.map((p) => [p.id, p]));
  for (const pos of Object.keys(depth) as Position[]) {
    depth[pos]!.sort((a, b) => overallFor(byId.get(b)!.attrs, pos) - overallFor(byId.get(a)!.attrs, pos));
  }
  return depth;
}

export function generateRoster(teamId: string, seed: number, tier: number, female = false): Player[] {
  const rng = new Rng(seed);
  const roster: Player[] = [];
  const used = new Set<number>();
  let n = 0;
  for (const pos of Object.keys(ROSTER_TEMPLATE) as Position[]) {
    for (let i = 0; i < ROSTER_TEMPLATE[pos]; i++) {
      // les titulaires sont meilleurs que les remplaçants
      const quality = tier * (i === 0 ? 1.04 : i === 1 ? 0.98 : 0.92) * rng.range(0.96, 1.03);
      roster.push(generatePlayer(rng, pos, quality, `${teamId}-p${n++}`, used, female));
    }
  }
  return roster;
}

/** Couleur claire (luminance perçue élevée) : utilisée pour éviter deux maillots blancs. */
export function isLight(hex: string): boolean {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 186;
}

export function teamFromTemplate(t: TeamTemplate, leagueSeed = 1): Team {
  // écart de niveau resserré pour garder des matchs disputés
  const roster = generateRoster(t.id, hashString(t.id) ^ leagueSeed, 1 + (t.tier - 1) * 0.5, !!t.women);
  return {
    id: t.id,
    city: t.city,
    name: t.name,
    abbr: t.abbr,
    conference: t.conference,
    colors: { primary: t.primary, secondary: t.secondary, accent: t.accent },
    logo: { shape: t.logoShape, glyph: t.glyph, stripes: false },
    uniform: {
      helmet: t.primary,
      homeJersey: t.primary,
      awayJersey: isLight(t.primary) ? t.secondary : '#F4F4F4',
      homePants: t.secondary === '#FFFFFF' ? '#E8E8E8' : t.secondary,
      awayPants: t.primary,
      numberColor: t.secondary,
      stripe: t.secondary,
    },
    stadium: { name: t.stadium, capacity: t.capacity, standColor: t.primary, roof: false },
    roster,
    depth: buildDepthChart(roster),
    ...(t.women ? { women: true } : {}),
  };
}

export function createDefaultTeams(leagueSeed = 1, count = TEAM_TEMPLATES.length): Team[] {
  return TEAM_TEMPLATES.slice(0, count).map((t) => teamFromTemplate(t, leagueSeed));
}

export function teamOverall(team: Team): number {
  const starters: [Position, number][] = [['QB', 1], ['RB', 1], ['WR', 3], ['TE', 1], ['OT', 2], ['OG', 2], ['C', 1], ['DE', 2], ['DT', 2], ['LB', 3], ['CB', 2], ['FS', 1], ['SS', 1], ['K', 1]];
  const byId = new Map(team.roster.map((p) => [p.id, p]));
  let sum = 0;
  let n = 0;
  for (const [pos, count] of starters) {
    const ids = team.depth[pos] ?? [];
    for (let i = 0; i < count && i < ids.length; i++) {
      const p = byId.get(ids[i]);
      if (p) {
        sum += overallFor(p.attrs, pos);
        n++;
      }
    }
  }
  return n ? Math.round(sum / n) : 50;
}

/** Équipes d'une ligue régionale (ou des sélections nationales avec l'id « nations »). */
export function createTeamsFor(groupId: string, seed = 1): Team[] {
  const templates = groupId === 'nations' ? NATIONS : groupId === 'nationsF' ? NATIONS_W : leagueDef(groupId).teams;
  return templates.map((t) => teamFromTemplate(t, seed));
}
