import { seqNewer, u32Diff } from './codec.js';

/** Fixed-size ring of numbers. Recording allocates nothing. */
export class Ring {
  private readonly buf: Float64Array;
  private n = 0;
  private head = 0;

  constructor(readonly capacity: number) {
    this.buf = new Float64Array(capacity);
  }

  push(v: number): void {
    this.buf[this.head] = v;
    this.head = (this.head + 1) % this.capacity;
    if (this.n < this.capacity) this.n++;
  }

  get size(): number {
    return this.n;
  }

  clear(): void {
    this.n = 0;
    this.head = 0;
  }

  /** Returns the values oldest-first (allocates; not for the hot path). */
  values(): number[] {
    const out: number[] = new Array(this.n);
    const start = (this.head - this.n + this.capacity) % this.capacity;
    for (let i = 0; i < this.n; i++) out[i] = this.buf[(start + i) % this.capacity]!;
    return out;
  }
}

export interface Summary {
  n: number;
  min: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  /** Standard deviation. */
  sd: number;
}

/** Nearest-rank percentile on a sorted array. */
export function percentile(sorted: ArrayLike<number>, p: number): number {
  if (sorted.length === 0) return NaN;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]!;
}

export function summarize(values: ArrayLike<number>): Summary {
  const s = Array.from(values).sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return { n: 0, min: NaN, mean: NaN, p50: NaN, p95: NaN, p99: NaN, max: NaN, sd: NaN };
  let sum = 0;
  for (const v of s) sum += v;
  const mean = sum / n;
  let sq = 0;
  for (const v of s) sq += (v - mean) ** 2;
  return {
    n,
    min: s[0]!,
    mean,
    p50: percentile(s, 50),
    p95: percentile(s, 95),
    p99: percentile(s, 99),
    max: s[n - 1]!,
    sd: Math.sqrt(sq / n),
  };
}

/**
 * NTP-style clock offset estimator (host side, one per player).
 * The host sends PING{id, hostT0}; the phone answers PONG{id, hostT0, clientT1}.
 * offset = clientClock - hostClock. The offset comes from the lowest-RTT sample
 * in the window, because that sample has the least queueing asymmetry.
 */
export class ClockSync {
  private readonly rtts = new Float64Array(8);
  private readonly offsets = new Float64Array(8);
  private count = 0;
  private idx = 0;
  /** Smoothed RTT (EWMA, alpha 1/8 like TCP SRTT). */
  srtt = NaN;
  lastRtt = NaN;
  offset = 0;
  synced = false;

  onPong(hostT0: number, clientT1: number, hostNow: number): void {
    const rtt = u32Diff(hostNow >>> 0, hostT0 >>> 0);
    if (rtt < 0 || rtt > 10_000) return;
    const offset = u32Diff(clientT1 >>> 0, hostT0 >>> 0) - rtt / 2;
    this.rtts[this.idx] = rtt;
    this.offsets[this.idx] = offset;
    this.idx = (this.idx + 1) % this.rtts.length;
    if (this.count < this.rtts.length) this.count++;
    this.lastRtt = rtt;
    this.srtt = Number.isNaN(this.srtt) ? rtt : this.srtt + (rtt - this.srtt) / 8;
    let best = 0;
    for (let i = 1; i < this.count; i++) if (this.rtts[i]! < this.rtts[best]!) best = i;
    this.offset = this.offsets[best]!;
    this.synced = true;
  }

  /** Estimated one-way latency (ms) of a packet stamped `clientTimeMs` and received at `hostNowMs`. */
  oneWay(clientTimeMs: number, hostNowMs: number): number {
    return u32Diff(hostNowMs >>> 0, clientTimeMs >>> 0) + this.offset;
  }

  reset(): void {
    this.count = 0;
    this.idx = 0;
    this.srtt = NaN;
    this.lastRtt = NaN;
    this.offset = 0;
    this.synced = false;
  }
}

/**
 * Per-link input statistics, updated once per received input packet with no
 * allocation. Jitter follows RFC 3550 §6.4.1: J += (|D| - J) / 16.
 */
export class LinkStats {
  readonly latency: Ring;
  jitter = 0;
  received = 0;
  lost = 0;
  stale = 0;
  private lastSeq = -1;
  private lastTransit = NaN;

  constructor(window = 600) {
    this.latency = new Ring(window);
  }

  /** Returns false if the packet is stale (older seq) and must be dropped. */
  onPacket(seq: number, transitMs: number): boolean {
    if (this.lastSeq >= 0) {
      if (!seqNewer(seq, this.lastSeq)) {
        this.stale++;
        return false;
      }
      const gap = (seq - this.lastSeq) & 0xffff;
      if (gap > 1) this.lost += gap - 1;
    }
    this.lastSeq = seq;
    this.received++;
    if (!Number.isNaN(this.lastTransit)) {
      const d = Math.abs(transitMs - this.lastTransit);
      this.jitter += (d - this.jitter) / 16;
    }
    this.lastTransit = transitMs;
    this.latency.push(transitMs);
    return true;
  }

  get lossPermille(): number {
    const total = this.received + this.lost;
    return total === 0 ? 0 : (this.lost * 1000) / total;
  }

  reset(): void {
    this.latency.clear();
    this.jitter = 0;
    this.received = 0;
    this.lost = 0;
    this.stale = 0;
    this.lastSeq = -1;
    this.lastTransit = NaN;
  }
}
