import { expect, test, type Page } from '@playwright/test';

const tap = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const b = document.querySelector(sel) as HTMLElement | null;
    if (!b) return false;
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    b.click();
    return true;
  }, sel);

/** Attend que l'élément existe puis le touche (le rendu logiciel des tests est lent). */
async function tapWhen(page: Page, sel: string, timeout = 30000) {
  await expect.poll(() => tap(page, sel), { timeout, intervals: [200] }).toBe(true);
}

const phase = (page: Page) => page.evaluate(() => (window as any).__gd.current?.mc?.phase ?? null);

async function waitPhase(page: Page, ph: string, timeout = 60000) {
  await expect.poll(() => phase(page), { timeout }).toBe(ph);
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test.describe('Gridiron Dynasty', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('lancement, menu et match rapide jusqu’à une passe', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/dev.html?quality=low');
    await expect(page.locator('.splash')).toBeVisible();
    await page.mouse.click(400, 200);
    await expect(page.locator('.menu-grid')).toBeVisible();
    await tapWhen(page, '[data-action=quick]');
    await expect(page.locator('.team-pick')).toBeVisible();
    await tap(page, '[data-action="qm:1"]');
    await tapWhen(page, '[data-action=start]');
    await waitPhase(page, 'CoinToss');
    await tapWhen(page, '[data-action=heads]');
    await tapWhen(page, '[data-action=receive]');
    // le coup d'envoi peut être botté par l'utilisateur ou l'IA
    await expect.poll(async () => {
      const p = await phase(page);
      if (p === 'PreSnap' || p === 'LivePlay') await tap(page, '.ctl-btn[data-id=kick]');
      return p;
    }, { timeout: 120000, intervals: [500] }).toBe('PlaySelection');
    const userOffense = await page.evaluate(() => { const m = (window as any).__gd.current.mc; return m.state.possession === m.userSide; });
    if (userOffense) {
      await tapWhen(page, '[data-action="cat:pass"]');
      await tapWhen(page, '[data-action="off:quickSlants"]');
      await waitPhase(page, 'PreSnap');
      await expect(page.locator('.ctl-btn[data-id=snap]')).toBeVisible();
      await tapWhen(page, '.ctl-btn[data-id=snap]');
      await expect.poll(async () => {
        await tap(page, '.ctl-btn[data-id=pass]');
        return page.evaluate(() => (window as any).__gd.current.mc.sim?.thrown ?? false);
      }, { timeout: 60000, intervals: [400] }).toBe(true);
    } else {
      await tapWhen(page, '[data-action="def:43cover2"]');
      await waitPhase(page, 'LivePlay');
    }
    await expect.poll(() => phase(page), { timeout: 60000 }).toBe('PlayReview');
    const log = await page.evaluate(() => (window as any).__gd.current.mc.state.log.length);
    expect(log).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('pause et reprise sans perte d’état', async ({ page }) => {
    await page.goto('/dev.html?quality=low');
    await page.mouse.click(400, 200);
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
    await page.goto('/dev.html?quality=low');
    await page.mouse.click(r.width / 2, r.height / 2);
    await expect(page.locator('.menu-grid')).toBeVisible();
    const inView = async (sel: string) => {
      const boxes = await page.locator(sel).evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height })));
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(-1);
        expect(b.y).toBeGreaterThanOrEqual(-1);
        expect(b.x + b.w).toBeLessThanOrEqual(r.width + 1);
        expect(b.y + b.h).toBeLessThanOrEqual(r.height + 1);
        expect(Math.min(b.w, b.h)).toBeGreaterThanOrEqual(40); // cible tactile minimale
      }
      return boxes.length;
    };
    expect(await inView('.tile, .topbar .btn')).toBeGreaterThan(4);
    await page.screenshot({ path: `test-results/menu-${r.name}.png` });
    await tapWhen(page, '[data-action=quick]');
    await tapWhen(page, '[data-action=start]');
    await waitPhase(page, 'CoinToss');
    await tapWhen(page, '[data-action=tails]');
    await tapWhen(page, '[data-action=kick]');
    await expect.poll(async () => {
      const p = await phase(page);
      if (p === 'PreSnap') await tap(page, '.ctl-btn[data-id=kick]');
      return p;
    }, { timeout: 60000, intervals: [400] }).toMatch(/LivePlay|PassInFlight|BallDead/);
    expect(await inView('.ctl-btn, .hud-btn.pause, .hud-btn.help')).toBeGreaterThan(2);
    await page.screenshot({ path: `test-results/match-${r.name}.png` });
  
});
}

test.describe('Commandes tactiles', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

  test('multi-touch : joystick tenu + bouton appuyé en même temps', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/dev.html?quality=low');
    await page.mouse.click(400, 200);
    await tapWhen(page, '[data-action="ext:challenges"]');
    await tapWhen(page, '[data-action="play:drive"]');
    await waitPhase(page, 'PlaySelection');
    await tapWhen(page, '[data-action="off:quickSlants"]');
    await waitPhase(page, 'PreSnap');
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    const center = async (sel: string) => {
      const b = await page.locator(sel).boundingBox();
      return { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 };
    };
    const read = () => page.evaluate(() => {
      const c = (window as any).__gd.current.controls;
      const i = c.read({ fx: 0, fy: 1, rx: 1, ry: 0 });
      return { x: i.moveX, y: i.moveY, sprint: i.sprint, stick: c.stickId };
    });
    // doigt 1 : joystick poussé vers le haut et maintenu
    const A = { x: 150, y: 300, id: 1 };
    await touch('touchStart', [A]);
    const A2 = { ...A, y: 250 };
    await touch('touchMove', [A2]);
    expect((await read()).y).toBeGreaterThan(0.5);
    // doigt 2 : HIKE pendant que le joystick reste tenu
    const hike = await center('.ctl-btn[data-id=snap]');
    const B = { ...hike, id: 2 };
    await touch('touchStart', [A2, B]);
    // (CDP) touchEnd liste les doigts qui se lèvent : le doigt 2 se lève, le doigt 1 reste posé
    await touch('touchEnd', [B]);
    await expect.poll(() => phase(page), { timeout: 20000 }).not.toBe('PreSnap');
    let r = await read();
    expect(r.stick).toBe('t1');
    expect(r.y).toBeGreaterThan(0.5);
    // doigt 3 : SPRINT maintenu en même temps que le joystick
    await expect(page.locator('.ctl-btn[data-id=sprint]')).toBeVisible({ timeout: 20000 });
    const sp = await center('.ctl-btn[data-id=sprint]');
    const C = { ...sp, id: 3 };
    await touch('touchStart', [A2, C]);
    r = await read();
    expect(r.sprint).toBe(true);
    expect(r.y).toBeGreaterThan(0.5);
    // on relâche le sprint : le joystick reste actif
    await touch('touchEnd', [C]);
    r = await read();
    expect(r.sprint).toBe(false);
    expect(r.y).toBeGreaterThan(0.5);
    await touch('touchEnd', [A2]);
    r = await read();
    expect(r.stick).toBeNull();
    expect(errors).toEqual([]);
  });
});
