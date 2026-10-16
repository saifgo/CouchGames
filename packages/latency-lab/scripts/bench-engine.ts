/**
 * Runs engine.html for each system/engine/core combo in Chromium and writes
 * results/engine-<machine>.json.
 *
 *   pnpm bench:engine [--headed] [--seconds=20] [--only=snes,n64]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, hostname, totalmem } from 'node:os';
import { chromium } from 'playwright';
import { resultsDir, startLabServer } from './lab-server.js';

const args = process.argv.slice(2);
const headed = args.includes('--headed');
const seconds = Number(args.find((a) => a.startsWith('--seconds='))?.slice(10) ?? 20);
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');

const COMBOS: { system: string; engine: string; core: string; coi?: boolean }[] = [
  { system: 'nes', engine: 'retroarch', core: 'fceumm' },
  { system: 'nes', engine: 'ejs', core: 'fceumm' },
  { system: 'snes', engine: 'retroarch', core: 'snes9x' },
  { system: 'snes', engine: 'ejs', core: 'snes9x' },
  { system: 'genesis', engine: 'retroarch', core: 'genesis_plus_gx' },
  { system: 'genesis', engine: 'ejs', core: 'genesis_plus_gx' },
  { system: 'gba', engine: 'ejs', core: 'mgba' },
  { system: 'psx', engine: 'retroarch', core: 'pcsx_rearmed' },
  { system: 'psx', engine: 'ejs', core: 'pcsx_rearmed' },
  { system: 'n64', engine: 'ejs', core: 'mupen64plus_next' },
  { system: 'n64', engine: 'ejs', core: 'parallel_n64' },
  // pthread builds (SharedArrayBuffer → needs COOP/COEP cross-origin isolation)
  { system: 'psx', engine: 'ejs-thread', core: 'pcsx_rearmed', coi: true },
  { system: 'n64', engine: 'ejs-thread', core: 'mupen64plus_next', coi: true },
  { system: 'psp', engine: 'ejs-thread', core: 'ppsspp', coi: true },
  { system: 'nds', engine: 'ejs', core: 'melonds' },
  { system: 'nds', engine: 'ejs', core: 'desmume2015' },
];
// N64 (mupen64plus_next / parallel_n64) crashes at plugin_start_gfx under Nostalgist; see ADR-001.
const SKIP_BY_DEFAULT = new Set(['n64']);

/**
 * Does injected input reach the core? Compare compositor screenshots of the game
 * canvas: idle vs idle (detects attract-mode animation → inconclusive), then after
 * a few presses of DOWN / START / A / B.
 */
async function checkInput(page: import('playwright').Page): Promise<boolean | null> {
  const shot = async () => (await page.locator('#stage').screenshot()).toString('base64');
  await page.evaluate(() => (document.getElementById('hud')!.style.display = 'none'));
  await page.waitForTimeout(3000);
  const a1 = await shot();
  await page.waitForTimeout(700);
  const a2 = await shot();
  const press = async (id: number) => {
    await page.evaluate((i) => (window as never as { __press: (i: number, d: boolean) => void }).__press(i, true), id);
    await page.waitForTimeout(150);
    await page.evaluate((i) => (window as never as { __press: (i: number, d: boolean) => void }).__press(i, false), id);
    await page.waitForTimeout(250);
  };
  for (let i = 0; i < 3; i++) for (const id of [5, 3, 8, 0]) await press(id);
  await page.waitForTimeout(800);
  const b = await shot();
  await page.evaluate(() => (document.getElementById('hud')!.style.display = ''));
  if (a1 !== a2) return b !== a2 ? null : false; // animated screen: change is not proof
  return b !== a2;
}

const combos = COMBOS.filter((c) => (only ? only.includes(c.system) : !SKIP_BY_DEFAULT.has(c.system)));
const results: unknown[] = [];

for (const coi of [false, true]) {
  const group = combos.filter((c) => !!c.coi === coi);
  if (!group.length) continue;
  const srv = await startLabServer({ coi });
  const browser = await chromium.launch({
    headless: !headed,
    channel: headed ? undefined : 'chromium',
    args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
  });
  for (const c of group) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const logs: string[] = [];
    page.on('console', (m) => logs.push(m.text()));
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
    const url = `${srv.url}/lab/engine.html?system=${c.system}&engine=${c.engine}&core=${c.core}&seconds=${seconds}&wait=1`;
    process.stdout.write(`${c.system.padEnd(8)} ${c.engine.padEnd(10)} ${c.core.padEnd(18)} `);
    try {
      await page.goto(url);
      await page.waitForFunction(
        () => (window as never as { __ready?: boolean }).__ready || (window as never as { __engineError?: string }).__engineError,
        null,
        { timeout: 90_000, polling: 250 },
      );
      const err = await page.evaluate(() => (window as never as { __engineError?: string }).__engineError);
      if (err) throw new Error(err);
      const inputReachedCore = await checkInput(page);
      await page.evaluate(() => (window as never as { __startMeasure: () => void }).__startMeasure());
      const handle = await page.waitForFunction(
        () => (window as never as { __engineResult?: unknown; __engineError?: string }).__engineResult ?? (window as never as { __engineError?: string }).__engineError,
        null,
        { timeout: (seconds + 90) * 1000, polling: 500 },
      );
      const r = (await handle.jsonValue()) as
        | string
        | {
            fps: number;
            frameCostMs: { p50: number; p95: number };
            hitchPct: number;
            overBudgetPct: number;
            inputReachedCore: boolean | null;
            launchMs: number;
          };
      if (typeof r === 'string') throw new Error(r);
      r.inputReachedCore = inputReachedCore;
      results.push(r);
      console.log(
        `fps ${r.fps.toFixed(1).padStart(5)}  cost p50 ${r.frameCostMs.p50.toFixed(2)} p95 ${r.frameCostMs.p95.toFixed(2)} ms  hitches ${r.hitchPct.toFixed(2)}%  input ${r.inputReachedCore}  launch ${r.launchMs.toFixed(0)} ms`,
      );
      await page.screenshot({ path: `${resultsDir}/raw/engine-${c.system}-${c.engine}-${c.core}.png` });
    } catch (err) {
      console.log(`FAILED: ${(err as Error).message.split('\n')[0]}`);
      results.push({ ...c, error: (err as Error).message.split('\n')[0], logs: logs.slice(-15) });
    }
    await page.close();
  }
  await browser.close();
  await srv.close();
}

mkdirSync(resultsDir, { recursive: true });
const machine = { hostname: hostname(), cpu: cpus()[0]?.model, cores: cpus().length, ramGb: Math.round(totalmem() / 2 ** 30) };
const file = `${resultsDir}/engine-${hostname().toLowerCase()}${headed ? '-headed' : ''}.json`;
writeFileSync(file, JSON.stringify({ machine, seconds, date: new Date().toISOString(), results }, null, 2));
console.log(`\nwrote ${file}`);
