import { describe, expect, it } from 'vitest';
import { createDefaultTeams } from '../../src/data/generator';
import { createLeague, isLeague, recordResult, simulateWeek, userGame, advanceWeek } from '../../src/league/league';
import { MatchController, simulateMatch } from '../../src/match/MatchController';
import { DEFAULT_RULES } from '../../src/rules/config';
import { SaveManager } from '../../src/save/SaveManager';
import { MemoryStore } from '../../src/save/storage';
import { emptyInput, type SimEvent } from '../../src/sim/types';

const teams = createDefaultTeams(1);

/** Joue un match en simulant un utilisateur humain (côté 0). */
function botMatch(seed: number, quarterMinutes = 1, playbook: string[] = ['meshDrag', 'insideZone', 'quickSlants', 'outsideZone']) {
  const mc = new MatchController(teams[0], teams[1], { userSide: 0, seed, rules: { ...DEFAULT_RULES, quarterMinutes } });
  const events: SimEvent[] = [];
  const phases = new Set<string>();
  mc.bus.on('sim', (e) => events.push(e.event));
  mc.bus.on('phase', (e) => phases.add(e.phase));
  mc.start();
  mc.resolveCoinToss('heads', 'receive');
  let i = 0;
  let steps = 0;
  let playStart = 0;
  let maxPlaySteps = 0;
  while (mc.phase !== 'MatchFinished' && steps < 200000) {
    steps++;
    const input = emptyInput();
    if (mc.phase === 'PlaySelection') {
      if (mc.state.possession === 0) {
        if (mc.state.nextKind === 'conversion') mc.chooseConversion(i % 3 === 0 ? 'two' : 'kick');
        if (mc.state.nextKind === 'conversion' && mc.conversionType === 'two') mc.selectOffense('quickSlants');
        else if (mc.state.down === 4) mc.selectOffense(mc.state.ballOn > 62 ? 'fieldGoal' : 'punt');
        else mc.selectOffense(playbook[i++ % playbook.length]);
      } else mc.selectDefense(['43cover2', '43cover3', 'nickelMan', '34blitz'][i++ % 4]);
    }
    if (mc.phase === 'PreSnap' && mc.sim && mc.sim.offense === 0 && mc.phaseTime > 0.5) {
      mc.snap();
      playStart = steps;
    }
    const sim = mc.sim;
    if (sim && (mc.phase === 'LivePlay' || mc.phase === 'PassInFlight')) {
      maxPlaySteps = Math.max(maxPlaySteps, steps - playStart);
      if (sim.awaitingKick) input.kickMeter = 0.1;
      const u = sim.userAgent >= 0 ? sim.agents[sim.userAgent] : null;
      if (u && sim.ball.holder === u.idx && u.idx === sim.qbIdx && sim.isPassPlay && sim.t > 1.4) input.pass = true;
      // le porteur contrôlé court vers l'avant
      if (u && sim.ball.holder === u.idx && !(u.idx === sim.qbIdx && sim.isPassPlay && !sim.thrown)) {
        const dir = u.side === sim.offense ? sim.dir : -sim.dir;
        input.moveX = dir;
        input.sprint = true;
      }
    } else playStart = steps;
    mc.update(1 / 30, input);
  }
  return { mc, events, phases, steps, maxPlaySteps };
}

