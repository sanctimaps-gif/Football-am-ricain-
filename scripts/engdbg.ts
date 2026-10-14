import { createDefaultTeams } from '../src/data/generator';
import { DEF_FRONTS, FORMATIONS, defPlayById, playById } from '../src/data/playbook';
import { DEFAULT_RULES } from '../src/rules/config';
import { PlaySim } from '../src/sim/PlaySim';
import { selectPersonnel } from '../src/sim/personnel';
import { DIFFICULTIES } from '../src/sim/types';
const teams = createDefaultTeams(7);
const off = playById('insideZone'); const def = defPlayById('43cover3');
const sim = new PlaySim({ kind: 'scrimmage', offense: 0, dir: 1, losX: 40, ballY: 26.67, lineToGainX: 50, offPlay: off, defPlay: def,
  offPlayers: selectPersonnel(teams[1], FORMATIONS[off.formation]), defPlayers: selectPersonnel(teams[4], DEF_FRONTS[def.front]),
  userSide: null, lockedPlayerId: null, userDefSlot: null, difficulty: DIFFICULTIES.normal, rules: { ...DEFAULT_RULES, penaltiesEnabled: false }, seed: 78,
  situation: { trailingLate: false, leadingLate: false, down: 1, toGo: 10 }, fatigue: new Map(), autoSwitch: true, userKicks: false });
sim.snap();
let prev = new Map<number, string>();
for (let k = 0; k < 60 * 3 && sim.phase !== 'dead'; k++) {
  sim.step(1 / 60);
  for (const a of sim.agents) {
    if (a.offense) continue;
    const cur = a.engagedWith.map((e) => sim.agents[e].slot).join('+');
    if ((prev.get(a.idx) ?? '') !== cur) console.log(`t${sim.t.toFixed(2)} ${a.slot} power ${a.power.toFixed(0)} engaged: [${prev.get(a.idx) ?? ''}] -> [${cur}] shedFrom=${a.shedFrom >= 0 ? sim.agents[a.shedFrom].slot : '-'}`);
    prev.set(a.idx, cur);
  }
}
for (const a of sim.agents) if (a.offense) console.log(a.slot, a.power.toFixed(0));
