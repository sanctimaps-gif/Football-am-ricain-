import { audio } from '../../audio/AudioEngine';
import { DEFENSIVE_PLAYS, OFFENSIVE_PLAYS } from '../../data/playbook';
import { fullName, type Attributes } from '../../data/types';
import { t } from '../../i18n';
import type { MatchController } from '../../match/MatchController';
import type { GameState } from '../../rules/types';
import {
  ALL_SLOTS, arenaLeaderboard, arenaPoints, arenaReward, arenaScenario, cardById, cardOvr, claimPass, currentEvent, DEF_SLOTS,
  dailyChallenges, effectivePlayer, eligibleFor, evolveCard, grant, isUT, JOURNEY_LENGTH, journeyStage, levelOf, matchReward,
  nextLevelXp, OFF_SLOTS, openPack, opponentTeam, PACKS, PASS_LEVELS, passLevel, passReward, playbookBudget, playbookCost, playCost,
  RARITY_COLOR, RARITY_LABEL, recordArena, recordVs, refreshDaily, rewardText, sellCard, sellValue, setLineup, SLOT_POS, ST_SLOTS,
  synergy, teamOvr, tierForOvr, togglePlay, TRAITS, traitCost, upgradeTrait, utTeam, vsScenario, weekOf, createUT,
  type Card, type Reward, type Scenario, type Slot, type UTState,
} from '../../ut/ultimate';
import type { App, Screen } from '../App';
import { showConfirm, showMessage } from '../dialog';
import { el, esc, onAction } from '../dom';
import { applyKitAction, KIT_PALETTE, kitEditorHtml, type KitPart } from '../KitDesigner';
import { logoSvg } from '../logo';
import { MainMenu } from '../screens/MainMenu';
import { MatchScreen } from '../screens/MatchScreen';

type Tab = 'home' | 'team' | 'cards' | 'playbook' | 'store' | 'base' | 'journeys' | 'arena' | 'vs' | 'pass' | 'events' | 'kit';
const TABS: [Tab, string][] = [
  ['home', 'Accueil'], ['team', 'Mon équipe'], ['cards', 'Cartes'], ['playbook', 'Playbook'], ['store', 'Boutique'], ['base', 'Défis du jour'],
  ['journeys', 'Journeys'], ['arena', 'Arena'], ['vs', 'VS'], ['pass', 'Field Pass'], ['events', 'Événements'], ['kit', 'Identité'],
];

/** Mini-carte de joueur (rareté, note, postes, nom). */
export function cardHtml(c: Card, action = '', pos = c.positions[0], extra = ''): string {
  const o = cardOvr(c, pos);
  const col = RARITY_COLOR[c.rarity];
  return `<button class="ut-card" data-action="${action}" style="--rc:${col}"><span class="ovr">${o}</span><span class="pos">${c.positions.join('/')}</span><span class="nm">${esc(c.player.lastName)}</span><span class="rr">${RARITY_LABEL[c.rarity]}${c.evo ? ` · EVO ${c.evo}` : ''}</span>${extra}</button>`;
}

/** Ultimate Team : tableau de bord hors ligne. */
export class UTHub implements Screen {
  readonly el: HTMLElement;
  private tab: Tab = 'home';
  private slot: Slot | null = null;
  private card: string | null = null;
  private fodder: string[] = [];
  private kitPart: KitPart = 'homeJersey';
  private sort: 'ovr' | 'pos' = 'ovr';

  constructor(private app: App, private ut: UTState) {
    this.el = el('div', 'screen');
    onAction(this.el, (a) => this.action(a));
    refreshDaily(ut);
    this.render();
  }

  static open(app: App): void {
    const saved = app.saves.loadUT(isUT);
    if (saved) return app.go(new UTHub(app, saved));
    const ut = createUT('Mon Équipe');
    app.saves.saveUT(ut);
    app.go(new UTHub(app, ut));
    void showMessage('Bienvenue dans Ultimate Team ! Vous recevez un effectif de départ, 5 000 pièces et 300 gemmes. Toutes les récompenses se gagnent en jouant : aucun achat réel.');
  }

