import { createDefaultTeams } from '../src/data/generator';
import { DEF_FRONTS, FORMATIONS, defPlayById, playById } from '../src/data/playbook';
import { DEFAULT_RULES } from '../src/rules/config';
import { PlaySim } from '../src/sim/PlaySim';
import { selectPersonnel } from '../src/sim/personnel';
import { DIFFICULTIES } from '../src/sim/types';
const teams = createDefaultTeams(7);
const plays = process.argv[2].split(',');
const defs = (process.argv[3] ?? '43cover2,43cover3,43runStop,nickelMan,34blitz').split(',');
const n = Number(process.argv[4] ?? 30);
for (const pid of plays) for (const did of defs) {
  const off = playById(pid); const def = defPlayById(did);
  let yards = 0, comp = 0, att = 0, ints = 0, td = 0, sacks = 0, fum = 0, t = 0; const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const dir = (i % 2 ? 1 : -1) as 1 | -1; const losX = (dir > 0 ? 10 : 110) + 30 * dir;
    const sim = new PlaySim({ kind: 'scrimmage', offense: 0, dir, losX, ballY: 26.67 + ((i % 3) - 1) * 3, lineToGainX: losX + 10 * dir, offPlay: off, defPlay: def,
      offPlayers: selectPersonnel(teams[i % 16], FORMATIONS[off.formation]), defPlayers: selectPersonnel(teams[(i + 3) % 16], DEF_FRONTS[def.front]),
      userSide: null, lockedPlayerId: null, userDefSlot: null, difficulty: DIFFICULTIES.normal, rules: { ...DEFAULT_RULES, penaltiesEnabled: false }, seed: 5000 + i,
      situation: { trailingLate: false, leadingLate: false, down: 1, toGo: 10 }, fatigue: new Map(), autoSwitch: true, userKicks: false });
    sim.snap();
    for (let k = 0; k < 60 * 30 && sim.phase !== 'dead'; k++) sim.step(1 / 60);
    const r = sim.result!; t += sim.t;
    const y = r.finalPossessor === 0 && !r.incomplete ? r.endSpot - 30 : 0;
    if (r.stats.some((s) => s.kind === 'passAtt')) att++;
    if (r.stats.some((s) => s.kind === 'completion')) comp++;
    if (r.turnover === 'interception') ints++;
    if (r.turnover === 'fumble') fum++;
    if (r.stats.some((s) => s.kind === 'sack')) sacks++;
    if (r.endSpot >= 100 && r.finalPossessor === 0) td++;
    yards += y; ys.push(Math.round(y));
  }
  ys.sort((a, b) => a - b);
  console.log(`${pid.padEnd(12)} vs ${did.padEnd(14)} avg ${(yards / n).toFixed(1)} med ${ys[n >> 1]} comp ${comp}/${att} int ${ints} fum ${fum} sack ${sacks} td ${td} t ${(t / n).toFixed(1)}s`);
}
