import { describe, expect, it } from 'vitest';
import { createTeamsFor } from '../../src/data/generator';
import { ALL_CLUBS, LEAGUES, NATIONS, generateClubTemplate } from '../../src/data/world';
import { applyChallenge, CHALLENGES, challengeWon, weeklyChallenge } from '../../src/match/challenges';
import { createCup, cupEntrants, cupDef, CUPS } from '../../src/league/cups';
import { bracketOrder, nextKnockoutRound, seededKnockout } from '../../src/league/knockout';
import { advanceWeek, simulateWeek, standings, userTeam, weekComplete } from '../../src/league/league';
import { endSeason, runAiDraft, startNewSeason } from '../../src/league/offseason';
import { applyPromotions, createClubCareer, originalSquad } from '../../src/league/pyramid';
import { interseasonUserGame, simulateInterseason } from '../../src/league/interseason';
import { buyPlayer, saleOffer, searchPlayers, sellPlayer } from '../../src/league/transfers';
import { DIVISION_SIZE, type League } from '../../src/league/types';
import { DEFAULT_RULES } from '../../src/rules/config';
import { createGameState } from '../../src/rules/engine';
import { MemoryStore } from '../../src/save/storage';
import { SaveManager } from '../../src/save/SaveManager';

const playSeason = (l: League) => {
  let guard = 0;
  while ((l.phase === 'regular' || l.phase === 'playoffs') && guard++ < 60) {
    simulateWeek(l, true);
    if (weekComplete(l)) advanceWeek(l);
  }
};

describe('monde : ligues, clubs et sélections', () => {
  it('identifiants uniques et noms « Ville + couleur » sans doublon dans une ligue', () => {
    const ids = [...ALL_CLUBS, ...NATIONS].map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of LEAGUES) {
      const names = l.teams.map((t) => `${t.city} ${t.name}`);
      expect(new Set(names).size).toBe(names.length);
      expect(new Set(l.teams.map((t) => t.abbr)).size).toBe(l.teams.length);
    }
    expect(LEAGUES.find((l) => l.id === 'usa')!.teams).toHaveLength(32);
    expect(NATIONS).toHaveLength(16);
  });

  it('chaque ligue génère des effectifs complets et deux maillots distincts', () => {
    for (const g of [...LEAGUES.map((l) => l.id), 'nations', 'nationsF']) {
      for (const t of createTeamsFor(g, 3)) {
        expect(t.roster.length).toBeGreaterThanOrEqual(45);
        expect(t.uniform.homeJersey).not.toBe(t.uniform.awayJersey);
      }
    }
  });

  it('les clubs générés pour les divisions inférieures sont uniques', () => {
    const taken = new Set<string>(ALL_CLUBS.map((t) => t.id));
    const gen = Array.from({ length: 25 }, (_, i) => generateClubTemplate('usa', 100 + i * 977, 0.7, taken));
    expect(new Set(gen.map((t) => t.id)).size).toBe(25);
    expect(new Set(gen.map((t) => t.city)).size).toBe(25);
  });
});

