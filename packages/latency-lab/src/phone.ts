/**
 * Lab phone: streams INPUT packets at a fixed rate and measures round-trip time
 * from the host's INPUT_ECHO replies. RTT/2 approximates one-way latency.
 * Results are shown on screen, exposed as window.__labResult and POSTed to
 * /api/lab/results (saved by the couch server when LAB=1).
 */
import {
  createInputState,
  decodeControl,
  decodeEchoInto,
  encodeControl,
  encodeInputInto,
  MsgType,
  summarize,
  TransportKind,
  TransportLabel,
  u32Now,
  type InputEcho,
} from '@couch/protocol';
import { PhoneLink, type PhoneLinkMode } from '@couch/net';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const out = $('out');
$<HTMLInputElement>('room').value = params.get('room') ?? '';
$<HTMLSelectElement>('mode').value = params.get('mode') ?? 'webrtc';
$<HTMLInputElement>('n').value = params.get('n') ?? '2000';
$<HTMLInputElement>('label').value = params.get('label') ?? localStorage.getItem('lab-label') ?? '';

export interface LabResult {
  label: string;
  mode: PhoneLinkMode;
  transport: string;
  userAgent: string;
  hz: number;
  sent: number;
  received: number;
  lossPct: number;
  connectMs: number;
  rtt: ReturnType<typeof summarize>;
  halfRtt: ReturnType<typeof summarize>;
  /** RFC 3550 interarrival jitter over RTT/2 samples. */
  jitter: number;
  dropped: number;
  rawRtt: number[];
}

async function run(): Promise<LabResult> {
  const room = $<HTMLInputElement>('room').value.trim().toUpperCase();
  const mode = $<HTMLSelectElement>('mode').value as PhoneLinkMode;
  const n = Number($<HTMLInputElement>('n').value);
  const hz = Number(params.get('hz') ?? 60);
  const label = $<HTMLInputElement>('label').value;
  localStorage.setItem('lab-label', label);
  const server = params.get('server') ?? location.origin;

  const link = new PhoneLink({ server, room, clientId: crypto.randomUUID?.() ?? String(Math.random()), mode });
  const sentAt = new Float64Array(65536);
  const rtts: number[] = [];
  const echo: InputEcho = { seq: 0, clientTimeMs: 0, hostTimeMs: 0 };

  link.on('input', (view) => {
    const now = performance.now();
    if (!decodeEchoInto(view, echo)) return;
    const t = sentAt[echo.seq];
    if (t) {
      rtts.push(now - t);
      sentAt[echo.seq] = 0;
    }
  });
  link.on('ctrl', (bytes) => {
    const m = decodeControl(bytes);
    if (m.type === MsgType.PING) {
      link.sendCtrl(encodeControl({ type: MsgType.PONG, id: m.id, hostTimeMs: m.hostTimeMs, clientTimeMs: u32Now(performance.now()) }));
    }
  });
  link.on('error', (e) => (out.textContent = `error: ${e.code} ${e.message}`));

  const t0 = performance.now();
  out.textContent = `connecting (${mode})…`;
  link.start();
  const wanted: TransportKind[] = mode === 'webrtc' ? [TransportKind.WEBRTC_P2P, TransportKind.WEBRTC_RELAY] : [TransportKind.WS_RELAY, TransportKind.WS_LAN];
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${mode} link after 15 s (state ${link.state}, rtc ${link.rtcState})`)), 15000);
    const check = () => {
      if (wanted.includes(link.transport) && link.state === 'open') {
        clearTimeout(timer);
        resolve();
      }
    };
    link.on('transport', check);
    link.on('state', check);
    check();
  });
  const connectMs = performance.now() - t0;
  // Let clock sync settle and the path warm up.
  await new Promise((r) => setTimeout(r, 600));

  const s = createInputState();
  const buf = new Uint8Array(24);
  const view = new DataView(buf.buffer);
  const period = 1000 / hz;
  let sent = 0;
  await new Promise<void>((resolve) => {
    let next = performance.now();
    const tick = () => {
      const now = performance.now();
      s.seq = (s.seq + 1) & 0xffff;
      s.clientTimeMs = u32Now(now);
      s.buttons = sent & 0xfff;
      sentAt[s.seq] = now;
      const len = encodeInputInto(s, view);
      link.sendInput(buf.subarray(0, len));
      sent++;
      if (sent % 100 === 0) out.textContent = `${TransportLabel[link.transport]}: ${sent}/${n} sent, ${rtts.length} echoed`;
      if (sent >= n) return resolve();
      next += period;
      setTimeout(tick, Math.max(0, next - performance.now()));
    };
    tick();
  });
  await new Promise((r) => setTimeout(r, 1000));
  const transport = TransportLabel[link.transport];
  link.close();

  const half = rtts.map((r) => r / 2);
  let jitter = 0;
  for (let i = 1; i < half.length; i++) jitter += (Math.abs(half[i]! - half[i - 1]!) - jitter) / 16;
  return {
    label,
    mode,
    transport,
    userAgent: navigator.userAgent,
    hz,
    sent,
    received: rtts.length,
    lossPct: ((sent - rtts.length) / sent) * 100,
    connectMs,
    rtt: summarize(rtts),
    halfRtt: summarize(half),
    jitter,
    dropped: link.dropped,
    rawRtt: rtts.map((r) => Math.round(r * 100) / 100),
  };
}

function fmt(r: LabResult): string {
  const f = (x: number) => x.toFixed(2);
  return [
    `${r.label || '(no label)'} · ${r.transport} · ${r.hz} Hz`,
    `samples ${r.received}/${r.sent}  loss ${r.lossPct.toFixed(2)}%  connect ${r.connectMs.toFixed(0)} ms`,
    `RTT/2  p50 ${f(r.halfRtt.p50)}  p95 ${f(r.halfRtt.p95)}  p99 ${f(r.halfRtt.p99)}  max ${f(r.halfRtt.max)} ms`,
    `jitter ${f(r.jitter)} ms   sd ${f(r.halfRtt.sd)} ms   dropped(backpressure) ${r.dropped}`,
  ].join('\n');
}

async function go() {
  try {
    const r = await run();
    out.textContent = fmt(r);
    (window as unknown as { __labResult: LabResult }).__labResult = r;
    void fetch('/api/lab/results', { method: 'POST', body: JSON.stringify(r) }).catch(() => {});
  } catch (err) {
    out.textContent = `failed: ${(err as Error).message}`;
    (window as unknown as { __labError: string }).__labError = (err as Error).message;
  }
}

$('go').addEventListener('click', () => void go());
if (params.get('autostart') === '1') void go();
