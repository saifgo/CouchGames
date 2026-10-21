// Renders every <section class="asset"> in art.html to out/.
// Run from the repo root: node apps/host-android-tv/play-store/render.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
mkdirSync(out, { recursive: true });

// Play rejects alpha in the feature graphic and screenshots, so only the icon stays PNG.
const files = {
  icon: 'icon-512.png',
  'icon-pro': 'icon-pro-512.png',
  feature: 'feature-graphic-1024x500.jpg',
  'tv-banner': 'tv-banner-1280x720.jpg',
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2100, height: 1200 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(here, 'art.html')).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));

for (const id of await page.$$eval('section.asset', (els) => els.map((e) => e.id))) {
  const name = files[id] ?? `screenshot-${id}.jpg`;
  const type = name.endsWith('.png') ? 'png' : 'jpeg';
  await page.locator(`#${id}`).screenshot({ path: join(out, name), type, ...(type === 'jpeg' ? { quality: 92 } : { omitBackground: true }) });
  console.log(name);
}
await browser.close();
