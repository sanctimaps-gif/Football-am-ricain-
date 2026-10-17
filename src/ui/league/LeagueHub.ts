import { audio } from '../../audio/AudioEngine';
import { teamOverall } from '../../data/generator';
import { overall } from '../../data/ratings';
import { ALL_POSITIONS, fullName, type Position } from '../../data/types';
import { teamInfo, advanceWeek, simulateWeek, standings, teamById, userGame, userTeam, weekComplete, recordResult } from '../../league/league';
import { capSpace, evaluateTrade, executeTrade, extendContract, facilityCost, payroll, releasePlayer, signFreeAgent, upgradeFacility } from '../../league/market';
import { buyPlayer, saleOffer, searchPlayers, sellPlayer } from '../../league/transfers';
import { divisionObjective, rankZone } from '../../league/pyramid';
import { interseasonTeam, interseasonUserGame, recordInterseason, simulateInterseason } from '../../league/interseason';
import { computeStandings, sortStandings, type StandingRow } from '../../league/schedule';
import { displayName } from '../../data/world';
import { showConfirm } from '../dialog';
import { applyKitAction, kitEditorHtml, type KitPart } from '../KitDesigner';
import { draftOnClock, draftPlayer, endSeason, runAiDraft, scoutValue, startNewSeason } from '../../league/offseason';
import { DIVISIONS, type DivisionLevel, type League } from '../../league/types';
import type { MatchController } from '../../match/MatchController';
import type { SlotMeta } from '../../save/SaveManager';
import type { Side } from '../../rules/types';
import type { App, Screen } from '../App';
import { el, esc, onAction, ovrClass } from '../dom';
import { logoSvg } from '../logo';
import { MainMenu } from '../screens/MainMenu';
import { PreMatchScreen } from '../screens/PreMatchScreen';
import { money, playerCard, playerRow, teamLabel } from './common';

type Tab = 'kit' | 'home' | 'schedule' | 'standings' | 'playoffs' | 'roster' | 'transfers' | 'market' | 'draft' | 'finance' | 'trade' | 'plan' | 'history';

const MODE_TITLES: Record<League['mode'], string> = {
  season: 'Championnat', coach: 'Carrière de coach', franchise: 'Franchise', playerCareer: 'Carrière de joueur', club: 'Carrière de club', cup: 'Coupe',
};

/** Tableau de bord des modes saison / coach / franchise / carrière de joueur. */
export class LeagueHub implements Screen {
  readonly el: HTMLElement;
  private tab: Tab = 'home';
  private rosterPos: Position | 'ALL' = 'ALL';
  private selectedPlayer: string | null = null;
  private tradeTeam: string | null = null;
  private tradeGive = new Set<string>();
  private tradeGet = new Set<string>();
  private busy = false;
  private transferPos: Position | 'ALL' = 'ALL';
  private kitPart: KitPart = 'homeJersey';

  constructor(private app: App, private l: League, private slot: number) {
    this.el = el('div', 'screen');
    // ancienne « carrière de joueur » (contrôle d'un joueur sur le terrain) : convertie en championnat
    if ((l.mode as string) === 'playerCareer') {
      l.mode = 'season';
      l.career = null;
    }
    onAction(this.el, (a, target) => this.onAction(a, target));
    this.render();
  }

  saveNow(): void {
    this.save();
  }

  private save(): void {
    const l = this.l;
    const meta: SlotMeta = {
      slot: this.slot, kind: l.mode, title: `${l.cup ? l.cup.name : MODE_TITLES[l.mode]} — ${displayName(userTeam(l))}`,
      teamId: l.userTeamId, season: l.season, week: l.week, updatedAt: Date.now(),
    };
    this.app.saves.saveSlot(meta, l);
  }

  private tabs(): Tab[] {
    const l = this.l;
    const tabs: Tab[] = ['home'];
    if (!l.cup || l.cup.groups) tabs.push('schedule', 'standings');
    if (l.phase === 'playoffs' || l.playoffs.length) tabs.push('playoffs');
    tabs.push('roster');
    if (l.mode === 'club') tabs.push('transfers');
    if (l.mode === 'coach' || l.mode === 'franchise' || l.mode === 'club') tabs.push('market', 'finance', 'plan');
    if (l.mode === 'franchise') tabs.push('trade');
    if (l.mode === 'club' || l.mode === 'franchise') tabs.push('kit');
    if (l.phase === 'draft' && (l.mode === 'coach' || l.mode === 'franchise' || l.mode === 'club')) tabs.push('draft');
    if (l.cup) return tabs;
    tabs.push('history');
    return tabs;
  }

  private tabLabel(tb: Tab): string {
    const l = this.l;
    if (l.cup && tb === 'standings') return 'Groupes';
    if (l.cup && tb === 'playoffs') return 'Phase finale';
    if (l.pyramid && tb === 'playoffs') return 'Playoffs';
    return { home: 'Accueil', schedule: 'Calendrier', standings: 'Classement', playoffs: 'Playoffs', transfers: 'Transferts', kit: 'Maillot', roster: 'Effectif', market: 'Recrutement', draft: 'Draft', finance: 'Finances & installations', trade: 'Échanges', plan: 'Plan de jeu', history: 'Historique' }[tb];
  }

