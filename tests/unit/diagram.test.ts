import { describe, expect, it } from 'vitest';
import { LESSONS } from '../../src/coach/academy';
import { buildTacticDiagram } from '../../src/coach/diagram';
import { createDefaultTeams } from '../../src/data/generator';

const teams = createDefaultTeams(7, 2);

describe('schémas tactiques', () => {
  it('chaque leçon : 22 joueurs, 11 numérotés avec un rôle, une flèche par joueur de l’équipe étudiée', () => {
    for (const l of LESSONS) {
      const d = buildTacticDiagram(l, teams[0], teams[1]);
      expect(d.players).toHaveLength(22);
      const mine = d.players.filter((p) => p.main);
      expect(mine).toHaveLength(11);
      expect(new Set(mine.map((p) => p.n)).size).toBe(11);
      for (const p of mine) expect(p.role.length).toBeGreaterThan(15);
      expect(d.arrows.filter((a) => a.main).length).toBeGreaterThanOrEqual(10);
    }
  });

  it('contenu cohérent avec la tactique : blitz, zones, routes, course', () => {
    const get = (id: string) => buildTacticDiagram(LESSONS.find((l) => l.id === id)!, teams[0], teams[1]);
    const blitz = get('34blitz');
    expect(blitz.arrows.filter((a) => a.main && a.kind === 'blitz')).toHaveLength(4);
    expect(get('43cover3').zones.filter((z) => z.down >= 12)).toHaveLength(3);
    const slants = get('quickSlants');
    expect(slants.players.find((p) => p.main && p.slot === 'X')!.role).toContain('Slant');
    expect(get('insideZone').arrows.some((a) => a.main && a.kind === 'run')).toBe(true);
    expect(get('nickelMan').arrows.some((a) => a.main && a.kind === 'man')).toBe(true);
  });
});
