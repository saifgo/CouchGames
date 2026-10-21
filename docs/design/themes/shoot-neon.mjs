// Renders the Neon Arcade mockups to PNG. Usage: node docs/design/themes/shoot-neon.mjs [look:sys ...]
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
const here = dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const LOOKS = ['synth', 'signs', 'grid'];
const SYSS = ['snes', 'nes', 'genesis', 'gb', 'psx', 'n64'];
const jobs = process.argv.slice(2).length ? process.argv.slice(2) : LOOKS.flatMap((l) => SYSS.map((s) => `${l}:${s}`));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
for (const job of jobs) {
  const [look, sys] = job.split(':');
  await page.goto(pathToFileURL(resolve(here, 'neon.html')).href + `?look=${look}&sys=${sys}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(here, `shots/neon/${look}-${sys}.png`) });
  console.log('shot', job);
}
await browser.close();
// Contact sheets: one image per look with six consoles side by side.
const b2 = await chromium.launch();
const p2 = await b2.newPage({ viewport: { width: 1920, height: 760 } });
for (const look of LOOKS) {
  await p2.goto(pathToFileURL(resolve(here, 'neon-sheet.html')).href + `?look=${look}`);
  await p2.waitForLoadState('networkidle');
  await p2.screenshot({ path: resolve(here, `shots/neon/sheet-${look}.png`), fullPage: true });
}
await b2.close();
