/** Checks that the controller keeps the phone screen awake (dumpsys power) after a real tap on Join. */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { lanAddresses, startCouchServer } from '@couch/signaling';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const adb = (...a: string[]) => execFileSync('adb', a, { encoding: 'utf8' }).trim();
const srv = await startCouchServer({ port: 8787, log: () => {}, static: [{ prefix: '/c', dir: `${repo}apps/controller-web/dist`, spa: true }, { prefix: '/', dir: `${repo}apps/host-web/dist`, spa: true }] });
const lan = lanAddresses().find((a) => !a.virtual)!;
const browser = await chromium.launch({ channel: 'chromium' });
const host = await browser.newPage();
await host.goto(`${srv.url}/?autostart=1`);
await host.waitForFunction(() => /^[A-Z]{4}$/.test(document.querySelector('.lobby .code')?.textContent ?? ''));
const room = (await host.textContent('.lobby .code'))!;
adb('forward', 'tcp:9333', 'localabstract:chrome_devtools_remote');
for (const t of (await (await fetch('http://localhost:9333/json/list')).json()) as { id: string; url: string; type: string }[])
  if (t.type === 'page' && t.url.startsWith(`http://${lan.address}:87`)) await fetch(`http://localhost:9333/json/close/${t.id}`, { method: 'PUT' });
adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'http://${lan.address}:8787/c/?r=${room}'`, 'com.android.chrome');
await new Promise((r) => setTimeout(r, 4000));
const cdp = await chromium.connectOverCDP('http://localhost:9333');
const page = cdp.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes(room))!;
const box = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('Join'))!.getBoundingClientRect();
  return { x: (b.left + b.width / 2) * devicePixelRatio, y: (b.top + b.height / 2) * devicePixelRatio, top: window.outerHeight * devicePixelRatio - window.innerHeight * devicePixelRatio };
});
console.log('tap join at', box);
adb('shell', 'input', 'tap', String(Math.round(box.x)), String(Math.round(box.y + box.top)));
await new Promise((r) => setTimeout(r, 4000));
const state = await page.evaluate(() => ({ joined: !!document.querySelector('.badge'), video: !!document.querySelector('video'), playing: !(document.querySelector('video') as HTMLVideoElement | null)?.paused, secure: isSecureContext }));
console.log('page', state);
console.log(adb('shell', 'dumpsys power | grep -iE "SCREEN_(BRIGHT|DIM)_WAKE_LOCK|FULL_WAKE|chrome" | head -5'));
await cdp.close();
await browser.close();
await srv.close();
process.exit(0);
