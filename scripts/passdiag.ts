import { createDefaultTeams } from '../src/data/generator';
import { DEF_FRONTS, FORMATIONS, defPlayById, playById } from '../src/data/playbook';
import { DEFAULT_RULES } from '../src/rules/config';
import { PlaySim } from '../src/sim/PlaySim';
import { selectPersonnel } from '../src/sim/personnel';
import { DIFFICULTIES } from '../src/sim/types';
const teams = createDefaultTeams(7);
const plays = ['digsOut', 'postCorner', 'paBoot', 'curlFlat', 'fourVerts', 'quickSlants'];
const defs = ['43cover2', '43cover3', 'nickelQuarters', '43cover1'];
const c: Record<string, number> = {};
let throwT = 0, nThrow = 0;
for (const pid of plays) for (const did of defs) for (let i = 0; i < 12; i++) {
  const off = playById(pid); const def = defPlayById(did);
  const dir = (i % 2 ? 1 : -1) as 1 | -1; const losX = (dir > 0 ? 10 : 110) + 30 * dir;
  const sim = new PlaySim({ kind: 'scrimmage', offense: 0, dir, losX, ballY: 26.67, lineToGainX: losX + 10 * dir, offPlay: off, defPlay: def,
    offPlayers: selectPersonnel(teams[i % 16], FORMATIONS[off.formation]), defPlayers: selectPersonnel(teams[(i + 3) % 16], DEF_FRONTS[def.front]),
    userSide: null, lockedPlayerId: null, userDefSlot: null, difficulty: DIFFICULTIES.normal, rules: { ...DEFAULT_RULES, penaltiesEnabled: false }, seed: 900 + i,
    situation: { trailingLate: false, leadingLate: false, down: 1, toGo: 10 }, fatigue: new Map(), autoSwitch: true, userKicks: false });
  sim.snap();
  let attempted = false; let tgt = -1; let minD = 99;
  for (let k = 0; k < 60 * 30 && sim.phase !== 'dead'; k++) {
    sim.step(1 / 60);
    if (sim.ball.state === 'air' && sim.ball.flight === 'pass' && sim.ball.target >= 0) { const t = sim.agents[sim.ball.target]; minD = Math.min(minD, Math.hypot(t.x - sim.ball.x, t.y - sim.ball.y)); }
    for (const e of sim.events) {
      if (e.type === 'throw') { c[e.target < 0 ? 'throwAway' : 'throw']= (c[e.target < 0 ? 'throwAway' : 'throw'] ?? 0) + 1; throwT += sim.t; nThrow++; tgt = e.target; }
      if (['drop', 'deflect', 'catch', 'interception'].includes(e.type)) { c[e.type] = (c[e.type] ?? 0) + 1; attempted = true; }
      if (e.type === 'sack') c.sack = (c.sack ?? 0) + 1;
    }
    sim.events.length = 0;
  }
  if (sim.result!.incomplete && !attempted && tgt >= 0) { c.noReach = (c.noReach ?? 0) + 1; c['noReachDist' + Math.min(5, Math.floor(minD))] = (c['noReachDist' + Math.min(5, Math.floor(minD))] ?? 0) + 1; }
}
console.log(c, 'avg throw time', (throwT / nThrow).toFixed(2));