  render(): void {
    const l = this.l;
    const team = userTeam(l);
    if (!this.tabs().includes(this.tab)) this.tab = 'home';
    const phaseLabel = l.cup
      ? (l.phase === 'regular' ? `Groupes · journée ${l.week}/${l.weeks}` : l.phase === 'playoffs' ? 'Phase finale' : 'Terminée')
      : l.phase === 'regular' ? `Semaine ${l.week}/${l.weeks}` : l.phase === 'playoffs' ? 'Playoffs' : l.phase === 'draft' ? 'Draft' : 'Intersaison';
    const context = l.cup ? `${l.cup.icon} ${l.cup.name}` : l.pyramid ? `${MODE_TITLES[l.mode]} · ${DIVISIONS[l.pyramid.level].name} · Saison ${l.season}` : `${MODE_TITLES[l.mode]} · Saison ${l.season}`;
    let body = '';
    switch (this.tab) {
      case 'home': body = this.homeTab(); break;
      case 'schedule': body = this.scheduleTab(); break;
      case 'standings': body = this.standingsTab(); break;
      case 'playoffs': body = this.playoffsTab(); break;
      case 'roster': body = this.rosterTab(); break;
      case 'transfers': body = this.transfersTab(); break;
      case 'kit': body = kitEditorHtml(userTeam(l).uniform, this.kitPart); break;
      case 'market': body = this.marketTab(); break;
      case 'draft': body = this.draftTab(); break;
      case 'finance': body = this.financeTab(); break;
      case 'trade': body = this.tradeTab(); break;
      case 'plan': body = this.planTab(); break;
      case 'history': body = this.historyTab(); break;
    }
    this.el.style.setProperty('--team', team.colors.primary);
    this.el.innerHTML = `
      <div class="topbar">
        <button class="btn ghost" data-action="menu">‹ Menu</button>
        ${logoSvg(team.logo, team.colors, 38)}
        <h1>${esc(displayName(team))} <span class="muted" style="font-size:16px">· ${esc(context)} · ${phaseLabel}</span></h1>
        <button class="btn" data-action="save">💾</button>
      </div>
      <div class="tabs">${this.tabs().map((x) => `<button class="chip ${x === this.tab ? 'on' : ''}" data-action="tab:${x}">${this.tabLabel(x)}</button>`).join('')}</div>
      <div class="panel scroll grow">${body}</div>`;
    this.bindPlanSliders();
  }

  // ———————————————————— Onglets ————————————————————

  private homeTab(): string {
    const l = this.l;
    const g = userGame(l);
    const row = standings(l).find((r) => r.teamId === l.userTeamId);
    let next = '';
    if (l.coach?.fired) {
      next = `<div class="panel"><h3>Vous avez été licencié</h3><div class="muted">Offres disponibles :</div><div class="col">${this.jobOffers().map((id) => `<button class="btn" data-action="job:${id}">${teamLabel(teamById(l, id))} · GÉN ${teamOverall(teamById(l, id))}</button>`).join('')}</div></div>`;
    } else if (g) {
      const home = teamById(l, g.home);
      const away = teamById(l, g.away);
      const label = 'label' in g ? g.label : `Semaine ${l.week}`;
      next = `<div class="panel col" style="align-items:center;gap:6px">
        <div class="opt-label">${esc(label)}</div>
        <div class="result-head" style="gap:12px"><div class="col" style="align-items:center;gap:2px">${logoSvg(home.logo, home.colors, 46)}<b>${esc(home.abbr)}</b></div><div style="font-size:20px">contre</div><div class="col" style="align-items:center;gap:2px">${logoSvg(away.logo, away.colors, 46)}<b>${esc(away.abbr)}</b></div></div>
        <div class="muted">${esc(home.stadium.name)} · GÉN ${teamOverall(home)} vs ${teamOverall(away)}</div>
        <div class="row" style="flex-wrap:nowrap"><button class="btn primary" style="white-space:nowrap" data-action="play">▶ Jouer</button><button class="btn" style="white-space:nowrap" data-action="simulate">Simuler</button></div>
      </div>`;
    } else if (l.phase === 'done') {
      const won = l.champion === l.userTeamId;
      next = `<div class="panel col" style="align-items:center;gap:8px"><div style="font-size:44px">${won ? '🏆' : '🏁'}</div><div style="font-size:22px;font-weight:900;text-align:center">${won ? `Vous remportez ${esc(l.cup?.name ?? 'la compétition')} !` : `Vainqueur : ${l.champion ? teamLabel(teamById(l, l.champion)) : '—'}`}</div><div class="row" style="flex-wrap:nowrap"><button class="btn primary" data-action="menu">Menu principal</button></div></div>`;
    } else if (l.phase === 'regular' || l.phase === 'playoffs') {
      const out = l.cup && l.phase === 'playoffs' && !l.playoffs.some((x) => !x.played && (x.home === l.userTeamId || x.away === l.userTeamId));
      next = `<div class="panel col" style="align-items:center"><div class="muted">${out ? 'Votre équipe est éliminée. Suivez la suite de la compétition.' : l.phase === 'playoffs' ? 'Votre équipe ne joue pas cette semaine des playoffs.' : 'Pas de match cette semaine.'}</div><button class="btn primary" data-action="advance">${l.cup ? 'Simuler le tour' : 'Simuler la semaine'}</button></div>`;
    } else if (l.phase === 'offseason') {
      next = `<div class="panel col" style="align-items:center"><div style="font-size:22px">🏆 Champion : ${l.champion ? teamLabel(teamById(l, l.champion)) : '—'}</div><button class="btn primary" data-action="endSeason">Bilan de saison et intersaison</button></div>`;
    } else if (l.phase === 'draft') {
      const manage = l.mode === 'coach' || l.mode === 'franchise';
      next = `<div class="panel col" style="align-items:center"><div>Draft en cours (choix ${l.draftPick + 1}/${l.draftOrder.length * l.draftRounds}).</div>${manage ? '<button class="btn primary" data-action="tab:draft">Aller à la draft</button>' : '<button class="btn primary" data-action="autoDraft">Terminer la draft et lancer la saison suivante</button>'}</div>`;
    }
    const coach = l.coach && l.mode !== 'club' ? `<div class="panel" style="margin-top:8px"><b>Direction</b> · Objectif : ${l.coach.objectives.wins} victoires${l.coach.objectives.playoffs ? ' + playoffs' : ''} · Confiance ${Math.round(l.coach.security)}/100 · Réputation ${Math.round(l.coach.reputation)}/100</div>` : '';
    const career = (l.interseason ? this.interseasonPanel() : '') + (l.pyramid ? this.clubSummary() : '');
    return `<div class="row" style="align-items:stretch;gap:10px">
      <div class="col grow">${next}${coach}${career}</div>
      <div class="col" style="width:40%">${row && (!l.cup || l.cup.groups) ? `<div class="panel"><b>Bilan</b> : ${row.w}-${row.l}-${row.t} · PF ${row.pf} · PA ${row.pa} · ${row.streak || '—'}</div>` : ''}
      <div class="panel col"><b>Actualités</b>${l.news.slice(0, 8).map((n) => `<div style="font-size:14px">${esc(n)}</div>`).join('') || '<div class="muted">Aucune actualité.</div>'}</div></div></div>`;
  }

