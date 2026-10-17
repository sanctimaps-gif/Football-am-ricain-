import { describe, expect, it } from 'vitest';
import { coachNameFor, recentForm, scoutOpponent, unitRatings } from '../../src/coach/scouting';
import { LESSONS } from '../../src/coach/academy';
import { createDefaultTeams } from '../../src/data/generator';
import type { ScheduledGame } from '../../src/league/schedule';

const teams = createDefaultTeams(1);

describe('rapport sur l’adversaire', () => {
  it('notes d’unités, joueurs clés, style, conseils liés à des tactiques réelles', () => {
    const r = scoutOpponent({ opponent: teams[1], user: teams[0], unlocked: ['insideZone'], plan: { passRatio: 0.7, aggression: 0.7, deepShots: 0.6 } });
    expect(r.units).toHaveLength(6);
    for (const x of r.units) expect(x.value).toBeGreaterThanOrEqual(30);
    expect(r.keyPlayers).toHaveLength(3);
    expect(r.keyPlayers[0].ovr).toBeGreaterThanOrEqual(r.keyPlayers[2].ovr);
    expect(r.style.join(' ')).toContain('lance beaucoup');
    expect(r.style.join(' ')).toContain('agressif');
    expect(r.advice.length).toBeGreaterThan(0);
    for (const a of r.advice) {
      expect(LESSONS.some((l) => l.id === a.play)).toBe(true);
      expect(a.unlocked).toBe(a.play === 'insideZone');
    }
    expect(r.strengths).toHaveLength(2);
    expect(r.weaknesses).toHaveLength(2);
    expect(r.verdict.length).toBeGreaterThan(10);
  });

  it('nom d’entraîneur stable et forme sur les derniers matchs', () => {
    expect(coachNameFor(teams[2])).toBe(coachNameFor(teams[2]));
    const id = teams[1].id;
    const g = (home: string, away: string, s: [number, number]): ScheduledGame => ({ id: home + away, week: 1, home, away, played: true, score: s, overtime: false });
    const sched = [[g(id, 'x', [21, 14])], [g('y', id, [10, 10])], [g('z', id, [28, 3])], [{ ...g(id, 'w', [0, 0]), played: false, score: null }]];
    expect(recentForm(id, sched)).toEqual(['V', 'N', 'D']);
  });

  it('équipe plus forte détectée dans le verdict', () => {
    const strong = structuredClone(teams[1]);
    for (const p of strong.roster) for (const k of Object.keys(p.attrs) as (keyof typeof p.attrs)[]) p.attrs[k] = 95;
    const r = scoutOpponent({ opponent: strong, user: teams[0], unlocked: [] });
    expect(r.verdict).toContain('plus fort');
    expect(unitRatings(strong).every((u) => u.value >= 90)).toBe(true);
  });
});
