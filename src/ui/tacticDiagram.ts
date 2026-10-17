import type { ArrowKind, TacticDiagram } from '../coach/diagram';
import { esc } from './dom';

const W = 520;
const H = 320;
// échelles non linéaires : le centre (ligne, quarterback) est agrandi pour que les joueurs ne se chevauchent pas
const X = (lat: number) => {
  const a = Math.abs(lat);
  const v = a <= 6 ? a * 19 : 114 + (a - 6) * 7.6;
  return W / 2 + Math.sign(lat) * Math.min(W / 2 - 12, v);
};
const Y = (down: number) => {
  const a = Math.abs(down);
  const v = a <= 3 ? a * 15 : 45 + (a - 3) * 8.2;
  return 214 - Math.sign(down) * v;
};

const STYLE: Record<ArrowKind, { color: string; width: number; dash?: string; head: boolean; label: string }> = {
  route: { color: '#ffd400', width: 2.6, head: true, label: 'Route de passe' },
  run: { color: '#ff4d4d', width: 3.4, head: true, label: 'Course du porteur' },
  lead: { color: '#ffffff', width: 2.2, dash: '6 4', head: true, label: 'Bloqueur de tête / feinte' },
  handoff: { color: '#ffffff', width: 1.6, dash: '2 3', head: true, label: 'Remise du ballon' },
  drop: { color: '#cfd8e3', width: 1.6, dash: '4 3', head: true, label: 'Recul du QB' },
  block: { color: '#9fb3c8', width: 2.4, head: false, label: 'Bloc' },
  blitz: { color: '#ff3b6b', width: 3, head: true, label: 'Blitz' },
  rush: { color: '#ff9f43', width: 2.2, head: true, label: 'Charge / tient l’intervalle' },
  man: { color: '#33e1ff', width: 2, dash: '5 4', head: true, label: 'Couverture individuelle' },
  zone: { color: '#ffe066', width: 1.4, dash: '3 3', head: true, label: 'Vers sa zone' },
};

/** Schéma complet (22 joueurs, flèches par mission) + liste numérotée des rôles. */
export function tacticDiagramHtml(d: TacticDiagram): string {
  const pts = (p: { down: number; lat: number }[]) => p.map((q) => `${X(q.lat).toFixed(1)},${Y(q.down).toFixed(1)}`).join(' ');
  let defs = '<defs>';
  for (const [k, s] of Object.entries(STYLE)) {
    if (!s.head) continue;
    defs += `<marker id="ah-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${s.color}"/></marker>`;
  }
  defs += '</defs>';
  let field = `<rect x="0" y="0" width="${W}" height="${H}" fill="#1d5a2a"/>`;
  for (const d of [-5, 5, 10, 15, 20]) field += `<line x1="0" y1="${Y(d)}" x2="${W}" y2="${Y(d)}" stroke="rgba(255,255,255,.18)" stroke-width="1"/>`;
  field += `<line x1="0" y1="${Y(0)}" x2="${W}" y2="${Y(0)}" stroke="#4d8dff" stroke-width="2.5"/><text x="6" y="${Y(0) - 4}" fill="#9cc0ff" font-size="11" font-weight="700">ligne de mêlée</text>`;
  let zones = '';
  for (const z of d.zones) zones += `<ellipse cx="${X(z.lat)}" cy="${Y(z.down)}" rx="${z.rx * 9.6}" ry="${z.ry * 9.6}" fill="rgba(255,224,102,.16)" stroke="rgba(255,224,102,.55)" stroke-width="1"/>`;
  let arrows = '';
  // les tracés de l'équipe étudiée par-dessus ceux de l'adversaire
  for (const a of [...d.arrows].sort((x, y) => Number(x.main) - Number(y.main))) {
    const s = STYLE[a.kind];
    const op = a.main ? 1 : 0.3;
    arrows += `<polyline points="${pts(a.pts)}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} ${s.head ? `marker-end="url(#ah-${a.kind})"` : ''} opacity="${op}"/>`;
    if (a.kind === 'block') {
      // barre de bloc perpendiculaire
      const e = a.pts[a.pts.length - 1];
      arrows += `<line x1="${X(e.lat) - 6}" y1="${Y(e.down)}" x2="${X(e.lat) + 6}" y2="${Y(e.down)}" stroke="${s.color}" stroke-width="${s.width}" opacity="${op}"/>`;
    }
  }
  let players = '';
  for (const p of d.players) {
    const x = X(p.lat);
    const y = Y(p.down);
    const op = p.main ? 1 : 0.5;
    const fill = p.offense ? (p.main ? '#ffffff' : '#c9d3df') : p.main ? '#ff5a5f' : '#d98a8c';
    const shape = p.offense
      ? `<circle cx="${x}" cy="${y}" r="9" fill="${fill}" stroke="#0a1220" stroke-width="1.5"/>`
      : `<rect x="${x - 9}" y="${y - 9}" width="18" height="18" rx="3" fill="${fill}" stroke="#0a1220" stroke-width="1.5" transform="rotate(45 ${x} ${y})"/>`;
    players += `<g opacity="${op}">${shape}<text x="${x}" y="${y + 3.5}" text-anchor="middle" font-size="${p.label.length > 2 ? 7.5 : 9}" font-weight="900" fill="#0a1220">${esc(p.label)}</text>${p.main ? `<circle cx="${x + 10}" cy="${y - 10}" r="6.5" fill="#0a1220" stroke="#ffd400" stroke-width="1"/><text x="${x + 10}" y="${y - 7.3}" text-anchor="middle" font-size="8" font-weight="900" fill="#ffd400">${p.n}</text>` : ''}</g>`;
  }
  const svg = `<svg class="tactic-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${defs}${field}${zones}${arrows}${players}
    <text x="${W - 6}" y="14" text-anchor="end" fill="rgba(255,255,255,.75)" font-size="11" font-weight="700">sens de l’attaque ↑</text></svg>`;
  const used = new Set(d.arrows.filter((a) => a.main).map((a) => a.kind));
  const legend = (Object.keys(STYLE) as ArrowKind[]).filter((k) => used.has(k)).map((k) => {
    const s = STYLE[k];
    return `<span class="lg"><svg width="26" height="10"><line x1="1" y1="5" x2="25" y2="5" stroke="${s.color}" stroke-width="3" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/></svg>${esc(s.label)}</span>`;
  }).join('') + `<span class="lg">○ attaque</span><span class="lg">◇ défense</span>${d.zones.length ? '<span class="lg"><i class="zone-sw"></i>Zone défendue</span>' : ''}`;
  const roles = d.players.filter((p) => p.main).sort((a, b) => a.n - b.n)
    .map((p) => `<li><b class="rn">${p.n}</b> <b>${esc(p.label)}</b> ${esc(p.role)}</li>`).join('');
  return `<div class="tactic">${svg}<div class="tactic-legend">${legend}</div></div><div class="roles"><h4>Le rôle de chacun</h4><ol>${roles}</ol></div>`;
}