  private interseasonPanel(): string {
    const l = this.l;
    const c = l.interseason!;
    const name = (id: string) => esc(displayName(interseasonTeam(l, id)));
    const games = c.games.map((g) => `<div style="font-size:14px">${esc(g.label)} : ${name(g.home)} ${g.score ? `<b>${g.score[0]} – ${g.score[1]}</b>` : 'vs'} ${name(g.away)}</div>`).join('');
    const mine = interseasonUserGame(l);
    const buttons = c.done ? '' : mine ? '<div class="row" style="flex-wrap:nowrap"><button class="btn primary" data-action="isPlay">▶ Jouer</button><button class="btn" data-action="isSim">Simuler</button></div>' : '<button class="btn" data-action="isSim">Simuler la suite</button>';
    return `<div class="panel col" style="margin-top:8px;gap:4px"><b>🌍 ${esc(c.name)} (intersaison)</b><div class="muted" style="font-size:13px">Clubs d'autres régions du monde · primes ${money(c.prize[0])} / ${money(c.prize[1])}</div>${games}${buttons}</div>`;
  }

  private clubSummary(): string {
    const l = this.l;
    const p = l.pyramid!;
    const rank = standings(l).findIndex((r) => r.teamId === l.userTeamId) + 1;
    const ladder = ([1, 2, 3] as DivisionLevel[]).map((lvl) => `<span class="chip ${lvl === p.level ? 'on' : ''}" style="min-height:30px">${lvl === 1 ? '🥇' : lvl === 2 ? '🥈' : '🥉'} D${lvl}</span>`).join('');
    const log = p.log.slice(-4).reverse().map((x) => `<div style="font-size:14px">S${x.season} · D${x.level} · ${x.rank}e ${x.moved === 'up' ? '⬆️ montée' : x.moved === 'down' ? '⬇️ relégation' : ''}</div>`).join('');
    return `<div class="panel" style="margin-top:8px"><div class="row" style="gap:6px;flex-wrap:wrap"><b>${DIVISIONS[p.level].name}</b>${ladder}</div>
      <div>🎯 ${esc(divisionObjective(p.level))}</div><div class="muted" style="font-size:14px">Classement actuel : ${rank}e / ${l.teams.length} · Trésorerie ${money(l.finances[l.userTeamId].cash)}</div>${log}</div>`;
  }

  private scheduleTab(): string {
    const l = this.l;
    return l.schedule.map((week, i) => `<div class="opt-label">Semaine ${i + 1}${i + 1 === l.week && l.phase === 'regular' ? ' (en cours)' : ''}</div>` + week.map((g) => {
      const h = teamById(l, g.home);
      const a = teamById(l, g.away);
      const mine = g.home === l.userTeamId || g.away === l.userTeamId;
      return `<div class="list-item" style="${mine ? 'background:rgba(255,204,26,.12)' : ''}"><span class="grow">${esc(h.abbr)} ${g.score ? `<b>${g.score[0]} – ${g.score[1]}</b>` : 'vs'} ${esc(a.abbr)}${g.overtime ? ' (prol.)' : ''}</span><span class="muted" style="font-size:13px">${esc(h.stadium.name)}${g.userPlayed ? ' · joué' : ''}</span></div>`;
    }).join('')).join('');
  }

