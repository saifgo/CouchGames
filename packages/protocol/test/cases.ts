import { Button, MenuAction, MsgType, TransportKind } from '../src/constants.js';
import type { ControlMsg, InputEcho, InputState } from '../src/codec.js';

const bit = (...b: number[]) => b.reduce((m, x) => (m | (1 << x)) >>> 0, 0);

const base: InputState = {
  seq: 0,
  clientTimeMs: 0,
  buttons: 0,
  lx: 0,
  ly: 0,
  rx: 0,
  ry: 0,
  l2: 0,
  r2: 0,
  hasGyro: false,
  gx: 0,
  gy: 0,
  gz: 0,
};

export const inputCases: { name: string; value: InputState }[] = [
  { name: 'input-idle', value: { ...base, seq: 1, clientTimeMs: 1000 } },
  {
    name: 'input-snes-a-b-diagonal',
    value: { ...base, seq: 513, clientTimeMs: 123456789, buttons: bit(Button.A, Button.B, Button.UP, Button.RIGHT) },
  },
  {
    name: 'input-all-buttons-analog-extremes',
    value: {
      ...base,
      seq: 65535,
      clientTimeMs: 4294967295,
      buttons: bit(...Array.from({ length: 17 }, (_, i) => i)),
      lx: -127,
      ly: 127,
      rx: 64,
      ry: -1,
      l2: 255,
      r2: 128,
    },
  },
  {
    name: 'input-with-gyro',
    value: {
      ...base,
      seq: 42,
      clientTimeMs: 77,
      buttons: bit(Button.R2),
      r2: 200,
      hasGyro: true,
      gx: -1600,
      gy: 32767,
      gz: -32767,
    },
  },
];

export const echoCases: { name: string; value: InputEcho }[] = [
  { name: 'echo-basic', value: { seq: 7, clientTimeMs: 1000, hostTimeMs: 2000 } },
  { name: 'echo-wrap', value: { seq: 65535, clientTimeMs: 4294967295, hostTimeMs: 5 } },
];

export const controlCases: { name: string; value: ControlMsg }[] = [
  {
    name: 'hello',
    value: {
      type: MsgType.HELLO,
      clientId: 'c0ffee00-0000-4000-8000-000000000001',
      name: 'Omar',
      wantSlot: null,
      caps: { vibrate: true, gyro: true, ios: false },
    },
  },
  {
    name: 'hello-utf8-name',
    value: { type: MsgType.HELLO, clientId: 'abc', name: 'Zoë 🎮', wantSlot: 2, caps: { vibrate: false, gyro: false, ios: true } },
  },
  {
    name: 'welcome',
    value: { type: MsgType.WELCOME, slot: 0, color: '#ff4d5e', name: 'P1', skin: 'snes', hostName: 'Living room' },
  },
  { name: 'leave', value: { type: MsgType.LEAVE } },
  { name: 'slot', value: { type: MsgType.SLOT, slot: 3, color: '#ffc83d' } },
  { name: 'skin-n64', value: { type: MsgType.SKIN, skin: 'n64', gameTitle: 'Homebrew Kart' } },
  { name: 'skin-modern-no-title', value: { type: MsgType.SKIN, skin: 'modern', gameTitle: null } },
  { name: 'rumble', value: { type: MsgType.RUMBLE, strong: 255, weak: 64, durationMs: 120 } },
  { name: 'menu-save', value: { type: MsgType.MENU, action: MenuAction.SAVE_STATE, arg: 2 } },
  { name: 'ping', value: { type: MsgType.PING, id: 300, hostTimeMs: 3000000000 } },
  { name: 'pong', value: { type: MsgType.PONG, id: 300, hostTimeMs: 3000000000, clientTimeMs: 12345 } },
  {
    name: 'stats',
    value: { type: MsgType.STATS, rttMs: 12.3, jitterMs: 1.5, lossPermille: 4, transport: TransportKind.WEBRTC_P2P, slot: 1 },
  },
  {
    name: 'roster',
    value: {
      type: MsgType.ROSTER,
      players: [
        { slot: 0, name: 'P1', color: '#ff4d5e', connected: true },
        { slot: 1, name: 'P2', color: '#3d9bff', connected: false },
      ],
    },
  },
  { name: 'error', value: { type: MsgType.ERROR, code: 'room-full', message: 'All slots are taken' } },
  { name: 'host-state', value: { type: MsgType.HOST_STATE, screen: 'game', paused: true, saveSlots: [0, 2] } },
];

/** Byte strings every implementation must reject. */
export const invalidCases: { name: string; hex: string; reason: string }[] = [
  { name: 'input-short', hex: '0101000000000000', reason: 'input packet shorter than 18 bytes' },
  { name: 'input-bad-version', hex: '0163010000000000000000000000000000ff', reason: 'protocol version 99' },
  { name: 'control-unknown-type', hex: '7f01', reason: 'unknown type 0x7f' },
  { name: 'ping-wrong-length', hex: '17012c01', reason: 'PING must be 8 bytes' },
];
