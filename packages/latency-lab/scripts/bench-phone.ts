/**
 * Real-phone latency run over Wi-Fi (ADR-002).
 *
 * The PC runs the couch server + lab host page (Chromium). An Android phone on
 * the same Wi-Fi opens phone.html in its own Chrome; adb (USB) is only used to
 * open the URL and read the Wi-Fi band. Test packets travel over the radio.
 * The phone page POSTs its result to the server, which saves it in results/raw.
 *
 *   pnpm bench:phone [--n=2000] [--label=home] [--modes=webrtc,ws] [--port=8787]
 *
 * Without adb: open http://<pc-lan-ip>:<port>/lab/phone.html?room=XXXX on the phone.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { lanAddresses } from '@couch/signaling';
import { resultsDir, startLabServer } from './lab-server.js';

const args = process.argv.slice(2);
const arg = (k: string, d: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const n = Number(arg('n', '2000'));
const label = arg('label', 'wifi');
const modes = arg('modes', 'webrtc,ws').split(',');
const port = Number(arg('port', '8787'));
const rawDir = `${resultsDir}/raw`;

const adb = (...a: string[]) => execFileSync('adb', a, { encoding: 'utf8' }).trim();
const log = (m: string) => console.log(m);

const lan = lanAddresses().find((a) => !a.virtual) ?? lanAddresses()[0];
if (!lan) throw new Error('no LAN address: is the PC on Wi-Fi/Ethernet?');

const srv = await startLabServer({ port });
const base = `http://${lan.address}:${port}`;
log(`lab server at ${base}`);
const browser = await chromium.launch({ channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const host = await browser.newPage();
await host.goto(`${srv.url}/lab/host.html`);
const code = (await (await host.waitForFunction(() => (window as never as { __lab?: { room: string } }).__lab?.room)).jsonValue()) as string;
log(`room ${code}`);

let devices: string[] = [];
try {
  devices = adb('devices').split('\n').slice(1).filter((l) => l.endsWith('device')).map((l) => l.split('\t')[0]!);
} catch {
  /* no adb */
}
if (!devices.length) {
  log(`No adb device. On the phone open:\n  ${base}/lab/phone.html?room=${code}&n=${n}\nResults are saved into results/raw. Ctrl+C to stop.`);
  await new Promise(() => {});
}
const model = adb('shell', 'getprop', 'ro.product.model');
const freq = /Frequency: (\d+)/.exec(adb('shell', 'dumpsys wifi | grep -m1 "mWifiInfo"'))?.[1];
const band = freq ? (Number(freq) > 5000 ? `5GHz` : `2.4GHz`) + `-${freq}MHz` : 'unknown-band';
log(`phone ${model}, wifi ${band}`);

// Keep the screen on while plugged in (restored at the end): background tabs are throttled.
adb('shell', 'svc', 'power', 'stayon', 'usb');
adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');

const out: unknown[] = [];
try {
  for (const mode of modes) {
    const tag = `${label}-${band}-${model}-${Date.now()}`.replace(/[^\w-]/g, '_');
    const url = `${base}/lab/phone.html?room=${code}&mode=${mode}&n=${n}&label=${tag}&autostart=1`;
    const before = new Set(existsSync(rawDir) ? readdirSync(rawDir) : []);
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${url}'`, 'com.android.chrome');
    log(`${mode}: running ${n} samples…`);
    const deadline = Date.now() + (n / 60 + 120) * 1000;
    let file: string | undefined;
    while (Date.now() < deadline && !file) {
      await new Promise((r) => setTimeout(r, 1000));
      file = readdirSync(rawDir).find((f) => !before.has(f) && f.includes(tag.slice(0, 40)));
    }
    if (!file) {
      log(`${mode}: no result (timeout). Is the phone on the same Wi-Fi, and did Windows Firewall allow Node/Chromium?`);
      out.push({ mode, error: 'timeout' });
      continue;
    }
    const r = JSON.parse(readFileSync(`${rawDir}/${file}`, 'utf8')) as {
      transport: string;
      halfRtt: { p50: number; p95: number; p99: number };
      jitter: number;
      lossPct: number;
      connectMs: number;
    };
    out.push({ mode, result: r });
    log(
      `${mode} → ${r.transport}: RTT/2 p50 ${r.halfRtt.p50.toFixed(2)} p95 ${r.halfRtt.p95.toFixed(2)} p99 ${r.halfRtt.p99.toFixed(2)} ms, jitter ${r.jitter.toFixed(2)}, loss ${r.lossPct.toFixed(2)}%, connect ${r.connectMs.toFixed(0)} ms`,
    );
  }
} finally {
  adb('shell', 'svc', 'power', 'stayon', 'false');
}
const hostView = await host.evaluate(() => (window as never as { __lab: { snapshot(): unknown } }).__lab.snapshot());
mkdirSync(resultsDir, { recursive: true });
const file = `${resultsDir}/transport-phone-${model.replace(/\W+/g, '_')}-${band}-${label}.json`;
writeFileSync(file, JSON.stringify({ date: new Date().toISOString(), n, band, model, runs: out, host: hostView }, null, 1));
log(`wrote ${file}`);
await browser.close();
await srv.close();
process.exit(0);