  private save(): void {
    this.app.saves.saveUT(this.ut);
  }

  private render(): void {
    const ut = this.ut;
    const lvl = levelOf(ut.xp);
    let body = '';
    switch (this.tab) {
      case 'home': body = this.homeTab(); break;
      case 'team': body = this.teamTab(); break;
      case 'cards': body = this.cardsTab(); break;
      case 'playbook': body = this.playbookTab(); break;
      case 'store': body = this.storeTab(); break;
      case 'base': body = this.baseTab(); break;
      case 'journeys': body = this.journeysTab(); break;
      case 'arena': body = this.arenaTab(); break;
      case 'vs': body = this.vsTab(); break;
      case 'pass': body = this.passTab(); break;
      case 'events': body = this.eventsTab(); break;
      case 'kit': body = this.kitTab(); break;
    }
    this.el.innerHTML = `<div class="topbar"><button class="btn ghost" data-action="menu">‹ Menu</button>${logoSvg({ shape: ut.logo.shape, glyph: ut.logo.glyph, stripes: false }, { primary: ut.colors.primary, secondary: ut.colors.secondary, accent: '#FFFFFF' }, 34)}
        <h1>${esc(ut.name)} <span class="muted" style="font-size:15px">· Ultimate Team · GÉN ${teamOvr(ut)}</span></h1>
        <span class="ut-res">🪙 ${ut.coins} · 💎 ${ut.gems} · 🏋️ ${ut.trainingPoints} · Niv. ${lvl}</span></div>
      <div class="tabs">${TABS.map(([k, label]) => `<button class="chip ${k === this.tab ? 'on' : ''}" data-action="tab:${k}">${label}</button>`).join('')}</div>
      <div class="panel scroll grow">${body}</div>`;
  }

  // ———————————————————— Onglets ————————————————————

