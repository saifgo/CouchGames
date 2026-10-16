/**
 * Builds docs/LATENCY.md tables and docs/img/latency-cdf.svg from results/*.json.
 *   pnpm tsx scripts/report.ts
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { summarize } from '@couch/protocol';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const res = `${repo}packages/latency-lab/results`;

interface PhoneResult {
  transport: string;
  halfRtt: ReturnType<typeof summarize>;
  jitter: number;
  lossPct: number;
  rawRtt: number[];
  connectMs: number;
}

const files = readdirSync(res).filter((f) => f.startsWith('transport-phone-') && f.endsWith('.json'));
interface Series {
  key: string;
  label: string;
  band: string;
  transport: string;
  half: number[];
  r: PhoneResult;
}
const series: Series[] = [];
for (const f of files) {
  const d = JSON.parse(readFileSync(`${res}/${f}`, 'utf8')) as { band: string; runs: { mode: string; result?: PhoneResult }[] };
  const band = d.band.startsWith('5') ? '5 GHz' : '2.4 GHz';
  for (const run of d.runs) {
    if (!run.result) continue;
    const t = run.mode === 'webrtc' ? 'WebRTC' : 'WebSocket';
    series.push({ key: `${t}-${band}`, label: `${t} · ${band}`, band, transport: t, half: run.result.rawRtt.map((x) => x / 2), r: run.result });
  }
}
const order = ['WebRTC-5 GHz', 'WebSocket-5 GHz', 'WebRTC-2.4 GHz', 'WebSocket-2.4 GHz'];
series.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

/* ------------------------------------------------- SVG percentile spectrum */
// Latency tails matter, so x is the percentile on a log-tail scale (-log10(1-p)):
// p50, p90, p99, p99.9 are evenly spaced. y is milliseconds.
// Reference categorical palette (validated: scripts/validate_palette.js, light mode), fixed order.
const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
const W = 880;
const H = 440;
const m = { l: 56, r: 190, t: 64, b: 52 };
const YMAX = 80;
const TAIL_MAX = 3; // p99.9
const tail = (p: number) => Math.min(TAIL_MAX, -Math.log10(Math.max(1e-9, 1 - p)));
const x = (p: number) => m.l + (tail(p) / TAIL_MAX) * (W - m.l - m.r);
const y = (v: number) => m.t + (1 - Math.min(v, YMAX) / YMAX) * (H - m.t - m.b);
const parts: string[] = [];
parts.push(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui,-apple-system,Segoe UI,sans-serif" role="img" aria-labelledby="t d">`,
  `<title id="t">One-way input latency by percentile, phone to host (RTT/2), Galaxy S21 over Wi-Fi</title>`,
  `<desc id="d">Latency at each percentile per transport and Wi-Fi band, 2000 samples each. Table view in docs/LATENCY.md.</desc>`,
  `<rect width="${W}" height="${H}" fill="#fcfcfb"/>`,
  `<text x="${m.l}" y="26" font-size="16" font-weight="600" fill="#0b0b0b">One-way input latency by percentile, phone → host</text>`,
  `<text x="${m.l}" y="44" font-size="12" fill="#52514e">RTT/2 in ms · Galaxy S21 → laptop over home Wi-Fi · 2000 samples per line · lower is better</text>`,
);
for (let v = 0; v <= YMAX; v += 20) {
  parts.push(`<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="#e6e5e0" stroke-width="1"/>`);
  parts.push(`<text x="${m.l - 8}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="#52514e">${v}${v === YMAX ? '+' : ''}</text>`);
}
for (const [p, lbl] of [
  [0, 'p0'],
  [0.5, 'p50'],
  [0.9, 'p90'],
  [0.95, 'p95'],
  [0.99, 'p99'],
  [0.999, 'p99.9'],
] as const) {
  parts.push(`<line x1="${x(p)}" x2="${x(p)}" y1="${m.t}" y2="${H - m.b}" stroke="#e6e5e0" stroke-width="1"/>`);
  parts.push(`<text x="${x(p)}" y="${H - m.b + 18}" font-size="11" text-anchor="middle" fill="#52514e">${lbl}</text>`);
}
parts.push(`<text x="${(m.l + W - m.r) / 2}" y="${H - 12}" font-size="12" text-anchor="middle" fill="#52514e">percentile (log-tail scale)</text>`);
// Budget: p95 ≤ 20 ms and p99 ≤ 40 ms, drawn as the step the curves must stay under.
parts.push(
  `<path d="M${x(0.95)},${y(20)}H${x(0.99)}V${y(40)}H${W - m.r}" fill="none" stroke="#8a8984" stroke-width="1.5" stroke-dasharray="5 4"/>`,
  `<text x="${x(0.95) - 4}" y="${y(20) - 6}" font-size="11" text-anchor="end" fill="#52514e">budget</text>`,
);
const ends: { y: number; i: number; s: Series; p95: number; p99: number }[] = [];
series.forEach((s, i) => {
  const sorted = [...s.half].sort((a, b) => a - b);
  const pts: string[] = [];
  const n = sorted.length;
  for (let k = 0; k < n; k++) {
    const p = k / n;
    if (tail(p) >= TAIL_MAX) break;
    pts.push(`${x(p).toFixed(1)},${y(sorted[k]!).toFixed(1)}`);
  }
  const last = sorted[Math.min(n - 1, Math.floor(0.999 * n))]!;
  pts.push(`${x(0.999).toFixed(1)},${y(last).toFixed(1)}`);
  parts.push(`<polyline fill="none" stroke="#fcfcfb" stroke-width="4" stroke-linejoin="round" points="${pts.join(' ')}"/>`);
  parts.push(`<polyline fill="none" stroke="${COLORS[i]}" stroke-width="2" stroke-linejoin="round" points="${pts.join(' ')}"/>`);
  const sm = summarize(sorted);
  ends.push({ y: y(last), i, s, p95: sm.p95, p99: sm.p99 });
});
// Direct labels at line ends, pushed apart to avoid collisions.
ends.sort((a, b) => a.y - b.y);
for (let k = 1; k < ends.length; k++) if (ends[k]!.y - ends[k - 1]!.y < 34) ends[k]!.y = ends[k - 1]!.y + 34;
for (const e of ends) {
  parts.push(`<rect x="${W - m.r + 10}" y="${e.y - 8}" width="12" height="3" rx="1.5" fill="${COLORS[e.i]}"/>`);
  parts.push(`<text x="${W - m.r + 28}" y="${e.y - 3}" font-size="12" fill="#0b0b0b">${e.s.label}</text>`);
  parts.push(`<text x="${W - m.r + 28}" y="${e.y + 12}" font-size="11" fill="#52514e">p95 ${e.p95.toFixed(1)} · p99 ${e.p99.toFixed(1)} ms</text>`);
}
parts.push('</svg>');
mkdirSync(`${repo}docs/img`, { recursive: true });
writeFileSync(`${repo}docs/img/latency-cdf.svg`, parts.join('\n'));

