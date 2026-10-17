import { expect, test, type Page } from '@playwright/test';

const tap = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const b = document.querySelector(sel) as HTMLElement | null;
    if (!b) return false;
    b.click();
    return true;
  }, sel);

/** Attend que l'élément existe puis le touche (le rendu logiciel des tests est lent). */
async function tapWhen(page: Page, sel: string, timeout = 30000) {
  await expect.poll(() => tap(page, sel), { timeout, intervals: [200] }).toBe(true);
}

const phase = (page: Page) => page.evaluate(() => (window as any).__gd.current?.mc?.phase ?? null);

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

const BASICS = ['insideZone', 'quickSlants', '43cover3', '43runStop'];

/** Débloque les 4 tactiques de base (évite de rejouer les leçons dans chaque test). */
const unlockBasics = (page: Page) =>
  page.evaluate((ids) => {
    const app = (window as any).__gd;
    app.profile.unlockedPlays = ids;
    app.saveProfile();
  }, BASICS);

async function openMenu(page: Page, w = 844, h = 390) {
  await page.goto('/dev.html?quality=low');
  await expect(page.locator('.splash')).toBeVisible();
  await page.mouse.click(w / 2, h / 2);
  await expect(page.locator('.home .sidenav')).toBeVisible();
}

/** Match rapide jusqu'au premier appel de l'entraîneur. */
async function startQuickMatch(page: Page) {
  await tapWhen(page, '[data-action="cat:home"]');
  await tapWhen(page, '[data-action=quick]');
  await tap(page, '[data-action="qm:1"]');
  await tapWhen(page, '[data-action=start]');
  await expect(page.locator('.prematch')).toBeVisible();
  await tapWhen(page, '[data-action=play]');
  await expect.poll(() => phase(page), { timeout: 60000 }).toBe('CoinToss');
  await tapWhen(page, '.modal [data-action=heads]');
  await tapWhen(page, '.modal [data-action=receive]');
}

