import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror: ' + e.message));
await page.goto('http://localhost:5173/dev.html');
await page.waitForTimeout(800);
await page.mouse.click(400, 200);
await page.waitForTimeout(400);
await page.click('[data-action=quick]', { force: true });
await page.click('[data-action=start]', { force: true });
await page.waitForTimeout(500);
await page.click('[data-action=tails]', { timeout: 4000, force: true });
await page.click('[data-action=kick]', { timeout: 4000, force: true });
const st = () => page.evaluate(() => { const m = window.__gd.current.mc; return m.phase + ' poss' + m.state.possession + ' user' + m.userSide + ' kind' + m.state.nextKind + ' sim:' + (m.sim && m.sim.phase) + ' await:' + (m.sim && m.sim.awaitingKick); });
for (let i = 0; i < 6; i++) { console.log(await st()); await page.waitForTimeout(500); }
const btns = await page.evaluate(() => [...document.querySelectorAll('.ctl-btn')].map((b) => b.dataset.id + ':' + getComputedStyle(b.closest('.controls')).display));
console.log(btns);
await page.click('.ctl-btn[data-id=kick]', { timeout: 4000, force: true }).catch((e) => console.log('click fail', e.message.split('\n')[0]));
for (let i = 0; i < 6; i++) { console.log(await st()); await page.waitForTimeout(500); }
await page.click('.ctl-btn[data-id=kick]', { timeout: 4000, force: true }).catch((e) => console.log('click fail', e.message.split('\n')[0]));
for (let i = 0; i < 6; i++) { console.log(await st()); await page.waitForTimeout(500); }
await page.screenshot({ path: "shots/20-dbg.png" }); console.log(await page.evaluate(() => { const s = window.__gd.current.mc.sim; const b = s.ball; return JSON.stringify({ b: [b.state, b.flight, b.x.toFixed(1), b.y.toFixed(1), b.z.toFixed(1), b.holder], t: s.t.toFixed(1), user: s.userAgent, ret: s.returnerIdx }); }));
await browser.close();
