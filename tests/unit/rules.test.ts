import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type RulesConfig } from '../../src/rules/config';
import { applyCoinToss, applyRunoff, attackDir, callTimeout, createGameState, resolvePlay, setConversionType } from '../../src/rules/engine';
import { emptyResult, type GameState, type PlayResult, type Side } from '../../src/rules/types';

const rules: RulesConfig = { ...DEFAULT_RULES, quarterMinutes: 3 };

function scrimmageState(offense: Side = 0, ballOn = 25, down = 1, toGo = 10): GameState {
  const s = createGameState(rules, { qb0: 0, rb0: 0, wr0: 0, cb1: 1, lb1: 1, qb1: 1 });
  s.possession = offense;
  s.ballOn = ballOn;
  s.down = down;
  s.toGo = toGo;
  s.nextKind = 'scrimmage';
  return s;
}

function run(s: GameState, endSpot: number, extra: Partial<PlayResult> = {}): string[] {
  const r: PlayResult = { ...emptyResult('scrimmage', s.possession, endSpot), elapsed: 5, ...extra };
  return resolvePlay(s, r, rules);
}

describe('downs et premier down', () => {
  it('un gain de 4 yards fait passer au 2e & 6', () => {
    const s = scrimmageState(0, 25);
    run(s, 29);
    expect(s.down).toBe(2);
    expect(s.toGo).toBe(6);
    expect(s.ballOn).toBe(29);
    expect(s.possession).toBe(0);
  });

  it('atteindre la ligne à gagner donne un nouveau premier down', () => {
    const s = scrimmageState(0, 25, 3, 4);
    const tags = run(s, 30);
    expect(tags).toContain('FIRST_DOWN');
    expect(s.down).toBe(1);
    expect(s.toGo).toBe(10);
    expect(s.teamStats[0].thirdDownConv).toBe(1);
    expect(s.teamStats[0].thirdDownAtt).toBe(1);
  });

  it('goal to go près de la ligne de but', () => {
    const s = scrimmageState(0, 85);
    run(s, 95);
    expect(s.down).toBe(1);
    expect(s.toGo).toBe(5);
  });

  it('perte de terrain augmente la distance', () => {
    const s = scrimmageState(0, 40, 2, 7);
    run(s, 35);
    expect(s.down).toBe(3);
    expect(s.toGo).toBe(12);
  });

  it('échec au 4e down : turnover on downs', () => {
    const s = scrimmageState(0, 60, 4, 3);
    const tags = run(s, 61);
    expect(tags).toContain('TURNOVER_ON_DOWNS');
    expect(s.possession).toBe(1);
    expect(s.ballOn).toBe(39);
    expect(s.down).toBe(1);
  });

  it('passe incomplète : ballon à la ligne de scrimmage, chrono arrêté', () => {
    const s = scrimmageState(0, 30, 1, 10);
    s.clockRunning = true;
    run(s, 50, { incomplete: true, playType: 'pass' });
    expect(s.ballOn).toBe(30);
    expect(s.down).toBe(2);
    expect(s.toGo).toBe(10);
    expect(s.clockRunning).toBe(false);
  });

  it('sortie en touche arrête le chrono', () => {
    const s = scrimmageState(0, 30);
    run(s, 34, { outOfBounds: true });
    expect(s.clockRunning).toBe(false);
    const s2 = scrimmageState(0, 30);
    run(s2, 34);
    expect(s2.clockRunning).toBe(true);
  });
});

