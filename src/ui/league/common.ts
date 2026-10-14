import { displayName } from '../../data/world';
import { overall } from '../../data/ratings';
import { fullName, type Attributes, type Player, type Team } from '../../data/types';
import { t } from '../../i18n';
import type { League } from '../../league/types';
import { esc, ovrClass } from '../dom';
import { logoSvg } from '../logo';

export const ATTR_KEYS: (keyof Attributes)[] = ['speed', 'acceleration', 'agility', 'strength', 'tackling', 'throwAccuracy', 'throwPower', 'catching', 'blocking', 'stamina', 'awareness', 'kickPower', 'kickAccuracy'];

export const money = (k: number): string => (Math.abs(k) >= 1000 ? `${(k / 1000).toFixed(1)} M$` : `${Math.round(k)} k$`);

export function teamLabel(tm: Team, size = 26): string {
  return `<span class="row" style="gap:6px;display:inline-flex">${logoSvg(tm.logo, tm.colors, size)}<span>${esc(displayName(tm))}</span></span>`;
}

export function playerRow(p: Player, extra = '', action = ''): string {
  const o = overall(p);
  return `<div class="list-item" ${action ? `data-action="${action}"` : ''}>
    <span class="ovr-badge ${ovrClass(o)}">${o}</span>
    <span style="width:34px;text-align:center;font-weight:900">${p.position}</span>
    <span class="grow">#${p.number} ${esc(fullName(p))}${p.isUserCreated ? ' ⭐' : ''}${p.injuryWeeks > 0 ? ` <span style="color:var(--bad)">🚑 ${p.injuryWeeks} sem.</span>` : ''}</span>
    <span class="muted" style="font-size:14px">${p.age} ans · ${money(p.contract.salary)} × ${p.contract.years}</span>${extra}</div>`;
}

export function playerCard(p: Player, l?: League): string {
  const o = overall(p);
  const s = l?.seasonStats[p.id];
  const bars = ATTR_KEYS.map((k) => `<div style="display:grid;grid-template-columns:118px minmax(60px,1fr) 30px;gap:8px;align-items:center"><span style="font-size:14px">${t(`attr.${k}`)}</span><div class="attr-bar"><i style="width:${p.attrs[k]}%"></i></div><b style="text-align:right">${p.attrs[k]}</b></div>`).join('');
  const hist = p.history.slice(-5).map((h) => `<tr><td>S${h.season}</td><td>${h.games}</td><td>${h.passYds}</td><td>${h.rushYds}</td><td>${h.recYds}</td><td>${h.passTD + h.rushTD + h.recTD}</td><td>${h.tackles}</td><td>${h.ints}</td></tr>`).join('');
  return `<div class="row" style="align-items:flex-start;gap:14px">
    <div class="col" style="min-width:170px">
      <div style="font-size:42px;font-weight:900" class="ovr-badge ${ovrClass(o)}">${o}</div>
      <div style="font-size:22px;font-weight:900">#${p.number} ${esc(fullName(p))}</div>
      <div class="muted">${t(`pos.${p.position}`)} · ${p.age} ans · ${p.appearance.heightCm} cm · ${p.appearance.weightKg} kg</div>
      <div class="muted">Potentiel ${p.potential} · Contrat ${money(p.contract.salary)} × ${p.contract.years} an(s)</div>
      ${s ? `<div class="panel" style="margin-top:6px;font-size:14px">Saison : ${s.games} m · Passes ${s.passComp}/${s.passAtt} ${s.passYds} yds ${s.passTD} TD · Courses ${s.rushYds} yds ${s.rushTD} TD · Réc ${s.rec} ${s.recYds} yds · Plaq ${s.tackles} · Sacks ${s.sacks} · INT ${s.ints}</div>` : ''}
    </div>
    <div class="col grow" style="gap:4px;min-width:220px">${bars}
      ${hist ? `<table class="stats" style="margin-top:6px"><tr><th>Saison</th><th>M</th><th>Yds passe</th><th>Yds course</th><th>Yds réc</th><th>TD</th><th>Plaq</th><th>INT</th></tr>${hist}</table>` : ''}
    </div></div>`;
}
