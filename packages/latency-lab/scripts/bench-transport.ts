/**
 * Transport latency benchmark (ADR-002), loopback edition: host page and phone
 * pages run in separate Chromium processes on this machine. This measures the
 * software floor of each path (browser + network stack + our code); radio time
 * is added by the real-phone run (bench-phone.ts).
 *
 *   pnpm bench:transport [--n=2000] [--wan=35]
 *
 * --wan is the one-way delay (ms) injected at the relay to emulate a cloud relay;
 * by default it is measured as half the TCP connect time to a public endpoint.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { chromium, type Browser } from 'playwright';
import { resultsDir, startLabServer } from './lab-server.js';

const args = process.argv.slice(2);
const n = Number(args.find((a) => a.startsWith('--n='))?.slice(4) ?? 2000);
let wanOneWay = Number(args.find((a) => a.startsWith('--wan='))?.slice(6) ?? NaN);

/** One-way internet delay estimate: half of the median TCP+TLS-free connect time to a cloud edge. */
async function measureWan(): Promise<number> {
  const { connect } = await import('node:net');
  const samples: number[] = [];
  for (let i = 0; i < 7; i++) {
    const t0 = performance.now();
    await new Promise<void>((ok) => {
      const s = connect(443, 'cloudflare.com', () => {
        samples.push(performance.now() - t0);
        s.destroy();
        ok();
      });
      s.on('error', () => ok());
      s.setTimeout(3000, () => (s.destroy(), ok()));
    });
  }
  samples.sort((a, b) => a - b);
  return samples.length ? samples[Math.floor(samples.length / 2)]! / 2 : 30;
}

const flags = ['--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required'];

interface Scenario {
  name: string;
  mode: 'webrtc' | 'ws';
  phones: number;
  relayDelayMs: number;
}

async function runScenario(sc: Scenario) {
  const srv = await startLabServer({ relayDelayMs: sc.relayDelayMs });
  const hostBrowser = await chromium.launch({ channel: 'chromium', args: flags });
  const phoneBrowsers: Browser[] = [];
  try {
    const host = await hostBrowser.newPage();
    await host.goto(`${srv.url}/lab/host.html`);
    const room = await host.waitForFunction(() => (window as never as { __lab?: { room: string } }).__lab?.room, null, { timeout: 15000 });
    const code = (await room.jsonValue()) as string;
    const pages = [];
    for (let i = 0; i < sc.phones; i++) {
      const b = await chromium.launch({ channel: 'chromium', args: flags });
      phoneBrowsers.push(b);
      const p = await b.newPage();
      await p.goto(`${srv.url}/lab/phone.html?room=${code}&mode=${sc.mode}&n=${n}&label=loopback-${sc.name}-p${i + 1}&autostart=1`);
      pages.push(p);
    }
    const results = [];
    for (const p of pages) {
      const h = await p.waitForFunction(
        () => (window as never as { __labResult?: unknown; __labError?: string }).__labResult ?? (window as never as { __labError?: string }).__labError,
        null,
        { timeout: (n / 60 + 60) * 1000, polling: 500 },
      );
      results.push(await h.jsonValue());
    }
    const hostView = await host.evaluate(() => (window as never as { __lab: { snapshot(): unknown } }).__lab.snapshot());
    return { scenario: sc, phones: results, host: hostView };
  } finally {
    for (const b of phoneBrowsers) await b.close();
    await hostBrowser.close();
    await srv.close();
  }
}

if (Number.isNaN(wanOneWay)) wanOneWay = Math.round(await measureWan());
console.log(`WAN one-way estimate for the cloud-relay scenario: ${wanOneWay} ms`);

const scenarios: Scenario[] = [
  { name: 'webrtc-1', mode: 'webrtc', phones: 1, relayDelayMs: 0 },
  { name: 'ws-lan-1', mode: 'ws', phones: 1, relayDelayMs: 0 },
  { name: 'ws-cloud-1', mode: 'ws', phones: 1, relayDelayMs: wanOneWay },
  { name: 'webrtc-4', mode: 'webrtc', phones: 4, relayDelayMs: 0 },
  { name: 'ws-lan-4', mode: 'ws', phones: 4, relayDelayMs: 0 },
];

const all = [];
for (const sc of scenarios) {
  process.stdout.write(`${sc.name.padEnd(12)} `);
  try {
    const r = await runScenario(sc);
    all.push(r);
    const lines = (r.phones as ({ halfRtt: { p50: number; p95: number; p99: number }; jitter: number; lossPct: number; transport: string } | string)[]).map((p) =>
      typeof p === 'string' ? `error: ${p}` : `${p.transport}: RTT/2 p50 ${p.halfRtt.p50.toFixed(2)} p95 ${p.halfRtt.p95.toFixed(2)} p99 ${p.halfRtt.p99.toFixed(2)} ms, jitter ${p.jitter.toFixed(2)}, loss ${p.lossPct.toFixed(2)}%`,
    );
    console.log(lines.join('\n             '));
  } catch (err) {
    console.log(`FAILED ${(err as Error).message.split('\n')[0]}`);
    all.push({ scenario: sc, error: (err as Error).message });
  }
}

mkdirSync(resultsDir, { recursive: true });
const file = `${resultsDir}/transport-loopback-${hostname().toLowerCase()}.json`;
// Raw RTT arrays are large; keep them (they feed the charts in docs/LATENCY.md).
writeFileSync(file, JSON.stringify({ date: new Date().toISOString(), n, wanOneWay, runs: all }, null, 1));
console.log(`wrote ${file}`);
