import { createDefaultTeams } from '../src/data/generator';
import { simulateMatch } from '../src/match/MatchController';
const teams = createDefaultTeams(7);
const m = simulateMatch(teams[0], teams[5], { seed: Number(process.argv[2] ?? 100) });
const filt = process.argv[3];
for (const l of m.state.log) {
  const line = `Q${l.quarter} ${Math.floor(l.clock / 60)}:${String(Math.floor(l.clock % 60)).padStart(2, '0')} off=${l.offense} ${l.down}&${l.toGo} @${l.ballOn} ${l.summary.key} ${JSON.stringify(l.summary.params ?? {})} [${l.tags.join(',')}] ${l.score.join('-')}`;
  if (!filt || line.includes(filt)) console.log(line);
}