  private standingsTab(): string {
    const l = this.l;
    const head = '<tr><th>Équipe</th><th>V</th><th>D</th><th>N</th><th>PF</th><th>PA</th><th>Diff</th><th>Série</th></tr>';
    const line = (r: StandingRow, prefix: string, style = '') => `<tr class="${r.teamId === l.userTeamId ? 'me' : ''}" style="${style}"><td>${prefix}${teamLabel(teamById(l, r.teamId), 20)}</td><td>${r.w}</td><td>${r.l}</td><td>${r.t}</td><td>${r.pf}</td><td>${r.pa}</td><td>${r.pf - r.pa}</td><td>${r.streak || '—'}</td></tr>`;
    if (l.cup?.groups) {
      return l.cup.groups.map((g, gi) => {
        const rows = sortStandings(computeStandings(g.map((id) => ({ id, conference: 0 as const })), l.schedule), l.schedule);
        return `<div class="opt-label">Groupe ${String.fromCharCode(65 + gi)}</div><table class="stats">${head}${rows.map((r, i) => line(r, i < 2 ? '✅ ' : '')).join('')}</table>`;
      }).join('') + '<div class="muted" style="font-size:13px">Les 2 premiers de chaque groupe se qualifient pour la phase finale.</div>';
    }
    if (l.pyramid) {
      const zoneStyle = { down: 'background:rgba(255,90,95,.16)', title: 'background:rgba(255,204,26,.14)' } as const;
      const icon = { down: '⬇️ ', title: '🏅 ' } as const;
      const d = DIVISIONS[l.pyramid.level];
      return `<div class="opt-label">${d.name}</div><table class="stats">${head}${standings(l).map((r, i) => {
        const z = rankZone(l, i);
        return line(r, `${i + 1}. ${z ? icon[z] : ''}`, z ? zoneStyle[z] : '');
      }).join('')}</table><div class="muted" style="font-size:13px">🏅 top 4 en playoffs${d.promote ? ' : le vainqueur monte' : ' pour le titre'}${d.relegate ? ` · ⬇️ le dernier descend` : ''}</div>`;
    }
    const st = standings(l);
    const names = l.conferenceNames ?? ['Conférence Atlantique', 'Conférence Horizon'];
    return [0, 1].map((c) => `<div class="opt-label">${esc(names[c])}</div><table class="stats">${head}${st.filter((r) => r.conference === c).map((r, i) => line(r, i < l.playoffTeams ? '🏅 ' : '')).join('')}</table>`).join('');
  }

  private playoffsTab(): string {
    const l = this.l;
    if (!l.playoffs.length) return '<div class="muted">Les playoffs commencent après la saison régulière.</div>';
    const rounds = [...new Set(l.playoffs.map((g) => g.round))].sort();
    return `<div class="bracket">${rounds.map((r) => `<div class="round">${l.playoffs.filter((g) => g.round === r).map((g) => {
      const h = teamById(l, g.home);
      const a = teamById(l, g.away);
      return `<div class="game"><div class="opt-label" style="margin:0">${esc(g.label)}</div><div class="${g.winner === h.id ? 'w' : ''}">${esc(h.abbr)} ${g.score ? g.score[0] : ''}</div><div class="${g.winner === a.id ? 'w' : ''}">${esc(a.abbr)} ${g.score ? g.score[1] : ''}</div></div>`;
    }).join('')}</div>`).join('')}${l.champion ? `<div class="round"><div class="game" style="font-size:20px">🏆 ${esc(displayName(teamById(l, l.champion)))}</div></div>` : ''}</div>`;
  }

  private rosterTab(): string {
    const l = this.l;
    const team = userTeam(l);
    if (this.selectedPlayer) {
      const p = team.roster.find((x) => x.id === this.selectedPlayer);
      if (p) {
        const manage = l.mode === 'coach' || l.mode === 'franchise' || l.mode === 'club';
        const depth = team.depth[p.position] ?? [];
        const idx = depth.indexOf(p.id);
        return `<div class="row" style="margin-bottom:8px"><button class="btn ghost" data-action="unselect">‹ Effectif</button>
          <span class="muted">Profondeur ${p.position} : n°${idx + 1}/${depth.length}</span>
          <button class="btn" data-action="depthUp:${p.id}" ${idx <= 0 ? 'disabled' : ''}>▲ Monter</button>
          <button class="btn" data-action="depthDown:${p.id}" ${idx >= depth.length - 1 ? 'disabled' : ''}>▼ Descendre</button>
          ${manage ? `<button class="btn" data-action="extend:${p.id}">Prolonger</button>${l.mode === 'club' ? `<button class="btn" data-action="sell:${p.id}">Vendre</button>` : ''}<button class="btn danger" data-action="release:${p.id}">Libérer</button>` : ''}
        </div>${playerCard(p, l)}`;
      }
    }
    const pos = this.rosterPos;
    const list = pos === 'ALL' ? [...team.roster].sort((a, b) => ALL_POSITIONS.indexOf(a.position) - ALL_POSITIONS.indexOf(b.position) || overall(b) - overall(a)) : (team.depth[pos] ?? []).map((id) => team.roster.find((p) => p.id === id)!).filter(Boolean);
    return `<div class="tabs"><button class="chip ${pos === 'ALL' ? 'on' : ''}" data-action="pos:ALL">Tous (${team.roster.length})</button>${ALL_POSITIONS.map((p) => `<button class="chip ${pos === p ? 'on' : ''}" data-action="pos:${p}">${p}</button>`).join('')}</div>
      ${pos !== 'ALL' ? '<div class="muted" style="font-size:14px">Profondeur de poste : l’ordre détermine les titulaires (touchez un joueur pour le monter/descendre).</div>' : ''}
      ${list.map((p, i) => playerRow(p, pos !== 'ALL' ? `<span class="chip" style="min-height:30px">${i === 0 ? 'Titulaire' : `n°${i + 1}`}</span>` : '', `player:${p.id}`)).join('')}`;
  }

