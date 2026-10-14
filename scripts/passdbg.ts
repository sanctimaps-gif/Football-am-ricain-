import { createDefaultTeams } from '../src/data/generator';
import { DEF_FRONTS, FORMATIONS, defPlayById, playById } from '../src/data/playbook';
import { DEFAULT_RULES } from '../src/rules/config';
import { PlaySim } from '../src/sim/PlaySim';
import { selectPersonnel } from '../src/sim/personnel';
import { DIFFICULTIES } from '../src/sim/types';
const teams = createDefaultTeams(7);
const dir = Number(process.argv[2] ?? -1) as 1 | -1;
const off = playById('quickSlants'); const def = defPlayById('43cover2');
const losX = (dir > 0 ? 10 : 110) + 30 * dir;
const sim = new PlaySim({ kind: 'scrimmage', offense: 0, dir, losX, ballY: 26.67, lineToGainX: losX + 10 * dir, offPlay: off, defPlay: def,
  offPlayers: selectPersonnel(teams[0], FORMATIONS[off.formation]), defPlayers: selectPersonnel(teams[1], DEF_FRONTS[def.front]),
  userSide: null, lockedPlayerId: null, userDefSlot: null, difficulty: DIFFICULTIES.normal, rules: DEFAULT_RULES, seed: 1000,
  situation: { trailingLate: false, leadingLate: false, down: 1, toGo: 10 }, fatigue: new Map(), autoSwitch: true, userKicks: false });
sim.snap();
let thrown = false;
for (let i = 0; i < 60 * 6 && sim.phase !== 'dead'; i++) {
  sim.step(1 / 60);
  if (sim.thrown && !thrown) { thrown = true; const b = sim.ball; const t = sim.agents[b.target];
    console.log('throw target', t.slot, 'pos', t.x.toFixed(1), t.y.toFixed(1), 'v', t.vx.toFixed(1), t.vy.toFixed(1), 'land', b.tx.toFixed(1), b.ty.toFixed(1), 'T', b.flightTime.toFixed(2), 'ball', b.x.toFixed(1), b.y.toFixed(1)); }
  if (thrown && i % 6 === 0) { const b = sim.ball; const t = sim.agents[b.target]; if (t) console.log(sim.t.toFixed(2), 'ball', b.x.toFixed(1), b.y.toFixed(1), b.z.toFixed(1), 'rcv', t.x.toFixed(1), t.y.toFixed(1), b.state); }
}