  private homeTab(): string {
    const ut = this.ut;
    const lvl = levelOf(ut.xp);
    const ev = currentEvent(ut);
    const daily = dailyChallenges(ut);
    const doneDaily = daily.filter((d) => ut.daily.done.includes(d.id)).length;
    const tile = (tab: Tab, icon: string, title: string, sub: string) => `<button class="tile" data-action="tab:${tab}"><span class="ico">${icon}</span>${title}<small>${esc(sub)}</small></button>`;
    return `<div class="row" style="gap:10px;align-items:stretch;flex-wrap:wrap">
        <div class="panel col" style="flex:1 1 220px"><b>Niveau ${lvl}</b><div class="attr-bar"><i style="width:${Math.min(100, ((ut.xp - nextLevelXp(lvl - 1)) / Math.max(1, nextLevelXp(lvl) - nextLevelXp(lvl - 1))) * 100)}%"></i></div>
          <div class="muted" style="font-size:13px">${ut.xp} XP · budget playbook ${playbookBudget(ut)} · synergie +${synergy(ut)}</div>
          <div style="font-size:14px">Bilan : ${ut.matches.w}V ${ut.matches.l}D ${ut.matches.t}N</div>
          <button class="btn primary" data-action="friendly">▶ Match amical</button></div>
        <div class="panel col" style="flex:1 1 220px;border-color:var(--accent)"><b>${ev.icon} Événement : ${esc(ev.name)}</b><div class="muted" style="font-size:13px">${esc(ev.desc)}</div><div style="font-size:14px">${(ut.events[ev.id] ?? []).length}/3 défis · récompense : ${esc(rewardText(ev.reward))}</div><button class="btn" data-action="tab:events">Voir l’événement</button></div>
      </div>
      <div class="card-grid" style="margin-top:8px">
        ${tile('base', '📆', 'Défis du jour', `${doneDaily}/3 terminés aujourd'hui`)}
        ${tile('journeys', '🗺️', 'Journeys', `Étape ${Math.min(JOURNEY_LENGTH, ut.journey + 1)}/${JOURNEY_LENGTH}`)}
        ${tile('arena', '🏟️', 'Arena', `Meilleur score de la semaine : ${ut.arena.week === weekOf() ? ut.arena.weekBest : 0}`)}
        ${tile('vs', '⚔️', 'VS', `Cote ${ut.vs.rating} · ${ut.vs.wins}V ${ut.vs.losses}D`)}
        ${tile('pass', '🎟️', 'Field Pass', `Niveau ${passLevel(ut)}/${PASS_LEVELS} (gratuit)`)}
        ${tile('store', '🛒', 'Boutique', 'Packs contre pièces ou gemmes gagnées en jouant')}
      </div>`;
  }

  private teamTab(): string {
    const ut = this.ut;
    if (this.slot) {
      const slot = this.slot;
      const pos = SLOT_POS[slot];
      const list = eligibleFor(ut, slot);
      return `<div class="row"><button class="btn ghost" data-action="slot:">‹ Composition</button><b>Emplacement ${slot} (${pos})</b><span class="muted">Touchez une carte pour la titulariser.</span></div>
        <div class="ut-cards">${list.map((c) => cardHtml(c, `assign:${c.id}`, pos, ut.lineup[slot] === c.id ? '<span class="tag">Titulaire</span>' : ALL_SLOTS.some((s) => ut.lineup[s] === c.id) ? '<span class="tag">Ailleurs</span>' : '')).join('') || '<div class="muted">Aucune carte à ce poste : ouvrez des packs !</div>'}</div>`;
    }
    const group = (title: string, slots: Slot[]) => `<div class="opt-label">${title}</div><div class="ut-cards">${slots.map((s) => {
      const c = cardById(ut, ut.lineup[s]);
      return c ? cardHtml(c, `slot:${s}`, SLOT_POS[s], `<span class="tag">${s}</span>`) : `<button class="ut-card empty" data-action="slot:${s}"><span class="pos">${s}</span><span class="nm">Vide</span></button>`;
    }).join('')}</div>`;
    return `<div class="muted" style="font-size:13px">GÉN de l'équipe ${teamOvr(ut)} · synergie +${synergy(ut)} (cartes doubles alignées : +1 lecture du jeu pour tous les titulaires, max +5). Touchez un emplacement pour changer de joueur.</div>
      ${group('Attaque', OFF_SLOTS)}${group('Défense', DEF_SLOTS)}${group('Équipes spéciales', ST_SLOTS)}`;
  }

  private cardsTab(): string {
    const ut = this.ut;
    if (this.card) {
      const c = cardById(ut, this.card);
      if (c) return this.cardDetail(c);
      this.card = null;
    }
    const cards = [...ut.cards].sort((a, b) => (this.sort === 'pos' ? a.positions[0].localeCompare(b.positions[0]) : 0) || cardOvr(b) - cardOvr(a));
    return `<div class="row"><b>${ut.cards.length} cartes</b><button class="chip ${this.sort === 'ovr' ? 'on' : ''}" data-action="sort:ovr">Par note</button><button class="chip ${this.sort === 'pos' ? 'on' : ''}" data-action="sort:pos">Par poste</button><span class="muted" style="font-size:13px">Touchez une carte : traits, évolution, vente.</span></div>
      <div class="ut-cards">${cards.map((c) => cardHtml(c, `card:${c.id}`, c.positions[0], ALL_SLOTS.some((s) => ut.lineup[s] === c.id) ? '<span class="tag">Titulaire</span>' : '')).join('')}</div>`;
  }

  private cardDetail(c: Card): string {
    const ut = this.ut;
    const p = effectivePlayer(c);
    const keys: (keyof Attributes)[] = ['speed', 'acceleration', 'agility', 'strength', 'tackling', 'throwAccuracy', 'throwPower', 'catching', 'blocking', 'awareness', 'kickPower', 'kickAccuracy'];
    const bars = keys.map((k) => `<div style="display:grid;grid-template-columns:110px minmax(50px,1fr) 28px;gap:6px;align-items:center;font-size:13px"><span>${t(`attr.${k}`)}</span><div class="attr-bar"><i style="width:${p.attrs[k]}%"></i></div><b>${p.attrs[k]}</b></div>`).join('');
    const traits = TRAITS.filter((tr) => tr.positions.some((x) => c.positions.includes(x))).map((tr) => {
      const lvl = c.traits.find((x) => x.id === tr.id)?.level ?? 0;
      return `<button class="btn" style="min-height:34px;font-size:13px" data-action="trait:${c.id}:${tr.id}" ${lvl >= 3 ? 'disabled' : ''}>${esc(tr.name)} ${'●'.repeat(lvl)}${'○'.repeat(3 - lvl)}${lvl < 3 ? ` · ${traitCost(lvl)} 🏋️` : ''}</button>`;
    }).join('');
    const fodder = ut.cards.filter((x) => x.id !== c.id && x.positions.includes(c.positions[0]) && !ALL_SLOTS.some((s) => ut.lineup[s] === x.id));
    return `<div class="row" style="flex-wrap:wrap"><button class="btn ghost" data-action="card:">‹ Cartes</button><button class="btn danger" data-action="sell:${c.id}">Vendre (${sellValue(c)} 🪙)</button></div>
      <div class="row" style="align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div class="col" style="gap:4px;flex:0 0 auto">${cardHtml(c, '', c.positions[0])}<b>${esc(fullName(p))}</b><span class="muted" style="font-size:13px">${c.positions.join(' / ')}${c.positions.length > 1 ? ' (carte double)' : ''} · ${p.age} ans · ${esc(c.program)}</span></div>
        <div class="col grow" style="gap:3px;min-width:220px">${bars}</div>
        <div class="col grow" style="min-width:220px;gap:4px"><b>Traits (${c.traits.length}/3)</b><div class="row" style="flex-wrap:wrap;gap:4px">${traits}</div>
          <b style="margin-top:6px">Évolution (EVO ${c.evo}/3)</b><div class="muted" style="font-size:13px">Sacrifiez 2 cartes au poste ${c.positions[0]} (${5 + c.evo * 5} 🏋️) : +1 aux attributs principaux à chaque niveau.</div>
          <div class="ut-cards">${fodder.slice(0, 12).map((x) => cardHtml(x, `fodder:${x.id}`, x.positions[0], this.fodder.includes(x.id) ? '<span class="tag">✓</span>' : '')).join('') || '<div class="muted">Aucune carte disponible.</div>'}</div>
          <button class="btn primary" data-action="evolve:${c.id}" ${this.fodder.length === 2 && c.evo < 3 ? '' : 'disabled'}>Faire évoluer</button></div></div>`;
  }

  private playbookTab(): string {
    const ut = this.ut;
    const cost = playbookCost(ut);
    const budget = playbookBudget(ut);
    const row = (id: string, name: string, desc: string, def: boolean) => {
      const on = (def ? ut.playbook.def : ut.playbook.off).includes(id);
      return `<div class="list-item" data-action="play:${def ? 'd' : 'o'}:${id}" style="${on ? 'background:rgba(255,204,26,.16)' : ''}"><span class="chip ${on ? 'on' : ''}" style="min-height:28px">${on ? '✓' : '+'}</span><b class="grow">${esc(name)}</b><span class="muted" style="font-size:13px">${esc(desc)}</span><span style="width:46px;text-align:right">${playCost(id)} pts</span></div>`;
    };
    return `<div class="row"><b>Budget : ${cost}/${budget}</b><div class="attr-bar grow"><i style="width:${Math.min(100, (cost / budget) * 100)}%"></i></div></div>
      <div class="muted" style="font-size:13px">Chaque action a un coût ; le budget augmente avec votre niveau. Seules les actions choisies sont proposées pendant vos matchs Ultimate Team (punt, field goal et genou à terre sont toujours disponibles).</div>
      <div class="row" style="align-items:flex-start;gap:10px;flex-wrap:wrap"><div class="col grow" style="min-width:260px"><div class="opt-label">Attaque</div>${OFFENSIVE_PLAYS.filter((p) => p.category !== 'special').map((p) => row(p.id, p.name, p.category === 'run' ? 'Course' : 'Passe', false)).join('')}</div>
      <div class="col grow" style="min-width:260px"><div class="opt-label">Défense</div>${DEFENSIVE_PLAYS.map((p) => row(p.id, p.name, p.tags.slice(0, 2).join(' · '), true)).join('')}</div></div>`;
  }

  private storeTab(): string {
    const ut = this.ut;
    return `<div class="muted" style="font-size:13px">Les packs s'achètent uniquement avec les pièces et les gemmes gagnées en jouant. Les notes sont tirées uniformément dans la plage indiquée (probabilités affichées).</div>
      <div class="card-grid">${PACKS.map((p) => {
        const afford = (p.cost.coins ?? 0) <= ut.coins && (p.cost.gems ?? 0) <= ut.gems;
        return `<button class="tile" data-action="buy:${p.id}" ${afford ? '' : 'disabled'} style="${afford ? '' : 'opacity:.55'}"><span class="ico">🎁</span>${esc(p.name)}<small>${esc(p.desc)}</small><small style="color:var(--accent);font-size:15px">${p.cost.coins ? `${p.cost.coins} 🪙` : `${p.cost.gems} 💎`}</small></button>`;
      }).join('')}</div>`;
  }

  private scenarioRow(s: Scenario, action: string, done: boolean, locked = false): string {
    return `<div class="list-item"><span class="grow"><b>${esc(s.title)}</b><br><span class="muted" style="font-size:13px">${esc(s.desc)} · Récompense : ${esc(rewardText(s.reward))}</span></span>${done ? '<span class="chip on">✓ Réussi</span>' : locked ? '<span class="chip">🔒</span>' : `<button class="btn primary" data-action="${action}">▶ Jouer</button>`}</div>`;
  }

  private baseTab(): string {
    const ut = this.ut;
    refreshDaily(ut);
    return `<div class="muted" style="font-size:13px">Madden Base : 3 défis renouvelés chaque jour, de plus en plus difficiles et de mieux en mieux récompensés.</div>
      ${dailyChallenges(ut).map((s, i) => this.scenarioRow(s, `daily:${i}`, ut.daily.done.includes(s.id))).join('')}`;
  }

  private journeysTab(): string {
    const ut = this.ut;
    const nodes = Array.from({ length: JOURNEY_LENGTH }, (_, i) => {
      const n = i + 1;
      const state = n <= ut.journey ? 'done' : n === ut.journey + 1 ? 'cur' : 'lock';
      return `<span class="jnode ${state}" title="Étape ${n}">${n % 10 === 0 ? '🏆' : n % 5 === 0 ? '⭐' : n}</span>`;
    }).join('<i class="jlink"></i>');
    const next = ut.journey < JOURNEY_LENGTH ? journeyStage(ut.journey + 1) : null;
    return `<div class="jmap">${nodes}</div>
      ${next ? this.scenarioRow(next, 'journey', false) : '<div class="panel">🏆 Parcours terminé ! Toutes les étapes sont validées.</div>'}
      <div class="muted" style="font-size:13px">Chaque étape réussie débloque la suivante. Étapes ⭐ : gemmes ; étapes 🏆 : packs, et une carte Légende à l'étape 30.</div>`;
  }

