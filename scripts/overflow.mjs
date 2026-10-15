import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sizes = [[667, 375], [844, 390], [932, 430]];
const problems = new Set();
for (const [w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: true });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto('http://localhost:5173/dev.html?quality=low');
  await page.waitForTimeout(700);
  await page.mouse.click(w / 2, h / 2);
  const tap = (sel) => page.evaluate((sel) => { const b = document.querySelector(sel); if (!b) return false; b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })); b.click(); return true; }, sel);
  const check = async (name) => {
    await page.waitForTimeout(400);
    const bad = await page.evaluate(() => {
      const out = [];
      for (const b of document.querySelectorAll('button')) {
        const r = b.getBoundingClientRect();
        if (!r.width || getComputedStyle(b).display === 'none') continue;
        const inner = b.querySelector(':scope > span') ?? b;
        const over = inner === b ? b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1 : inner.getBoundingClientRect().width > r.width * 0.95 || inner.getBoundingClientRect().height > r.height;
        let sc = b.parentElement; while (sc && !['auto','scroll'].includes(getComputedStyle(sc).overflowY) && !['auto','scroll'].includes(getComputedStyle(sc).overflowX)) sc = sc.parentElement;
        const outside = !sc && (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1);
        if (over || outside) out.push(`${(b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 24)} ${over ? 'TEXTE' : ''}${outside ? 'HORS-ÉCRAN' : ''}`);
      }
      return out;
    });
    for (const x of bad) problems.add(`${w}x${h} ${name}: ${x}`);
    if (w === 667) await page.screenshot({ path: `shots/70-${name}.png` });
  };
  await check('menu');
  await tap('[data-action=settings]'); await check('settings'); await tap('[data-action=back]');
  await tap('[data-action="ext:franchise"]'); await check('franchise'); await tap('[data-action=create]');
  for (const tb of ['home', 'roster', 'market', 'finance', 'trade', 'plan']) { await tap(`[data-action="tab:${tb}"]`); await check(`hub-${tb}`); }
  await tap('[data-action=menu]');
  await tap('[data-action=quick]'); await check('setup');
  await tap('[data-action=start]');
  await page.waitForFunction(() => window.__gd.current.mc?.phase === 'CoinToss', null, { timeout: 90000, polling: 500 });
  await check('coin');
  await tap('[data-action=heads]'); await page.waitForTimeout(300); await tap('[data-action=receive]');
  for (let i = 0; i < 300; i++) {
    const ph = await page.evaluate(() => window.__gd.current.mc?.phase);
    if (ph === 'PlaySelection') break;
    await tap('.ctl-btn[data-id=kick]');
    await page.waitForTimeout(400);
  }
  await check('playcall');
  const off = await page.evaluate(() => { const m = window.__gd.current.mc; return m.state.possession === m.userSide; });
  if (off) { await tap('[data-action="off:quickSlants"]'); await page.waitForFunction(() => window.__gd.current.mc?.phase === 'PreSnap', null, { timeout: 90000, polling: 500 }); await check('presnap-off'); await tap('.ctl-btn[data-id=snap]'); await page.waitForTimeout(1500); await check('qb'); }
  else { await tap('[data-action="def:43cover2"]'); await page.waitForFunction(() => window.__gd.current.mc?.phase === 'PreSnap', null, { timeout: 90000, polling: 500 }); await check('presnap-def'); await page.waitForFunction(() => window.__gd.current.mc?.phase === 'LivePlay', null, { timeout: 90000, polling: 500 }); await check('defense'); }
  await tap('[data-action=pause]'); await check('pause');
  await page.close();
}
console.log([...problems].join('\n') || 'AUCUN DÉBORDEMENT');
await browser.close();
