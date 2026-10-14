import { createDefaultTeams } from '../src/data/generator';
import { DEF_FRONTS, FORMATIONS, defPlayById, playById } from '../src/data/playbook';
import { DEFAULT_RULES } from '../src/rules/config';
import { PlaySim } from '../src/sim/PlaySim';
import { selectPersonnel } from '../src/sim/personnel';
import { DIFFICULTIES } from '../src/sim/types';
const teams = createDefaultTeams(7);
const off = playById(process.argv[2] ?? 'insideZone'); const def = defPlayById(process.argv[3] ?? '43cover3');
for (let i = 0; i < Number(process.argv[4] ?? 5); i++) {
  const dir = 1; const losX = 40;
  const sim = new PlaySim({ kind: 'scrimmage', offense: 0, dir, losX, ballY: 26.67, lineToGainX: 50, offPlay: off, defPlay: def,
    offPlayers: selectPersonnel(teams[i], FORMATIONS[off.formation]), defPlayers: selectPersonnel(teams[i + 3], DEF_FRONTS[def.front]),
    userSide: null, lockedPlayerId: null, userDefSlot: null, difficulty: DIFFICULTIES.normal, rules: { ...DEFAULT_RULES, penaltiesEnabled: false }, seed: 77 + i,
    situation: { trailingLate: false, leadingLate: false, down: 1, toGo: 10 }, fatigue: new Map(), autoSwitch: true, userKicks: false });
  sim.snap();
  const lines: string[] = [];
  for (let k = 0; k < 60 * 30 && sim.phase !== 'dead'; k++) {
    sim.step(1 / 60);
    if (k % 12 === 0) {
      const c = sim.carrier();
      const eng = sim.agents.filter((a) => !a.offense && a.engagedWith.length).map((a) => a.slot).join('/');
      lines.push(`t${sim.t.toFixed(1)} c=${c?.slot}@${c ? (c.x - 40).toFixed(1) + ',' + (c.y - 26.67).toFixed(1) : '-'} eng[${eng}]`);
    }
    for (const e of sim.events) if (e.type === 'tackle' || e.type === 'brokenTackle') lines.push(`${e.type} by ${sim.agents[e.by].slot} at t${sim.t.toFixed(2)}`);
    sim.events.length = 0;
  }
  console.log(`--- play ${i}: ${(sim.result!.endSpot - 30).toFixed(1)} yds`);
  console.log(lines.join(' | '));
}