  private transfersTab(): string {
    const l = this.l;
    const pos = this.transferPos;
    const list = searchPlayers(l, pos).slice(0, 40);
    const f = l.finances[l.userTeamId];
    return `<div class="row" style="flex-wrap:wrap"><b>Marché des transferts</b><span class="muted">Trésorerie ${money(f.cash)} · Espace salarial ${money(capSpace(l, l.userTeamId))} · Effectif ${userTeam(l).roster.length}/55</span></div>
      <div class="tabs"><button class="chip ${pos === 'ALL' ? 'on' : ''}" data-action="tpos:ALL">Tous</button>${ALL_POSITIONS.map((p) => `<button class="chip ${pos === p ? 'on' : ''}" data-action="tpos:${p}">${p}</button>`).join('')}</div>
      <div class="muted" style="font-size:13px">Achetez des joueurs aux clubs de votre division ou à des clubs étrangers. Pour vendre, ouvrez la fiche d’un joueur dans l’Effectif.</div>
      ${list.map((x) => playerRow(x.player, `<span class="muted" style="font-size:13px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.seller)}</span><button class="btn ${x.fee <= f.cash ? 'primary' : ''}" data-action="buy:${x.player.id}">${money(x.fee)}</button>`)).join('') || '<div class="muted">Aucun joueur disponible à ce poste.</div>'}`;
  }

  private marketTab(): string {
    const l = this.l;
    const fa = [...l.freeAgents].sort((a, b) => overall(b) - overall(a)).slice(0, 40);
    return `<div class="row"><b>Agents libres</b><span class="muted">Espace salarial : ${money(capSpace(l, l.userTeamId))} · Trésorerie : ${money(l.finances[l.userTeamId].cash)} · Effectif ${userTeam(l).roster.length}/55</span></div>
      ${fa.length ? fa.map((p) => playerRow(p, `<button class="btn" data-action="sign:${p.id}">Signer</button>`)).join('') : '<div class="muted">Aucun agent libre pour le moment (le marché s’ouvre à l’intersaison et après les libérations).</div>'}`;
  }

  private draftTab(): string {
    const l = this.l;
    const onClock = draftOnClock(l);
    const mine = onClock === l.userTeamId;
    const cls = [...l.draftClass].sort((a, b) => scoutValue(b) - scoutValue(a)).slice(0, 40);
    return `<div class="row"><b>${onClock ? `Au choix : ${esc(teamById(l, onClock).abbr)} (choix ${l.draftPick + 1})` : 'Draft terminée'}</b>
      ${!mine && onClock ? '<button class="btn" data-action="draftSim">Simuler jusqu’à mon choix</button>' : ''}
      ${!onClock ? '<button class="btn primary" data-action="newSeason">Lancer la saison suivante</button>' : ''}</div>
      ${cls.map((p) => playerRow(p, `<span class="muted" style="font-size:13px">Pot. ${p.potential}</span>${mine ? `<button class="btn primary" data-action="draft:${p.id}">Choisir</button>` : ''}`)).join('')}`;
  }

  private financeTab(): string {
    const l = this.l;
    const f = l.finances[l.userTeamId];
    const team = userTeam(l);
    const fac = (k: 'training' | 'medical' | 'stadium', label: string, desc: string) => `<div class="setting"><label>${label} <span class="muted">(niv. ${f.facilities[k]}/5) — ${desc}</span></label>${f.facilities[k] < 5 ? `<button class="btn" data-action="upgrade:${k}">Améliorer (${money(facilityCost(f.facilities[k]))})</button>` : '<span class="chip on">Max</span>'}</div>`;
    const top = [...team.roster].sort((a, b) => b.contract.salary - a.contract.salary).slice(0, 12);
    return `<div class="row" style="align-items:flex-start;gap:12px">
      <div class="col grow">
        <div class="panel"><b>Budget</b><br>Trésorerie : ${money(f.cash)} · Masse salariale : ${money(payroll(team))} / plafond ${money(f.salaryCap)} · Espace : ${money(capSpace(l, l.userTeamId))}<br>Recettes saison : ${money(f.seasonRevenue)} · Dépenses saison : ${money(f.seasonExpenses)} · Soutien des fans : ${Math.round(f.fanSupport)}/100</div>
        <div class="setting"><label>Prix du billet : ${f.ticketPrice} $</label><div class="row"><button class="btn" data-action="ticket:-10" ${l.mode !== 'franchise' ? 'disabled' : ''}>−</button><button class="btn" data-action="ticket:10" ${l.mode !== 'franchise' ? 'disabled' : ''}>+</button></div></div>
        ${fac('training', 'Centre d’entraînement', 'progression des joueurs')}
        ${fac('medical', 'Centre médical', 'blessures plus courtes')}
        ${fac('stadium', 'Stade', 'capacité et recettes')}
        ${l.mode !== 'franchise' ? '<div class="muted" style="font-size:14px">Les installations et la billetterie se gèrent en mode Franchise.</div>' : ''}
      </div>
      <div class="col grow"><b>Contrats les plus élevés</b>${top.map((p) => playerRow(p, '', `player:${p.id}`)).join('')}</div></div>`;
  }

