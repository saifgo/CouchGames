import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';

const repo = fileURLToPath(new URL('../', import.meta.url));
const haveGame = existsSync(`${repo}test-roms/nes/240pee.nes`) && existsSync(`${repo}apps/host-web/cores/retroarch/fceumm_libretro.wasm`);

// Tests open their own contexts (TV + phones); close them so a running emulator
// doesn't steal CPU from the next test.
test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close();
});

async function openHost(browser: Browser): Promise<{ host: Page; room: string }> {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('couch.host.settings.v1', JSON.stringify({ onboardingDone: true })));
  const host = await ctx.newPage();
  await host.goto('/?autostart=1');
  const code = host.locator('.lobby .code');
  await expect(code).toHaveText(/^[A-Z]{4}$/, { timeout: 20_000 });
  return { host, room: (await code.textContent())! };
}

async function openPhone(browser: Browser, room: string, name: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const phone = await ctx.newPage();
  await phone.goto(`/c/?r=${room}`);
  await phone.locator('input').nth(1).fill(name);
  await phone.getByRole('button', { name: 'Join' }).click();
  await expect(phone.locator('.badge')).toHaveText(/^P\d$/, { timeout: 20_000 });
  return phone;
}

/** Real pointer press on a rendered control (by skin control id). */
async function press(phone: Page, id: string, ms = 120) {
  const box = (await phone.locator(`[data-id="${id}"]`).first().boundingBox())!;
  await phone.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await phone.mouse.down();
  await phone.waitForTimeout(ms);
  await phone.mouse.up();
}

test('phones pair with the TV, get slots, and see the lobby skin', async ({ browser }) => {
  const { host, room } = await openHost(browser);
  const p1 = await openPhone(browser, room, 'Alice');
  const p2 = await openPhone(browser, room, 'Bob');
  await expect(p1.locator('.badge')).toHaveText('P1');
  await expect(p2.locator('.badge')).toHaveText('P2');
  await expect(host.locator('.topbar-players')).toContainText('Alice');
  await expect(host.locator('.topbar-players')).toContainText('Bob');
  await expect(p1.locator('svg.pad-svg')).toHaveAttribute('data-skin', 'modern');

  // Reconnect keeps the slot: reload phone 1 (same clientId in localStorage).
  await p1.reload();
  await p1.locator('input').nth(1).fill('Alice');
  await p1.getByRole('button', { name: 'Join' }).click();
  await expect(p1.locator('.badge')).toHaveText('P1', { timeout: 20_000 });
});

test('phone d-pad and buttons drive the TV menus', async ({ browser }) => {
  const { host, room } = await openHost(browser);
  const phone = await openPhone(browser, room, 'Nav');
  await host.locator('.home [data-nav]').first().focus();
  const before = await host.evaluate(() => document.activeElement?.textContent);
  await press(phone, 'dpad'); // centre of the d-pad = dead zone → no move
  await press(phone, 'b'); // modern pad bottom button "A" = RetroPad B = confirm
  await expect(host.locator('.modal')).toBeVisible();
  await press(phone, 'a'); // right button = back
  await expect(host.locator('.modal')).toHaveCount(0);
  expect(before).toBeTruthy();
});

test('a game launches, the phone switches skin, input reaches the core, menu works', async ({ browser }) => {
  test.skip(!haveGame, 'run pnpm test-roms && pnpm cores');
  const { host, room } = await openHost(browser);
  const phone = await openPhone(browser, room, 'Player');
  await host.locator('.card', { hasText: '240pee' }).first().click();
  await host.locator('.modal button', { hasText: 'Play' }).first().click();
  await expect(host.locator('.player canvas')).toBeVisible({ timeout: 30_000 });
  await expect(host.locator('.loading')).toHaveCount(0, { timeout: 30_000 });
  await expect(phone.locator('svg.pad-svg')).toHaveAttribute('data-skin', 'nes', { timeout: 10_000 });
  await host.waitForTimeout(2500);
  // The title screen only reacts to START; press it from the phone to reach the menu.
  await press(phone, 'start');
  await host.waitForTimeout(800);
  const shot = async () => createHash('sha1').update(await host.locator('.stage').screenshot()).digest('hex');
  // Menus blink, so compare the *set* of frames seen before and after the press.
  const sample = async () => {
    const set = new Set<string>();
    for (let i = 0; i < 8; i++) {
      set.add(await shot());
      await host.waitForTimeout(120);
    }
    return set;
  };
  const before = await sample();
  // 240p suite menu: d-pad down moves the cursor.
  const dpad = (await phone.locator('[data-id="dpad"]').boundingBox())!;
  await phone.mouse.move(dpad.x + dpad.width / 2, dpad.y + dpad.height * 0.85);
  await phone.mouse.down();
  await phone.waitForTimeout(150);
  await phone.mouse.up();
  await host.waitForTimeout(300);
  const after = await sample();
  expect([...after].some((h) => !before.has(h))).toBe(true);

  // Home button → in-game menu on TV and actions on the phone.
  await press(phone, 'menu');
  await expect(host.locator('.ingame-menu')).toBeVisible();
  await expect(phone.locator('.tvmenu')).toBeVisible();
  await phone.locator('.tvmenu button', { hasText: 'Save state' }).click();
  await phone.locator('.tvmenu button', { hasText: 'Slot 1' }).click();
  await expect(host.locator('.toast')).toContainText('Saved to slot 1', { timeout: 10_000 });
  await phone.locator('.tvmenu button', { hasText: 'Resume' }).click();
  await expect(host.locator('.ingame-menu')).toHaveCount(0);
  await expect(phone.locator('.tvmenu')).toHaveCount(0);
});

test('latency regression: loopback WebRTC p95 stays under 5 ms', async ({ browser }) => {
  const hostPage = await (await browser.newContext()).newPage();
  await hostPage.goto('/lab/host.html');
  const room = (await (await hostPage.waitForFunction(() => (window as never as { __lab?: { room: string } }).__lab?.room)).jsonValue()) as string;
  const phone = await (await browser.newContext()).newPage();
  await phone.goto(`/lab/phone.html?room=${room}&mode=webrtc&n=600&label=ci&autostart=1`);
  const r = (await (
    await phone.waitForFunction(() => (window as never as { __labResult?: unknown }).__labResult, null, { timeout: 60_000 })
  ).jsonValue()) as { halfRtt: { p95: number }; lossPct: number; transport: string };
  console.log(`loopback ${r.transport}: p95 ${r.halfRtt.p95.toFixed(2)} ms, loss ${r.lossPct.toFixed(2)}%`);
  expect(r.transport).toBe('WebRTC P2P');
  expect(r.halfRtt.p95).toBeLessThan(5);
  expect(r.lossPct).toBeLessThan(1);
});
