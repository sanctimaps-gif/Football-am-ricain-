import { createDefaultTeams } from '../src/data/generator';
import { quickSimulate } from '../src/match/quickSim';
const teams = createDefaultTeams(1);
let pts = 0, n = 200; const t0 = Date.now(); let ties = 0;
for (let i = 0; i < n; i++) { const s = quickSimulate(teams[i % 16], teams[(i + 3) % 16], { seed: i }); pts += s.score[0] + s.score[1]; if (s.winner === null) ties++; if (i < 5) console.log(s.score, s.teamStats[0].passComp + '/' + s.teamStats[0].passAtt, s.teamStats[0].rushYds, s.quarter); }
console.log('avg pts', pts / n, 'ties', ties, 'ms', (Date.now() - t0) / n);
