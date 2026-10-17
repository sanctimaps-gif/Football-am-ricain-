import { audio } from '../../audio/AudioEngine';
import { LESSONS, lessonAvailable, playName } from '../../coach/academy';
import { coachNameFor, scoutOpponent, unitRatings, type ScoutReport } from '../../coach/scouting';
import type { GamePlan } from '../../ai/playcaller';
import { overall } from '../../data/ratings';
import { displayName } from '../../data/world';
import type { ScheduledGame } from '../../league/schedule';
import type { App, Screen } from '../App';
import { assistantBubble, portraitImg } from '../coachUi';
import { el, esc, onAction } from '../dom';
import { logoSvg } from '../logo';
import { launchMatch, type MatchConfig } from './MatchScreen';

export interface PreMatchOptions {
  /** Libellé de la compétition (« Championnat — semaine 4 »…). */
  competition: string;
  /** Calendrier (forme récente de l'adversaire). */
  schedule?: ScheduledGame[][];
  /** Plan de jeu de l'adversaire (tendances). */
  opponentPlan?: GamePlan;
  /** Résultat simulé sans regarder le match (« Jeu rapide »). */
  onSimulate?: () => void;
  onBack: () => void;
}

/**
 * Avant-match façon « aperçu du match suivant » : rapport de l'entraîneur adjoint sur l'adversaire
 * (forme, style, joueurs clés, forces/faiblesses, conseils tactiques), comparaison des unités, compositions.
 */
export class PreMatchScreen implements Screen {
  readonly el: HTMLElement;
  private report: ScoutReport;
  private tab: 'report' | 'lineups' = 'report';

  constructor(private app: App, private cfg: MatchConfig, private o: PreMatchOptions) {
    const side = cfg.userSide ?? 0;
    const user = side === 0 ? cfg.home : cfg.away;
    const opp = side === 0 ? cfg.away : cfg.home;
    this.report = scoutOpponent({ opponent: opp, user, plan: o.opponentPlan, schedule: o.schedule, unlocked: app.profile.unlockedPlays });
    this.el = el('div', 'screen prematch');
    onAction(this.el, (a) => this.action(a));
    this.render();
  }

