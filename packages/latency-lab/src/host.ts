/**
 * Lab host: creates a room and echoes every INPUT packet straight back as
 * INPUT_ECHO on the same path. Also runs clock sync and records one-way
 * latency per phone. State is exposed on window.__lab for Playwright.
 */
import {
  ClockSync,
  createInputState,
  decodeControl,
  decodeInputInto,
  encodeControl,
  encodeEchoInto,
  LinkStats,
  MsgType,
  summarize,
  TransportLabel,
  u32Now,
  type InputEcho,
} from '@couch/protocol';
import { HostLink } from '@couch/net';

const params = new URLSearchParams(location.search);
const server = params.get('server') ?? location.origin;

interface PeerRec {
  clock: ClockSync;
  stats: LinkStats;
  transport: string;
  pingId: number;
}
const peers = new Map<number, PeerRec>();
const link = new HostLink({ server, name: 'Latency lab' });
const state = createInputState();
const echo: InputEcho = { seq: 0, clientTimeMs: 0, hostTimeMs: 0 };
const echoBuf = new Uint8Array(12);
const echoView = new DataView(echoBuf.buffer);

link.on('hosted', ({ room }) => {
  document.getElementById('room')!.textContent = room;
  document.getElementById('url')!.textContent = `${location.origin}/lab/phone.html?room=${room}`;
  (window as unknown as { __lab: unknown }).__lab = lab;
  lab.room = room;
});
link.on('peerJoin', (p) => {
  peers.set(p.id, { clock: new ClockSync(), stats: new LinkStats(5000), transport: TransportLabel[p.transport], pingId: 0 });
});
link.on('peerLeave', (id) => peers.delete(id));
link.on('transport', (id, k) => {
  const r = peers.get(id);
  if (r) r.transport = TransportLabel[k];
});

// Hot path: decode, echo, record. No allocation besides what the browser hands us.
link.on('input', (id, view) => {
  const now = performance.now();
  if (!decodeInputInto(view, state)) return;
  echo.seq = state.seq;
  echo.clientTimeMs = state.clientTimeMs;
  echo.hostTimeMs = u32Now(now);
  encodeEchoInto(echo, echoView);
  link.sendInput(id, echoBuf);
  const r = peers.get(id);
  if (r?.clock.synced) r.stats.onPacket(state.seq, r.clock.oneWay(state.clientTimeMs, now));
});

link.on('ctrl', (id, bytes) => {
  const msg = decodeControl(bytes);
  const r = peers.get(id);
  if (msg.type === MsgType.PONG && r) r.clock.onPong(msg.hostTimeMs, msg.clientTimeMs, u32Now(performance.now()));
});

setInterval(() => {
  for (const [id, r] of peers) {
    link.sendCtrl(id, encodeControl({ type: MsgType.PING, id: r.pingId++ & 0xffff, hostTimeMs: u32Now(performance.now()) }));
  }
}, 500);

const lab = {
  room: null as string | null,
  /** One-way latency summaries per peer (clock-sync based). */
  snapshot() {
    return [...peers].map(([id, r]) => ({
      id,
      transport: r.transport,
      srtt: r.clock.srtt,
      oneWay: summarize(r.stats.latency.values()),
      jitter: r.stats.jitter,
      lost: r.stats.lost,
      received: r.stats.received,
    }));
  },
};

setInterval(() => {
  const rows = lab.snapshot().map(
    (p) =>
      `<tr><td>#${p.id}</td><td>${p.transport}</td><td>${p.srtt.toFixed(1)} ms rtt</td><td>${p.oneWay.p50.toFixed(1)} / ${p.oneWay.p95.toFixed(1)} ms 1-way p50/p95</td><td>${p.jitter.toFixed(2)} jit</td><td>${p.lost} lost</td></tr>`,
  );
  document.getElementById('peers')!.innerHTML = rows.join('');
}, 500);

link.start();