  private tradeTab(): string {
    const l = this.l;
    const mine = userTeam(l);
    const others = l.teams.filter((x) => x.id !== l.userTeamId);
    if (!this.tradeTeam) this.tradeTeam = others[0].id;
    const other = teamById(l, this.tradeTeam);
    const list = (team: typeof mine, set: Set<string>, prefix: string) => [...team.roster].sort((a, b) => overall(b) - overall(a)).slice(0, 30).map((p) => `<div class="list-item" data-action="${prefix}:${p.id}" style="${set.has(p.id) ? 'background:rgba(255,204,26,.2)' : ''}"><span class="ovr-badge ${ovrClass(overall(p))}">${overall(p)}</span><b style="width:30px">${p.position}</b><span class="grow">${esc(fullName(p))}</span><span class="muted" style="font-size:13px">${p.age} a · ${money(p.contract.salary)}</span></div>`).join('');
    const ev = this.tradeGive.size || this.tradeGet.size ? evaluateTrade(l, l.userTeamId, other.id, [...this.tradeGive], [...this.tradeGet]) : null;
    return `<div class="row"><span>Partenaire :</span>${others.map((x) => `<button class="chip ${x.id === other.id ? 'on' : ''}" data-action="tradeTeam:${x.id}">${esc(x.abbr)}</button>`).join('')}</div>
      <div class="row" style="margin:6px 0"><span class="grow ${ev ? (ev.ok ? '' : 'muted') : 'muted'}">${ev ? (ev.ok ? '✅ ' + esc(ev.message) : '❌ ' + esc(ev.reason)) : 'Sélectionnez des joueurs des deux côtés.'}</span><button class="btn primary" data-action="tradeDo" ${ev?.ok ? '' : 'disabled'}>Proposer l’échange</button></div>
      <div class="row" style="align-items:flex-start;gap:10px"><div class="col grow"><b>Je donne (${esc(mine.abbr)})</b>${list(mine, this.tradeGive, 'give')}</div><div class="col grow"><b>Je reçois (${esc(other.abbr)})</b>${list(other, this.tradeGet, 'get')}</div></div>`;
  }

  private planTab(): string {
    const plan = this.l.plans[this.l.userTeamId];
    const slider = (k: keyof typeof plan, label: string, lo: string, hi: string) => `<div class="setting"><label>${label}<br><span class="muted" style="font-size:13px">${lo} ← → ${hi}</span></label><input type="range" min="0" max="1" step="0.05" value="${plan[k]}" data-plan="${k}"></div>`;
    return `<div class="muted">Le plan de jeu oriente les choix de l’IA pour votre équipe (matchs simulés et appels automatiques).</div>
      ${slider('passRatio', 'Équilibre course / passe', 'Course', 'Passe')}
      ${slider('aggression', 'Agressivité (4e tentatives, blitz)', 'Prudent', 'Agressif')}
      ${slider('deepShots', 'Passes profondes', 'Courtes', 'Longues')}`;
  }

  private historyTab(): string {
    const l = this.l;
    const r = l.records;
    return `<div class="row" style="align-items:flex-start;gap:12px"><div class="col grow">${l.trophies?.length ? `<b>Trophées du club</b>${l.trophies.map((x) => `<div class="list-item">🏆 ${esc(x)}</div>`).join('')}` : ''}${l.pyramid?.log.length ? `<b style="margin-top:6px">Parcours en divisions</b>${l.pyramid.log.map((x) => `<div class="list-item">S${x.season} · D${x.level} · ${x.rank}e${x.moved === 'up' ? ' · ⬆️ montée' : x.moved === 'down' ? ' · ⬇️ relégation' : ''}</div>`).join('')}` : ''}<b>Palmarès</b>${l.history.map((h) => `<div class="list-item">Saison ${h.season} · 🏆 ${esc(teamInfo(l, h.champion).name)} · MVP ${esc(h.mvp?.name ?? '—')}${h.userRecord ? ` · Vous : ${h.userRecord.w}-${h.userRecord.l}-${h.userRecord.t}` : ''}</div>`).join('') || '<div class="muted">Aucune saison terminée.</div>'}
      ${l.coach ? `<b style="margin-top:8px">Carrière du coach</b>${l.coach.seasons.map((s) => `<div class="list-item">S${s.season} ${esc(teamInfo(l, s.teamId).abbr)} ${s.w}-${s.l}-${s.t}${s.playoffs ? ' · playoffs' : ''}${s.champion ? ' · 🏆' : ''}</div>`).join('') || '<div class="muted">—</div>'}` : ''}</div>
      <div class="col grow"><b>Records</b>
        <div>Points en un match : ${r.mostPointsGame ? `${r.mostPointsGame.value} (${esc(teamInfo(l, r.mostPointsGame.teamId).abbr)}, S${r.mostPointsGame.season})` : '—'}</div>
        <div>Victoires en une saison : ${r.bestSeason ? `${r.bestSeason.w} (${esc(teamInfo(l, r.bestSeason.teamId).abbr)}, S${r.bestSeason.season})` : '—'}</div>
        <div>Yards à la passe (saison) : ${r.passYdsSeason ? `${r.passYdsSeason.value} — ${esc(r.passYdsSeason.name)}` : '—'}</div>
        <div>Yards à la course (saison) : ${r.rushYdsSeason ? `${r.rushYdsSeason.value} — ${esc(r.rushYdsSeason.name)}` : '—'}</div></div></div>`;
  }

  // ———————————————————— Actions ————————————————————

  private message(text: string): void {
    const m = el('div', 'modal', `<div class="box"><div class="helptext scroll">${esc(text)}</div><div class="actions"><button class="btn primary" data-action="close">OK</button></div></div>`);
    m.querySelector('button')!.addEventListener('click', () => m.remove());
    this.el.appendChild(m);
  }

