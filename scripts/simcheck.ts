import { createDefaultTeams } from '../src/data/generator';
import { simulateMatch } from '../src/match/MatchController';
import { DEFAULT_RULES } from '../src/rules/config';

const teams = createDefaultTeams(7);
const n = Number(process.argv[2] ?? 6);
const agg: Record<string, number> = {};
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  const m = simulateMatch(teams[i % teams.length], teams[(i + 5) % teams.length], { seed: 100 + i, rules: { ...DEFAULT_RULES, quarterMinutes: Number(process.argv[3] ?? 3) } });
  const s = m.state;
  const t = s.teamStats;
  console.log(`#${i} ${m.teams[0].abbr} ${s.score[0]} - ${s.score[1]} ${m.teams[1].abbr} | plays ${s.playNumber} | Q${s.quarter} | pass ${t[0].passComp}/${t[0].passAtt} ${t[0].passYds}y, ${t[1].passComp}/${t[1].passAtt} ${t[1].passYds}y | rush ${t[0].rushAtt}-${t[0].rushYds}, ${t[1].rushAtt}-${t[1].rushYds} | INT ${t[0].interceptionsThrown + t[1].interceptionsThrown} FUM ${t[0].fumblesLost + t[1].fumblesLost} sacks ${t[0].sacks + t[1].sacks} pen ${t[0].penalties + t[1].penalties} punts ${t[0].punts+t[1].punts} FG ${t[0].fgMade+t[1].fgMade}/${t[0].fgAtt+t[1].fgAtt}`);
  const tagCounts: Record<string, number> = {};
  for (const l of s.log) for (const tg of l.tags) tagCounts[tg] = (tagCounts[tg] ?? 0) + 1;
  for (const [k, v] of Object.entries(tagCounts)) agg[k] = (agg[k] ?? 0) + v;
}
console.log('tags', agg);
console.log('ms/match', (Date.now() - t0) / n);
