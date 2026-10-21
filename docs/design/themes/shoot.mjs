// Renders the theme mockups to PNG. Usage: node docs/design/themes/shoot.mjs [ids...]
// Needs PLAYWRIGHT_BROWSERS_PATH and, for the "default" shot, the app running on :8787 (pnpm start).
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
const here = dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const ALL = ['nes','snes','genesis','gb','gbc','gba','psx','n64','psp','nds','ps2','atari2600','pce'];
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['default', ...ALL];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
for (const id of ids) {
  if (id === 'default') {
    await page.goto('http://localhost:8787/', { waitUntil: 'networkidle' }).catch((e) => console.error(e.message));
    await page.keyboard.press('Enter'); await page.waitForTimeout(800);
    await page.getByText("Let’s play").click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(2500);
  } else {
    await page.goto(pathToFileURL(resolve(here, 'mockup.html')).href + '?sys=' + id);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: resolve(here, `shots/${id}.png`) });
  console.log('shot', id);
}
await browser.close();
