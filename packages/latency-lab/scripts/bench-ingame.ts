/**
 * Product-level latency with a real phone: the actual host app (built) runs a
 * game in Chromium on this PC; the Android phone (adb) opens the actual
 * controller page over Wi-Fi and gets real touchscreen taps via `adb input`.
 * Reports host-side clock-synced one-way latency while the emulator runs.
 *
 *   pnpm tsx scripts/bench-ingame.ts [--game=horizontal-shooter] [--seconds=40]
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { lanAddresses, startCouchServer } from '@couch/signaling';
import { resultsDir } from './lab-server.js';

const args = process.argv.slice(2);
const arg = (k: string, d: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const game = arg('game', 'horizontal-shooter');
const seconds = Number(arg('seconds', '40'));
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const adb = (...a: string[]) => execFileSync('adb', a, { encoding: 'utf8' }).trim();

const srv = await startCouchServer({
  port: 8787,
  log: () => {},
  libraryRoots: [
    { dir: `${repo}roms`, source: 'user', urlPrefix: '/roms' },
    { dir: `${repo}test-roms`, source: 'homebrew', urlPrefix: '/test-roms' },
  ],
  static: [
    { prefix: '/c', dir: `${repo}apps/controller-web/dist`, spa: true },
    { prefix: '/cores', dir: `${repo}apps/host-web/cores`, spa: false },
    { prefix: '/', dir: `${repo}apps/host-web/dist`, spa: true },
  ],
});
const lan = lanAddresses().find((a) => !a.virtual)!;
const browser = await chromium.launch({ channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const host = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await host.goto(`${srv.url}/?autostart=1`);
await host.waitForFunction(() => /^[A-Z]{4}$/.test(document.querySelector('.lobby .code')?.textContent ?? ''));
const room = (await host.textContent('.lobby .code'))!;
const model = adb('shell', 'getprop', 'ro.product.model');
const freq = /Frequency: (\d+)/.exec(adb('shell', 'dumpsys wifi | grep -m1 "mWifiInfo"'))?.[1] ?? '?';
console.log(`room ${room}; phone ${model} @ ${freq} MHz`);

// Close controller/lab tabs left by earlier runs (they share the device clientId).
adb('forward', 'tcp:9333', 'localabstract:chrome_devtools_remote');
for (const t of (await (await fetch('http://localhost:9333/json/list')).json()) as { id: string; url: string; type: string }[])
  if (t.type === 'page' && t.url.startsWith(`http://${lan.address}:87`)) await fetch(`http://localhost:9333/json/close/${t.id}`, { method: 'PUT' });
// Landscape like a real player (restored at the end).
const rot = { auto: adb('shell', 'settings', 'get', 'system', 'accelerometer_rotation'), user: adb('shell', 'settings', 'get', 'system', 'user_rotation') };
adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
adb('shell', 'settings', 'put', 'system', 'user_rotation', '1');
adb('shell', 'svc', 'power', 'stayon', 'usb');
adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'http://${lan.address}:8787/c/?r=${room}&autojoin=1&name=${model}'`, 'com.android.chrome');
await host.waitForFunction(() => document.querySelectorAll('.topbar-players .chip').length > 0, null, { timeout: 30_000 });
console.log('phone joined');

await host.locator('.card', { hasText: game }).first().click();
await host.locator('.modal button', { hasText: 'Play' }).first().click();
await host.waitForSelector('.player canvas', { timeout: 30_000 });
await host.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 30_000 });
console.log(`playing ${game}; tapping the phone for ${seconds}s`);

// Screen size → tap the right half (face buttons) and left half (d-pad) alternately.
const size = /(\d+)x(\d+)/.exec(adb('shell', 'wm', 'size'))!;
const [w, h] = [Number(size[2]), Number(size[1])].sort((a, b) => b - a) as [number, number]; // landscape
const t0 = Date.now();
let taps = 0;
while (Date.now() - t0 < seconds * 1000) {
  const right = taps % 2 === 0;
  const x = right ? Math.round(w * 0.82) : Math.round(w * 0.16);
  const y = Math.round(h * 0.6);
  adb('shell', 'input', 'swipe', String(x), String(y), String(x), String(y), '90');
  taps++;
}
const view = await host.evaluate(() => (window as never as { __couch: { session: { view: unknown } } }).__couch.session.view);
adb('shell', 'svc', 'power', 'stayon', 'false');
adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', rot.auto === 'null' ? '1' : rot.auto);
if (rot.user !== 'null') adb('shell', 'settings', 'put', 'system', 'user_rotation', rot.user);
const phoneEvents = await (async () => {
  try {
    const cdp = await chromium.connectOverCDP('http://localhost:9333');
    const page = cdp.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes(room));
    const ev = await page?.evaluate(() => (window as never as { __couchPhone?: { session: { link: { events: unknown[] }; snap: unknown } } }).__couchPhone);
    await cdp.close();
    return ev;
  } catch (e) {
    return String(e);
  }
})();
console.log(JSON.stringify(view, null, 1));
console.log('phone:', JSON.stringify(phoneEvents).slice(0, 1500));
writeFileSync(`${resultsDir}/ingame-${model.replace(/\W+/g, '_')}-${freq}MHz.json`, JSON.stringify({ date: new Date().toISOString(), game, taps, freq, view }, null, 1));
await browser.close();
await srv.close();
process.exit(0);
