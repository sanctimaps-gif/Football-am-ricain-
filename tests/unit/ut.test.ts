import { describe, expect, it } from 'vitest';
import { createTeamsFor } from '../../src/data/generator';
import { quickSimulate } from '../../src/match/quickSim';
import { DEFAULT_RULES } from '../../src/rules/config';
import { MemoryStore } from '../../src/save/storage';
import { SaveManager } from '../../src/save/SaveManager';
import {
  ALL_SLOTS, arenaLeaderboard, arenaPoints, cardById, cardOvr, claimPass, createUT, currentEvent, dailyChallenges, eligibleFor, evolveCard,
  grant, isUT, journeyStage, makeCard, openPack, opponentTeam, passLevel, playbookBudget, playbookCost, rarityOf, sellCard, setLineup,
  SLOT_POS, synergy, teamOvr, togglePlay, upgradeTrait, utTeam,
} from '../../src/ut/ultimate';
import { Rng } from '../../src/core/rng';

describe('Ultimate Team', () => {
  it('effectif de départ complet, playbook dans le budget, équipe jouable', () => {
    const ut = createUT('Titans', 3);
    expect(ALL_SLOTS.every((s) => !!cardById(ut, ut.lineup[s]))).toBe(true);
    expect(playbookCost(ut)).toBeLessThanOrEqual(playbookBudget(ut));
    const team = utTeam(ut);
    expect(new Set(team.roster.map((p) => p.id)).size).toBe(team.roster.length);
    expect(new Set(team.roster.map((p) => p.number)).size).toBe(team.roster.length);
    for (const pos of ['QB', 'RB', 'FB', 'WR', 'TE', 'C', 'OG', 'OT', 'DE', 'DT', 'LB', 'CB', 'FS', 'SS', 'K', 'P'] as const) expect(team.depth[pos]?.length).toBeGreaterThan(0);
    // le titulaire QB de la composition est bien premier dans la profondeur
    expect(team.depth.QB![0]).toBe(ut.lineup.QB);
    const s = quickSimulate(team, opponentTeam(1, 0.8), { rules: { ...DEFAULT_RULES, quarterMinutes: 3 }, seed: 2 });
    expect(s.finished).toBe(true);
  });

  it('rareté selon la note et cartes générées proches de la note visée', () => {
    expect(rarityOf(65)).toBe('bronze');
    expect(rarityOf(72)).toBe('silver');
    expect(rarityOf(80)).toBe('gold');
    expect(rarityOf(86)).toBe('elite');
    expect(rarityOf(91)).toBe('legend');
    const ut = createUT('X', 5);
    const rng = new Rng(9);
    for (const target of [62, 75, 88]) expect(Math.abs(cardOvr(makeCard(rng, ut, 'WR', target)) - target)).toBeLessThanOrEqual(3);
  });

  it('packs : coût débité, cartes ajoutées, refus sans monnaie', () => {
    const ut = createUT('X', 7);
    const n = ut.cards.length;
    const res = openPack(ut, 'pro');
    expect(Array.isArray(res)).toBe(true);
    expect(ut.coins).toBe(2500);
    expect(ut.cards.length).toBe(n + 5);
    ut.gems = 0;
    expect(openPack(ut, 'legend')).toBe('Gemmes insuffisantes.');
  });

  it('composition : une carte double peut occuper ses deux postes, échange si déjà titulaire', () => {
    const ut = createUT('X', 11);
    const rng = new Rng(4);
    let dual = makeCard(rng, ut, 'WR', 80, 'Test', 1);
    while (dual.positions.length < 2) dual = makeCard(rng, ut, 'WR', 80, 'Test', 1);
    ut.cards.push(dual);
    const other = dual.positions[1];
    const slot = ALL_SLOTS.find((s) => SLOT_POS[s] === other)!;
    expect(eligibleFor(ut, slot).some((c) => c.id === dual.id)).toBe(true);
    setLineup(ut, slot, dual.id);
    expect(synergy(ut)).toBeGreaterThanOrEqual(1);
    const prev = ut.lineup.QB!;
    setLineup(ut, 'QB', ut.lineup.QB!);
    expect(ut.lineup.QB).toBe(prev);
  });

  it('traits, évolution et vente', () => {
    const ut = createUT('X', 13);
    const qb = cardById(ut, ut.lineup.QB)!;
    const before = cardOvr(qb);
    ut.trainingPoints = 100;
    expect(upgradeTrait(ut, qb.id, 'sniper')).toContain('niveau 1');
    expect(cardOvr(qb)).toBeGreaterThanOrEqual(before);
    expect(upgradeTrait(ut, qb.id, 'wall')).toContain('incompatible');
    const rng = new Rng(2);
    const f1 = makeCard(rng, ut, 'QB', 60);
    const f2 = makeCard(rng, ut, 'QB', 60);
    ut.cards.push(f1, f2);
    const evoBefore = cardOvr(qb);
    expect(evolveCard(ut, qb.id, [f1.id, f2.id])).toContain('Évolution 1/3');
    expect(cardOvr(qb)).toBeGreaterThan(evoBefore);
    expect(cardById(ut, f1.id)).toBeUndefined();
    expect(sellCard(ut, qb.id)).toContain('Retirez');
    const bench = ut.cards.find((c) => !ALL_SLOTS.some((s) => ut.lineup[s] === c.id))!;
    const coins = ut.coins;
    sellCard(ut, bench.id);
    expect(ut.coins).toBeGreaterThan(coins);
  });

  it('playbook à budget : refus quand le budget est dépassé, budget qui augmente avec le niveau', () => {
    const ut = createUT('X', 17);
    const all = ['fourVerts', 'postCorner', 'paBoot', 'paCross', 'readOption', 'digsOut', 'meshDrag', 'curlFlat', 'rbScreen', 'tossSweep'];
    let refused = false;
    for (const id of all) if (togglePlay(ut, id, false)) refused = true;
    expect(refused).toBe(true);
    expect(playbookCost(ut)).toBeLessThanOrEqual(playbookBudget(ut));
    const b = playbookBudget(ut);
    grant(ut, { xp: 5000 });
    expect(playbookBudget(ut)).toBeGreaterThan(b);
  });

  it('défis du jour, parcours de 30 étapes, Field Pass, Arena et événement du mois', () => {
    const ut = createUT('X', 19);
    const d = dailyChallenges(ut, new Date(2026, 9, 15));
    expect(d).toHaveLength(3);
    expect(d[2].tier).toBeGreaterThan(d[0].tier);
    expect(dailyChallenges(ut, new Date(2026, 9, 15))[0].id).toBe(d[0].id);
    expect(journeyStage(1).tier).toBeLessThan(journeyStage(30).tier);
    expect(journeyStage(30).reward.card?.ovr).toBe(92);
    expect(claimPass(ut, 1)).toBe('Niveau du pass pas encore atteint.');
    ut.xp = 3000;
    expect(passLevel(ut)).toBe(10);
    expect(Array.isArray(claimPass(ut, 1))).toBe(true);
    expect(claimPass(ut, 1)).toBe('Déjà récupéré.');
    expect(arenaPoints(7, 60)).toBe(90);
    expect(arenaPoints(3, 60)).toBe(30);
    expect(arenaLeaderboard(ut, 100)).toHaveLength(10);
    expect(currentEvent(ut, new Date(2026, 1, 3)).name).toBe('Grande Finale');
    expect(currentEvent(ut).challenges).toHaveLength(3);
  });

  it('sauvegarde Ultimate Team indépendante des emplacements', () => {
    const sm = new SaveManager(new MemoryStore());
    const ut = createUT('Sauvés', 23);
    sm.saveUT(ut);
    const back = sm.loadUT(isUT)!;
    expect(back.name).toBe('Sauvés');
    expect(teamOvr(back)).toBe(teamOvr(ut));
    sm.deleteUT();
    expect(sm.loadUT(isUT)).toBeNull();
  });
});

describe('équipes féminines', () => {
  it('sélections féminines : joueuses générées avec silhouette adaptée', () => {
    const teams = createTeamsFor('nationsF', 1);
    expect(teams).toHaveLength(12);
    for (const t of teams) {
      expect(t.women).toBe(true);
      expect(t.roster.every((p) => p.appearance.female)).toBe(true);
    }
    const men = createTeamsFor('nations', 1)[0];
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(teams[0].roster.map((p) => p.appearance.heightCm))).toBeLessThan(avg(men.roster.map((p) => p.appearance.heightCm)));
  });
});
