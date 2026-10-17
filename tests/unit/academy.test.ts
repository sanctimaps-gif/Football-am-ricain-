import { describe, expect, it } from 'vitest';
import {
  basicsDone, coachPlaybook, DEMO_STEP, demoController, demoOutcome, findDemoSeed, LESSONS, lessonAvailable, lessonQuiz, nextStarter, STARTER_LESSONS, unlock,
} from '../../src/coach/academy';
import { createDefaultTeams } from '../../src/data/generator';
import { DEFENSIVE_PLAYS, OFFENSIVE_PLAYS } from '../../src/data/playbook';

const teams = createDefaultTeams(1);

describe('académie tactique', () => {
  it('une leçon par tactique d’attaque (hors spéciales) et de défense, démonstrations cohérentes', () => {
    const off = OFFENSIVE_PLAYS.filter((p) => p.category !== 'special').map((p) => p.id).sort();
    const def = DEFENSIVE_PLAYS.map((p) => p.id).sort();
    expect(LESSONS.filter((l) => l.side === 'off').map((l) => l.id).sort()).toEqual(off);
    expect(LESSONS.filter((l) => l.side === 'def').map((l) => l.id).sort()).toEqual(def);
    for (const l of LESSONS) {
      // l'adversaire de démonstration est de l'autre camp
      expect(l.side === 'off' ? def : off).toContain(l.demo.against);
      expect(l.text.length).toBeGreaterThan(80);
      expect(l.keys.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('4 tutoriels de base obligatoires (2 attaque, 2 défense), les autres verrouillés avant', () => {
    expect(STARTER_LESSONS).toHaveLength(4);
    let u: string[] = [];
    expect(basicsDone(u)).toBe(false);
    const adv = LESSONS.find((l) => !STARTER_LESSONS.includes(l.id))!;
    expect(lessonAvailable(adv, u)).toBe(false);
    for (const id of STARTER_LESSONS) {
      expect(nextStarter(u)).toBe(id);
      u = unlock(u, id);
    }
    u = unlock(u, STARTER_LESSONS[0]);
    expect(u).toHaveLength(4);
    expect(basicsDone(u)).toBe(true);
    expect(lessonAvailable(adv, u)).toBe(true);
    const book = coachPlaybook(u);
    expect(book.off).toHaveLength(2);
    expect(book.def).toHaveLength(2);
  });

  it('question de compréhension : 3 réponses distinctes, une seule correcte', () => {
    for (const l of LESSONS) {
      const q = lessonQuiz(l);
      expect(q.answers).toHaveLength(3);
      expect(new Set(q.answers).size).toBe(3);
      expect(q.answers[q.correct]).toBe(l.whenToUse);
    }
  });

  it('chaque démonstration joue l’action imposée et se termine', () => {
    for (const l of LESSONS) {
      const mc = demoController(l, teams[0], teams[1], 1234);
      let n = 0;
      while (mc.phase !== 'BallDead' && n++ < 60 * 40) mc.update(DEMO_STEP);
      expect(mc.phase).toBe('BallDead');
      expect(l.side === 'off' ? mc.offCall?.id : mc.defCall?.id).toBe(l.id);
      expect(demoOutcome(mc)).not.toBeNull();
    }
  });

  it('démonstration déterministe : même graine, même résultat', () => {
    const l = LESSONS[0];
    const seed = findDemoSeed(l, teams[0], teams[1], 4);
    const run = () => {
      const mc = demoController(l, teams[0], teams[1], seed);
      let n = 0;
      while (mc.phase !== 'BallDead' && n++ < 60 * 40) mc.update(DEMO_STEP);
      return demoOutcome(mc);
    };
    expect(run()).toEqual(run());
  });
});
