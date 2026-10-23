// Renders every <section class="asset"> in art.html to out/.
// Run from the repo root: node apps/host-android-tv/play-store/render.mjs
//
// out/
//   icon-512.png, icon-pro-512.png         app icon (32-bit PNG)
//   feature-graphic-1024x500.jpg           feature graphic
//   tv-banner-1280x720.jpg                 Android TV banner
//   tv/        1920 x 1080  Android TV screenshots
//   phone/     1080 x 1920  phone screenshots
//   tablet-7/  1920 x 1200  7" tablet screenshots
//   tablet-10/ 2560 x 1600  10" tablet screenshots (tablet art at 4/3 scale)
import { chromium } from '@playwright/test';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) rmSync(join(out, f), { recursive: true, force: true });
for (const d of ['tv', 'phone', 'tablet-7', 'tablet-10']) mkdirSync(join(out, d), { recursive: true });

// Play rejects alpha in the feature graphic and screenshots, so only the icons stay PNG.
const brand = {
  icon: 'icon-512.png',
  'icon-pro': 'icon-pro-512.png',
  feature: 'feature-graphic-1024x500.jpg',
  'tv-banner': 'tv-banner-1280x720.jpg',
};

const browser = await chromium.launch();

async function open(scale) {
  const page = await browser.newPage({ viewport: { width: 2200, height: 2200 }, deviceScaleFactor: scale });
  await page.goto(pathToFileURL(join(here, 'art.html')).href);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  return page;
}

async function shoot(page, id, path) {
  const type = path.endsWith('.png') ? 'png' : 'jpeg';
  await page.locator(`#${id}`).screenshot({ path, type, ...(type === 'jpeg' ? { quality: 92 } : { omitBackground: true }) });
  console.log(path.slice(out.length + 1));
}

const page = await open(1);
for (const id of await page.$$eval('section.asset', (els) => els.map((e) => e.id))) {
  if (brand[id]) await shoot(page, id, join(out, brand[id]));
  else if (id.startsWith('tablet-')) await shoot(page, id, join(out, 'tablet-7', `${id.replace('tablet-', 'tablet-7-')}.jpg`));
  else await shoot(page, id, join(out, id.split('-')[0], `${id}.jpg`));
}
await page.close();

const big = await open(4 / 3);
for (const id of await big.$$eval('section[data-fmt="tablet"]', (els) => els.map((e) => e.id)))
  await shoot(big, id, join(out, 'tablet-10', `${id.replace('tablet-', 'tablet-10-')}.jpg`));

await browser.close();