  private jobOffers(): string[] {
    const l = this.l;
    return l.teams.filter((x) => x.id !== l.userTeamId).sort((a, b) => teamOverall(a) - teamOverall(b)).slice(0, 3).map((x) => x.id);
  }

  private onAction(a: string, target: HTMLElement): void {
    if (this.busy) return;
    const l = this.l;
    audio.ui();
    const [k, v] = [a.split(':')[0], a.split(':').slice(1).join(':')];
    switch (k) {
      case 'menu':
        this.save();
        this.app.go(new MainMenu(this.app));
        return;
      case 'save':
        this.save();
        this.message('Partie sauvegardée.');
        return;
      case 'tab':
        this.tab = v as Tab;
        this.selectedPlayer = null;
        break;
      case 'play':
        this.playUserGame();
        return;
      case 'simulate':
        simulateWeek(l, true);
        this.finishWeek([]);
        return;
      case 'advance':
        simulateWeek(l, true);
        this.finishWeek([]);
        return;
      case 'endSeason': {
        const report = endSeason(l);
        if (l.mode === 'season') {
          runAiDraft(l, false);
          report.push(...startNewSeason(l));
          report.push(`La saison ${l.season} commence !`);
        } else {
          runAiDraft(l);
          this.tab = 'draft';
        }
        this.save();
        this.render();
        this.message(report.join('\n'));
        return;
      }
      case 'autoDraft': {
        runAiDraft(l, false);
        const msgs = startNewSeason(l);
        this.save();
        this.render();
        if (msgs.length) this.message(msgs.join('\n'));
        return;
      }
      case 'draft':
        draftPlayer(l, l.userTeamId, v);
        runAiDraft(l);
        this.save();
        break;
      case 'draftSim':
        runAiDraft(l);
        break;
      case 'newSeason': {
        const msgs = startNewSeason(l);
        this.tab = 'home';
        this.save();
        this.render();
        if (msgs.length) this.message(msgs.join('\n'));
        return;
      }
      case 'isPlay':
        this.playInterseason();
        return;
      case 'isSim': {
        const msgs = simulateInterseason(l, true);
        this.save();
        this.render();
        if (msgs.length) this.message(msgs.join('\n'));
        return;
      }
      case 'kitpart':
      case 'kitcolor':
        this.kitPart = applyKitAction(userTeam(l).uniform, this.kitPart, a);
        if (k === 'kitcolor') this.save();
        break;
      case 'tpos':
        this.transferPos = v as Position | 'ALL';
        break;
      case 'buy': {
        const r = buyPlayer(l, v);
        if (r.ok) this.save();
        this.render();
        this.message(r.ok ? r.message : r.reason);
        return;
      }
      case 'sell': {
        const offer = saleOffer(l, v);
        if (!offer) return;
        const p = userTeam(l).roster.find((x) => x.id === v)!;
        void showConfirm(`${offer.buyer} propose ${money(offer.fee)} pour ${fullName(p)} (GÉN ${overall(p)}). Accepter ?`, 'Vendre', 'Refuser').then((ok) => {
          if (!ok) return;
          const r = sellPlayer(l, v);
          this.selectedPlayer = null;
          this.save();
          this.render();
          this.message(r.ok ? r.message : r.reason);
        });
        return;
      }
      case 'job':
        l.userTeamId = v;
        if (l.coach) {
          l.coach.fired = false;
          l.coach.security = 60;
        }
        l.news.unshift(`Vous êtes le nouveau coach de ${teamById(l, v).name}.`);
        this.save();
        break;
      case 'pos':
        this.rosterPos = v as Position | 'ALL';
        break;
      case 'player':
        this.selectedPlayer = v;
        this.tab = 'roster';
        break;
      case 'unselect':
        this.selectedPlayer = null;
        break;
      case 'depthUp':
      case 'depthDown': {
        const team = userTeam(l);
        const p = team.roster.find((x) => x.id === v)!;
        const d = team.depth[p.position]!;
        const i = d.indexOf(v);
        const j = k === 'depthUp' ? i - 1 : i + 1;
        if (j >= 0 && j < d.length) [d[i], d[j]] = [d[j], d[i]];
        break;
      }
      case 'release': {
        const r = releasePlayer(l, l.userTeamId, v);
        this.selectedPlayer = null;
        this.render();
        this.message(r.ok ? r.message : r.reason);
        return;
      }
      case 'extend': {
        const p = userTeam(l).roster.find((x) => x.id === v)!;
        const offer = Math.round(p.contract.salary * 1.15);
        const r = extendContract(l, l.userTeamId, v, offer, 3);
        this.render();
        this.message(r.ok ? r.message : `${r.reason} (offre ${money(offer)})`);
        return;
      }
      case 'sign': {
        const p = l.freeAgents.find((x) => x.id === v)!;
        const r = signFreeAgent(l, l.userTeamId, v, p.contract.salary, p.contract.years);
        this.render();
        this.message(r.ok ? r.message : r.reason);
        return;
      }
      case 'upgrade': {
        const r = upgradeFacility(l, l.userTeamId, v as 'training' | 'medical' | 'stadium');
        this.render();
        this.message(r.ok ? r.message : r.reason);
        return;
      }
      case 'ticket': {
        const f = l.finances[l.userTeamId];
        f.ticketPrice = Math.max(20, Math.min(250, f.ticketPrice + Number(v)));
        break;
      }
      case 'tradeTeam':
        this.tradeTeam = v;
        this.tradeGet.clear();
        break;
      case 'give':
        if (this.tradeGive.has(v)) this.tradeGive.delete(v);
        else this.tradeGive.add(v);
        break;
      case 'get':
        if (this.tradeGet.has(v)) this.tradeGet.delete(v);
        else this.tradeGet.add(v);
        break;
      case 'tradeDo': {
        const r = executeTrade(l, l.userTeamId, this.tradeTeam!, [...this.tradeGive], [...this.tradeGet]);
        this.tradeGive.clear();
        this.tradeGet.clear();
        this.save();
        this.render();
        this.message(r.ok ? r.message : r.reason);
        return;
      }
    }
    void target;
    this.render();
  }

