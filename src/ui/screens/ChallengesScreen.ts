import { audio } from '../../audio/AudioEngine';
import type { Team } from '../../data/types';
import { displayName, groupOfTeam } from '../../data/world';
import { applyChallenge, challengeWon, CHALLENGES, STARS, weeklyChallenge, type Challenge } from '../../match/challenges';
import type { App, Screen } from '../App';
import { showMessage } from '../dialog';
import { el, esc, onAction } from '../dom';
import { logoSvg } from '../logo';
import { MainMenu } from './MainMenu';
import { launchMatch } from './MatchScreen';

const stars = (n: number, max = 3) => '★'.repeat(n) + '☆'.repeat(Math.max(0, max - n));

/** Défis « Moment » et événement de la semaine. */
export class ChallengesScreen implements Screen {
  readonly el: HTMLElement;

  constructor(private app: App) {
    this.el = el('div', 'screen');
    onAction(this.el, (a) => this.action(a));
    this.render();
  }

  private team(id: string, group: string): Team {
    const g = group || groupOfTeam(id);
    const t = this.app.teamsOf(g).find((x) => x.id === id);
    if (!t) throw new Error(`Équipe ${id} introuvable`);
    return t;
  }

  private all(): Challenge[] {
    return [weeklyChallenge(), ...CHALLENGES];
  }

  private render(): void {
    const done = this.app.profile.challenges ?? {};
    const total = CHALLENGES.reduce((s, c) => s + (done[c.id] ?? 0), 0);
    const d = this.app.settings.difficulty;
    const cards = this.all().map((c) => {
      const user = this.team(c.userSide === 0 ? c.home : c.away, c.group);
      const opp = this.team(c.userSide === 0 ? c.away : c.home, c.group);
      const best = done[c.id] ?? 0;
      return `<button class="tile" data-action="play:${c.id}" style="${c.weekly ? 'border-color:var(--accent)' : ''}">
        <span class="ico">${c.icon}</span>${esc(c.title)}
        <span class="row" style="gap:6px;justify-content:center;align-items:center">${logoSvg(user.logo, user.colors, 26)}<b style="font-size:13px">${esc(user.abbr)}</b><span class="muted" style="font-size:13px">vs</span><b style="font-size:13px">${esc(opp.abbr)}</b>${logoSvg(opp.logo, opp.colors, 26)}</span>
        <small>${esc(c.desc)}</small><small style="color:var(--accent);font-size:16px">${stars(best)}</small></button>`;
    }).join('');
    this.el.innerHTML = `<div class="topbar"><button class="btn ghost" data-action="back">‹ Retour</button><h1>Défis & événements</h1><span class="muted" style="white-space:nowrap">${total}/${CHALLENGES.length * 3} ★</span></div>
      <div class="row" style="flex-wrap:wrap;gap:6px"><span class="muted" style="font-size:14px">Gagnez le match à partir de la situation imposée. Étoiles : facile ★, normal ★★, difficile ★★★.</span>${(['easy', 'normal', 'hard'] as const).map((x) => `<button class="chip ${x === d ? 'on' : ''}" data-action="diff:${x}">${x === 'easy' ? 'Facile' : x === 'normal' ? 'Normal' : 'Difficile'}</button>`).join('')}</div>
      <div class="scroll grow"><div class="card-grid">${cards}</div></div>`;
  }

  private action(a: string): void {
    audio.ui();
    const [k, v] = a.split(':');
    if (k === 'back') return this.app.go(new MainMenu(this.app));
    if (k === 'diff') {
      this.app.settings.difficulty = v as 'easy' | 'normal' | 'hard';
      this.app.saveSettings();
    }
    if (k === 'play') {
      const c = this.all().find((x) => x.id === v);
      if (c) return this.start(c);
    }
    this.render();
  }

  private start(c: Challenge): void {
    const app = this.app;
    const difficulty = app.settings.difficulty;
    launchMatch(app, {
      home: this.team(c.home, c.group), away: this.team(c.away, c.group), userSide: c.userSide, context: 'challenge',
      quarterMinutes: 15, difficulty, title: `${c.icon} ${c.title}`,
      setup: (s) => applyChallenge(c, s),
      onExit: (mc, completed) => {
        const screen = new ChallengesScreen(app);
        app.go(screen);
        if (!completed || !mc) return;
        if (challengeWon(c, mc.state)) {
          const earned = STARS[difficulty];
          const prev = app.profile.challenges[c.id] ?? 0;
          if (earned > prev) {
            app.profile.challenges[c.id] = earned;
            app.saveProfile();
          }
          screen.render();
          void showMessage(`🏆 Défi réussi ! ${stars(earned)}${earned > prev ? ' (nouveau record)' : ''}`);
        } else {
          void showMessage(`Défi échoué (${displayName(mc.teams[0])} ${mc.state.score[0]} – ${mc.state.score[1]} ${displayName(mc.teams[1])}). Réessayez !`);
        }
      },
    });
  }
}
