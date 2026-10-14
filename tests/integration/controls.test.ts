import { describe, expect, it } from 'vitest';
import { createDefaultTeams } from '../../src/data/generator';
import { MatchController } from '../../src/match/MatchController';
import { DEFAULT_RULES } from '../../src/rules/config';
import { emptyInput, type SimInput } from '../../src/sim/types';

const teams = createDefaultTeams(1);

/** Prépare un match où l'utilisateur (côté 0) est en attaque ou en défense sur une action de scrimmage. */
function setup(offense: boolean, offPlay = 'quickSlants', defPlay = '43cover2', playClock = false) {
  const mc = new MatchController(teams[0], teams[1], { userSide: 0, seed: 11, playClock, rules: { ...DEFAULT_RULES, quarterMinutes: 5 } });
  mc.practiceHook = (s) => {
    s.nextKind = 'scrimmage';
    s.possession = offense ? 0 : 1;
    s.ballOn = 30;
    s.down = 1;
    s.toGo = 10;
  };
  mc.start();
  mc.resolveCoinToss('heads', 'receive');
  // laisse passer le coup d'envoi
  let guard = 0;
  while (mc.phase !== 'PlaySelection' && guard++ < 20000) {
    if (mc.phase === 'PreSnap' && mc.sim?.offense === 0) mc.snap();
    const i = emptyInput();
    if (mc.sim?.awaitingKick) i.kickMeter = 0;
    mc.update(1 / 30, i);
  }
  if (offense) mc.selectOffense(offPlay);
  else mc.selectDefense(defPlay);
  guard = 0;
  while (mc.phase !== 'PreSnap' && guard++ < 100) mc.update(1 / 30);
  return mc;
}

const step = (mc: MatchController, patch: Partial<SimInput> = {}, n = 1) => {
  for (let i = 0; i < n; i++) mc.update(1 / 60, { ...emptyInput(), ...patch });
};

describe('chaque commande a un effet', () => {
  it('HIKE lance l’action', () => {
    const mc = setup(true);
    expect(mc.phase).toBe('PreSnap');
    expect(mc.snap()).toBe(true);
    expect(['LivePlay', 'BallDead']).toContain(mc.phase);
  });

  it('CIBLE change le receveur sélectionné', () => {
    const mc = setup(true);
    const sim = mc.sim!;
    sim.cyclePassTarget();
    const a = sim.passTarget;
    sim.cyclePassTarget();
    expect(sim.passTarget).not.toBe(a);
  });

  it('PASSE lance le ballon vers la cible', () => {
    const mc = setup(true);
    mc.snap();
    step(mc, {}, 80); // le QB recule
    const sim = mc.sim!;
    expect(sim.userAgent).toBe(sim.qbIdx);
    step(mc, { pass: true, passType: 'bullet' });
    expect(sim.thrown).toBe(true);
    expect(sim.ball.passType).toBe('bullet');
  });

  it('SPRINT augmente la vitesse et le joystick déplace le joueur', () => {
    // défenseur contrôlé qui court en terrain libre (vers son propre en-but)
    const speedAfter = (sprint: boolean) => {
      const mc = setup(false);
      let guard = 0;
      while (mc.phase === 'PreSnap' && guard++ < 400) step(mc);
      const sim = mc.sim!;
      const u = sim.agents[sim.userAgent];
      const x0 = u.x;
      step(mc, { moveX: sim.dir, moveY: 0, sprint }, 40);
      return { v: Math.hypot(u.vx, u.vy), moved: Math.abs(u.x - x0), flag: u.sprinting };
    };
    const walk = speedAfter(false);
    const run = speedAfter(true);
    expect(walk.moved).toBeGreaterThan(1);
    expect(run.flag).toBe(true);
    expect(run.v).toBeGreaterThan(walk.v);
  });

  it('FEINTE, PLONGEON et PROTÉGER agissent sur le porteur', () => {
    const mc = setup(true, 'insideZone');
    mc.snap();
    const sim = mc.sim!;
    let guard = 0;
    while (sim.ball.holder !== sim.userAgent && guard++ < 200) step(mc);
    const u = sim.agents[sim.userAgent];
    step(mc, { juke: true, moveY: 1 });
    expect(u.jukeCooldown).toBeGreaterThan(0);
    step(mc, { protect: true });
    expect(u.protect).toBe(true);
    step(mc, {}, 80);
    if (sim.phase === 'live' && sim.ball.holder === u.idx) {
      step(mc, { dive: true });
      expect(u.diveTimer > 0 || u.down).toBe(true);
    }
  });

  it('CHANGER, PLAQUER, SUIVRE et CONTRER en défense', () => {
    const mc = setup(false);
    const sim = mc.sim!;
    const before = sim.userAgent;
    step(mc, { switchPlayer: true });
    expect(sim.userAgent).not.toBe(before);
    // le snap automatique de l'IA arrive après un court délai
    let guard = 0;
    while (mc.phase === 'PreSnap' && guard++ < 400) step(mc);
    const u = () => sim.agents[sim.userAgent];
    step(mc, { contain: true }, 30);
    expect(Math.hypot(u().vx, u().vy)).toBeGreaterThan(1);
    step(mc, { jump: true });
    expect(u().jumpTimer).toBeGreaterThan(0);
    step(mc, { tackle: true });
    expect(u().diveTimer > 0 || u().down).toBe(true);
  });

  it('FRAPPER : un appui en avance n’est pas perdu', () => {
    const mc = setup(true, 'fieldGoal');
    mc.snap();
    const sim = mc.sim!;
    step(mc, { kickMeter: 0 }); // trop tôt
    let guard = 0;
    while (!sim.kicked && guard++ < 300) step(mc);
    expect(sim.kicked).toBe(true);
  });

  it('chrono de jeu de 40 s : retard de jeu si l’attaque ne snappe pas', () => {
    const mc = setup(true, 'quickSlants', '43cover2', true);
    expect(mc.playClock).not.toBeNull();
    const before = mc.state.ballOn;
    let flagged = false;
    mc.bus.on('resolved', ({ tags }) => {
      if (tags.some((x) => x.startsWith('PENALTY:delayOfGame'))) flagged = true;
    });
    let guard = 0;
    while (!flagged && guard++ < 3000) step(mc, {}, 1);
    expect(flagged).toBe(true);
    expect(mc.state.ballOn).toBe(before - 5);
  });
});
