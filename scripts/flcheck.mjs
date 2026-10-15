import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sizes = [[667, 375], [844, 390]];
const problems = new Set();
const url = process.argv[2] ?? 'http://localhost:5173/dev.html?quality=low';
for (const [w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: true });
  page.on('pageerror', (e) => problems.add('pageerror ' + e.message));
  page.on('console', (m) => m.type() === 'error' && problems.add('console ' + m.text()));
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(700);
  await page.mouse.click(w / 2, h / 2);
  const tap = async (sel) => { const ok = await page.evaluate((sel) => { const b = document.querySelector(sel); if (!b) return false; b.click(); return true; }, sel); if (!ok) problems.add(`${w}x${h} introuvable ${sel}`); await page.waitForTimeout(150); };
  const check = async (name) => {
    await page.waitForTimeout(300);
    const bad = await page.evaluate(() => {
      const out = [];
      for (const b of document.querySelectorAll('button')) {
        const r = b.getBoundingClientRect();
        if (!r.width || getComputedStyle(b).display === 'none') continue;
        const over = b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1;
        let sc = b.parentElement; while (sc && !['auto','scroll'].includes(getComputedStyle(sc).overflowY) && !['auto','scroll'].includes(getComputedStyle(sc).overflowX)) sc = sc.parentElement;
        const outside = !sc && (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1);
        if (over || outside) out.push(`${(b.textContent || '').trim().slice(0, 30)} ${over ? 'TEXTE' : ''}${outside ? 'HORS-ÉCRAN' : ''}`);
      }
      if (document.documentElement.scrollWidth > innerWidth + 1) out.push('SCROLL HORIZONTAL');
      return out;
    });
    for (const x of bad) problems.add(`${w}x${h} ${name}: ${x}`);
    await page.screenshot({ path: `shots/fl-${w}-${name}.png` });
  };
  await check('menu');
  // carrière de club : club créé
  await tap('[data-action="ext:club"]'); await check('club-mode');
  await tap('[data-action="mode:create"]'); await tap('[data-action="league:eur"]'); await check('club-identity');
  await tap('[data-action=toKit]'); await tap('[data-action="kitpart:socks"]'); await tap('[data-action="kitcolor:#C8102E"]'); await check('club-kit');
  await tap('[data-action=startCustom]'); await page.waitForTimeout(400); await check('club-created-home');
  await tap('[data-action="tab:kit"]'); await check('club-kit-tab');
  await tap('[data-action=menu]');
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.includes('slot')) localStorage.removeItem(k); });
  // carrière de club : club existant
  await tap('[data-action="ext:club"]'); await tap('[data-action="mode:existing"]'); await check('club-pick');
  await tap('[data-action="club:us-kcr"]'); await tap('[data-action=next]'); await check('club-keep');
  await tap('[data-action=start]'); await page.waitForTimeout(400); await check('club-home');
  for (const tb of ['standings', 'transfers', 'roster', 'finance']) { await tap(`[data-action="tab:${tb}"]`); await check(`club-${tb}`); }
  await tap('[data-action="tab:transfers"]'); await tap('[data-action^="buy:"]'); await check('club-buy'); await tap('.modal .btn.primary');
  await tap('[data-action="tab:home"]'); await tap('[data-action=simulate]'); await check('club-after-sim'); await tap('.modal .btn.primary');
  await tap('[data-action=menu]');
  // championnats
  await tap('[data-action="ext:season"]'); await tap('[data-action="league:usa"]'); await check('champ-usa');
  await tap('[data-action="league:custom"]'); await check('champ-custom');
  await tap('[data-action="league:eur"]'); await tap('[data-action=start]'); await page.waitForTimeout(300); await tap('[data-action="tab:standings"]'); await check('champ-standings');
  await tap('[data-action=menu]');
  // coupes
  await tap('[data-action="ext:cups"]'); await check('cups');
  await tap('[data-action="cup:nations"]'); await check('cup-pick'); await tap('[data-action="team:nt-fra"]'); await tap('[data-action=start]'); await page.waitForTimeout(300);
  await check('cup-home'); await tap('[data-action="tab:standings"]'); await check('cup-groups');
  await tap('[data-action=menu]');
  // match rapide
  await tap('[data-action=quick]'); await tap('[data-action=homeLeague]'); await check('quick');
  await tap('[data-action=back]');
  // Ultimate Team
  await tap('[data-action="ext:ut"]'); await page.waitForTimeout(300); await tap('.modal .btn.primary'); await check('ut-home');
  for (const tb of ['team', 'cards', 'playbook', 'store', 'base', 'journeys', 'arena', 'vs', 'pass', 'events', 'kit']) { await tap(`[data-action="tab:${tb}"]`); await check(`ut-${tb}`); }
  await tap('[data-action="tab:store"]'); await tap('[data-action="buy:pro"]'); await check('ut-pack'); await tap('.modal .btn.primary');
  await tap('[data-action="tab:team"]'); await tap('[data-action="slot:QB"]'); await check('ut-slot'); await tap('[data-action^="assign:"]');
  await tap('[data-action="tab:cards"]'); await tap('[data-action^="card:ut"]'); await check('ut-card');
  await tap('[data-action="tab:arena"]'); await tap('[data-action=arena]');
  await page.waitForFunction(() => window.__gd.current.mc?.phase === 'PlaySelection', null, { timeout: 30000 });
  const ar = await page.evaluate(() => { const m = window.__gd.current.mc; return { q: m.state.quarter, clock: m.state.clock, plays: m.offensePlaysForUser().length }; });
  console.log(w, 'arena', JSON.stringify(ar));
  await check('ut-arena-play');
  await page.evaluate(() => window.__gd.current.exit?.(false));
  await page.goto(url); await page.waitForTimeout(700); await page.mouse.click(w / 2, h / 2);
  // féminines
  await tap('[data-action="ext:cups"]'); await tap('[data-action="cup:worldCupW"]'); await check('cup-women');
  await tap('[data-action=list]'); await tap('[data-action=back]');
  // défis
  await tap('[data-action="ext:challenges"]'); await check('challenges');
  await tap('[data-action="play:drive"]');
  await page.waitForFunction(() => window.__gd.current.mc?.phase === 'PlaySelection', null, { timeout: 30000 });
  const st = await page.evaluate(() => { const s = window.__gd.current.mc.state; return { q: s.quarter, clock: s.clock, score: s.score, pos: s.possession, ballOn: s.ballOn }; });
  console.log(w, 'challenge state', JSON.stringify(st));
  await check('challenge-play');
  await page.close();
}
console.log([...problems].join('\n') || 'AUCUN PROBLÈME');
await browser.close();
