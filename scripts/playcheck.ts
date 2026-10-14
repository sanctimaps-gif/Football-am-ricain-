import { createDefaultTeams } from '../src/data/generator';
import { DEF_FRONTS, FORMATIONS, defPlayById, playById } from '../src/data/playbook';
import { DEFAULT_RULES } from '../src/rules/config';
import { PlaySim } from '../src/sim/PlaySim';
import { kickoffCoverage, kickReturnUnit, selectPersonnel } from '../src/sim/personnel';
import { DIFFICULTIES, type SimKind } from '../src/sim/types';

const teams = createDefaultTeams(7);
const [kindArg, offId, defId, nArg, verbose] = process.argv.slice(2);
const kind = (kindArg ?? 'scrimmage') as SimKind;
const n = Number(nArg ?? 10);
const summary: Record<string, number> = {};
for (let i = 0; i < n; i++) {
  const off = kind === 'kickoff' ? null : playById(offId);
  const def = defPlayById(defId ?? '43cover2');
  const dir = (i % 2 ? 1 : -1) as 1 | -1;
  const ballOn = kind === 'extraPoint' ? 85 : kind === 'kickoff' ? 35 : 30;
  const losX = (dir > 0 ? 10 : 110) + ballOn * dir;
  const sim = new PlaySim({
    kind, offense: 0, dir, losX, ballY: 26.67, lineToGainX: losX + 10 * dir, offPlay: off, defPlay: def,
    offPlayers: kind === 'kickoff' ? kickoffCoverage(teams[0]) : selectPersonnel(teams[0], FORMATIONS[off!.formation]),
    defPlayers: kind === 'kickoff' ? kickReturnUnit(teams[1]) : selectPersonnel(teams[1], DEF_FRONTS[kind === 'extraPoint' || kind === 'fieldGoal' ? 'goalLine' : def.front]),
    userSide: null, lockedPlayerId: null, userDefSlot: null, difficulty: DIFFICULTIES.normal, rules: DEFAULT_RULES, seed: 1000 + i,
    situation: { trailingLate: false, leadingLate: false, down: 1, toGo: 10 }, fatigue: new Map(), autoSwitch: true, userKicks: false,
  });
  sim.snap();
  let steps = 0;
  const evs: string[] = [];
  while (sim.phase !== 'dead' && steps < 60 * 40) {
    sim.step(1 / 60);
    for (const e of sim.events) if (!['hit', 'switch'].includes(e.type)) evs.push(`${sim.t.toFixed(2)}:${e.type}${'by' in e ? '#' + (e as any).by : ''}`);
    sim.events.length = 0;
    steps++;
  }
  const r = sim.result!;
  const key = `${r.summary.key}${r.incomplete ? ' inc' : ''}${r.turnover !== 'none' ? ' TO:' + r.turnover : ''}`;
  summary[key] = (summary[key] ?? 0) + 1;
  console.log(`[${i}] dir${dir} ${r.summary.key} ${JSON.stringify(r.summary.params ?? {})} end=${r.endSpot.toFixed(1)} poss=${r.finalPossessor} t=${sim.t.toFixed(1)} kickGood=${r.kickGood} tb=${r.kickTouchback} stats=${r.stats.map((s) => s.kind).join(',')}`);
  if (verbose) console.log('   ', evs.join(' '));
}
console.log(summary);
