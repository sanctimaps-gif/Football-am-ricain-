import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', (d) => d.accept());
await page.goto('http://localhost:5173/dev.html?quality=low');
await page.waitForTimeout(800);
const tap = (sel) => page.evaluate((sel) => { const b = document.querySelector(sel); if (!b) return false; b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })); b.click(); return true; }, sel);
const shot = async (n) => { await page.waitForTimeout(500); await page.screenshot({ path: `shots/${n}.png` }); };
await page.mouse.click(400, 200);
await shot('40-menu');
await tap('[data-action="ext:franchise"]'); await shot('41-franchise');
await tap('[data-action="primary:#D62828"]'); await tap('[data-action="shape:star"]'); await shot('42-franchise-edit');
await tap('[data-action=create]'); await shot('43-hub');
for (const tb of ['schedule', 'standings', 'roster', 'market', 'finance', 'trade', 'plan', 'history']) { await tap(`[data-action="tab:${tb}"]`); await shot(`44-tab-${tb}`); }
await tap('[data-action="tab:home"]');
for (let w = 0; w < 11; w++) { await tap('[data-action=simulate]') || await tap('[data-action=advance]'); await page.waitForTimeout(300); await tap('.modal [data-action=close]'); }
await tap('[data-action="tab:playoffs"]'); await shot('45-playoffs');
await tap('[data-action="tab:home"]');
for (let w = 0; w < 4; w++) { await tap('[data-action=simulate]') || await tap('[data-action=advance]'); await page.waitForTimeout(300); await tap('.modal [data-action=close]'); }
await shot('46-season-end');
await tap('[data-action=endSeason]'); await shot('47-report');
await tap('.modal [data-action=close]');
await tap('[data-action="tab:draft"]'); await shot('48-draft');
const pick = await page.evaluate(() => document.querySelector('[data-action^="draft:"]')?.dataset.action);
if (pick) { await tap(`[data-action="${pick}"]`); }
await page.waitForTimeout(300);
await tap('[data-action=draftSim]'); await tap('[data-action=newSeason]'); await shot('49-season2');
await tap('[data-action=menu]');
await tap('[data-action="ext:saves"]'); await shot('50-saves');
await tap('[data-action=back]');
await tap('[data-action="ext:player"]'); await shot('51-player');
await tap('[data-action="pos:QB"]'); await tap('[data-action=create]'); await shot('52-career-hub');
await tap('[data-action="tab:career"]'); await shot('53-career');
await tap('[data-action=menu]');
await tap('[data-action="ext:training"]'); await page.waitForTimeout(1500); await shot('54-training');
console.log(errors.join('\n') || 'no errors');
await browser.close();
