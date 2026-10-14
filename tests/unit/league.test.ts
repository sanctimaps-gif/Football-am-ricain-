import { describe, expect, it } from 'vitest';
import { createPlayerCareer, careerPlayer, train, updateCareerAfterGame } from '../../src/league/career';
import { advanceWeek, createLeague, isLeague, standings, simulateWeek, teamById, userGame, weekComplete } from '../../src/league/league';
import { capSpace, evaluateTrade, executeTrade, releasePlayer, signFreeAgent, upgradeFacility } from '../../src/league/market';
import { draftOnClock, draftPlayer, endSeason, runAiDraft, startNewSeason } from '../../src/league/offseason';
import { computeStandings, roundRobin, sortStandings } from '../../src/league/schedule';
import { ROSTER_MAX } from '../../src/league/types';
import { overall } from '../../src/data/ratings';
import { SaveManager } from '../../src/save/SaveManager';
import { MemoryStore } from '../../src/save/storage';
import { DEFAULT_SETTINGS } from '../../src/save/settings';

function playSeason(l: ReturnType<typeof createLeague>) {
  let guard = 0;
  while (l.phase === 'regular' || l.phase === 'playoffs') {
    simulateWeek(l, true);
    advanceWeek(l);
    if (guard++ > 40) throw new Error('boucle');
  }
}

describe('calendrier', () => {
  it('round-robin : chaque équipe joue une fois par semaine, sans doublon', () => {
    const ids = Array.from({ length: 16 }, (_, i) => `t${i}`);
    const s = roundRobin(ids, 15, 3);
    expect(s.length).toBe(15);
    const pairs = new Set<string>();
    for (const week of s) {
      const seen = new Set<string>();
      expect(week.length).toBe(8);
      for (const g of week) {
        expect(seen.has(g.home) || seen.has(g.away)).toBe(false);
        seen.add(g.home);
        seen.add(g.away);
        const k = [g.home, g.away].sort().join('-');
        expect(pairs.has(k)).toBe(false);
        pairs.add(k);
      }
    }
  });

  it('classement : victoires, défaites, nuls et tri', () => {
    const teams = [{ id: 'a', conference: 0 as const }, { id: 'b', conference: 0 as const }, { id: 'c', conference: 0 as const }];
    const sched = [[{ id: '1', week: 1, home: 'a', away: 'b', played: true, score: [21, 14] as [number, number], overtime: false }],
      [{ id: '2', week: 2, home: 'b', away: 'c', played: true, score: [10, 10] as [number, number], overtime: true }],
      [{ id: '3', week: 3, home: 'c', away: 'a', played: true, score: [3, 7] as [number, number], overtime: false }]];
    const rows = sortStandings(computeStandings(teams, sched), sched);
    expect(rows[0].teamId).toBe('a');
    expect(rows[0].w).toBe(2);
    const b = rows.find((r) => r.teamId === 'b')!;
    expect(b.t).toBe(1);
    expect(b.l).toBe(1);
    expect(b.pf).toBe(24);
  });
});

describe('saison complète', () => {
  it('saison régulière + playoffs + champion + intersaison + nouvelle saison', () => {
    const l = createLeague({ mode: 'franchise', userTeamId: 'lyn', seed: 42, weeks: 6 });
    expect(userGame(l)).not.toBeNull();
    playSeason(l);
    expect(l.phase).toBe('offseason');
    expect(l.champion).toBeTruthy();
    const final = l.playoffs.find((g) => g.id === 'final')!;
    expect(final.played).toBe(true);
    expect(l.playoffs.filter((g) => g.round === 1).length).toBe(4);
    // statistiques de saison
    expect(Object.keys(l.seasonStats).length).toBeGreaterThan(50);
    const report = endSeason(l);
    expect(report.length).toBeGreaterThan(0);
    expect(l.phase).toBe('draft');
    expect(l.history[0].champion).toBe(l.champion);
    // draft : l'IA choisit, puis l'utilisateur
    runAiDraft(l);
    if (draftOnClock(l) === l.userTeamId) draftPlayer(l, l.userTeamId, l.draftClass[0].id);
    runAiDraft(l, false);
    expect(draftOnClock(l)).toBeNull();
    startNewSeason(l);
    expect(l.season).toBe(2);
    expect(l.phase).toBe('regular');
    for (const t of l.teams) {
      expect(t.roster.length).toBeGreaterThanOrEqual(45);
      expect(t.roster.length).toBeLessThanOrEqual(ROSTER_MAX + 3);
    }
    simulateWeek(l, true);
    expect(weekComplete(l)).toBe(true);
  });

  it('le classement couvre toutes les équipes', () => {
    const l = createLeague({ mode: 'season', userTeamId: 'mar', seed: 7, weeks: 3 });
    simulateWeek(l, true);
    const st = standings(l);
    expect(st.length).toBe(16);
    expect(st.reduce((s, r) => s + r.w + r.l + r.t, 0)).toBe(16);
  });
});

