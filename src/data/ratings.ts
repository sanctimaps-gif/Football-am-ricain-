import type { Attributes, Player, Position } from './types';

type Weights = Partial<Record<keyof Attributes, number>>;

/** Pondérations utilisées pour la note globale par poste. */
export const POSITION_WEIGHTS: Record<Position, Weights> = {
  QB: { throwAccuracy: 4, throwPower: 2.5, awareness: 3, agility: 1, speed: 0.7, stamina: 0.5 },
  RB: { speed: 3, acceleration: 2.5, agility: 2.5, strength: 1.2, catching: 1, awareness: 1, stamina: 0.6 },
  FB: { blocking: 3, strength: 2.5, speed: 1, catching: 1, awareness: 1 },
  WR: { speed: 3, catching: 3.5, agility: 2, acceleration: 1.5, awareness: 1 },
  TE: { catching: 2.5, blocking: 2.5, strength: 1.5, speed: 1.2, awareness: 1 },
  C: { blocking: 4, strength: 3, awareness: 1.5, agility: 0.5 },
  OG: { blocking: 4, strength: 3, awareness: 1, agility: 0.5 },
  OT: { blocking: 4, strength: 2.5, agility: 1.2, awareness: 1 },
  DE: { strength: 2.5, speed: 2, tackling: 2.5, agility: 1.5, acceleration: 1 },
  DT: { strength: 3.5, tackling: 2.5, blocking: 0.5, agility: 1, awareness: 0.8 },
  LB: { tackling: 3, speed: 2, awareness: 2.5, strength: 1.5, agility: 1 },
  CB: { speed: 3.5, agility: 2.5, awareness: 2, catching: 1, acceleration: 1.5, tackling: 0.7 },
  FS: { speed: 2.5, awareness: 3, catching: 1.2, tackling: 1.5, agility: 1.2 },
  SS: { tackling: 2.5, speed: 2, awareness: 2.5, strength: 1.2, agility: 1 },
  K: { kickPower: 3, kickAccuracy: 3.5, awareness: 0.3 },
  P: { kickPower: 3.5, kickAccuracy: 2.5, awareness: 0.3 },
};

export function overallFor(attrs: Attributes, pos: Position): number {
  const w = POSITION_WEIGHTS[pos];
  let sum = 0;
  let total = 0;
  for (const k of Object.keys(w) as (keyof Attributes)[]) {
    sum += attrs[k] * (w[k] ?? 0);
    total += w[k] ?? 0;
  }
  return Math.round(Math.max(30, Math.min(99, sum / total)));
}

export const overall = (p: Player): number => overallFor(p.attrs, p.position);

/** Vitesse maximale en yards/s à partir de l'attribut (≈ 6,4 à 10,3 yd/s). */
export const topSpeed = (a: Attributes): number => 6.2 + (a.speed / 99) * 4.1;
/** Accélération en yd/s². */
export const accelRate = (a: Attributes): number => 6 + (a.acceleration / 99) * 9;
