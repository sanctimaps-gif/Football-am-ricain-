import { audio } from '../../audio/AudioEngine';
import { diplomas, FACILITIES, facilityDef, facilityLevel, kits, startBuilding, useKit, type MatchRewards } from '../../league/facilities';
import { teamById } from '../../league/league';
import type { FacilityKind, League } from '../../league/types';
import type { App, Screen } from '../App';
import { el, esc, onAction } from '../dom';
import { money } from './common';

/** Illustration vectorielle d'un bâtiment, qui grandit avec le niveau. */
export function facilitySvg(kind: FacilityKind, level: number, c1: string, c2: string): string {
  const w = 200;
  const h = 110;
  const ground = `<rect x="0" y="0" width="${w}" height="${h}" fill="#1f3b2a"/><rect x="0" y="80" width="${w}" height="30" fill="#2b4a33"/>`;
  let art = '';
  if (kind === 'stadium') {
    const rx = 42 + level * 9;
    const ry = 18 + level * 4;
    for (let i = level; i >= 1; i--) art += `<ellipse cx="100" cy="72" rx="${rx - (level - i) * 7}" ry="${ry - (level - i) * 3}" fill="${i % 2 ? c1 : '#d9dde3'}" stroke="#0b1220" stroke-width="1"/>`;
    art += `<ellipse cx="100" cy="74" rx="${rx * 0.55}" ry="${ry * 0.45}" fill="#3fa34d"/><line x1="${100 - rx * 0.4}" y1="74" x2="${100 + rx * 0.4}" y2="74" stroke="#fff" stroke-width="1"/>`;
    if (level >= 4) art += `<rect x="${100 - rx}" y="${70 - ry - 6}" width="${rx * 2}" height="5" fill="#cfd6df" opacity=".9"/>`;
  } else if (kind === 'seats') {
    for (let r = 0; r < level + 1; r++) for (let s = 0; s < 6 + level * 2; s++) art += `<rect x="${30 + s * (140 / (6 + level * 2))}" y="${80 - r * 11}" width="${120 / (6 + level * 2)}" height="8" rx="2" fill="${r % 2 ? c1 : c2}"/>`;
  } else if (kind === 'shop') {
    const bw = 60 + level * 18;
    const bh = 26 + level * 7;
    art = `<rect x="${100 - bw / 2}" y="${80 - bh}" width="${bw}" height="${bh}" fill="#e9edf2"/><rect x="${100 - bw / 2}" y="${80 - bh}" width="${bw}" height="8" fill="${c1}"/>
      <rect x="${100 - bw / 2 + 8}" y="${80 - bh + 14}" width="${bw - 16}" height="${bh - 24}" fill="#24425f" opacity=".85"/><text x="100" y="${80 - bh + 7}" font-size="6" text-anchor="middle" fill="#fff" font-family="sans-serif" font-weight="bold">CLUB STORE</text>`;
  } else if (kind === 'medical') {
    const bw = 50 + level * 16;
    const bh = 30 + level * 8;
    art = `<rect x="${100 - bw / 2}" y="${80 - bh}" width="${bw}" height="${bh}" fill="#f4f6f8"/><rect x="92" y="${80 - bh + 6}" width="16" height="16" fill="#fff"/><path d="M97 ${80 - bh + 8}h6v5h5v6h-5v5h-6v-5h-5v-6h5z" fill="#e63946"/>`;
    for (let i = 0; i < level; i++) art += `<rect x="${100 - bw / 2 + 6 + i * ((bw - 12) / level)}" y="${80 - 14}" width="${(bw - 12) / level - 4}" height="8" fill="#9cc3e6"/>`;
  } else {
    art = `<rect x="20" y="58" width="${70 + level * 12}" height="26" fill="#3fa34d" stroke="#fff"/><line x1="${55 + level * 6}" y1="58" x2="${55 + level * 6}" y2="84" stroke="#fff"/>`;
    const bw = 30 + level * 10;
    art += `<rect x="${170 - bw}" y="${80 - (24 + level * 6)}" width="${bw}" height="${24 + level * 6}" fill="#dfe4ea"/><rect x="${170 - bw}" y="${80 - (24 + level * 6)}" width="${bw}" height="5" fill="${c1}"/>`;
  }
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">${ground}${art}</svg>`;
}

/** Bâtiments du club : 5 onglets (Stade, Sièges, Boutique, Infirmerie, Entraînement), niveaux à construire. */
export class InstallationsScreen implements Screen {
  readonly el: HTMLElement;
  private kind: FacilityKind = 'stadium';

  constructor(_app: App, private l: League, private back: () => void, private onChange: () => void) {
    this.el = el('div', 'screen installations');
    onAction(this.el, (a) => this.action(a));
    this.render();
  }