describe('score', () => {
  it('touchdown = 6 points puis conversion', () => {
    const s = scrimmageState(0, 80);
    const tags = run(s, 101);
    expect(tags).toContain('TOUCHDOWN');
    expect(s.score).toEqual([6, 0]);
    expect(s.nextKind).toBe('conversion');
    expect(s.ballOn).toBe(85);
  });

  it('un touchdown ne peut pas être compté deux fois après la fin du match', () => {
    const s = scrimmageState(0, 80);
    s.finished = true;
    run(s, 101);
    expect(s.score).toEqual([0, 0]);
  });

  it('extra point réussi = 1 point puis kickoff par l’équipe qui a marqué', () => {
    const s = scrimmageState(0, 80);
    run(s, 101);
    const r: PlayResult = { ...emptyResult('extraPoint', 0, 85), kickGood: true };
    const tags = resolvePlay(s, r, rules);
    expect(tags).toContain('XP_GOOD');
    expect(s.score).toEqual([7, 0]);
    expect(s.nextKind).toBe('kickoff');
    expect(s.possession).toBe(0);
    expect(s.ballOn).toBe(35);
  });

  it('conversion à 2 points réussie', () => {
    const s = scrimmageState(1, 80);
    run(s, 100);
    setConversionType(s, 'two', rules);
    expect(s.ballOn).toBe(98);
    const tags = run(s, 100.5);
    expect(tags).toContain('TWO_PT_GOOD');
    expect(s.score).toEqual([0, 8]);
    expect(s.nextKind).toBe('kickoff');
  });

  it('conversion à 2 points ratée', () => {
    const s = scrimmageState(1, 80);
    run(s, 100);
    setConversionType(s, 'two', rules);
    const tags = run(s, 99);
    expect(tags).toContain('TWO_PT_FAILED');
    expect(s.score).toEqual([0, 6]);
  });

  it('field goal réussi = 3 points', () => {
    const s = scrimmageState(0, 70, 4, 6);
    const r: PlayResult = { ...emptyResult('fieldGoal', 0, 70), kickGood: true, stats: [{ kind: 'kick', kicker: 'k0', fieldGoal: true, good: true }] };
    const tags = resolvePlay(s, r, rules);
    expect(tags).toContain('FG_GOOD');
    expect(s.score).toEqual([3, 0]);
    expect(s.teamStats[0].fgMade).toBe(1);
    expect(s.playerStats['k0'].fgm).toBe(1);
    expect(s.nextKind).toBe('kickoff');
  });

  it('field goal manqué : ballon à l’adversaire au point du coup de pied', () => {
    const s = scrimmageState(0, 60, 4, 6);
    resolvePlay(s, { ...emptyResult('fieldGoal', 0, 60), kickGood: false }, rules);
    expect(s.possession).toBe(1);
    expect(s.ballOn).toBe(47);
  });

  it('safety = 2 points pour la défense et free kick du 20', () => {
    const s = scrimmageState(0, 3);
    const tags = run(s, -1);
    expect(tags).toContain('SAFETY');
    expect(s.score).toEqual([0, 2]);
    expect(s.nextKind).toBe('kickoff');
    expect(s.possession).toBe(0);
    expect(s.ballOn).toBe(20);
  });
});

