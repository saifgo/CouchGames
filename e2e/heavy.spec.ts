import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/** M4: heavier systems on the web host (desktop-class only, ADR-001). */
const repo = fileURLToPath(new URL('../', import.meta.url));
const has = (p: string) => existsSync(`${repo}${p}`);

async function launch(page: Page, base: string, title: string) {
  await page.addInitScript(() => {
    const k = 'couch.host.settings.v1';
    localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) ?? '{}'), onboardingDone: true }));
  });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${base}/?autostart=1`);
  await page.locator('.card', { hasText: title }).first().click();
  await page.locator('.modal button', { hasText: 'Play' }).first().click();
  await expect(page.locator('.player canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.loading')).toHaveCount(0, { timeout: 60_000 });
  // Running = the engine reports a frame rate after a few seconds.
  await page.keyboard.press('l');
  await expect(page.locator('.latency-overlay')).toContainText(/[1-9]\d?\.\d fps/, { timeout: 20_000 });
  await page.waitForTimeout(6000); // past boot
  const text = (await page.locator('.latency-overlay').textContent()) ?? '';
  const fps = Number(/([\d.]+) fps/.exec(text)?.[1]);
  expect(fps).toBeGreaterThan(50);
  return text;
}

test('NDS (melonDS, EmulatorJS build) runs on the web host', async ({ page, baseURL }) => {
  test.skip(!has('test-roms/nds') || !has('apps/host-web/cores/ejs/melonds_libretro.wasm'), 'needs pnpm test-roms && pnpm cores');
  console.log(await launch(page, baseURL!, 'ds-craft'));
});

test('PSP (PPSSPP pthread build) runs when cross-origin isolated', async ({ page }) => {
  test.skip(!has('test-roms/psp') || !has('apps/host-web/cores/ejs-thread/ppsspp_libretro.wasm'), 'needs pnpm test-roms && pnpm cores');
  // Enable the experimental flag before the app reads settings.
  await page.addInitScript(() => localStorage.setItem('couch.host.settings.v1', JSON.stringify({ experimentalPsp: true })));
  console.log(await launch(page, 'http://localhost:8798', 'BounceZero'));
});

test('PS1 (pcsx_rearmed) runs on a desktop-class host', async ({ page, baseURL }) => {
  test.skip(!has('test-roms/psx/celeste.cue'), 'needs pnpm test-roms');
  console.log(await launch(page, baseURL!, 'celeste'));
});
