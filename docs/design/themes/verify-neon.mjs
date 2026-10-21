// Checks that a theme never moves components: switches through every console in the real app,
// records component boxes, and compares them across consoles and with Midnight. Saves screenshots.
// Usage (app on :8787): node docs/design/themes/verify-neon.mjs [theme]
import { chromium } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

const here = dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const theme = process.argv[2] ?? 'neon';
const out = resolve(here, `shots/app-${theme}`);
mkdirSync(out, { recursive: true });
const SEL = ['.topbar', '.preview', '.preview-screen', '.details', '.players-panel', '.platforms', '.wheel', '.hints', '.details-title', '.details-system', '.facts', '.press-play',
  '.lobby-head', '.lobby-qr', '.code', '.lobby-url', '.slots', '.card:nth-child(1) .card-frame', '.card:nth-child(2) .card-frame', '.card:nth-child(1) .card-title', '.platform:nth-child(1)', '.logo', '.clock'];

const browser = await chromium.launch();
async function run(th, shots) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.addInitScript((t) => {
    const k = 'couch.host.settings.v1';
    const s = JSON.parse(localStorage.getItem(k) ?? '{}');
    localStorage.setItem(k, JSON.stringify({ ...s, theme: t, onboardingDone: true }));
  }, th);
  await page.goto('http://localhost:8787/', { waitUntil: 'networkidle' });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  await page.getByText('Let’s play').click({ timeout: 2000 }).catch(() => {});
  await page.waitForSelector('.home .platform');
  await page.evaluate(() => document.fonts.ready);
  const n = await page.locator('.platform').count();
  const res = {};
  for (let i = 0; i < n; i++) {
    const p = page.locator('.platform').nth(i);
    await p.focus();
    await page.waitForTimeout(700);
    const sys = await page.locator('.home').getAttribute('data-sys');
    // Measure with the platform focused, like a user browsing consoles.
    res[sys] = await page.evaluate((sels) => Object.fromEntries(sels.map((s) => {
      const e = document.querySelector('.home ' + s);
      if (!e) return [s, null];
      // Unscaled layout box: offset sizes ignore transforms (focus scale).
      const r = e.getBoundingClientRect();
      return [s, [Math.round(r.left), Math.round(r.top), e.offsetWidth, e.offsetHeight]];
    })), SEL);
    if (shots) await page.screenshot({ path: resolve(out, `${sys}.png`) });
  }
  await page.close();
  return res;
}

const a = await run(theme, true);
const ref = Object.values(a)[0];
let diffs = 0;
for (const [sys, boxes] of Object.entries(a)) {
  for (const s of SEL) {
    if (s === '.logo') continue;
    if (JSON.stringify(boxes[s]) !== JSON.stringify(ref[s])) { diffs++; console.log(`[${theme}] ${sys} ${s}: ${JSON.stringify(boxes[s])} vs ${JSON.stringify(ref[s])}`); }
  }
}
console.log(`${theme}: ${Object.keys(a).length} consoles (${Object.keys(a).join(', ')}), ${diffs} box differences between consoles`);
if (theme !== 'midnight') {
  const m = await run('midnight', false);
  const mref = Object.values(m)[0];
  let d2 = 0;
  for (const s of SEL) if (JSON.stringify(mref[s]) !== JSON.stringify(ref[s])) { d2++; console.log(`vs midnight ${s}: ${JSON.stringify(ref[s])} vs ${JSON.stringify(mref[s])}`); }
  console.log(`${theme} vs midnight: ${d2} box differences`);
}
await browser.close();