describe('marché et budget', () => {
  it('refuse une signature au-delà du plafond salarial', () => {
    const l = createLeague({ mode: 'franchise', userTeamId: 'lyn', seed: 5 });
    startNewSeason(l); // génère des agents libres
    const fa = l.freeAgents[0];
    const team = teamById(l, 'lyn');
    while (team.roster.length > 50) team.roster.pop();
    const over = capSpace(l, 'lyn') + 1;
    const r = signFreeAgent(l, 'lyn', fa.id, over, 2);
    expect(r.ok).toBe(false);
  });

  it('refuse une offre inférieure à la demande puis accepte une offre correcte', () => {
    const l = createLeague({ mode: 'franchise', userTeamId: 'lyn', seed: 5 });
    startNewSeason(l);
    const team = teamById(l, 'lyn');
    while (team.roster.length > 50) team.roster.pop();
    const fa = l.freeAgents[0];
    expect(signFreeAgent(l, 'lyn', fa.id, Math.round(fa.contract.salary * 0.5), 2).ok).toBe(false);
    const cashBefore = l.finances.lyn.cash;
    const ok = signFreeAgent(l, 'lyn', fa.id, fa.contract.salary, 2);
    expect(ok.ok).toBe(true);
    expect(team.roster.some((p) => p.id === fa.id)).toBe(true);
    expect(l.finances.lyn.cash).toBeLessThan(cashBefore);
  });

  it('refuse les échanges déséquilibrés et respecte les effectifs', () => {
    const l = createLeague({ mode: 'franchise', userTeamId: 'lyn', seed: 9 });
    const a = teamById(l, 'lyn');
    const b = teamById(l, 'mar');
    const bestB = [...b.roster].sort((x, y) => overall(y) - overall(x))[0];
    const worstA = [...a.roster].sort((x, y) => overall(x) - overall(y))[0];
    expect(evaluateTrade(l, 'lyn', 'mar', [worstA.id], [bestB.id]).ok).toBe(false);
    const bestA = [...a.roster].sort((x, y) => overall(y) - overall(x)).slice(0, 2);
    const worstB = [...b.roster].sort((x, y) => overall(x) - overall(y))[0];
    const r = executeTrade(l, 'lyn', 'mar', bestA.map((p) => p.id), [worstB.id]);
    expect(r.ok).toBe(true);
    expect(b.roster.some((p) => p.id === bestA[0].id)).toBe(true);
  });

  it('libérer un joueur coûte une indemnité', () => {
    const l = createLeague({ mode: 'franchise', userTeamId: 'lyn', seed: 9 });
    const p = teamById(l, 'lyn').roster[10];
    const cash = l.finances.lyn.cash;
    expect(releasePlayer(l, 'lyn', p.id).ok).toBe(true);
    expect(l.finances.lyn.cash).toBeLessThan(cash);
    expect(l.freeAgents.includes(p)).toBe(true);
  });

  it('amélioration des installations limitée par la trésorerie', () => {
    const l = createLeague({ mode: 'franchise', userTeamId: 'lyn', seed: 9 });
    l.finances.lyn.cash = 1000;
    expect(upgradeFacility(l, 'lyn', 'training').ok).toBe(false);
    l.finances.lyn.cash = 100000;
    expect(upgradeFacility(l, 'lyn', 'training').ok).toBe(true);
    expect(l.finances.lyn.facilities.training).toBe(3);
  });
});

describe('carrière de joueur', () => {
  it('le joueur créé est drafté, s’entraîne et progresse', () => {
    const l = createPlayerCareer({ firstName: 'Léo', lastName: 'Test', position: 'WR', number: 88, skinTone: 2, heightCm: 188, visor: false }, 11);
    const p = careerPlayer(l)!;
    expect(p).toBeTruthy();
    expect(p.isUserCreated).toBe(true);
    expect(l.career!.draft).not.toBeNull();
    const before = { ...p.attrs };
    train(l, 'technique');
    expect(JSON.stringify(before)).not.toBe(JSON.stringify(p.attrs));
    expect(train(l, 'technique')).toContain('déjà');
    simulateWeek(l, true);
    updateCareerAfterGame(l);
    expect(l.seasonStats[p.id]?.games ?? 0).toBeGreaterThanOrEqual(0);
  });
});

describe('sauvegardes', () => {
  it('sauvegarde et rechargement d’une ligue', () => {
    const store = new MemoryStore();
    const sm = new SaveManager(store);
    const l = createLeague({ mode: 'coach', userTeamId: 'tls', seed: 3, weeks: 4 });
    simulateWeek(l, true);
    sm.saveSlot({ slot: 1, kind: 'coach', title: 'Test', teamId: 'tls', season: 1, week: 1, updatedAt: 0 }, l);
    const loaded = sm.loadSlot(1, isLeague);
    expect(loaded).not.toBeNull();
    expect(loaded!.userTeamId).toBe('tls');
    expect(loaded!.schedule[0].filter((g) => g.played).length).toBe(8);
    expect(sm.listSlots()[0].title).toBe('Test');
    sm.deleteSlot(1);
    expect(sm.loadSlot(1, isLeague)).toBeNull();
  });

  it('données corrompues ou incomplètes : valeurs par défaut', () => {
    const store = new MemoryStore();
    store.set('gd.settings', '{pas du json');
    const sm = new SaveManager(store);
    expect(sm.loadSettings()).toEqual(DEFAULT_SETTINGS);
    store.set('gd.settings', JSON.stringify({ version: 1, savedAt: 0, data: { quarterMinutes: 7, difficulty: 'hard', volumes: { music: 5 } } }));
    const s = sm.loadSettings();
    expect(s.quarterMinutes).toBe(3);
    expect(s.difficulty).toBe('hard');
    expect(s.volumes.music).toBe(1);
    store.set('gd.slot2.data', JSON.stringify({ version: 1, savedAt: 0, data: { foo: 1 } }));
    expect(sm.loadSlot(2, isLeague)).toBeNull();
  });

  it('sauvegarde d’une version future ignorée', () => {
    const store = new MemoryStore();
    store.set('gd.profile', JSON.stringify({ version: 99, savedAt: 0, data: { quickMatches: [1] } }));
    expect(new SaveManager(store).loadProfile().quickMatches).toEqual([]);
  });
});