describe('changements de possession', () => {
  it('interception : ballon à la défense au point de retour', () => {
    const s = scrimmageState(0, 40);
    const tags = run(s, 55, { finalPossessor: 1, turnover: 'interception', playType: 'pass' });
    expect(tags).toContain('INTERCEPTION');
    expect(s.possession).toBe(1);
    expect(s.ballOn).toBe(45);
    expect(s.down).toBe(1);
  });

  it('interception dans l’en-but = touchback', () => {
    const s = scrimmageState(0, 70);
    const tags = run(s, 105, { finalPossessor: 1, turnover: 'interception', possessionChangedInEndZone: true });
    expect(tags).toContain('TOUCHBACK');
    expect(s.possession).toBe(1);
    expect(s.ballOn).toBe(20);
  });

  it('retour d’interception jusqu’en en-but = touchdown défensif', () => {
    const s = scrimmageState(0, 40);
    const tags = run(s, -1, { finalPossessor: 1, turnover: 'interception' });
    expect(tags).toContain('DEFENSIVE_TD');
    expect(s.score).toEqual([0, 6]);
    expect(s.possession).toBe(1);
  });

  it('kickoff : touchback au 25', () => {
    const s = createGameState(rules);
    applyCoinToss(s, 1, rules);
    expect(s.possession).toBe(0);
    resolvePlay(s, { ...emptyResult('kickoff', 1, 110), kickTouchback: true }, rules);
    expect(s.possession).toBe(1);
    expect(s.ballOn).toBe(25);
    expect(s.nextKind).toBe('scrimmage');
  });

  it('kickoff retourné jusqu’au 32', () => {
    const s = createGameState(rules);
    applyCoinToss(s, 1, rules);
    resolvePlay(s, { ...emptyResult('kickoff', 1, 68), elapsed: 6 }, rules);
    expect(s.possession).toBe(1);
    expect(s.ballOn).toBe(32);
  });

  it('punt avec fair catch', () => {
    const s = scrimmageState(0, 30, 4, 8);
    const tags = resolvePlay(s, { ...emptyResult('punt', 1, 75), fairCatch: true }, rules);
    expect(tags).toContain('FAIR_CATCH');
    expect(s.possession).toBe(1);
    expect(s.ballOn).toBe(25);
    expect(s.teamStats[0].punts).toBe(1);
  });
});

describe('pénalités', () => {
  it('faux départ : -5 yards, down rejoué', () => {
    const s = scrimmageState(0, 30, 2, 6);
    run(s, 30, { preSnapPenalty: { type: 'falseStart', against: 0 }, elapsed: 0 });
    expect(s.ballOn).toBe(25);
    expect(s.down).toBe(2);
    expect(s.toGo).toBe(11);
  });

  it('hors-jeu défensif : +5 yards, premier down si la distance est couverte', () => {
    const s = scrimmageState(0, 30, 3, 4);
    const tags = run(s, 30, { preSnapPenalty: { type: 'offside', against: 1 }, elapsed: 0 });
    expect(s.ballOn).toBe(35);
    expect(s.down).toBe(1);
    expect(tags).toContain('FIRST_DOWN');
  });

  it('demi-distance près de la ligne de but', () => {
    const s = scrimmageState(0, 6, 1, 10);
    run(s, 6, { preSnapPenalty: { type: 'falseStart', against: 0 }, elapsed: 0 });
    expect(s.ballOn).toBe(3);
  });

  it('holding offensif accepté sur une grosse course : -10 et down rejoué', () => {
    const s = scrimmageState(0, 40, 1, 10);
    const tags = run(s, 70, { penalties: [{ type: 'holding', against: 0 }] });
    expect(tags).toContain('PENALTY:holding:accepted');
    expect(s.ballOn).toBe(30);
    expect(s.down).toBe(1);
    expect(s.toGo).toBe(20);
  });

  it('holding refusé si l’action est une interception', () => {
    const s = scrimmageState(0, 40, 1, 10);
    const tags = run(s, 50, { penalties: [{ type: 'holding', against: 0 }], finalPossessor: 1, turnover: 'interception' });
    expect(tags).toContain('PENALTY:holding:declined');
    expect(s.possession).toBe(1);
  });

  it('interférence de passe défensive : ballon au point de faute + premier down', () => {
    const s = scrimmageState(0, 30, 3, 8);
    const tags = run(s, 30, { incomplete: true, penalties: [{ type: 'passInterference', against: 1, spot: 58 }] });
    expect(tags).toContain('PENALTY:passInterference:accepted');
    expect(s.ballOn).toBe(58);
    expect(s.down).toBe(1);
  });

  it('facemask : +15 yards après l’action', () => {
    const s = scrimmageState(0, 30, 2, 8);
    run(s, 34, { penalties: [{ type: 'facemask', against: 1 }] });
    expect(s.ballOn).toBe(49);
    expect(s.down).toBe(1);
  });

  it('fautes compensées : down rejoué', () => {
    const s = scrimmageState(0, 30, 2, 8);
    const tags = run(s, 50, { penalties: [{ type: 'holding', against: 0 }, { type: 'facemask', against: 1 }] });
    expect(tags).toContain('PENALTY:offsetting');
    expect(s.ballOn).toBe(30);
    expect(s.down).toBe(2);
  });
});

