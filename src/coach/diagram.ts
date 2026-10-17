import { DEFENSIVE_PLAYS, OFFENSIVE_PLAYS, ROUTES, type OffAssign, type RouteId } from '../data/playbook';
import type { Team } from '../data/types';
import { DEMO_STEP, demoController, type Lesson } from './academy';

/**
 * Schéma tactique d'une leçon : les 22 joueurs alignés exactement comme dans la simulation de démonstration,
 * avec les flèches de chaque mission (routes, course, blocs, blitz, couverture) et le rôle de chacun.
 * Repère : `down` = yards vers l'avant depuis la ligne de mêlée, `lat` = écart latéral (positif = droite de l'attaque).
 */

export interface DiagPoint {
  down: number;
  lat: number;
}

export type ArrowKind = 'route' | 'run' | 'lead' | 'block' | 'drop' | 'handoff' | 'blitz' | 'rush' | 'man' | 'zone';

export interface DiagArrow {
  kind: ArrowKind;
  pts: DiagPoint[];
  /** Le joueur concerné appartient-il à l'équipe étudiée ? (sinon tracé atténué) */
  main: boolean;
}

export interface DiagPlayer extends DiagPoint {
  slot: string;
  label: string;
  offense: boolean;
  /** Joueur de l'équipe étudiée (mis en avant). */
  main: boolean;
  /** Numéro affiché dans la liste des rôles (équipe étudiée uniquement). */
  n: number;
  role: string;
}

export interface DiagZone extends DiagPoint {
  rx: number;
  ry: number;
}

export interface TacticDiagram {
  side: 'off' | 'def';
  players: DiagPlayer[];
  arrows: DiagArrow[];
  zones: DiagZone[];
}

const SLOT_NAMES: Record<string, string> = {
  QB: 'Quarterback', RB: 'Running back', FB: 'Fullback', X: 'Receveur X', Z: 'Receveur Z', H: 'Receveur H (slot)', Y: 'Tight end', Y2: 'Tight end n°2',
  LT: 'Tackle gauche', LG: 'Guard gauche', C: 'Centre', RG: 'Guard droit', RT: 'Tackle droit',
  LE: 'Defensive end gauche', RE: 'Defensive end droit', LDT: 'Defensive tackle gauche', RDT: 'Defensive tackle droit', NT: 'Nose tackle',
  WLB: 'Linebacker côté faible', MLB: 'Linebacker central', SLB: 'Linebacker côté fort', LOLB: 'Linebacker extérieur gauche', ROLB: 'Linebacker extérieur droit',
  LCB: 'Cornerback gauche', RCB: 'Cornerback droit', NB: 'Nickelback', DB: 'Dimeback', FS: 'Free safety', SS: 'Strong safety',
};

/** Abréviation affichée sur le schéma. */
const SHORT: Record<string, string> = { Y2: 'Y', LDT: 'DT', RDT: 'DT', NT: 'NT', LOLB: 'OLB', ROLB: 'OLB', WLB: 'LB', MLB: 'LB', SLB: 'LB', LCB: 'CB', RCB: 'CB' };

export const ROUTE_TEXT: Record<RouteId, string> = {
  go: 'Go : file tout droit en profondeur',
  fade: 'Fade : en profondeur le long de la ligne de touche',
  slant: 'Slant : 2 pas puis diagonale vers l’intérieur',
  out: 'Out : 6 yards puis coupe vers la ligne de touche',
  dig: 'Dig : 11 yards puis coupe vers l’intérieur',
  post: 'Post : 11 yards puis diagonale vers les poteaux',
  corner: 'Corner : 11 yards puis vers le coin du terrain',
  curl: 'Curl : 11 yards puis revient vers le QB',
  flat: 'Flat : sort vers la ligne de touche, à faible profondeur',
  wheel: 'Wheel : sort vers le bord puis remonte en profondeur',
  drag: 'Drag : traverse le terrain à 4 yards',
  seam: 'Seam : monte en profondeur entre deux défenseurs',
  hitch: 'Hitch : 5 yards puis se retourne vers le QB',
  comeback: 'Comeback : 15 yards puis revient vers la touche',
  screen: 'Écran : recule derrière la ligne pour recevoir',
  swing: 'Swing : sort en arc vers le bord (option de passe)',
  angle: 'Angle : sort puis coupe vers l’intérieur',
  block: 'Reste bloquer',
};

