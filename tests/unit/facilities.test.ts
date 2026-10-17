import { describe, expect, it } from 'vitest';
import { createLeague, simulateWeek, advanceWeek, weekComplete } from '../../src/league/league';
import { facilityLevel, grantMatchRewards, homeAdvantage, startBuilding, useKit, withHomeAdvantage } from '../../src/league/facilities';

describe('installations (investisseur)', () => {
  it('construction : coût en argent et diplômes, une à la fois, terminée après N semaines', () => {
    const l = createLeague({ mode: 'franchise', userTeamId: 'tls', seed: 5, weeks: 8 });
    const f = l.finances.tls;
    expect(facilityLevel(f, 'shop')).toBe(1);
    expect(startBuilding(l, 'tls', 'shop').ok).toBe(false); // pas de diplômes
    f.diplomas = 100;
    const cash = f.cash;
    const r = startBuilding(l, 'tls', 'shop');
    expect(r.ok).toBe(true);
    expect(f.cash).toBeLessThan(cash);
    expect(f.diplomas).toBe(80);
    expect(startBuilding(l, 'tls', 'stadium').ok).toBe(false); // déjà un chantier
    const weeks = f.building!.weeksLeft;
    for (let i = 0; i < weeks; i++) {
      simulateWeek(l, true);
      if (weekComplete(l)) advanceWeek(l);
    }
    expect(f.building).toBeNull();
    expect(facilityLevel(f, 'shop')).toBe(2);
  });

  it('avantage à domicile selon le stade, trousses et récompenses de match', () => {
    const l = createLeague({ mode: 'club', userTeamId: 'tls', seed: 6, weeks: 6 });
    const f = l.finances.tls;
    f.facilities.stadium = 5;
    expect(homeAdvantage(l, 'tls')).toBe(8);
    const t = l.teams.find((x) => x.id === 'tls')!;
    const boosted = withHomeAdvantage(t, 8);
    expect(boosted.roster[0].attrs.speed).toBeGreaterThanOrEqual(t.roster[0].attrs.speed);
    expect(boosted.roster[0].id).toBe(t.roster[0].id);
    const before = f.cash;
    const r = grantMatchRewards(l, 'tls', before, 'win', 3);
    expect(r.diplomas).toBe(35);
    expect(r.cash).toBeGreaterThan(0);
    const p = t.roster[0];
    p.injuryWeeks = 3;
    f.kits = 1;
    expect(useKit(l, 'tls', p.id).ok).toBe(true);
    expect(p.injuryWeeks).toBe(0);
    expect(useKit(l, 'tls', p.id).ok).toBe(false);
  });
});