  private arenaTab(): string {
    const ut = this.ut;
    const board = arenaLeaderboard(ut);
    return `<div class="row" style="align-items:flex-start;gap:12px;flex-wrap:wrap"><div class="col grow" style="min-width:240px">
        <b>Arena — drive chronométré</b><div class="muted" style="font-size:13px">Un seul drive depuis vos 25 yards, 2:30 au chrono : points marqués × 10, + bonus de temps restant si touchdown. Classement de la semaine contre des rivaux IA (hors ligne).</div>
        <div>Meilleur score : ${ut.arena.best} · Tentatives : ${ut.arena.attempts}</div><button class="btn primary" data-action="arena">▶ Lancer un drive</button>
        <div class="muted" style="font-size:13px">Récompenses : 30+ pts = 20 💎, 70+ = 40 💎, 100+ = 60 💎.</div></div>
      <div class="col grow" style="min-width:220px"><b>Classement de la semaine</b>${board.map((r, i) => `<div class="list-item" style="${r.me ? 'background:rgba(255,204,26,.16)' : ''}"><b style="width:26px">${i + 1}</b><span class="grow">${esc(r.name)}</span><b>${r.pts}</b></div>`).join('')}</div></div>`;
  }

  private vsTab(): string {
    const ut = this.ut;
    const s = vsScenario(ut);
    return `<div class="panel col"><b>⚔️ VS — match éclair contre un rival IA</b><div class="muted" style="font-size:13px">${esc(s.desc)} Victoire : +25 de cote ; défaite : −15. (Les duels en ligne en temps réel ne sont pas disponibles : le jeu fonctionne sans serveur.)</div>
      <div>Cote ${ut.vs.rating} · ${ut.vs.wins} victoires · ${ut.vs.losses} défaites</div><div>Récompense de victoire : ${esc(rewardText(s.reward))}</div><button class="btn primary" data-action="vs">▶ Défier un rival</button></div>`;
  }