describe('chronomètre et périodes', () => {
  it('écoulement entre les actions quand le chrono tourne', () => {
    const s = scrimmageState(0, 30);
    s.clock = 100;
    s.clockRunning = true;
    const used = applyRunoff(s, rules);
    expect(used).toBeGreaterThan(0);
    expect(s.clock).toBe(100 - used);
  });

  it('temps mort arrête le chrono et décrémente le compteur', () => {
    const s = scrimmageState(0, 30);
    s.clockRunning = true;
    expect(callTimeout(s, 0)).toBe(true);
    expect(s.timeouts[0]).toBe(2);
    expect(s.clockRunning).toBe(false);
    s.timeouts[0] = 0;
    expect(callTimeout(s, 0)).toBe(false);
  });

  it('fin du 1er quart-temps : la possession continue', () => {
    const s = scrimmageState(0, 30);
    s.clock = 3;
    const tags = run(s, 33);
    expect(tags).toContain('END_QUARTER');
    expect(s.quarter).toBe(2);
    expect(s.possession).toBe(0);
    expect(s.clock).toBe(180);
  });

  it('mi-temps : l’équipe qui a reçu le coup d’envoi botte', () => {
    const s = createGameState(rules);
    applyCoinToss(s, 1, rules); // 0 botte à l'ouverture
    s.quarter = 2;
    s.nextKind = 'scrimmage';
    s.possession = 0;
    s.ballOn = 40;
    s.clock = 2;
    s.timeouts = [0, 1];
    const tags = run(s, 45);
    expect(tags).toContain('HALFTIME');
    expect(s.quarter).toBe(3);
    expect(s.nextKind).toBe('kickoff');
    expect(s.possession).toBe(1);
    expect(s.timeouts).toEqual([3, 3]);
  });

  it('fin du match avec un vainqueur', () => {
    const s = scrimmageState(0, 30);
    s.quarter = 4;
    s.clock = 2;
    s.score = [14, 10];
    const tags = run(s, 33);
    expect(tags).toContain('GAME_OVER');
    expect(s.finished).toBe(true);
    expect(s.winner).toBe(0);
  });

  it('touchdown à 0:00 : la conversion est jouée avant la fin', () => {
    const s = scrimmageState(0, 90);
    s.quarter = 4;
    s.clock = 3;
    s.score = [10, 14];
    run(s, 100);
    expect(s.finished).toBe(false);
    expect(s.nextKind).toBe('conversion');
    resolvePlay(s, { ...emptyResult('extraPoint', 0, 85), kickGood: true }, rules);
    expect(s.finished).toBe(true);
    expect(s.score).toEqual([17, 14]);
    expect(s.winner).toBe(0);
  });

  it('égalité en fin de temps réglementaire : prolongation', () => {
    const s = scrimmageState(0, 30);
    s.quarter = 4;
    s.clock = 1;
    s.score = [7, 7];
    const tags = run(s, 33);
    expect(tags).toContain('OVERTIME');
    expect(s.quarter).toBe(5);
    expect(s.needsCoinToss).toBe(true);
    expect(s.finished).toBe(false);
  });

  it('égalité sans prolongation autorisée', () => {
    const r2: RulesConfig = { ...rules, overtime: { ...rules.overtime, enabled: false } };
    const s = scrimmageState(0, 30);
    s.quarter = 4;
    s.clock = 1;
    s.score = [7, 7];
    resolvePlay(s, { ...emptyResult('scrimmage', 0, 33), elapsed: 5 }, r2);
    expect(s.finished).toBe(true);
    expect(s.winner).toBe(null);
  });

  it('les équipes changent de côté à chaque quart-temps', () => {
    expect(attackDir(0, 1)).toBe(1);
    expect(attackDir(1, 1)).toBe(-1);
    expect(attackDir(0, 2)).toBe(-1);
    expect(attackDir(0, 3)).toBe(1);
  });
});

