import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:5173/dev.html?quality=low');
await page.waitForTimeout(800);
const tap = (sel) => page.evaluate((sel) => { const b = document.querySelector(sel); if (!b) return false; const r = b.getBoundingClientRect(); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: r.x + 5, clientY: r.y + 5 })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })); b.click(); return true; }, sel);
await page.mouse.click(400, 200);
await page.waitForTimeout(400);
await tap('[data-action=quick]');
await tap('[data-action="qm:1"]');
await tap('[data-action=start]');
await page.waitForTimeout(600);
await tap('[data-action=tails]');
await page.waitForTimeout(200);
await tap('[data-action=receive]');
const st = () => page.evaluate(() => { const m = window.__gd.current.mc; if (!m) return { phase: 'none' }; const s = m.state; return { phase: m.phase, poss: s.possession, user: m.userSide, q: s.quarter, clock: Math.round(s.clock), score: s.score.join('-'), down: s.down, toGo: s.toGo, ballOn: s.ballOn, kind: s.nextKind, simKind: m.sim?.setup.kind, aw: m.sim?.awaitingKick, ticker: window.__gd.current.tickerText }; });
let n = 0; let lastTicker = '';
const t0 = Date.now();
while (Date.now() - t0 < 420000) {
  await page.waitForTimeout(400);
  const s = await st();
  if (s.ticker && s.ticker !== lastTicker) { console.log(`Q${s.q} ${s.clock}s ${s.score} | ${s.ticker}`); lastTicker = s.ticker; }
  if (s.phase === 'PlaySelection') {
    if (s.poss === s.user) {
      if (s.kind === 'conversion') { await tap('[data-action=kick]'); continue; }
      if (s.down === 4) { await tap('[data-action="cat:special"]'); await page.waitForTimeout(150); await tap(s.ballOn > 60 ? '[data-action="off:fieldGoal"]' : '[data-action="off:punt"]'); continue; }
      const pass = Math.random() < 0.5;
      await tap(pass ? '[data-action="cat:pass"]' : '[data-action="cat:run"]');
      await page.waitForTimeout(150);
      await tap(pass ? '[data-action="off:meshDrag"]' : '[data-action="off:insideZone"]');
    } else await tap('[data-action="def:43cover3"]');
  } else if (s.phase === 'PreSnap' && s.poss === s.user) {
    if (n < 3) await page.screenshot({ path: `shots/30-presnap-${n}.png` });
    await tap('.ctl-btn[data-id=snap]') || await tap('.ctl-btn[data-id=kick]');
  } else if ((s.phase === 'LivePlay') && s.poss === s.user) {
    if (s.aw) { await tap('.ctl-btn[data-id=kick]'); continue; }
    if (await tap('.bubble.sel')) { if (n < 4) await page.screenshot({ path: `shots/31-throw-${n++}.png` }); }
  } else if (s.phase === 'PassInFlight' && n < 6) { await page.screenshot({ path: `shots/32-air-${n++}.png` }); }
  else if (s.phase === 'none') break;
}
await page.screenshot({ path: 'shots/39-end.png' });
console.log(JSON.stringify(await st()));
console.log(errors.join('\n') || 'no errors');
await browser.close();