  private passTab(): string {
    const ut = this.ut;
    const lvl = passLevel(ut);
    return `<div class="muted" style="font-size:13px">Field Pass gratuit : chaque tranche de 300 XP débloque un niveau. Récupérez les récompenses quand vous voulez.</div>
      <div class="ut-pass">${Array.from({ length: PASS_LEVELS }, (_, i) => {
        const n = i + 1;
        const claimed = ut.pass.claimed.includes(n);
        const r: Reward = passReward(n);
        return `<div class="pass-cell ${n <= lvl ? 'open' : ''}"><b>${n}</b><span>${esc(rewardText(r))}</span>${claimed ? '<span class="chip on" style="min-height:26px">✓</span>' : n <= lvl ? `<button class="btn primary" style="min-height:30px" data-action="claim:${n}">Prendre</button>` : '<span class="muted">🔒</span>'}</div>`;
      }).join('')}</div>`;
  }

  private eventsTab(): string {
    const ut = this.ut;
    const ev = currentEvent(ut);
    const done = ut.events[ev.id] ?? [];
    return `<div class="panel"><b>${ev.icon} ${esc(ev.name)}</b> <span class="muted" style="font-size:13px">(événement du mois, renouvelé chaque mois)</span><div class="muted" style="font-size:13px">${esc(ev.desc)} Terminez les 3 défis pour gagner : ${esc(rewardText(ev.reward))}.</div></div>
      ${ev.challenges.map((s, i) => this.scenarioRow(s, `event:${i}`, done.includes(s.id))).join('')}`;
  }