describe('prolongation (mort subite modifiée)', () => {
  function otState(): GameState {
    const s = scrimmageState(0, 30);
    s.quarter = 4;
    s.clock = 1;
    s.score = [10, 10];
    run(s, 33);
    applyCoinToss(s, 0, rules); // l'équipe 0 reçoit
    resolvePlay(s, { ...emptyResult('kickoff', 0, 75), elapsed: 5 }, rules);
    return s;
  }

  it('touchdown sur la première possession = victoire', () => {
    const s = otState();
    expect(s.possession).toBe(0);
    s.ballOn = 95;
    run(s, 101);
    expect(s.finished).toBe(true);
    expect(s.winner).toBe(0);
  });

  it('field goal sur la première possession : l’adversaire a sa chance', () => {
    const s = otState();
    s.ballOn = 75;
    resolvePlay(s, { ...emptyResult('fieldGoal', 0, 75), kickGood: true }, rules);
    expect(s.finished).toBe(false);
    expect(s.score).toEqual([13, 10]);
    // kickoff vers l'équipe 1
    resolvePlay(s, { ...emptyResult('kickoff', 1, 110), kickTouchback: true }, rules);
    expect(s.possession).toBe(1);
    // échec au 4e down de l'équipe 1 → victoire de l'équipe 0
    s.down = 4;
    s.toGo = 5;
    run(s, s.ballOn + 2);
    expect(s.finished).toBe(true);
    expect(s.winner).toBe(0);
  });

  it('field goal égalisateur en 2e possession puis mort subite', () => {
    const s = otState();
    s.ballOn = 75;
    resolvePlay(s, { ...emptyResult('fieldGoal', 0, 75), kickGood: true }, rules);
    resolvePlay(s, { ...emptyResult('kickoff', 1, 110), kickTouchback: true }, rules);
    s.ballOn = 70;
    resolvePlay(s, { ...emptyResult('fieldGoal', 1, 70), kickGood: true }, rules);
    expect(s.score).toEqual([13, 13]);
    expect(s.finished).toBe(false);
    resolvePlay(s, { ...emptyResult('kickoff', 0, 110), kickTouchback: true }, rules);
    s.ballOn = 80;
    resolvePlay(s, { ...emptyResult('fieldGoal', 0, 80), kickGood: true }, rules);
    expect(s.finished).toBe(true);
    expect(s.winner).toBe(0);
  });
});

describe('statistiques', () => {
  it('une passe complétée compte pour le passeur et le receveur', () => {
    const s = scrimmageState(0, 30);
    run(s, 42, {
      playType: 'pass',
      stats: [
        { kind: 'passAtt', passer: 'qb0' },
        { kind: 'completion', passer: 'qb0', receiver: 'wr0', yards: 12 },
      ],
    });
    expect(s.playerStats['qb0'].passComp).toBe(1);
    expect(s.playerStats['qb0'].passYds).toBe(12);
    expect(s.playerStats['wr0'].rec).toBe(1);
    expect(s.teamStats[0].passYds).toBe(12);
    expect(s.teamStats[0].totalYards).toBe(12);
    expect(s.teamStats[0].firstDowns).toBe(1);
  });

  it('les statistiques d’une action annulée par une pénalité acceptée ne comptent pas', () => {
    const s = scrimmageState(0, 30);
    run(s, 70, { stats: [{ kind: 'rush', runner: 'rb0', yards: 40 }], penalties: [{ type: 'holding', against: 0 }] });
    expect(s.playerStats['rb0']).toBeUndefined();
    expect(s.teamStats[0].rushYds).toBe(0);
    expect(s.teamStats[0].penalties).toBe(1);
  });
});
