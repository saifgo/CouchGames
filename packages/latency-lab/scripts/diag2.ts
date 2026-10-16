/** Opens the controller on the phone via intent only (no CDP navigation), then reads PhoneLink.events. */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { lanAddresses, startCouchServer } from '@couch/signaling';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const adb = (...a: string[]) => execFileSync('adb', a, { encoding: 'utf8' }).trim();
const srv = await startCouchServer({ port: 8787, log: (m) => console.log('[server]', m), static: [{ prefix: '/c', dir: `${repo}apps/controller-web/dist`, spa: true }, { prefix: '/', dir: `${repo}apps/host-web/dist`, spa: true }] });
const lan = lanAddresses().find((a) => !a.virtual)!;
const browser = await chromium.launch({ channel: 'chromium' });
const host = await browser.newPage();
await host.goto(`${srv.url}/?autostart=1`);
await host.waitForFunction(() => /^[A-Z]{4}$/.test(document.querySelector('.lobby .code')?.textContent ?? ''));
const room = (await host.textContent('.lobby .code'))!;
// Close stale controller tabs first.
adb('forward', 'tcp:9333', 'localabstract:chrome_devtools_remote');
for (const t of (await (await fetch('http://localhost:9333/json/list')).json()) as { id: string; url: string; type: string }[])
  if (t.type === 'page' && t.url.startsWith(`http://${lan.address}:87`)) await fetch(`http://localhost:9333/json/close/${t.id}`, { method: 'PUT' });
const T = process.env.T ? `&transport=${process.env.T}` : '';
console.log('am start', Date.now());
adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'http://${lan.address}:8787/c/?r=${room}&autojoin=1&name=diag${T}'`, 'com.android.chrome');
await new Promise((r) => setTimeout(r, 15000));
const cdp = await chromium.connectOverCDP('http://localhost:9333');
const phone = cdp.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes(room))!;
const ev = await phone.evaluate(() => (window as never as { __couchPhone: { session: { link: { events: unknown[] } } } }).__couchPhone.session.link.events);
for (const e of ev as { t: number; e: string }[]) console.log(e.t, e.e);
await cdp.close();
await browser.close();
await srv.close();
process.exit(0);