describe('match interactif piloté', () => {
  it('se joue jusqu’au bout avec un score cohérent', () => {
    const { mc, events, phases } = botMatch(5);
    expect(mc.phase).toBe('MatchFinished');
    const s = mc.state;
    // reconstruction du score à partir des tags
    const pts: [number, number] = [0, 0];
    for (const l of s.log) {
      const sc = l.score;
      expect(sc[0]).toBeGreaterThanOrEqual(pts[0]);
      expect(sc[1]).toBeGreaterThanOrEqual(pts[1]);
      pts[0] = sc[0];
      pts[1] = sc[1];
    }
    expect(pts).toEqual(s.score);
    const tdCount = s.log.filter((l) => l.tags.includes('TOUCHDOWN')).length;
    const conv = s.log.filter((l) => l.tags.some((t) => ['XP_GOOD', 'XP_NO_GOOD', 'TWO_PT_GOOD', 'TWO_PT_FAILED', 'DEFENSIVE_TWO_PT'].includes(t))).length;
    // chaque touchdown est suivi d'une conversion (sauf touchdown décisif en prolongation)
    expect(conv).toBeGreaterThanOrEqual(tdCount - 1);
    expect(events.some((e) => e.type === 'snap')).toBe(true);
    expect(events.some((e) => e.type === 'throw')).toBe(true);
    expect(events.some((e) => e.type === 'tackle')).toBe(true);
    for (const p of ['CoinToss', 'PreSnap', 'LivePlay', 'BallDead', 'PlayReview', 'PlaySelection', 'MatchFinished']) expect(phases.has(p)).toBe(true);
    expect(s.teamStats[0].passAtt + s.teamStats[0].rushAtt).toBeGreaterThan(5);
  });

  it('aucune action sans fin et chrono décroissant', () => {
    const { mc, maxPlaySteps } = botMatch(9);
    expect(maxPlaySteps).toBeLessThan(30 * 32); // < 32 s de jeu par action
    let lastQ = 1;
    let lastClock = Infinity;
    for (const l of mc.state.log) {
      if (l.quarter !== lastQ) {
        lastQ = l.quarter;
        lastClock = Infinity;
      }
      expect(l.clock).toBeLessThanOrEqual(lastClock + 1e-6);
      lastClock = l.clock;
    }
  });

  it('le snap est impossible pendant la sélection et une passe impossible avant le snap', () => {
    const mc = new MatchController(teams[0], teams[1], { userSide: 0, seed: 3 });
    mc.start();
    mc.resolveCoinToss('heads', 'kick');
    // pendant le coup d'envoi, on attend la fin
    let guard = 0;
    while (mc.phase !== 'PlaySelection' && guard++ < 5000) {
      if (mc.phase === 'PreSnap' && mc.sim?.offense === 0) mc.snap();
      const inp = emptyInput();
      if (mc.sim?.awaitingKick) inp.kickMeter = 0;
      mc.update(1 / 30, inp);
    }
    expect(mc.phase).toBe('PlaySelection');
    expect(mc.snap()).toBe(false);
    const before = mc.state.playNumber;
    const inp = emptyInput();
    inp.pass = true;
    mc.update(1 / 30, inp);
    expect(mc.state.playNumber).toBe(before);
  });

  it('pause : la simulation ne progresse pas', () => {
    const mc = new MatchController(teams[2], teams[3], { userSide: null, seed: 4, headless: false });
    mc.start();
    for (let i = 0; i < 200; i++) mc.update(1 / 30);
    mc.paused = true;
    const t = mc.sim?.t;
    const clock = mc.state.clock;
    for (let i = 0; i < 100; i++) mc.update(1 / 30);
    expect(mc.sim?.t).toBe(t);
    expect(mc.state.clock).toBe(clock);
  });
});

describe('simulation IA contre IA', () => {
  it('plusieurs matchs complets sans blocage, scores plausibles', () => {
    for (let i = 0; i < 4; i++) {
      const mc = simulateMatch(teams[i], teams[i + 4], { seed: 50 + i, rules: { ...DEFAULT_RULES, quarterMinutes: 1 } });
      expect(mc.state.finished).toBe(true);
      expect(mc.state.score[0] + mc.state.score[1]).toBeLessThan(150);
      expect(mc.state.score.every((x) => x !== 1)).toBe(true); // 1 point seul impossible
    }
  });

  it('les turnovers changent bien la possession', () => {
    const mc = simulateMatch(teams[5], teams[6], { seed: 77, rules: { ...DEFAULT_RULES, quarterMinutes: 3 } });
    const log = mc.state.log;
    for (let i = 0; i < log.length - 1; i++) {
      const tags = log[i].tags;
      if ((tags.includes('INTERCEPTION') || tags.includes('FUMBLE_LOST') || tags.includes('TURNOVER_ON_DOWNS')) && !tags.includes('TOUCHDOWN') && !tags.some((t) => t.startsWith('END') || t === 'HALFTIME')) {
        expect(log[i + 1].offense).not.toBe(log[i].offense);
      }
    }
  });
});

describe('ligue + match joué + sauvegarde', () => {
  it('un match joué par l’utilisateur est enregistré et survit au rechargement', () => {
    const l = createLeague({ mode: 'season', userTeamId: 'lyn', seed: 12, weeks: 3, quarterMinutes: 1 });
    const g = userGame(l)!;
    const home = l.teams.find((t) => t.id === g.home)!;
    const away = l.teams.find((t) => t.id === g.away)!;
    const mc = simulateMatch(home, away, { seed: 1, rules: { ...DEFAULT_RULES, quarterMinutes: 1 } });
    recordResult(l, g, mc.state, true);
    simulateWeek(l, false);
    advanceWeek(l);
    expect(l.week).toBe(2);
    const sm = new SaveManager(new MemoryStore());
    sm.saveSlot({ slot: 2, kind: 'season', title: 't', teamId: 'lyn', season: 1, week: 2, updatedAt: 0 }, l);
    const back = sm.loadSlot(2, isLeague)!;
    const saved = back.schedule[0].find((x) => x.id === g.id)!;
    expect(saved.score).toEqual([mc.state.score[0], mc.state.score[1]]);
    expect(saved.userPlayed).toBe(true);
  });
});