  private kitTab(): string {
    const ut = this.ut;
    const pal = (k: 'primary' | 'secondary') => KIT_PALETTE.map((c) => `<button data-action="color:${k}:${c}" aria-label="${c}" style="width:26px;height:26px;border-radius:7px;background:${c};border:${ut.colors[k] === c ? '3px solid #ffcc1a' : '1px solid #555'}"></button>`).join('');
    return `<div class="row" style="flex-wrap:wrap"><input type="text" data-field="name" value="${esc(ut.name)}" maxlength="18" placeholder="Nom de l'équipe"><input type="text" data-field="abbr" value="${esc(ut.abbr)}" maxlength="3" style="width:80px"><input type="text" data-field="glyph" value="${esc(ut.logo.glyph)}" maxlength="2" style="width:70px">${(['shield', 'circle', 'diamond', 'hexagon', 'star', 'square'] as const).map((x) => `<button class="chip ${x === ut.logo.shape ? 'on' : ''}" data-action="shape:${x}">${x}</button>`).join('')}</div>
      <div class="opt-label">Couleurs du club</div><div class="row" style="flex-wrap:wrap;gap:3px">${pal('primary')}</div><div class="row" style="flex-wrap:wrap;gap:3px;margin-top:4px">${pal('secondary')}</div>
      <div class="opt-label">Maillot</div>${kitEditorHtml(ut.uniform, this.kitPart)}
      <div class="row" style="margin-top:10px"><button class="btn danger" data-action="reset">Recommencer Ultimate Team</button></div>`;
  }