/* ------------------------------------------------------------ tables */
const f = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '–');
const phoneRows = series.map(
  (s) =>
    `| ${s.transport} | ${s.band} | ${s.r.halfRtt.n} | ${f(s.r.halfRtt.p50)} | ${f(s.r.halfRtt.p95)} | ${f(s.r.halfRtt.p99)} | ${f(s.r.halfRtt.max)} | ${f(s.r.jitter)} | ${f(s.r.lossPct)} | ${s.r.connectMs.toFixed(0)} |`,
);

const loop = JSON.parse(readFileSync(`${res}/${readdirSync(res).find((x) => x.startsWith('transport-loopback-'))!}`, 'utf8')) as {
  wanOneWay: number;
  runs: { scenario: { name: string; phones: number }; phones: PhoneResult[] }[];
};
const loopRows = loop.runs.flatMap((run) =>
  run.phones.map(
    (p, i) =>
      `| ${run.scenario.name}${run.scenario.phones > 1 ? ` (phone ${i + 1})` : ''} | ${p.transport} | ${f(p.halfRtt.p50)} | ${f(p.halfRtt.p95)} | ${f(p.halfRtt.p99)} | ${f(p.halfRtt.max)} | ${f(p.lossPct)} |`,
  ),
);

const out = `<!-- generated by packages/latency-lab/scripts/report.ts — edit the narrative in docs/LATENCY.md above the marker only -->

### Phone over Wi-Fi (real radio)

![One-way latency by percentile](img/latency-cdf.svg)

| Transport | Band | n | p50 ms | p95 ms | p99 ms | max ms | jitter ms | loss % | connect ms |
|---|---|---|---|---|---|---|---|---|---|
${phoneRows.join('\n')}

### Loopback (software floor: same PC, separate Chromium processes)

WAN one-way delay injected for the cloud-relay row: ${loop.wanOneWay} ms (half the measured TCP connect time to a Cloudflare edge).

| Scenario | Transport | p50 ms | p95 ms | p99 ms | max ms | loss % |
|---|---|---|---|---|---|---|
${loopRows.join('\n')}
`;
const latPath = `${repo}docs/LATENCY.md`;
let doc = '';
try {
  doc = readFileSync(latPath, 'utf8');
} catch {
  /* first run */
}
const MARK = '<!-- RESULTS -->';
doc = doc.includes(MARK) ? doc.slice(0, doc.indexOf(MARK) + MARK.length) + '\n' + out : `# Latency report\n\n${MARK}\n${out}`;
writeFileSync(latPath, doc);
console.log('wrote docs/LATENCY.md and docs/img/latency-cdf.svg');
