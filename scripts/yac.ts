import { createDefaultTeams } from '../src/data/generator';
import { DEF_FRONTS, FORMATIONS, defPlayById, playById } from '../src/data/playbook';
import { DEFAULT_RULES } from '../src/rules/config';
import { PlaySim } from '../src/sim/PlaySim';
import { selectPersonnel } from '../src/sim/personnel';
import { DIFFICULTIES } from '../src/sim/types';
const teams = createDefaultTeams(7);
let air = 0, yac = 0, n = 0, att = 0, sacks = 0; const nearest: number[] = [];
for (const pid of ['quickSlants', 'curlFlat', 'meshDrag', 'digsOut', 'fourVerts', 'hitchFlat']) for (const did of ['43cover2', '43cover3', '43cover1', 'nickelMan', 'nickelQuarters']) for (let i = 0; i < 10; i++) {
  const off = playById(pid); const def = defPlayById(did);
  const dir = (i % 2 ? 1 : -1) as 1 | -1; const losX = (dir > 0 ? 10 : 110) + 30 * dir;
  const sim = new PlaySim({ kind: 'scrimmage', offense: 0, dir, losX, ballY: 26.67, lineToGainX: losX + 10 * dir, offPlay: off, defPlay: def,
    offPlayers: selectPersonnel(teams[i % 16], FORMATIONS[off.formation]), defPlayers: selectPersonnel(teams[(i + 3) % 16], DEF_FRONTS[def.front]),
    userSide: null, lockedPlayerId: null, userDefSlot: null, difficulty: DIFFICULTIES.normal, rules: { ...DEFAULT_RULES, penaltiesEnabled: false }, seed: 300 + i,
    situation: { trailingLate: false, leadingLate: false, down: 1, toGo: 10 }, fatigue: new Map(), autoSwitch: true, userKicks: false });
  sim.snap(); let catchX: number | null = null;
  for (let k = 0; k < 60 * 30 && sim.phase !== 'dead'; k++) { sim.step(1 / 60); for (const e of sim.events) { if (e.type === 'catch' && sim.agents[e.by].offense) { catchX = sim.agents[e.by].x; const c = sim.agents[e.by]; nearest.push(Math.min(...sim.agents.filter((a) => !a.offense).map((a) => Math.hypot(a.x - c.x, a.y - c.y)))); } if (e.type === 'sack') sacks++; if (e.type==='throw') att++; } sim.events.length = 0; }
  const r = sim.result!;
  if (catchX !== null && r.finalPossessor === 0 && !r.incomplete) { n++; air += (catchX - losX) * dir; yac += r.endSpot - 30 - (catchX - losX) * dir; }
}
nearest.sort((a, b) => a - b);
console.log('completions', n, 'att', att, 'air/comp', (air / n).toFixed(1), 'yac/comp', (yac / n).toFixed(1), 'median nearest def at catch', nearest[nearest.length >> 1].toFixed(1), 'sacks', sacks);
