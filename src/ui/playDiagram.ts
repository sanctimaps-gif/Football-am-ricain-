import { DEF_FRONTS, FORMATIONS, ROUTES, type DefensivePlay, type OffensivePlay } from '../data/playbook';

/** Schéma de l'action (formation + tracés) pour les cartes du playbook. */
export function offenseDiagram(play: OffensivePlay): string {
  const slots = FORMATIONS[play.formation];
  // repère : lat -24..24 → x 0..200, down -15..25 → y 120..0
  const X = (lat: number) => 100 + lat * 3.9;
  const Y = (down: number) => 78 - down * 3.0;
  let s = `<svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid meet"><line x1="0" y1="${Y(0)}" x2="200" y2="${Y(0)}" stroke="#7fb0ff" stroke-width="1.5"/>`;
  for (const sl of slots) {
    const a = play.assign[sl.slot];
    const x = X(sl.lat);
    const y = Y(sl.down);
    if (a?.kind === 'route') {
      const r = ROUTES[a.route];
      const sgn = sl.lat === 0 ? 1 : Math.sign(sl.lat);
      const pts = [[x, y], ...r.points.map((p) => [X(sl.lat + sgn * p.out), Y(sl.down + p.down)])];
      s += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#ffd400" stroke-width="2"/>`;
      const last = pts[pts.length - 1];
      s += `<circle cx="${last[0]}" cy="${last[1]}" r="2.5" fill="#ffd400"/>`;
    } else if ((a?.kind === 'carry' || sl.slot === play.handoffTo) && play.runAim) {
      s += `<line x1="${x}" y1="${y}" x2="${X(play.runAim.lat)}" y2="${Y(play.runAim.down)}" stroke="#ff6b6b" stroke-width="2.4" stroke-dasharray="0"/>`;
    } else if (a?.kind === 'lead' && play.runAim) {
      s += `<line x1="${x}" y1="${y}" x2="${X(play.runAim.lat)}" y2="${Y(play.runAim.down + 1)}" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="3 2"/>`;
    }
    const fill = sl.slot === 'QB' ? '#ffffff' : ['OT', 'OG', 'C'].includes(sl.pos) ? '#9fb3c8' : '#33e1ff';
    s += `<circle cx="${x}" cy="${y}" r="4" fill="${fill}" stroke="#0a1220" stroke-width="1"/>`;
  }
  return s + '</svg>';
}

export function defenseDiagram(play: DefensivePlay): string {
  const slots = DEF_FRONTS[play.front];
  const X = (lat: number) => 100 + lat * 3.9;
  const Y = (down: number) => 100 - down * 4.2;
  let s = `<svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid meet"><line x1="0" y1="${Y(0)}" x2="200" y2="${Y(0)}" stroke="#7fb0ff" stroke-width="1.5"/>`;
  for (const sl of slots) {
    const blitz = play.blitz.includes(sl.slot);
    const x = X(sl.lat);
    const y = Y(sl.down);
    if (blitz) s += `<line x1="${x}" y1="${y}" x2="${X(sl.lat * 0.2)}" y2="${Y(-3)}" stroke="#ff6b6b" stroke-width="2"/>`;
    else if (sl.role === 's' || sl.role === 'cb') {
      const zone = play.tags.includes('zone');
      if (zone) s += `<ellipse cx="${x}" cy="${y - 6}" rx="16" ry="7" fill="rgba(255,212,0,.18)" stroke="#ffd400" stroke-width="1"/>`;
    }
    s += `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="12" font-weight="900" fill="${blitz ? '#ff6b6b' : '#ffffff'}">✕</text>`;
  }
  return s + '</svg>';
}
