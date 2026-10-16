import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/** Not a test: renders TV + phone screenshots into docs/img/ for review. Run with SHOTS=1. */
const out = fileURLToPath(new URL('../docs/img/', import.meta.url));
test.skip(!process.env.SHOTS, 'set SHOTS=1');

test('screenshots', async ({ browser }) => {
  mkdirSync(out, { recursive: true });
  const hostCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await hostCtx.addInitScript(() => localStorage.setItem('couch.host.settings.v1', JSON.stringify({ onboardingDone: true })));
  const host = await hostCtx.newPage();
  await host.goto('/?autostart=1');
  await expect(host.locator('.lobby .code')).toHaveText(/^[A-Z]{4}$/);
  const room = (await host.locator('.lobby .code').textContent())!;
  await host.waitForTimeout(800);
  await host.screenshot({ path: `${out}tv-home-empty-lobby.png` });
  const phones = [];
  for (const name of ['Omar', 'Lina']) {
    const p = await (await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })).newPage();
    await p.goto(`/c/?r=${room}`);
    await p.locator('input').nth(1).fill(name);
    await p.getByRole('button', { name: 'Join' }).click();
    await expect(p.locator('.badge')).toHaveText(/^P\d$/);
    phones.push(p);
  }
  await host.waitForTimeout(2500);
  await host.screenshot({ path: `${out}tv-home.png` });
  await host.locator('.card').nth(2).click();
  await host.waitForTimeout(400);
  await host.screenshot({ path: `${out}tv-detail.png` });
  await host.locator('.modal button', { hasText: 'Play' }).first().click();
  await expect(host.locator('.loading')).toHaveCount(0, { timeout: 30_000 });
  await host.waitForTimeout(3000);
  await host.keyboard.press('l');
  await host.screenshot({ path: `${out}tv-ingame.png` });
  await phones[0]!.screenshot({ path: `${out}phone-ingame.png` });
  await host.keyboard.press('Escape');
  await host.waitForTimeout(600);
  await host.screenshot({ path: `${out}tv-menu.png` });
  await phones[0]!.screenshot({ path: `${out}phone-tvmenu.png` });
  const join = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 })).newPage();
  await join.goto(`/c/?r=${room}`);
  await join.screenshot({ path: `${out}phone-join.png` });
});
