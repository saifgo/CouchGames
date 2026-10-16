/**
 * Runs engine.html in the Android phone's Chrome (via adb intent) for each
 * system: a proxy for "web host on an Android SoC" in ADR-001. Results are
 * POSTed by the page and collected from results/raw.
 *
 *   pnpm tsx scripts/bench-phone-engine.ts [--seconds=20] [--port=8788] [--only=snes,psx]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { lanAddresses } from '@couch/signaling';
import { resultsDir, startLabServer } from './lab-server.js';

const args = process.argv.slice(2);
const arg = (k: string, d: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const seconds = Number(arg('seconds', '20'));
const tap = args.includes('--tap');
const port = Number(arg('port', '8788'));
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const rawDir = `${resultsDir}/raw`;
const adb = (...a: string[]) => execFileSync('adb', a, { encoding: 'utf8' }).trim();

const COMBOS = [
  { system: 'nes', engine: 'ejs', core: 'fceumm' },
  { system: 'snes', engine: 'ejs', core: 'snes9x' },
  { system: 'snes', engine: 'retroarch', core: 'snes9x' },
  { system: 'genesis', engine: 'ejs', core: 'genesis_plus_gx' },
  { system: 'gba', engine: 'ejs', core: 'mgba' },
  { system: 'psx', engine: 'ejs', core: 'pcsx_rearmed' },
  { system: 'nds', engine: 'ejs', core: 'melonds' },
].filter((c) => !only || only.includes(c.system));

const lan = lanAddresses().find((a) => !a.virtual)!;
const srv = await startLabServer({ port });
const base = `http://${lan.address}:${port}`;
const model = adb('shell', 'getprop', 'ro.product.model');
const soc = adb('shell', 'getprop', 'ro.soc.model') || adb('shell', 'getprop', 'ro.board.platform');
console.log(`phone ${model} (${soc}); server ${base}`);
adb('shell', 'svc', 'power', 'stayon', 'usb');
adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');

const results: unknown[] = [];
try {
  for (const c of COMBOS) {
    const before = new Set(existsSync(rawDir) ? readdirSync(rawDir) : []);
    const url = `${base}/lab/engine.html?system=${c.system}&engine=${c.engine}&core=${c.core}&seconds=${seconds}${tap ? '&tapToStart=1' : ''}`;
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${url}'`, 'com.android.chrome');
    if (tap) {
      await new Promise((r) => setTimeout(r, 3500));
      adb('shell', 'input', 'tap', '540', '1300');
    }
    process.stdout.write(`${c.system.padEnd(8)} ${c.engine.padEnd(10)} ${c.core.padEnd(16)} `);
    const deadline = Date.now() + (seconds + 120) * 1000;
    let file: string | undefined;
    while (!file && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1000));
      file = readdirSync(rawDir).find((f) => !before.has(f) && f.includes(`engine-${c.system}-${c.engine}-${c.core}`));
    }
    if (!file) {
      console.log('timeout');
      results.push({ ...c, error: 'timeout' });
      continue;
    }
    const r = JSON.parse(readFileSync(`${rawDir}/${file}`, 'utf8')) as {
      fps: number;
      frameCostMs: { p50: number; p95: number };
      hitchPct: number;
      gl: string;
    };
    results.push(r);
    console.log(`fps ${r.fps.toFixed(1)}  cost p50 ${r.frameCostMs.p50.toFixed(2)} p95 ${r.frameCostMs.p95.toFixed(2)} ms  hitches ${r.hitchPct.toFixed(2)}%  ${r.gl}`);
  }
} finally {
  adb('shell', 'svc', 'power', 'stayon', 'false');
}
const file = `${resultsDir}/engine-phone-${model.replace(/\W+/g, '_')}${tap ? '-tap' : ''}.json`;
writeFileSync(file, JSON.stringify({ date: new Date().toISOString(), model, soc, seconds, results }, null, 2));
console.log(`wrote ${file}`);
await srv.close();
process.exit(0);
