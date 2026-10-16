import { describe, expect, it } from 'vitest';
import { ClockSync, LinkStats, Ring, percentile, summarize } from '../src/stats.js';
import { generateRoomCode, normalizeRoomCode } from '../src/room.js';
import { frameForPeer, frameFromPhone, parseHostFrame, RelayChannel } from '../src/signaling.js';

describe('Ring', () => {
  it('keeps the newest values in order', () => {
    const r = new Ring(3);
    [1, 2, 3, 4, 5].forEach((v) => r.push(v));
    expect(r.values()).toEqual([3, 4, 5]);
  });
});

describe('summarize', () => {
  it('computes nearest-rank percentiles', () => {
    const vals = Array.from({ length: 100 }, (_, i) => i + 1);
    const s = summarize(vals);
    expect([s.p50, s.p95, s.p99, s.min, s.max]).toEqual([50, 95, 99, 1, 100]);
    expect(percentile([], 50)).toBeNaN();
  });
});

describe('ClockSync', () => {
  it('recovers a fixed offset with symmetric delay', () => {
    const cs = new ClockSync();
    const offset = 50_000; // phone clock ahead by 50 s
    for (let i = 0; i < 5; i++) {
      const t0 = 1000 + i * 2000;
      cs.onPong(t0, t0 + 3 + offset, t0 + 6);
    }
    expect(cs.offset).toBe(offset);
    expect(cs.lastRtt).toBe(6);
    // Packet sent at phone time (h + offset) arrives 3 ms later.
    expect(cs.oneWay(20_000 + offset, 20_003)).toBe(3);
  });

  it('prefers the lowest-RTT sample', () => {
    const cs = new ClockSync();
    cs.onPong(0, 100 + 40, 80); // asymmetric slow sample
    cs.onPong(1000, 1100 + 2, 1004); // fast sample, true offset 100
    expect(cs.offset).toBe(100);
  });

  it('survives u32 wrap', () => {
    const cs = new ClockSync();
    cs.onPong(4294967290, 10, 4); // rtt 10ms across wrap
    expect(cs.lastRtt).toBe(10);
  });
});

describe('LinkStats', () => {
  it('counts loss, drops stale packets, tracks jitter', () => {
    const ls = new LinkStats(10);
    expect(ls.onPacket(1, 5)).toBe(true);
    expect(ls.onPacket(2, 7)).toBe(true);
    expect(ls.onPacket(5, 5)).toBe(true); // 3,4 lost
    expect(ls.onPacket(4, 5)).toBe(false); // stale
    expect(ls.lost).toBe(2);
    expect(ls.stale).toBe(1);
    expect(ls.received).toBe(3);
    expect(ls.jitter).toBeGreaterThan(0);
    expect(ls.lossPermille).toBe(400);
  });
});

describe('room codes', () => {
  it('generates valid codes and normalizes input', () => {
    for (let i = 0; i < 100; i++) expect(normalizeRoomCode(generateRoomCode())).not.toBeNull();
    expect(normalizeRoomCode(' abcd ')).toBe('ABCD');
    expect(normalizeRoomCode('ABCO')).toBeNull();
    expect(normalizeRoomCode('ABC')).toBeNull();
  });
});

describe('relay framing', () => {
  it('round-trips host frames', () => {
    const f = frameForPeer(RelayChannel.CTRL, 513, new Uint8Array([9, 8]));
    expect(parseHostFrame(f)).toEqual({ channel: 1, peer: 513, payload: new Uint8Array([9, 8]) });
    expect(Array.from(frameFromPhone(RelayChannel.INPUT, new Uint8Array([7])))).toEqual([0, 7]);
    expect(parseHostFrame(new Uint8Array([5, 0, 0]))).toBeNull();
  });
});
