import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const q of ['low', 'medium']) {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`http://localhost:5173/dev.html?quality=${q}`);
  await page.waitForTimeout(600);
  await page.mouse.click(400, 200);
  await page.evaluate(() => document.querySelector('[data-action=spectator]').click());
  await page.waitForFunction(() => window.__gd.current.mc?.phase === 'LivePlay', null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => ({ calls: window.__gd.renderer.drawCalls, tris: window.__gd.renderer.renderer.info.render.triangles, fps: window.__gd.measuredFps }));
  console.log(q, JSON.stringify(info));
  await page.screenshot({ path: `shots/60-perf-${q}.png` });
  await page.close();
}
await browser.close();
