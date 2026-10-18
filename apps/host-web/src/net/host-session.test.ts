import { ClockSync, LinkStats, PLAYER_COLORS, createInputState } from '@couch/protocol';
import { describe, expect, it, vi } from 'vitest';
import { HostSession } from './host-session.js';

type Slot = HostSession['players'][number];

function seat(s: HostSession, slot: number, name: string, connected: boolean, peerId: number | null): void {
  s.players[slot] = {
    slot,
    name,
    connected,
    peerId,
    clientId: name,
    color: PLAYER_COLORS[slot]!,
    transport: 0,
    input: createInputState(),
    clock: new ClockSync(),
    stats: new LinkStats(600),
    lastSeen: 0,
    caps: { vibrate: false, gyro: false, ios: false },
  } as unknown as Slot;
}

function session() {
  const s = new HostSession('http://localhost:1');
  const sendCtrl = vi.fn();
  Object.assign(s.link, { sendCtrl, kick: vi.fn() });
  return { s, sendCtrl };
}

describe('HostSession slot management', () => {
  it('tidySlots removes away players and moves the rest up', () => {
    const { s } = session();
    seat(s, 0, 'away', false, null); // P1 left: slot kept for a reconnect
    seat(s, 1, 'bob', true, 11);
    seat(s, 3, 'cat', true, 13);
    expect(s.tidySlots()).toBe(1);
    expect(s.players.slice(0, 4).map((p) => p?.name ?? null)).toEqual(['bob', 'cat', null, null]);
    expect(s.players[0]!.slot).toBe(0);
    expect(s.players[0]!.color).toBe(PLAYER_COLORS[0]);
    expect(s.players[1]!.slot).toBe(1);
  });

  it('tells moved phones their new slot', () => {
    const { s, sendCtrl } = session();
    seat(s, 2, 'bob', true, 12);
    s.tidySlots();
    expect(s.players[0]!.name).toBe('bob');
    expect(sendCtrl).toHaveBeenCalledWith(12, expect.any(Uint8Array));
  });

  it('swapSlots moves a player into an empty P1', () => {
    const { s } = session();
    seat(s, 1, 'bob', true, 11);
    s.swapSlots(1, 0);
    expect(s.players[0]!.name).toBe('bob');
    expect(s.players[1]).toBeNull();
  });
});