  // ———————————————————— Actions ————————————————————

  private action(a: string): void {
    const ut = this.ut;
    audio.ui();
    const parts = a.split(':');
    const [k, v] = parts;
    switch (k) {
      case 'menu':
        this.save();
        return this.app.go(new MainMenu(this.app));
      case 'tab':
        this.tab = v as Tab;
        this.slot = null;
        this.card = null;
        this.fodder = [];
        break;
      case 'slot':
        this.slot = (v || null) as Slot | null;
        break;
      case 'assign':
        if (this.slot) setLineup(ut, this.slot, v);
        this.slot = null;
        this.save();
        break;
      case 'card':
        this.card = v || null;
        this.fodder = [];
        break;
      case 'sort':
        this.sort = v as 'ovr' | 'pos';
        break;
      case 'sell': {
        void showConfirm(`Vendre cette carte pour ${sellValue(cardById(ut, v)!)} pièces ?`, 'Vendre', 'Annuler').then((ok) => {
          if (!ok) return;
          const msg = sellCard(ut, v);
          if (!cardById(ut, v)) this.card = null;
          this.save();
          this.render();
          void showMessage(msg);
        });
        return;
      }
      case 'trait': {
        const msg = upgradeTrait(ut, v, parts[2]);
        this.save();
        this.render();
        void showMessage(msg);
        return;
      }
      case 'fodder':
        if (this.fodder.includes(v)) this.fodder = this.fodder.filter((x) => x !== v);
        else if (this.fodder.length < 2) this.fodder.push(v);
        break;
      case 'evolve': {
        const msg = evolveCard(ut, v, this.fodder);
        this.fodder = [];
        this.save();
        this.render();
        void showMessage(msg);
        return;
      }
      case 'play': {
        const err = togglePlay(ut, parts[2], v === 'd');
        this.save();
        this.render();
        if (err) void showMessage(err);
        return;
      }
      case 'buy': {
        const res = openPack(ut, v);
        this.save();
        this.render();
        void showMessage(typeof res === 'string' ? res : `🎁 Nouvelles cartes :\n${res.map((c) => `${RARITY_LABEL[c.rarity]} · ${c.positions.join('/')} ${cardOvr(c)} · ${fullName(c.player)}`).join('\n')}`);
        return;
      }
      case 'claim': {
        const res = claimPass(ut, Number(v));
        this.save();
        this.render();
        void showMessage(typeof res === 'string' ? res : res.join('\n'));
        return;
      }
      case 'friendly':
        return this.startMatch({ id: 'friendly', title: 'Match amical', desc: '', tier: tierForOvr(teamOvr(ut)), quarter: 1, clock: 0, score: [0, 0], possession: 'user', ballOn: 25, timeouts: [3, 3], reward: {}, goal: 'win' }, 'friendly');
      case 'daily':
        return this.startMatch(dailyChallenges(ut)[Number(v)], 'daily');
      case 'journey':
        return this.startMatch(journeyStage(ut.journey + 1), 'journey');
      case 'arena':
        return this.startMatch(arenaScenario(ut), 'arena');
      case 'vs':
        return this.startMatch(vsScenario(ut), 'vs');
      case 'event':
        return this.startMatch(currentEvent(ut).challenges[Number(v)], 'event');
      case 'color':
        ut.colors[v as 'primary' | 'secondary'] = parts[2];
        this.save();
        break;
      case 'shape':
        ut.logo.shape = v as UTState['logo']['shape'];
        this.save();
        break;
      case 'kitpart':
      case 'kitcolor':
        this.kitPart = applyKitAction(ut.uniform, this.kitPart, a);
        this.save();
        break;
      case 'reset':
        void showConfirm('Effacer toute votre progression Ultimate Team ?', 'Effacer', 'Annuler').then((ok) => {
          if (!ok) return;
          this.app.saves.deleteUT();
          UTHub.open(this.app);
        });
        return;
    }
    this.render();
    this.bindInputs();
  }

