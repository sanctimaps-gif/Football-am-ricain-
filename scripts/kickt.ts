import { createDefaultTeams } from '../src/data/generator';
import { MatchController } from '../src/match/MatchController';
import { emptyInput } from '../src/sim/types';
const teams = createDefaultTeams(1);
for (let seed = 1; seed < 6; seed++) {
  const mc = new MatchController(teams[0], teams[1], { userSide: 0, seed });
  mc.start();
  mc.resolveCoinToss('heads', 'kick');
  if (mc.state.possession !== 0) continue;
  mc.snap();
  for (let i = 0; i < 30; i++) mc.update(1 / 30);
  console.log(mc.phase, 'await', mc.sim!.awaitingKick, 't', mc.sim!.t.toFixed(2), 'deadline', mc.sim!.kickDeadline);
  const inp = emptyInput(); inp.kickMeter = 0.1;
  mc.update(1 / 30, inp);
  console.log(mc.phase, mc.sim!.awaitingKick, mc.sim!.kicked);
  break;
}