  private bindPlanSliders(): void {
    this.el.querySelectorAll('input[data-plan]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const key = (inp as HTMLInputElement).dataset.plan as 'passRatio' | 'aggression' | 'deepShots';
        this.l.plans[this.l.userTeamId][key] = Number((inp as HTMLInputElement).value);
        this.save();
      });
    });
  }

  private playInterseason(): void {
    const l = this.l;
    const g = interseasonUserGame(l);
    if (!g) return;
    const home = interseasonTeam(l, g.home);
    const away = interseasonTeam(l, g.away);
    const app = this.app;
    const slot = this.slot;
    const isSide: Side = g.home === l.userTeamId ? 0 : 1;
    const back = () => app.go(new LeagueHub(app, l, slot));
    app.go(new PreMatchScreen(app, {
      home, away, userSide: isSide, context: 'league', quarterMinutes: l.quarterMinutes,
      plans: [l.plans[home.id] ?? l.plans[l.userTeamId], l.plans[away.id] ?? l.plans[l.userTeamId]], playoff: true,
      title: `${l.interseason!.name} · ${g.label}`,
      onExit: (mc: MatchController | null, completed: boolean) => {
        const hub = new LeagueHub(app, l, slot);
        const msgs: string[] = [];
        if (completed && mc && mc.state.finished) msgs.push(...recordInterseason(l, g.id, mc.state));
        msgs.push(...simulateInterseason(l, !completed));
        hub.saveNow();
        app.go(hub);
        if (msgs.length) hub.showMessage(msgs.join('\n'));
      },
    }, {
      competition: `${l.interseason!.name} · ${g.label}`,
      opponentPlan: l.plans[isSide === 0 ? away.id : home.id],
      onSimulate: () => {
        const hub = new LeagueHub(app, l, slot);
        const msgs = simulateInterseason(l, true);
        hub.saveNow();
        app.go(hub);
        if (msgs.length) hub.showMessage(msgs.join('\n'));
      },
      onBack: back,
    }));
  }

  showMessage(text: string): void {
    this.message(text);
  }

  private playUserGame(): void {
    const l = this.l;
    const g = userGame(l);
    if (!g) return;
    const home = teamById(l, g.home);
    const away = teamById(l, g.away);
    const userSide: Side = g.home === l.userTeamId ? 0 : 1;
    const app = this.app;
    const slot = this.slot;
    const back = () => app.go(new LeagueHub(app, l, slot));
    app.go(new PreMatchScreen(app, {
      home, away, userSide, context: 'league', quarterMinutes: l.quarterMinutes,
      plans: [l.plans[home.id], l.plans[away.id]],
      playoff: l.phase === 'playoffs',
      title: 'label' in g ? g.label : `Semaine ${l.week}`,
      onExit: (mc: MatchController | null, completed: boolean) => {
        const hub = new LeagueHub(app, l, slot);
        if (completed && mc && mc.state.finished) {
          recordResult(l, g, mc.state, true);
          simulateWeek(l, false);
          hub.finishWeek([]);
        } else {
          // match abandonné : défaite par forfait simulée
          simulateWeek(l, true);
          hub.finishWeek(['Match abandonné : le résultat a été simulé.']);
        }
        app.go(hub);
      },
    }, {
      competition: `${l.cup ? l.cup.name : MODE_TITLES[l.mode]} · ${'label' in g ? g.label : `Semaine ${l.week}`}`,
      schedule: l.schedule,
      opponentPlan: l.plans[userSide === 0 ? away.id : home.id],
      onSimulate: () => {
        const hub = new LeagueHub(app, l, slot);
        app.go(hub);
        simulateWeek(l, true);
        hub.finishWeek([]);
      },
      onBack: back,
    }));
  }

  /** Fin de semaine : progression de carrière, passage à la semaine suivante, sauvegarde automatique. */
  finishWeek(msgs: string[]): void {
    const l = this.l;
    const g = l.phase === 'regular' ? (l.schedule[l.week - 1] ?? []).find((x) => x.home === l.userTeamId || x.away === l.userTeamId) : l.playoffs.filter((x) => x.home === l.userTeamId || x.away === l.userTeamId).slice(-1)[0];
    if (g?.score) {
      const mine = g.home === l.userTeamId ? 0 : 1;
      const res = g.score[mine] > g.score[1 - mine] ? 'Victoire' : g.score[mine] < g.score[1 - mine] ? 'Défaite' : 'Match nul';
      msgs.unshift(`${res} ${g.score[0]}-${g.score[1]} (${teamById(l, g.home).abbr} – ${teamById(l, g.away).abbr})`);
    }
    if (weekComplete(l)) advanceWeek(l);
    this.save();
    this.render();
    if (msgs.length) this.message(msgs.join('\n'));
  }
}

export { MODE_TITLES };