  private render(): void {
    const { home, away } = this.cfg;
    const side = this.cfg.userSide ?? 0;
    const user = side === 0 ? home : away;
    const opp = side === 0 ? away : home;
    const r = this.report;
    const head = `<div class="pm-head">
        <div class="pm-team">${logoSvg(home.logo, home.colors, 54)}<div>${esc(displayName(home))}</div></div>
        <div class="pm-mid"><div class="pm-comp">${esc(this.o.competition)}</div><div class="pm-vs">VS</div><div class="muted small">🏟️ ${esc(home.stadium.name)}</div></div>
        <div class="pm-team">${logoSvg(away.logo, away.colors, 54)}<div>${esc(displayName(away))}</div></div>
      </div>`;
    let body = '';
    if (this.tab === 'report') {
      const formChips = r.form.length ? r.form.map((f) => `<span class="form ${f}">${f}</span>`).join('') : '<span class="muted">pas encore de match joué</span>';
      const mine = unitRatings(user);
      const bars = r.units.map((u, i) => {
        const m = mine[i].value;
        return `<div class="ucmp"><span class="v ${m >= u.value ? 'win' : ''}">${m}</span><div class="ub"><i style="width:${m}%;background:${user.colors.primary}"></i></div><span class="lbl">${esc(u.label)}</span><div class="ub rev"><i style="width:${u.value}%;background:${opp.colors.primary}"></i></div><span class="v ${u.value > m ? 'win' : ''}">${u.value}</span></div>`;
      }).join('');
      const advice = r.advice.map((a) => {
        const lesson = LESSONS.find((l) => l.id === a.play);
        return `<li>${esc(a.text)} <b>→ ${esc(playName(a.play))}</b> ${a.unlocked ? '<span class="tag ok">apprise</span>' : lesson ? `<button class="chip" data-action="learn:${a.play}">🔒 Apprendre</button>` : ''}</li>`;
      }).join('');
      body = `<div class="pm-grid">
        <div class="panel scroll">
          <h3>Aperçu du match suivant</h3>
          <p><b>${esc(r.coachName)}</b> mène ${esc(displayName(opp))}. Forme récente : ${formChips}</p>
          <ul class="pm-list">${r.style.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
          <h4>Joueurs clés</h4>
          <div class="pm-keys">${r.keyPlayers.map((k) => `<div class="pm-key"><span class="ovr">${k.ovr}</span><span>${k.player.position}</span><b>${esc(k.player.firstName.charAt(0))}. ${esc(k.player.lastName.toUpperCase())}</b></div>`).join('')}</div>
          <div class="row" style="gap:16px;flex-wrap:wrap"><div><h4>Forces</h4><div class="muted">${r.strengths.map(esc).join(' · ')}</div></div><div><h4>Faiblesses</h4><div class="muted">${r.weaknesses.map(esc).join(' · ')}</div></div></div>
        </div>
        <div class="panel scroll">
          ${assistantBubble(this.app, r.verdict)}
          <h4>Conseils tactiques</h4><ul class="pm-list">${advice}</ul>
          <h4>Comparaison</h4><div class="ucmps"><div class="ucmp head"><span class="v">${esc(user.abbr)}</span><span></span><span class="lbl"></span><span></span><span class="v">${esc(opp.abbr)}</span></div>${bars}</div>
        </div>
      </div>`;
    } else {
      const col = (tm: typeof home) => {
        const starters = (pos: string, n: number) => (tm.depth[pos as keyof typeof tm.depth] ?? []).map((id) => tm.roster.find((p) => p.id === id)).filter((p) => !!p && p.injuryWeeks <= 0).slice(0, n);
        const rows = ([['QB', 1], ['RB', 1], ['WR', 3], ['TE', 1], ['OT', 2], ['DE', 2], ['DT', 2], ['LB', 3], ['CB', 2], ['FS', 1], ['SS', 1], ['K', 1]] as const)
          .flatMap(([pos, n]) => starters(pos, n)).map((p) => `<div class="lu"><span class="pos">${p!.position}</span><span class="nm">${esc(p!.lastName.toUpperCase())}</span><span class="ovr">${overall(p!)}</span></div>`).join('');
        const coach = tm === user ? `${portraitImg(this.app.profile.coach.portrait, 34)} ${esc(this.app.profile.coach.name)}` : `🧑‍💼 ${esc(coachNameFor(tm))}`;
        return `<div class="panel scroll"><h3 style="color:${tm.colors.secondary}">${esc(displayName(tm))}</h3><div class="row" style="gap:6px;align-items:center;margin-bottom:6px">${coach}</div><div class="lineup">${rows}</div></div>`;
      };
      body = `<div class="pm-grid">${col(home)}${col(away)}</div>`;
    }
    this.el.innerHTML = `
      <div class="topbar"><button class="btn ghost" data-action="back">‹ Retour</button>
        <div class="row" style="gap:6px"><button class="chip ${this.tab === 'report' ? 'on' : ''}" data-action="tab:report">📝 Rapport adverse</button><button class="chip ${this.tab === 'lineups' ? 'on' : ''}" data-action="tab:lineups">👥 Compositions</button></div>
        <div class="row" style="margin-left:auto;gap:8px">${this.o.onSimulate ? '<button class="btn" data-action="sim">⏩ Jeu rapide</button>' : ''}<button class="btn primary" data-action="play">📺 Jouer le match</button></div></div>
      ${head}${body}`;
  }

  private action(a: string): void {
    audio.ui();
    if (a === 'back') return this.o.onBack();
    if (a.startsWith('tab:')) {
      this.tab = a.slice(4) as 'report' | 'lineups';
      this.render();
    } else if (a === 'play') {
      audio.ui('confirm');
      launchMatch(this.app, { ...this.cfg, report: this.report });
    } else if (a === 'sim') this.o.onSimulate?.();
    else if (a.startsWith('learn:')) {
      const id = a.slice(6);
      void import('./AcademyScreen').then(({ AcademyScreen, LessonScreen }) => {
        const l = LESSONS.find((x) => x.id === id);
        const back = () => this.app.go(new PreMatchScreen(this.app, this.cfg, this.o));
        if (l && lessonAvailable(l, this.app.profile.unlockedPlays)) this.app.go(new LessonScreen(this.app, l, back));
        else this.app.go(new AcademyScreen(this.app, l?.side ?? 'off', back));
      });
    }
  }
}
