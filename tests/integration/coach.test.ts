import { describe, expect, it } from 'vitest';
import { createDefaultTeams } from '../../src/data/generator';
import { OFFENSIVE_PLAYS } from '../../src/data/playbook';
import { MatchController } from '../../src/match/MatchController';
import { DEFAULT_RULES } from '../../src/rules/config';

const teams = createDefaultTeams(1);
const BOOK = { off: ['insideZone', 'quickSlants'], def: ['43cover3', '43runStop'] };

/** Match où l'utilisateur (côté 0) est uniquement entraîneur : il appelle des actions, l'IA joue. */
function coachMatch(seed: number, auto = false) {
  const mc = new MatchController(teams[0], teams[1], { userSide: 0, seed, headless: true, playbook: BOOK, rules: { ...DEFAULT_RULES, quarterMinutes: 1 } });
  mc.autoCoach = auto;
  const userCalls: string[] = [];
  let userAgents = 0;
  mc.bus.on('phase', (e) => {
    if (e.phase === 'LivePlay' && mc.sim) {
      if (mc.sim.userAgent >= 0) userAgents++;
      const side = mc.sim.offense;
      if (side === 0 && mc.offCall) userCalls.push(mc.offCall.id);
      if (side === 1 && mc.defCall) userCalls.push(mc.defCall.id);
    }
  });
  mc.start();
  if (mc.phase === 'CoinToss') mc.resolveCoinToss('heads', 'receive');
  let guard = 0;
  let i = 0;
  while (mc.phase !== 'MatchFinished' && guard++ < 200000) {
    if (mc.phase === 'PlaySelection' && !auto) {
      const s = mc.state;
      if (s.possession === 0) {
        if (s.nextKind === 'conversion') mc.chooseConversion('kick');
        else if (s.down === 4) mc.selectOffense(s.ballOn > 62 ? 'fieldGoal' : 'punt');
        else mc.selectOffense(BOOK.off[i++ % 2]);
      } else mc.selectDefense(BOOK.def[i++ % 2]);
    }
    mc.update(1 / 30);
  }
  return { mc, userCalls, userAgents };
}

describe('mode entraîneur', () => {
  it('le match se joue jusqu’au bout sans qu’aucun joueur ne soit dirigé par l’utilisateur', () => {
    const { mc, userAgents, userCalls } = coachMatch(7);
    expect(mc.phase).toBe('MatchFinished');
    expect(userAgents).toBe(0);
    expect(userCalls.length).toBeGreaterThan(5);
  });

  it('entraîneur adjoint automatique : il ne choisit que des tactiques débloquées (ou spéciales)', () => {
    const { mc, userCalls } = coachMatch(8, true);
    expect(mc.phase).toBe('MatchFinished');
    const special = new Set(OFFENSIVE_PLAYS.filter((p) => p.category === 'special').map((p) => p.id));
    const allowed = new Set([...BOOK.off, ...BOOK.def]);
    expect(userCalls.length).toBeGreaterThan(5);
    for (const id of userCalls) expect(allowed.has(id) || special.has(id)).toBe(true);
  });

  it('suggestions de l’adjoint limitées aux tactiques débloquées', () => {
    const mc = new MatchController(teams[0], teams[1], { userSide: 0, seed: 2, playbook: BOOK });
    mc.state.down = 2;
    mc.state.toGo = 7;
    for (let k = 0; k < 20; k++) {
      expect(BOOK.off).toContain(mc.suggestOffense().id);
      expect(BOOK.def).toContain(mc.suggestDefense().id);
    }
  });

  it('consigne « receveur prioritaire » : il passe en tête de la lecture du QB', () => {
    const mc = new MatchController(teams[0], teams[1], { userSide: 0, seed: 3, playbook: BOOK });
    mc.start();
    mc.resolveCoinToss('heads', 'receive');
    let guard = 0;
    while (!(mc.phase === 'PlaySelection' && mc.state.possession === 0) && guard++ < 20000) {
      if (mc.phase === 'PlaySelection') mc.selectDefense('43cover3');
      mc.update(1 / 30);
    }
    const slants = OFFENSIVE_PLAYS.find((p) => p.id === 'quickSlants')!;
    const last = slants.progression![slants.progression!.length - 1];
    mc.priorityTarget = last;
    expect(mc.selectOffense('quickSlants')).toBe(true);
    expect(mc.offCall!.progression![0]).toBe(last);
    expect(slants.progression![0]).not.toBe(last);
  });

  it('actions imposées (démonstration de l’académie) pour les deux équipes', () => {
    const mc = new MatchController(teams[0], teams[1], { userSide: null, seed: 4, headless: true, forcedCalls: { off: 'paBoot', def: 'nickelBlitz' } });
    mc.practiceHook = (s) => {
      s.nextKind = 'scrimmage';
      s.ballOn = 35;
      s.down = 1;
      s.toGo = 10;
    };
    mc.start();
    let guard = 0;
    while (mc.phase !== 'PreSnap' && guard++ < 1000) mc.update(1 / 30);
    expect(mc.offCall?.id).toBe('paBoot');
    expect(mc.defCall?.id).toBe('nickelBlitz');
  });

  it('livre de jeu restreint : seules les actions choisies + actions spéciales', () => {
    const mc = new MatchController(teams[0], teams[1], { userSide: 0, seed: 3, playbook: { off: ['insideZone', 'quickSlants'], def: ['43cover2'] } });
    const ids = mc.offensePlaysForUser().map((p) => p.id);
    expect(ids).toContain('insideZone');
    expect(ids).toContain('punt');
    expect(ids).not.toContain('fourVerts');
    expect(mc.defensePlaysForUser().map((p) => p.id)).toEqual(['43cover2']);
  });

  it('fin anticipée (Arena) : le match s’arrête quand la condition est remplie', () => {
    const mc = new MatchController(teams[0], teams[1], { userSide: 0, seed: 5, headless: true, endCheck: (s) => s.playNumber >= 3 });
    mc.autoCoach = true;
    mc.start();
    mc.resolveCoinToss('heads', 'receive');
    let guard = 0;
    while (mc.phase !== 'MatchFinished' && guard++ < 40000) mc.update(1 / 30);
    expect(mc.phase).toBe('MatchFinished');
    expect(mc.state.playNumber).toBeLessThan(6);
  });
});
