/** Diagnostics: host app on PC + controller on the real phone, logs phone-side state via CDP. */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { lanAddresses, startCouchServer } from '@couch/signaling';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const adb = (...a: string[]) => execFileSync('adb', a, { encoding: 'utf8' }).trim();
const srv = await startCouchServer({
  port: 8787,
  log: (m) => console.log('[server]', m),
  libraryRoots: [{ dir: `${repo}test-roms`, source: 'homebrew', urlPrefix: '/test-roms' }],
  static: [
    { prefix: '/c', dir: `${repo}apps/controller-web/dist`, spa: true },
    { prefix: '/cores', dir: `${repo}apps/host-web/cores`, spa: false },
    { prefix: '/', dir: `${repo}apps/host-web/dist`, spa: true },
  ],
});
const lan = lanAddresses().find((a) => !a.virtual)!;
const browser = await chromium.launch({ channel: 'chromium' });
const host = await browser.newPage();
host.on('console', (m) => console.log('[host]', m.text().slice(0, 200)));
await host.goto(`${srv.url}/?autostart=1`);
await host.waitForFunction(() => /^[A-Z]{4}$/.test(document.querySelector('.lobby .code')?.textContent ?? ''));
const room = (await host.textContent('.lobby .code'))!;
adb('forward', 'tcp:9333', 'localabstract:chrome_devtools_remote');
adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'http://${lan.address}:8787/c/?r=${room}&autojoin=1&name=diag'`, 'com.android.chrome');
await new Promise((r) => setTimeout(r, 4000));
const cdp = await chromium.connectOverCDP('http://localhost:9333');
const pages = cdp.contexts().flatMap((c) => c.pages());
console.log('phone pages:', pages.map((p) => p.url()).filter((u) => u.includes('192.168')));
const phone = pages.find((p) => p.url().includes(room)) ?? pages.find((p) => p.url().includes('/c/'))!;
if (!phone.url().includes(room)) await phone.goto(`http://${lan.address}:8787/c/?r=${room}&autojoin=1&name=diag${process.env.T ? `&transport=${process.env.T}` : ''}`);
phone.on('console', (m) => console.log('[phone]', m.text().slice(0, 200)));
const t0 = Date.now();
await phone.evaluate(() => {
  const w = window as never as { __trace: unknown[]; __couchPhone?: { session: { link: { on: (e: string, f: (...a: unknown[]) => void) => void; transport: number } } } };
  w.__trace = [];
  const start = performance.now();
  const link = w.__couchPhone!.session.link;
  link.on('transport', (t) => w.__trace.push(['transport', Math.round(performance.now() - start), t]));
  link.on('state', (st) => w.__trace.push(['state', Math.round(performance.now() - start), st]));
  // Sample echo RTTs as they arrive.
  const ring = (w.__couchPhone!.session as unknown as { rtt: { values(): number[] } }).rtt;
  let n = 0;
  setInterval(() => {
    const v = ring.values();
    if (v.length !== n) {
      w.__trace.push(['rtt', Math.round(performance.now() - start), v.slice(Math.max(0, n - (v.length > n ? 0 : 0))).slice(-Math.max(1, v.length - n)).map((x) => Math.round(x))]);
      n = v.length;
    }
  }, 500);
});
await new Promise((r) => setTimeout(r, 20000));
const trace = await phone.evaluate(() => (window as never as { __trace: unknown[] }).__trace);
for (const t of trace as unknown[][]) console.log(JSON.stringify(t).slice(0, 300));
console.log('elapsed', Date.now() - t0);
await cdp.close();
await browser.close();
await srv.close();
process.exit(0);
