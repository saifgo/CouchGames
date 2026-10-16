/** Launches each test ROM on the Android host via couch://game/<id>, records fps from logcat + a screenshot. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const env = { ...process.env, MSYS_NO_PATHCONV: '1' };
const adb = (...a: string[]) => execFileSync('adb', a, { encoding: 'utf8', env });
const only = process.argv[2]?.split(',');
const games = [
  ['nes', '240pee.nes'],
  ['snes', 'horizontal-shooter.sfc'],
  ['genesis', 'bombx.bin'],
  ['gba', '240pee_mb.gba'],
  ['psx', 'celeste.cue'],
  ['n64', 'FlappyBird-v1.7.z64'],
  ['n64', 'gamejam2024.z64'],
  ['psp', 'BounceZero.pbp'],
  ['nds', 'ds-craft-beta1.7.1.nds'],
].filter(([s]) => !only || only.includes(s!));
const results: Record<string, unknown>[] = [];
for (const [sys, file] of games) {
  const size = statSync(`${repo}test-roms/${sys}/${file}`).size;
  const id = createHash('sha1').update(`${sys}/${file}/${size}`).digest('hex').slice(0, 12);
  adb('logcat', '-c');
  adb('shell', 'am', 'start', '-S', '-a', 'android.intent.action.VIEW', '-d', `couch://game/${id}`, '-n', 'app.couch.tv/.MainActivity');
  process.stdout.write(`${sys.padEnd(8)} ${file.padEnd(26)} `);
  await new Promise((r) => setTimeout(r, 45_000)); // core download + boot + two 5 s fps windows
  const log = adb('logcat', '-d', '-s', 'Couch', 'libretrodroid', 'AndroidRuntime');
  const fps = [...log.matchAll(/fps ([\d.]+) system=(\w+) core=(\w+)/g)].map((m) => Number(m[1]));
  const core = /core=(\w+)/.exec(log)?.[1] ?? '?';
  const crash = /FATAL|AndroidRuntime: (?!Shutting)/.test(log);
  writeFileSync(`${repo}packages/latency-lab/results/raw/android-${sys}-${file}.png`, execFileSync('adb', ['exec-out', 'screencap', '-p'], { env }));
  const steady = fps.slice(1);
  const avg = steady.length ? steady.reduce((a, b) => a + b, 0) / steady.length : NaN;
  console.log(`core ${core.padEnd(24)} fps ${fps.map((f) => f.toFixed(1)).join(' ')}${crash ? '  CRASH' : ''}`);
  results.push({ sys, file, core, fps, avg, crash });
}
const model = adb('shell', 'getprop', 'ro.product.model').trim();
writeFileSync(`${repo}packages/latency-lab/results/android-systems-${model}.json`, JSON.stringify({ date: new Date().toISOString(), model, results }, null, 1));
adb('shell', 'am', 'force-stop', 'app.couch.tv');