  private render(): void {
    const l = this.l;
    const f = l.finances[l.userTeamId];
    const team = teamById(l, l.userTeamId);
    const def = facilityDef(this.kind);
    const cur = facilityLevel(f, this.kind);
    const b = f.building;
    const cards = def.levels.map((lv) => {
      const owned = lv.level <= cur;
      const building = b && b.kind === this.kind && b.level === lv.level;
      const next = lv.level === cur + 1;
      let foot: string;
      if (owned) foot = `<div class="fc-foot owned">${lv.level === cur ? 'NIVEAU ACTUEL ✓' : 'OBTENU ✓'}</div>`;
      else if (building) foot = `<div class="fc-foot building">🏗️ EN CONSTRUCTION · ${b!.weeksLeft} sem.</div>`;
      else if (next) {
        const can = !b && f.cash >= lv.cost && diplomas(f) >= lv.diplomas;
        foot = `<button class="fc-foot buy ${can ? '' : 'off'}" data-action="build:${this.kind}">💵 ${money(lv.cost)} · 🎓 ${lv.diplomas}</button>`;
      } else foot = `<div class="fc-foot locked">🔒 Niveau ${lv.level - 1} requis</div>`;
      return `<div class="fcard ${owned ? 'owned' : ''} ${next ? 'next' : ''}">
        <div class="fc-head">${esc(def.name.toUpperCase())} · NIVEAU ${lv.level}</div>
        <div class="fc-art">${facilitySvg(this.kind, lv.level, team.colors.primary, team.colors.secondary)}</div>
        <div class="fc-info">${lv.effects.map(([k, v]) => `<div class="fc-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}
          ${owned ? '' : `<div class="fc-row"><span>Temps de construction</span><b>⏱ ${lv.weeks} sem.</b></div>`}</div>
        ${foot}</div>`;
    }).join('');
    const injured = team.roster.filter((p) => p.injuryWeeks > 0);
    const infirmary = this.kind === 'medical'
      ? `<div class="panel" style="margin-top:8px"><b>Infirmerie</b> · ${injured.length ? injured.map((p) => `<span class="chip" style="margin:2px">${p.position} ${esc(p.lastName)} (${p.injuryWeeks} sem.) <button class="btn" style="min-height:30px;padding:2px 8px;margin-left:6px" data-action="heal:${p.id}" ${kits(f) ? '' : 'disabled'}>🧰 Soigner</button></span>`).join('') : '<span class="muted">aucun blessé</span>'}</div>`
      : '';
    this.el.innerHTML = `
      <div class="topbar"><button class="btn ghost" data-action="back">‹ Retour</button><h1>Installations</h1>
        <div class="wallet"><span>💵 ${money(f.cash)}</span><span>🎓 ${diplomas(f)}</span><span>🧰 ${kits(f)}</span></div></div>
      <div class="ftabs">${FACILITIES.map((x) => `<button class="${x.kind === this.kind ? 'on' : ''}" data-action="kind:${x.kind}">${x.icon} ${esc(x.name)} <small>niv. ${facilityLevel(f, x.kind)}</small></button>`).join('')}</div>
      <div class="muted small" style="margin:4px 0">${esc(def.desc)}${b ? ` · Chantier en cours : ${esc(facilityDef(b.kind).name)} niveau ${b.level} (${b.weeksLeft} sem.)` : ' · Une construction à la fois ; elle avance à chaque semaine de compétition.'}</div>
      <div class="fcards">${cards}</div>${infirmary}`;
  }

  private action(a: string): void {
    audio.ui();
    if (a === 'back') return this.back();
    const [k, v] = a.split(':');
    if (k === 'kind') this.kind = v as FacilityKind;
    if (k === 'build') {
      const r = startBuilding(this.l, this.l.userTeamId, v as FacilityKind);
      this.toast(r.ok ? r.message : r.reason);
      if (r.ok) {
        audio.ui('confirm');
        this.onChange();
      }
    }
    if (k === 'heal') {
      const r = useKit(this.l, this.l.userTeamId, v);
      this.toast(r.ok ? r.message : r.reason);
      if (r.ok) this.onChange();
    }
    this.render();
  }

  private toast(text: string): void {
    const t = el('div', 'toast', esc(text));
    this.el.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
}

/** Récompenses après un match (cartes hexagonales), « toucher pour continuer ». */
export class RewardScreen implements Screen {
  readonly el: HTMLElement;
  constructor(app: App, r: MatchRewards, headline: string, next: () => void) {
    this.el = el('div', 'screen rewards');
    const card = (icon: string, value: string, label: string) => `<div class="hexcard"><div class="hv">${value}</div><div class="hl">${label}</div><div class="hi">${icon}</div></div>`;
    this.el.innerHTML = `<div class="rw-title">${esc(headline)}</div>
      <div class="hexrow">${card('💵', money(r.cash), 'Argent')}${card('🎓', String(r.diplomas), 'Diplômes')}${card('🧰', String(r.kits), 'Trousses de secours')}</div>
      <div class="rw-tap">TOUCHER POUR CONTINUER</div>`;
    let done = false;
    this.el.addEventListener('click', () => {
      if (done) return;
      done = true;
      audio.ui('confirm');
      next();
    });
    void app;
  }
}
