import { describe, expect, it } from 'vitest';
import { createDefaultTeams } from '../../src/data/generator';
import { CELEBRATIONS, celebrationOf, computePose } from '../../src/render/playerModel';

describe('célébrations de touchdown', () => {
  it('chaque joueur a la sienne (stable) et un effectif couvre presque toutes les célébrations', () => {
    const team = createDefaultTeams(1, 1)[0];
    const styles = team.roster.map((p) => celebrationOf(p.id));
    expect(celebrationOf(team.roster[0].id)).toBe(styles[0]);
    expect(new Set(styles).size).toBeGreaterThanOrEqual(CELEBRATIONS.length - 3);
  });

  it('les 12 poses sont valides et distinctes', () => {
    const sig = new Set<string>();
    for (let c = 0; c < CELEBRATIONS.length; c++) {
      const p = computePose('celebrate', 0.9, 0, 0, false, false, c);
      for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
      sig.add(Object.values(p).map((v) => v.toFixed(2)).join(','));
    }
    expect(sig.size).toBe(CELEBRATIONS.length);
    // le salto fait un tour complet au milieu de son cycle
    expect(computePose('celebrate', 0.95, 0, 0, false, false, 3).flip).toBeGreaterThan(1);
  });
});
