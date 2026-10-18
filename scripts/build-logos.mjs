#!/usr/bin/env node
/**
 * Console logos for the platform wheel (owner decision 2026-10-18: official logos, not drawings).
 *
 * 1. Downloads each logo SVG from Wikimedia Commons (all marked public domain there; the
 *    brands are still trademarks of their owners, see docs/LICENSES.md).
 * 2. For logos with black or very dark parts, turns those parts white so they read on the
 *    TV's dark background. Writes packages/systems/logos/<system>.svg (used by the web host).
 * 3. Renders each SVG to apps/host-android-tv/app/src/main/res/drawable-nodpi/logo_<system>.png
 *    with headless Chromium, so Android shows exactly what the browser shows.
 *
 *   node scripts/build-logos.mjs            # render PNGs; download only missing SVGs
 *   node scripts/build-logos.mjs --fetch    # re-download and re-process every SVG
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svgDir = join(root, 'packages/systems/logos');
const pngDir = join(root, 'apps/host-android-tv/app/src/main/res/drawable-nodpi');
const refetch = process.argv.includes('--fetch');

/**
 * Commons file per system. `light` = colours darker than this luminance turn white, so the logo
 * reads on the dark background (0 = keep the original colours).
 */
export const LOGOS = {
  nes: { file: 'NES logo.svg', light: 0.06 },
  snes: { file: 'SNES logo.svg', light: 0 },
  genesis: { file: 'Sega genesis logo.svg', light: 0 },
  gb: { file: 'Nintendo Game Boy Logo.svg', light: 0.15 }, // dark blue → white
  gbc: { file: 'Game Boy Color logo.svg', light: 0 },
  gba: { file: 'Game Boy Advance logo.svg', light: 0 },
  psx: { file: 'PlayStation logo and wordmark.svg', light: 0.06 },
  n64: { file: 'Nintendo 64 wordmark.svg', light: 0.06 },
  psp: { file: 'PSP Logo.svg', light: 0.06 },
  nds: { file: 'Nintendo DS Logo.svg', light: 0.06 },
  ps2: { file: 'PlayStation 2 logo.svg', light: 0.06 },
  atari2600: { file: 'Atari 2600 logo.svg', light: 0 },
};

const UA = { 'User-Agent': 'couch-emulation build-logos (https://github.com/; dev script)' };

/** Relative luminance of a #rgb / #rrggbb colour, 0 (black) … 1 (white). */
function luminance(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Dark colours → white, so black lettering shows on a dark screen. Brand colours stay. */
export function lighten(svg, below = 0.06) {
  let out = svg.replace(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])/g, (m) => (luminance(m) < below ? '#ffffff' : m));
  out = out.replace(/((?:fill|stroke)\s*[:=]\s*["']?)black\b/gi, '$1#ffffff');
  out = out.replace(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g, (m, r, g, b) =>
    luminance('#' + [r, g, b].map((v) => Number(v).toString(16).padStart(2, '0')).join('')) < below ? '#ffffff' : m,
  );
  // Shapes without a fill are black by default: make the default white.
  out = out.replace(/<svg\b([^>]*)>/, (m, attrs) => (/\sfill\s*=/.test(attrs) ? m : `<svg${attrs} fill="#ffffff">`));
  return out;
}

async function fetchSvg(file) {
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replaceAll(' ', '_'))}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: UA, redirect: 'follow' });
    if (res.ok) return res.text();
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1))); // Commons rate-limits bursts
  }
  throw new Error(`could not download ${file}`);
}

mkdirSync(svgDir, { recursive: true });
mkdirSync(pngDir, { recursive: true });
for (const [id, { file, light }] of Object.entries(LOGOS)) {
  const out = join(svgDir, `${id}.svg`);
  if (existsSync(out) && !refetch) continue;
  const raw = await fetchSvg(file);
  writeFileSync(out, light > 0 ? lighten(raw, light) : raw);
  console.log(`↓ ${id}.svg  (${file})`);
  await new Promise((r) => setTimeout(r, 1500));
}

// Render for Android: 160 px tall (crisp on 4K TVs at the wheel's ~40 dp), width follows.
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const id of Object.keys(LOGOS)) {
  const svg = readFileSync(join(svgDir, `${id}.svg`), 'utf8');
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  await page.setContent(`<html><body style="margin:0;background:transparent"><img id="l" src="${src}" style="height:160px;max-width:720px;object-fit:contain;display:block"></body></html>`);
  await page.waitForFunction(() => document.getElementById('l').complete);
  await page.locator('#l').screenshot({ path: join(pngDir, `logo_${id}.png`), omitBackground: true });
  console.log(`✓ logo_${id}.png`);
}
await browser.close();