describe('élimination directe', () => {
  it('tableau 1-8, 4-5, 2-7, 3-6 puis tours suivants jusqu’à la finale', () => {
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    const games = seededKnockout(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(games.map((g) => `${g.home}-${g.away}`)).toEqual(['a-h', 'd-e', 'b-g', 'c-f']);
    for (const g of games) { g.played = true; g.winner = g.home; }
    const semis = nextKnockoutRound(games);
    expect(semis.map((g) => `${g.home}-${g.away}`)).toEqual(['a-d', 'b-c']);
    for (const g of semis) { g.played = true; g.winner = g.away; }
    const final = nextKnockoutRound([...games, ...semis]);
    expect(final).toHaveLength(1);
    expect(final[0].id).toBe('final');
    expect(final[0].label).toBe('Finale');
  });
});

describe('coupes et tournois', () => {
  it('chaque coupe se joue jusqu’au vainqueur avec le bon nombre d’équipes', () => {
    for (const c of CUPS) {
      const user = c.national ? 'eu-mad' : c.pool()[c.pool().length - 1].id;
      const l = createCup(c.id, user, { leagueId: 'eur', seed: 9 });
      expect(l.teams.some((t) => t.id === user)).toBe(true);
      expect(l.teams.length).toBe(c.national ? 8 : c.size);
      playSeason(l);
      expect(l.phase).toBe('done');
      expect(l.champion).not.toBeNull();
      expect(l.playoffs.find((g) => g.id === 'final')?.played).toBe(true);
    }
  });

  it('phase de groupes : 4 groupes de 4, les deux premiers en quarts', () => {
    const l = createCup('nations', 'nt-fra', { seed: 3 });
    expect(l.cup!.groups).toHaveLength(4);
    expect(l.cup!.groups!.every((g) => g.length === 4)).toBe(true);
    expect(l.weeks).toBe(3);
    for (let w = 0; w < 3; w++) { simulateWeek(l, true); advanceWeek(l); }
    expect(l.phase).toBe('playoffs');
    expect(l.playoffs).toHaveLength(4);
    expect(l.playoffs[0].label).toBe('Quart de finale');
  });

  it('une petite équipe choisie est toujours qualifiée', () => {
    const e = cupEntrants(cupDef('champions'), 'af-nbo');
    expect(e).toHaveLength(16);
    expect(e.some((t) => t.id === 'af-nbo')).toBe(true);
  });
});

describe('carrière de club', () => {
  const squad = originalSquad('us-kcr', 1);
  const keep = squad.slice(0, 3).map((p) => p.id);
  const fresh = () => createClubCareer({ leagueId: 'usa', clubId: 'us-kcr', keepIds: keep, seed: 77 });

  it('départ en troisième division avec seulement 3 joueurs de l’effectif d’origine', () => {
    const l = fresh();
    expect(l.pyramid!.level).toBe(3);
    expect(l.teams).toHaveLength(DIVISION_SIZE);
    const me = userTeam(l);
    const kept = me.roster.filter((p) => p.id.endsWith('-keep'));
    expect(kept.map((p) => p.id.replace('-keep', '')).sort()).toEqual([...keep].sort());
    expect(me.roster.length).toBeGreaterThanOrEqual(45);
    for (const lvl of [1, 2, 3] as const) expect(l.pyramid!.members[lvl]).toHaveLength(DIVISION_SIZE);
  });

  it('playoffs de division : le top 4 joue, seul le vainqueur monte', () => {
    const l = fresh();
    let guard = 0;
    while (l.phase === 'regular' && guard++ < 30) { simulateWeek(l, true); advanceWeek(l); }
    expect(l.phase).toBe('playoffs');
    expect(l.playoffs).toHaveLength(2);
    expect(l.playoffs[0].label).toBe('Demi-finale');
    const top4 = standings(l).slice(0, 4).map((r) => r.teamId);
    expect(new Set(l.playoffs.flatMap((g) => [g.home, g.away]))).toEqual(new Set(top4));
    playSeason(l);
    expect(l.phase).toBe('offseason');
    const champ = l.champion!;
    expect(top4).toContain(champ);
    const last = standings(l)[DIVISION_SIZE - 1].teamId;
    // on force le club de l'utilisateur vainqueur des playoffs
    l.champion = l.userTeamId;
    const msgs = applyPromotions(l);
    expect(msgs[0]).toContain('PROMOTION');
    expect(l.pyramid!.level).toBe(2);
    expect(l.trophies).toContain(`Champion de Troisième division ${l.season}`);
    expect(l.teams).toHaveLength(DIVISION_SIZE);
    for (const lvl of [1, 2, 3] as const) expect(l.pyramid!.members[lvl]).toHaveLength(DIVISION_SIZE);
    // en D3, personne ne descend ; un seul club monte
    expect(l.pyramid!.members[3]).toContain(last === l.userTeamId ? l.pyramid!.members[3][0] : last);
  });

  it('seul le vainqueur monte : un 1er de saison régulière battu en playoffs reste', () => {
    const l = fresh();
    playSeason(l);
    const other = l.playoffs.find((g) => g.id === 'final')!;
    l.champion = other.home === l.userTeamId ? other.away : other.home;
    const msgs = applyPromotions(l);
    expect(l.pyramid!.level).toBe(3);
    expect(msgs[0]).toContain('reste');
  });

  it('club créé (style Rugby Nations) : pays d’origine, identité et maillot, effectif généré', () => {
    const tpl = { id: 'x', city: 'Springfield', name: 'Storm', abbr: 'SPR', conference: 0 as const, primary: '#0B3D91', secondary: '#F5C400', accent: '#FFFFFF', logoShape: 'shield' as const, glyph: 'S', stadium: 'Stade', capacity: 15000, tier: 0.8 };
    const l = createClubCareer({ leagueId: 'eur', custom: { template: tpl, uniform: { socks: '#C8102E', cleats: '#FFFFFF', collar: '#111111' } }, keepIds: [], seed: 4 });
    const me = userTeam(l);
    expect(me.city).toBe('Springfield');
    expect(me.custom).toBe(true);
    expect(me.uniform.socks).toBe('#C8102E');
    expect(me.roster.some((p) => p.id.endsWith('-keep'))).toBe(false);
    expect(l.pyramid!.leagueId).toBe('eur');
    expect(l.pyramid!.level).toBe(3);
  });

  it('tournoi intersaison contre des clubs d’autres régions, avec primes', () => {
    const l = fresh();
    playSeason(l);
    endSeason(l);
    const c = l.interseason!;
    expect(c.opponents).toHaveLength(3);
    expect(c.opponents.every((t) => !t.id.startsWith('us-'))).toBe(true);
    expect(interseasonUserGame(l)).not.toBeNull();
    const cash = l.finances[l.userTeamId].cash;
    simulateInterseason(l, true);
    expect(c.done).toBe(true);
    expect(c.games.find((g) => g.id === 'final')?.played).toBe(true);
    const inFinal = [c.games[2].home, c.games[2].away].includes(l.userTeamId);
    if (inFinal) expect(l.finances[l.userTeamId].cash).toBeGreaterThan(cash);
    runAiDraft(l, false);
    startNewSeason(l);
    expect(l.interseason).toBeNull();
  });

  it('plusieurs saisons enchaînées sans erreur (montées, relégations, draft)', () => {
    const l = fresh();
    for (let s = 0; s < 3; s++) {
      playSeason(l);
      endSeason(l);
      runAiDraft(l, false);
      startNewSeason(l);
      expect(l.teams).toHaveLength(DIVISION_SIZE);
      expect(new Set(l.teams.flatMap((t) => t.roster.map((p) => p.id))).size).toBe(l.teams.reduce((n, t) => n + t.roster.length, 0));
    }
    expect(l.pyramid!.log).toHaveLength(3);
  });

  it('transferts : achat (indemnité débitée) et vente (indemnité créditée)', () => {
    const l = fresh();
    const cash0 = l.finances[l.userTeamId].cash;
    const target = searchPlayers(l).filter((x) => x.fee <= cash0 && x.teamId === null)[0];
    const r = buyPlayer(l, target.player.id);
    expect(r.ok).toBe(true);
    expect(l.finances[l.userTeamId].cash).toBe(cash0 - target.fee);
    expect(userTeam(l).roster.some((p) => p.id === target.player.id)).toBe(true);
    const seller = userTeam(l).roster.find((p) => p.id !== target.player.id)!;
    const offer = saleOffer(l, seller.id)!;
    const cash1 = l.finances[l.userTeamId].cash;
    expect(sellPlayer(l, seller.id).ok).toBe(true);
    expect(l.finances[l.userTeamId].cash).toBe(cash1 + offer.fee);
    expect(userTeam(l).roster.some((p) => p.id === seller.id)).toBe(false);
  });

  it('achat refusé si la trésorerie est insuffisante', () => {
    const l = fresh();
    l.finances[l.userTeamId].cash = 10;
    const r = buyPlayer(l, searchPlayers(l)[0].player.id);
    expect(r.ok).toBe(false);
  });
});

describe('défis', () => {
  it('la situation du défi est appliquée à l’état du match', () => {
    const c = CHALLENGES.find((x) => x.id === 'goalLine')!;
    const s = createGameState({ ...DEFAULT_RULES, quarterMinutes: 15 });
    applyChallenge(c, s);
    expect(s.quarter).toBe(4);
    expect(s.clock).toBe(38);
    expect(s.score).toEqual([27, 23]);
    expect(s.possession).toBe(1); // l'IA attaque
    expect(s.ballOn).toBe(96);
    expect(s.toGo).toBe(4);
    expect(s.twoMinuteWarned[1]).toBe(true);
    s.finished = true;
    s.winner = 0;
    expect(challengeWon(c, s)).toBe(true);
  });

  it('l’événement de la semaine est stable pendant une semaine et change ensuite', () => {
    expect(weeklyChallenge(2900)).toEqual(weeklyChallenge(2900));
    expect(weeklyChallenge(2900).id).not.toBe(weeklyChallenge(2901).id);
  });

  it('les étoiles des défis sont sauvegardées dans le profil', () => {
    const sm = new SaveManager(new MemoryStore());
    const p = sm.loadProfile();
    p.challenges.drive = 2;
    sm.saveProfile(p);
    expect(sm.loadProfile().challenges.drive).toBe(2);
  });
});