  private bindInputs(): void {
    this.el.querySelectorAll('input[data-field]').forEach((inp) => inp.addEventListener('change', () => {
      const f = (inp as HTMLInputElement).dataset.field!;
      const val = (inp as HTMLInputElement).value.trim();
      if (f === 'name' && val) this.ut.name = val.slice(0, 18);
      if (f === 'abbr' && val.length >= 2) this.ut.abbr = val.toUpperCase().slice(0, 3);
      if (f === 'glyph' && val) this.ut.logo.glyph = val.slice(0, 2);
      this.save();
      this.render();
      this.bindInputs();
    }));
  }

  /** Lance un match Ultimate Team (amical, défi, étape, Arena, VS, événement). */
  private startMatch(s: Scenario, kind: 'friendly' | 'daily' | 'journey' | 'arena' | 'vs' | 'event'): void {
    const ut = this.ut;
    const app = this.app;
    const home = utTeam(ut);
    const away = opponentTeam(ut.seed + ut.nextId * 13 + ut.matches.w * 7 + ut.matches.l, s.tier, home.abbr);
    const setup = kind === 'friendly' ? undefined : (st: GameState) => {
      st.quarter = s.quarter;
      st.clock = s.clock;
      st.score = [s.score[0], s.score[1]];
      st.possession = s.possession === 'user' ? 0 : 1;
      st.ballOn = s.ballOn;
      st.down = 1;
      st.toGo = Math.min(10, 100 - s.ballOn);
      st.timeouts = [s.timeouts[0], s.timeouts[1]];
      st.nextKind = 'scrimmage';
      st.clockRunning = false;
      st.needsCoinToss = false;
      st.finished = false;
      if (s.clock <= 120 && s.quarter === 4) st.twoMinuteWarned = [false, true];
    };
    const endCheck = s.goal === 'drive' ? (st: GameState) => st.possession !== 0 || st.nextKind === 'kickoff' : undefined;
    app.go(new MatchScreen(app, {
      home, away, userSide: 0, context: 'challenge', quarterMinutes: kind === 'friendly' ? undefined : 15,
      title: `Ultimate Team · ${s.title}`, playbook: { off: [...ut.playbook.off], def: [...ut.playbook.def] }, setup, endCheck,
      onExit: (mc: MatchController | null, completed: boolean) => {
        const hub = new UTHub(app, ut);
        app.go(hub);
        if (!completed || !mc) return;
        const st = mc.state;
        const won = st.winner === 0;
        const tied = st.winner === null;
        const msgs: string[] = [];
        if (kind === 'arena') {
          const pts = arenaPoints(st.score[0], st.clock);
          recordArena(ut, pts);
          msgs.push(`🏟️ Arena : ${pts} points.`, ...grant(ut, arenaReward(pts)));
        } else {
          if (won) ut.matches.w++;
          else if (tied) ut.matches.t++;
          else ut.matches.l++;
          msgs.push(won ? '🏆 Victoire !' : tied ? 'Match nul.' : 'Défaite.');
          msgs.push(...grant(ut, matchReward(won, tied, st.score[0])));
          if (won && kind !== 'friendly') {
            msgs.push(`🎯 ${s.title} réussi !`, ...grant(ut, s.reward));
            if (kind === 'daily') ut.daily.done.push(s.id);
            if (kind === 'journey') ut.journey++;
            if (kind === 'event') {
              const ev = currentEvent(ut);
              const done = (ut.events[ev.id] ??= []);
              if (!done.includes(s.id)) done.push(s.id);
              if (done.length === 3) msgs.push(`${ev.icon} Événement terminé !`, ...grant(ut, ev.reward));
            }
          }
          if (kind === 'vs') {
            const d = recordVs(ut, won);
            msgs.push(`Cote VS : ${d > 0 ? '+' : ''}${d} → ${ut.vs.rating}`);
          }
        }
        app.saves.saveUT(ut);
        hub.render();
        void showMessage(msgs.join('\n'));
      },
    }));
  }
}
