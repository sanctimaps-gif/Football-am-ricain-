import { audio } from '../../audio/AudioEngine';
import { fullName } from '../../data/types';
import { formatClock, t } from '../../i18n';
import type { MatchController } from '../../match/MatchController';
import type { PlayerGameStats, TeamStats } from '../../rules/stats';
import type { App, Screen } from '../App';
import { el, esc, onAction } from '../dom';
import { logoSvg } from '../logo';
import type { MatchConfig } from './MatchScreen';

/** Résultat du match : score final, statistiques d'équipe et individuelles, joueur du match. */
export class ResultScreen implements Screen {
  readonly el: HTMLElement;
  private tab: 'team' | 'players' = 'team';

  constructor(private app: App, private mc: MatchController, private cfg: MatchConfig) {
    this.el = el('div', 'screen');
    this.render();
    if (cfg.context === 'quick') {
      const s = mc.state;
      app.profile.quickMatches.push({ date: Date.now(), home: mc.teams[0].id, away: mc.teams[1].id, score: [s.score[0], s.score[1]], userSide: mc.userSide });
      app.saveProfile();
    }
    audio.startMusic();
  }

  private render(): void {
    const mc = this.mc;
    const s = mc.state;
    const [h, a] = mc.teams;
    let verdict = '';
    if (mc.userSide !== null) verdict = s.winner === null ? t('result.tie') : s.winner === mc.userSide ? t('result.win') : t('result.loss');
    const mvp = mc.playerOfTheGame();
    const ts = s.teamStats;
    const row = (label: string, f: (x: TeamStats) => string) => `<tr><td>${label}</td><td>${f(ts[0])}</td><td>${f(ts[1])}</td></tr>`;
    const teamTable = `<table class="stats"><tr><th></th><th>${esc(h.abbr)}</th><th>${esc(a.abbr)}</th></tr>
      ${row(t('stats.firstDowns'), (x) => String(x.firstDowns))}
      ${row(t('stats.totalYards'), (x) => String(x.totalYards))}
      ${row(t('stats.passing'), (x) => `${x.passComp}/${x.passAtt}`)}
      ${row(t('stats.passYds'), (x) => String(x.passYds))}
      ${row(t('stats.rushing'), (x) => String(x.rushAtt))}
      ${row(t('stats.rushYds'), (x) => String(x.rushYds))}
      ${row(t('stats.tds'), (x) => String(x.passTD + x.rushTD))}
      ${row(t('stats.ints'), (x) => String(x.interceptionsThrown))}
      ${row(t('stats.fumbles'), (x) => String(x.fumblesLost))}
      ${row(t('stats.sacks'), (x) => String(x.sacks))}
      ${row(t('stats.thirdDown'), (x) => `${x.thirdDownConv}/${x.thirdDownAtt}`)}
      ${row(t('stats.fg'), (x) => `${x.fgMade}/${x.fgAtt}`)}
      ${row(t('stats.penalties'), (x) => `${x.penalties} (${x.penaltyYds})`)}
      ${row(t('stats.top'), (x) => formatClock(x.timeOfPossession))}
    </table>`;
    const players: { name: string; team: string; st: PlayerGameStats }[] = [];
    for (const team of mc.teams) for (const p of team.roster) {
      const st = s.playerStats[p.id];
      if (st) players.push({ name: `${p.number} ${fullName(p)} (${p.position})`, team: team.abbr, st });
    }
    const top = (f: (x: PlayerGameStats) => number, fmt: (x: PlayerGameStats) => string, n = 4) =>
      players.filter((p) => f(p.st) > 0).sort((x, y) => f(y.st) - f(x.st)).slice(0, n).map((p) => `<tr><td>${esc(p.team)} · ${esc(p.name)}</td><td>${fmt(p.st)}</td></tr>`).join('') || '<tr><td class="muted">—</td><td></td></tr>';
    const playerTable = `<table class="stats">
      <tr><th>Passes</th><th>C/T · yds · TD · INT</th></tr>${top((x) => x.passAtt, (x) => `${x.passComp}/${x.passAtt} · ${x.passYds} · ${x.passTD} · ${x.passInt}`, 2)}
      <tr><th>Courses</th><th>Tent. · yds · TD</th></tr>${top((x) => x.rushYds + x.rushAtt, (x) => `${x.rushAtt} · ${x.rushYds} · ${x.rushTD}`)}
      <tr><th>Réceptions</th><th>Réc. · yds · TD</th></tr>${top((x) => x.recYds + x.rec, (x) => `${x.rec} · ${x.recYds} · ${x.recTD}`)}
      <tr><th>Défense</th><th>Plaq. · sacks · INT</th></tr>${top((x) => x.tackles + x.sacks * 2 + x.ints * 3, (x) => `${x.tackles} · ${x.sacks} · ${x.ints}`)}
    </table>`;
    const continueBtn = this.cfg.context === 'league' ? `<button class="btn primary" data-action="continue">${t('result.continue')}</button>` : `<button class="btn primary" data-action="rematch">${t('result.rematch')}</button><button class="btn" data-action="menu">${t('result.menu')}</button>`;
    this.el.innerHTML = `
      <div class="topbar"><h1>${t('result.title')}${this.cfg.title ? ' — ' + esc(this.cfg.title) : ''}</h1>${continueBtn}</div>
      <div class="row grow" style="align-items:stretch;gap:12px;min-height:0">
        <div class="panel col" style="width:38%;justify-content:center;align-items:center">
          <div class="result-head">
            <div class="col" style="align-items:center">${logoSvg(h.logo, h.colors, 64)}<div class="tn">${esc(h.abbr)}</div></div>
            <div class="big">${s.score[0]} – ${s.score[1]}</div>
            <div class="col" style="align-items:center">${logoSvg(a.logo, a.colors, 64)}<div class="tn">${esc(a.abbr)}</div></div>
          </div>
          ${verdict ? `<div class="verdict">${verdict}</div>` : ''}
          ${s.quarter > 4 ? '<div class="muted">après prolongation</div>' : ''}
          ${mvp ? `<div class="panel" style="text-align:center;margin-top:8px"><div class="opt-label">${t('result.mvp')}</div><div style="font-size:20px;font-weight:900">#${mvp.player.number} ${esc(fullName(mvp.player))}</div><div class="muted">${esc(mc.teams[mvp.side].name)} · ${mvp.player.position}</div></div>` : ''}
        </div>
        <div class="panel col grow" style="min-height:0">
          <div class="tabs"><button class="chip ${this.tab === 'team' ? 'on' : ''}" data-action="tab:team">Équipes</button><button class="chip ${this.tab === 'players' ? 'on' : ''}" data-action="tab:players">Joueurs</button></div>
          <div class="scroll grow">${this.tab === 'team' ? teamTable : playerTable}</div>
        </div>
      </div>`;
    onAction(this.el, (act) => {
      audio.ui();
      if (act.startsWith('tab:')) {
        this.tab = act.slice(4) as 'team' | 'players';
        this.render();
      } else if (act === 'continue' || act === 'menu') this.cfg.onExit(this.mc, true);
      else if (act === 'rematch') {
        import('./MatchScreen').then(({ MatchScreen }) => this.app.go(new MatchScreen(this.app, this.cfg)));
      }
    });
  }
}
