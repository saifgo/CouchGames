/**
 * Default box art: one CouchPad-branded cover per console, shown when a game has no cover of its
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
import { COLORS, DRAWINGS, MARK_ON, markSvgBody, type MarkColors, type Variant } from '@couch/design';
import { SYSTEMS } from '../src/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const coverDir = join(root, 'packages/systems/covers');
const pngDir = join(root, 'apps/host-android-tv/app/src/main/res/drawable-nodpi');

/**
 * Cover background: lifted Ink (`--cp-ink-1`). The web (styles.css `.art.default-cover`) and Android
 * hosts fill around a contained cover with the same colour.
 */
export const COVER_BG = '#26211b';
const TEXT = COLORS.cream;
/** Fredoka (SIL OFL 1.1) embedded as a data URL, so each SVG renders the same anywhere, offline. */
const FREDOKA = readFileSync(join(root, 'packages/design/fonts/fredoka-latin.woff2')).toString('base64');
const FONT = "Fredoka, Nunito, ui-rounded, system-ui, sans-serif";

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
/** a·t + b·(1−t) per channel. */
const mix = (a: string, b: string, t: number) => toHex(rgb(a).map((v, i) => v * t + rgb(b)[i]! * (1 - t)));
const luminance = (hex: string) => rgb(hex).reduce((s, v, i) => s + (v / 255) * [0.2126, 0.7152, 0.0722][i]!, 0);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** The CouchPad mark (packages/design) as a nested <svg> at (x, y), w wide. */
function mark(variant: Variant, colors: MarkColors, x: number, y: number, w: number): string {
  const [vx, vy, vw, vh] = DRAWINGS[variant].viewBox;
  return `<svg x="${x}" y="${y}" width="${w}" height="${+((w * vh) / vw).toFixed(2)}" viewBox="${vx} ${vy} ${vw} ${vh}">${markSvgBody(variant, colors)}</svg>`;
}

function cover(sys: (typeof SYSTEMS)[number]): string {
  // Dark brand colours (PSP, PS2) are lifted so the big mark still shows on the dark cover.
  const accent = luminance(sys.accent) < 0.25 ? mix('#ffffff', sys.accent, 0.35) : sys.accent;
  const tint = mix(accent, COVER_BG, 0.3);
  // The rendered PNG, not the SVG: some Commons SVGs (SNES) clip when nested in another SVG.
  const logoPath = join(pngDir, `logo_${sys.id}.png`);
  const logo = existsSync(logoPath)
    ? `<image href="data:image/png;base64,${readFileSync(logoPath).toString('base64')}" x="70" y="92" width="460" height="150" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="300" y="196" text-anchor="middle" font-size="64" font-weight="700" fill="${TEXT}">${esc(sys.name)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800" font-family="${FONT}">
  <style>@font-face{font-family:Fredoka;font-weight:300 700;src:url(data:font/woff2;base64,${FREDOKA}) format('woff2')}</style>
  <rect width="600" height="800" fill="${COVER_BG}"/>
  <rect width="600" height="16" fill="${accent}"/>
  ${logo}
  ${mark('full', { y: tint, i: COVER_BG, p: tint }, 90, 290, 420)}
  <rect x="60" y="626" width="480" height="2" fill="${mix(TEXT, COVER_BG, 0.12)}"/>
  ${mark('cut', MARK_ON.ink, 56, 669, 84)}
  <text x="156" y="728" font-size="44" font-weight="700" letter-spacing="-0.4" fill="${TEXT}">Couch<tspan fill="${COLORS.yellow}">Pad</tspan></text>
  <text x="540" y="726" text-anchor="end" font-size="30" font-weight="600" letter-spacing="2" fill="${mix(accent, TEXT, 0.55)}">${esc(sys.shortName.toUpperCase())}</text>
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
  await page.waitForTimeout(50); // let the embedded font settle before the shot
  await page.locator('#c').screenshot({ path: join(pngDir, `cover_${sys.id}.png`) });
  console.log(`✓ cover_${sys.id}  (svg + png)`);
}
await browser.close();