test.describe('NFL League — entraîneur', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('premier lancement : tutoriel de base obligatoire, leçon (texte, ralenti, question) et déblocage', async ({ page }) => {
    const errors = collectErrors(page);
    await openMenu(page);
    // un match est refusé tant que les bases ne sont pas apprises
    await tapWhen(page, '[data-action=quick]');
    await tap(page, '[data-action=start]');
    await tapWhen(page, '[data-action=play]');
    await expect(page.locator('.dialog, .modal').first()).toBeVisible();
    expect(await phase(page)).toBeNull();
    // leçon : lecture → ralenti → question
    await openMenu(page);
    await tapWhen(page, '[data-action^="lesson:"]');
    await expect(page.locator('.lesson-read')).toBeVisible();
    await tapWhen(page, '[data-action=watch]');
    await expect(page.locator('.lesson-caption')).toBeVisible();
    await tapWhen(page, '[data-action="slow:1"]');
    await tapWhen(page, '[data-action=toquiz]', 150000);
    await expect(page.locator('.quiz .answers')).toBeVisible();
    for (let i = 0; i < 3 && !(await page.locator('[data-action^="next:"]').count()); i++) await tap(page, `[data-action="answer:${i}"]`);
    await expect(page.locator('[data-action^="next:"]')).toBeVisible();
    const unlocked = await page.evaluate(() => (window as any).__gd.profile.unlockedPlays);
    expect(unlocked).toEqual(['insideZone']);
    expect(errors).toEqual([]);
  });

  test('avant-match (rapport adverse), appel d’une tactique avec consigne, action jouée par l’IA', async ({ page }) => {
    const errors = collectErrors(page);
    await openMenu(page);
    await unlockBasics(page);
    await startQuickMatch(page);
    await expect.poll(async () => {
      // si l'adversaire attaque d'abord, on appelle une défense apprise
      const sel = await page.evaluate(() => !!document.querySelector('.cpanel [data-action^="pick:"]'));
      const off = await page.evaluate(() => { const m = (window as any).__gd.current?.mc; return m ? m.state.possession === m.userSide && m.state.nextKind === 'scrimmage' : false; });
      if (sel && !off) {
        await tap(page, '.cpanel [data-action="pick:43cover3"]');
        await tap(page, '.cpanel [data-action=confirm]');
      }
      return sel && off;
    }, { timeout: 150000, intervals: [500] }).toBe(true);
    // seules les tactiques apprises sont proposées
    await tapWhen(page, '.cpanel [data-action="cat:pass"]');
    const picks = await page.locator('.cpanel [data-action^="pick:"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.action));
    expect(picks).toEqual(['pick:quickSlants']);
    await tapWhen(page, '.cpanel [data-action="pick:quickSlants"]');
    await tapWhen(page, '.cpanel [data-action="prio:Z"]');
    await tapWhen(page, '.cpanel [data-action=confirm]');
    await expect.poll(() => page.evaluate(() => (window as any).__gd.current.mc.offCall?.progression?.[0]), { timeout: 10000 }).toBe('Z');
    // snap automatique, aucun joueur contrôlé
    await expect.poll(() => phase(page), { timeout: 60000 }).toMatch(/LivePlay|PassInFlight|BallDead|PlayReview/);
    expect(await page.evaluate(() => (window as any).__gd.current.mc.sim.userAgent)).toBe(-1);
    // panneaux d'information
    for (const p of ['overview', 'stats', 'notes', 'plan']) {
      await tapWhen(page, `[data-action="panel:${p}"]`);
      await expect(page.locator('.cpanel h2').first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('pause et reprise sans perte d’état (spectateur)', async ({ page }) => {
    await openMenu(page);
    await tapWhen(page, '[data-action=spectator]');
    await expect.poll(() => phase(page), { timeout: 60000 }).toBe('LivePlay');
    await tapWhen(page, '[data-action=pause]');
    const before = await page.evaluate(() => (window as any).__gd.current.mc.sim.t);
    await page.waitForTimeout(1500);
    const during = await page.evaluate(() => (window as any).__gd.current.mc.sim.t);
    expect(during).toBe(before);
    await tapWhen(page, '[data-action=resume]');
    await expect.poll(() => page.evaluate(() => (window as any).__gd.current.mc.sim?.t ?? 0)).not.toBe(before);
  });
});

const RESOLUTIONS = [
  { name: 'iphone-se', width: 667, height: 375 },
  { name: 'android-20-9', width: 800, height: 360 },
  { name: 'iphone-pro', width: 844, height: 390 },
  { name: 'tablette', width: 1180, height: 820 },
];

for (const r of RESOLUTIONS) {
  test(`interface lisible et boutons dans l’écran — ${r.name}`, async ({ page }) => {
    await page.setViewportSize({ width: r.width, height: r.height });
    await openMenu(page, r.width, r.height);
    const inView = async (sel: string, minTarget = 40) => {
      const boxes = await page.locator(sel).evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0).map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height })));
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(-1);
        expect(b.x + b.w).toBeLessThanOrEqual(r.width + 1);
        expect(Math.min(b.w, b.h)).toBeGreaterThanOrEqual(minTarget); // cible tactile minimale
      }
      return boxes.length;
    };
    expect(await inView('.fl-card, .fl-hero, .icon-btn, .coach-chip')).toBeGreaterThan(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/menu-${r.name}.png` });
    await unlockBasics(page);
    await startQuickMatch(page);
    await expect(page.locator('.cpanel [data-action^="pick:"]').first()).toBeVisible({ timeout: 150000 });
    expect(await inView('.cnav-btn, .hud-btn.pause, .cpanel .playcard')).toBeGreaterThan(5);
    // le bouton de l'appel et la carte choisie restent dans l'écran
    await tap(page, '.cpanel [data-action^="pick:"]');
    const confirm = await page.locator('.cpanel [data-action=confirm]').boundingBox();
    expect(confirm).not.toBeNull();
    expect(confirm!.y + confirm!.height).toBeLessThanOrEqual(r.height + 1);
    await page.screenshot({ path: `test-results/match-${r.name}.png` });
  });
}