const where = (z: DiagPoint): string => {
  const side = z.lat < -7 ? 'gauche' : z.lat > 7 ? 'droite' : 'centre';
  return `${z.down >= 12 ? 'profonde' : 'courte'} ${side === 'centre' ? 'au centre' : `à ${side}`}`;
};

/** Points d'une route à partir de la position de départ (même construction que la simulation). */
function routePoints(start: DiagPoint, route: RouteId): DiagPoint[] {
  const r = ROUTES[route];
  const sgn = start.lat === 0 ? 1 : Math.sign(start.lat);
  return [start, ...r.points.map((p) => ({ down: Math.min(24, start.down + p.down), lat: start.lat + sgn * p.out }))];
}

export function buildTacticDiagram(l: Lesson, home: Team, away: Team): TacticDiagram {
  const mc = demoController(l, home, away, 1234);
  let n = 0;
  while (mc.phase !== 'PreSnap' && n++ < 600) mc.update(DEMO_STEP);
  const sim = mc.sim!;
  const off = OFFENSIVE_PLAYS.find((p) => p.id === (l.side === 'off' ? l.id : l.demo.against))!;
  const def = DEFENSIVE_PLAYS.find((p) => p.id === (l.side === 'def' ? l.id : l.demo.against))!;
  const players: DiagPlayer[] = [];
  const arrows: DiagArrow[] = [];
  const zones: DiagZone[] = [];
  const pos = new Map<number, DiagPoint>();
  for (const a of sim.agents) pos.set(a.idx, sim.toPlay(a.x, a.y));
  const labelOf = (slot: string, offense: boolean) => (offense ? slot === 'QB' || slot === 'RB' || slot === 'FB' ? slot : ['LT', 'LG', 'C', 'RG', 'RT'].includes(slot) ? 'OL' : slot.replace('2', '') : SHORT[slot] ?? slot);
  const qb = sim.agents.find((a) => a.offense && a.slot === 'QB');
  const qbPos = qb ? pos.get(qb.idx)! : { down: -1, lat: 0 };
  const shotgun = qbPos.down < -3;
  const progression = off.progression ?? [];

  // ——— attaque ———
  for (const a of sim.agents.filter((x) => x.offense)) {
    const p = pos.get(a.idx)!;
    const main = l.side === 'off';
    const asg: OffAssign = off.assign[a.slot] ?? { kind: 'block' };
    let role = '';
    if (a.slot === 'QB') {
      if (off.category === 'run') {
        if (asg.kind === 'carry') {
          role = off.subtype === 'sneak' ? 'Garde le ballon et plonge derrière son centre.' : 'Garde le ballon et court vers l’extérieur ; latéralise au RB si le défenseur du bord vient sur lui.';
          arrows.push({ kind: 'run', pts: [p, { down: off.runAim!.down, lat: off.runAim!.lat }], main });
        } else {
          role = `Remet le ballon au ${off.handoffTo === 'RB' ? 'running back' : off.handoffTo} (flèche pointillée).`;
        }
      } else {
        const fake = off.subtype === 'playAction';
        role = `${fake ? 'Fausse remise au RB, puis lit' : shotgun ? 'Lit' : 'Recule en 3 à 5 pas, puis lit'} la défense : ${progression.slice(0, 3).map((s, i) => `${i + 1}) ${s}`).join(', ')}.`;
        if (!shotgun) arrows.push({ kind: 'drop', pts: [p, { down: p.down - 4, lat: p.lat }], main });
      }
    } else if (asg.kind === 'carry' || a.slot === off.handoffTo) {
      role = 'Porteur : prend le ballon et attaque l’intervalle visé (flèche rouge), puis lit ses blocs.';
      if (off.runAim) arrows.push({ kind: 'run', pts: [p, { down: off.runAim.down, lat: off.runAim.lat }], main });
      if (qb && off.handoffTo === a.slot) arrows.push({ kind: 'handoff', pts: [qbPos, p], main });
    } else if (asg.kind === 'lead') {
      role = 'Bloqueur de tête : part devant le porteur et percute le premier défenseur dans l’intervalle.';
      if (off.runAim) arrows.push({ kind: 'lead', pts: [p, { down: off.runAim.down + 1, lat: off.runAim.lat * 0.8 }], main });
    } else if (asg.kind === 'route') {
      const k = progression.indexOf(a.slot);
      role = `${ROUTE_TEXT[asg.route]}${k >= 0 ? ` — cible n°${k + 1}` : ''}${off.category === 'run' ? ' (option de passe)' : ''}.`;
      if (asg.route !== 'block') arrows.push({ kind: 'route', pts: routePoints(p, asg.route), main });
    } else if (asg.kind === 'fake') {
      role = 'Fausse remise : simule la course pour attirer les linebackers.';
      arrows.push({ kind: 'lead', pts: [p, { down: p.down + 2.5, lat: p.lat + 1.5 }], main });
    } else if (asg.kind === 'screenBlock') {
      role = 'Laisse passer son défenseur, puis sort escorter le running back.';
      arrows.push({ kind: 'block', pts: [p, { down: p.down + 1, lat: p.lat + Math.sign(p.lat || 1) * 3 }], main });
    } else {
      const ol = ['LT', 'LG', 'C', 'RG', 'RT'].includes(a.slot);
      role = ol
        ? off.category === 'run'
          ? off.subtype === 'outside' ? 'Bloque en glissant latéralement vers le bord (bloc de zone).' : 'Pousse le défenseur devant lui pour ouvrir l’intervalle (bloc de zone).'
          : 'Protège le QB : recule et reste entre son défenseur et le QB.'
        : 'Bloque le défenseur le plus proche (bloc de soutien).';
      arrows.push({ kind: 'block', pts: [p, { down: p.down + (off.category === 'pass' && ol ? -1.2 : 1.4), lat: p.lat + (off.subtype === 'outside' ? Math.sign(off.runAim?.lat ?? 1) * 1.2 : 0) }], main });
    }
    players.push({ ...p, slot: a.slot, label: labelOf(a.slot, true), offense: true, main, n: 0, role: `${SLOT_NAMES[a.slot] ?? a.slot} — ${role}` });
  }

  // ——— défense ———
  for (const a of sim.agents.filter((x) => !x.offense)) {
    const p = pos.get(a.idx)!;
    const main = l.side === 'def';
    let role = '';
    const blitz = def.blitz.includes(a.slot);
    if (a.defAssign === 'rush') {
      if (blitz) {
        role = 'Blitz : fonce sur le quarterback dès le snap.';
        arrows.push({ kind: 'blitz', pts: [p, { down: qbPos.down + 0.5, lat: qbPos.lat + p.lat * 0.15 }], main });
      } else {
        role = def.runFocus ? 'Tient son intervalle contre la course, puis plaque le porteur.' : 'Charge le quarterback (pass rush) tout en surveillant la course.';
        arrows.push({ kind: 'rush', pts: [p, { down: Math.max(-1.5, p.down - 2.5), lat: p.lat * 0.85 }], main });
      }
    } else if (a.defAssign === 'man' && a.manTarget >= 0) {
      const t = sim.agents[a.manTarget];
      const tp = pos.get(t.idx)!;
      role = `Individuelle : suit le ${t.slot} (${SLOT_NAMES[t.slot] ?? t.slot}) partout.`;
      arrows.push({ kind: 'man', pts: [p, tp], main });
    } else if (a.defAssign === 'spy') {
      role = 'Espion : surveille le quarterback et le plaque s’il court.';
      arrows.push({ kind: 'rush', pts: [p, { down: p.down - 2, lat: qbPos.lat }], main });
    } else {
      const z = sim.toPlay(a.zoneX, a.zoneY);
      const zone = { down: Math.min(22, z.down), lat: z.lat };
      const deep = zone.down >= 12;
      zones.push({ ...zone, rx: deep ? 9 : 6, ry: deep ? 4.5 : 3 });
      role = `Zone ${where(zone)} : défend l’espace et intercepte ce qui y arrive.${def.runFocus && a.slot === 'SS' ? ' Descend dans la boîte contre la course.' : ''}`;
      arrows.push({ kind: 'zone', pts: [p, zone], main });
    }
    players.push({ ...p, slot: a.slot, label: labelOf(a.slot, false), offense: false, main, n: 0, role: `${SLOT_NAMES[a.slot] ?? a.slot} — ${role}` });
  }
  // numérotation de l'équipe étudiée (de gauche à droite, puis de l'avant vers l'arrière)
  const mine = players.filter((p) => p.main).sort((a, b) => (l.side === 'off' ? b.down - a.down : a.down - b.down) || a.lat - b.lat);
  mine.forEach((p, i) => (p.n = i + 1));
  mc.bus.clear();
  return { side: l.side, players, arrows, zones };
}
