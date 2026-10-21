/**
 * Default box art: one Couch-branded cover per console, shown when a game has no cover of its
 * own (online art off, not found, or homebrew). Flat colours, no gradients.
 *
 * 1. Writes packages/systems/covers/<system>.svg (used by the web host). The console logo is
 *    embedded (the wheel's logo_<system>.png from `pnpm logos`), so each file stands alone.
 * 2. Renders each SVG to apps/host-android-tv/app/src/main/res/drawable-nodpi/cover_<system>.png
 *    with headless Chromium, so Android shows exactly what the browser shows.
 *
 *   pnpm covers      (run `pnpm logos` first if a logo is missing)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { SYSTEMS } from '../src/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const coverDir = join(root, 'packages/systems/covers');
const pngDir = join(root, 'apps/host-android-tv/app/src/main/res/drawable-nodpi');

/** Cover background. The web and Android hosts fill around a contained cover with the same colour. */
export const COVER_BG = '#11151d';
const BRAND = '#ffd166';
const TEXT = '#eef2f8';
const FONT = "'Segoe UI', system-ui, -apple-system, Roboto, sans-serif";

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
/** a·t + b·(1−t) per channel. */
const mix = (a: string, b: string, t: number) => toHex(rgb(a).map((v, i) => v * t + rgb(b)[i]! * (1 - t)));
const luminance = (hex: string) => rgb(hex).reduce((s, v, i) => s + (v / 255) * [0.2126, 0.7152, 0.0722][i]!, 0);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** The Couch mark (triangle + circle) on its 44 × 20 grid. */
const MARK = '<path d="M10 2.5 19 18H1z"/><circle cx="33" cy="10.5" r="7.5"/>';

function cover(sys: (typeof SYSTEMS)[number]): string {
  // Dark brand colours (PSP, PS2) are lifted so the big mark still shows on the dark cover.
  const accent = luminance(sys.accent) < 0.25 ? mix('#ffffff', sys.accent, 0.35) : sys.accent;
  // The rendered PNG, not the SVG: some Commons SVGs (SNES) clip when nested in another SVG.
  const logoPath = join(pngDir, `logo_${sys.id}.png`);
  const logo = existsSync(logoPath)
    ? `<image href="data:image/png;base64,${readFileSync(logoPath).toString('base64')}" x="70" y="92" width="460" height="150" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="300" y="196" text-anchor="middle" font-size="64" font-weight="800" fill="${TEXT}">${esc(sys.name)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800" font-family="${FONT}">
  <rect width="600" height="800" fill="${COVER_BG}"/>
  <rect width="600" height="16" fill="${accent}"/>
  ${logo}
  <g transform="translate(60 322) scale(10.9)" fill="${mix(accent, COVER_BG, 0.3)}">${MARK}</g>
  <rect x="60" y="626" width="480" height="2" fill="${mix(TEXT, COVER_BG, 0.12)}"/>
  <g transform="translate(60 682) scale(1.8)" fill="${BRAND}">${MARK}</g>
  <text x="152" y="714" font-size="38" font-weight="800" fill="${TEXT}">Couch</text>
  <text x="540" y="712" text-anchor="end" font-size="26" font-weight="700" letter-spacing="2" fill="${mix(accent, TEXT, 0.55)}">${esc(sys.shortName.toUpperCase())}</text>
</svg>
`;
}

mkdirSync(coverDir, { recursive: true });
mkdirSync(pngDir, { recursive: true });
for (const sys of SYSTEMS) writeFileSync(join(coverDir, `${sys.id}.svg`), cover(sys));

// 450 × 600 px: sharp at the detail dialog's 260 dp on a 1080p TV, small enough for the APK.
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const sys of SYSTEMS) {
  const src = `data:image/svg+xml;base64,${Buffer.from(cover(sys)).toString('base64')}`;
  await page.setContent(`<html><body style="margin:0"><img id="c" src="${src}" style="width:450px;height:600px;display:block"></body></html>`);
  await page.waitForFunction(() => (document.getElementById('c') as HTMLImageElement).complete);
  await page.locator('#c').screenshot({ path: join(pngDir, `cover_${sys.id}.png`) });
  console.log(`✓ cover_${sys.id}  (svg + png)`);
}
await browser.close();
