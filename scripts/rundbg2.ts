import { createDefaultTeams } from '../src/data/generator';
import { DEF_FRONTS, FORMATIONS, defPlayById, playById } from '../src/data/playbook';
import { DEFAULT_RULES } from '../src/rules/config';
import { PlaySim } from '../src/sim/PlaySim';
import { selectPersonnel } from '../src/sim/personnel';
import { DIFFICULTIES } from '../src/sim/types';
const teams = createDefaultTeams(7);
const off = playById(process.argv[2] ?? 'insideZone'); const def = defPlayById(process.argv[3] ?? '43cover3');
const i = Number(process.argv[4] ?? 0);
const sim = new PlaySim({ kind: 'scrimmage', offense: 0, dir: 1, losX: 40, ballY: 26.67, lineToGainX: 50, offPlay: off, defPlay: def,
  offPlayers: selectPersonnel(teams[i], FORMATIONS[off.formation]), defPlayers: selectPersonnel(teams[i + 3], DEF_FRONTS[def.front]),
  userSide: null, lockedPlayerId: null, userDefSlot: null, difficulty: DIFFICULTIES.normal, rules: { ...DEFAULT_RULES, penaltiesEnabled: false }, seed: 77 + i,
  situation: { trailingLate: false, leadingLate: false, down: 1, toGo: 10 }, fatigue: new Map(), autoSwitch: true, userKicks: false });
sim.snap();
for (let k = 0; k < 60 * 30 && sim.phase !== 'dead'; k++) {
  sim.step(1 / 60);
  if (k % 9 === 0 && sim.t > 0.5) {
    console.log(`t${sim.t.toFixed(2)} ` + sim.agents.map((a) => `${a.slot}${a.idx === sim.ball.holder ? '*' : ''}(${(a.x - 40).toFixed(1)},${(a.y - 26.67).toFixed(1)}${a.engagedWith.length ? 'E' + a.engagedWith.map((e) => sim.agents[e].slot).join('+') : ''}${a.blockTarget >= 0 ? '>' + sim.agents[a.blockTarget].slot : ''})`).join(' '));
  }
  for (const e of sim.events) if (e.type === 'tackle' || e.type === 'brokenTackle') console.log(`${e.type} by ${sim.agents[e.by].slot}`);
  sim.events.length = 0;
}
