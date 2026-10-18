/**
 * Wire constants shared by every implementation (TypeScript here, Kotlin in
 * apps/host-android-tv). Changing any value is a protocol break: bump
 * PROTOCOL_VERSION and regenerate vectors/golden.json.
 */

export const PROTOCOL_VERSION = 1;

/** First byte of every message. Values < 0x10 travel on the unreliable channel. */
export const MsgType = {
  // Unreliable channel ("input"): full-state, latest-wins.
  INPUT: 0x01,
  INPUT_ECHO: 0x02,

  // Reliable channel ("ctrl").
  HELLO: 0x10,
  WELCOME: 0x11,
  LEAVE: 0x12,
  SLOT: 0x13,
  SKIN: 0x14,
  RUMBLE: 0x15,
  MENU: 0x16,
  PING: 0x17,
  PONG: 0x18,
  STATS: 0x19,
  ROSTER: 0x1a,
  ERROR: 0x1b,
  HOST_STATE: 0x1c,
} as const;
export type MsgType = (typeof MsgType)[keyof typeof MsgType];

/**
 * RetroPad buttons. Bit index === libretro RETRO_DEVICE_ID_JOYPAD_* id, so a
 * libretro frontend maps bit i straight to joypad id i.
 */
export const Button = {
  B: 0,
  Y: 1,
  SELECT: 2,
  START: 3,
  UP: 4,
  DOWN: 5,
  LEFT: 6,
  RIGHT: 7,
  A: 8,
  X: 9,
  L: 10,
  R: 11,
  L2: 12,
  R2: 13,
  L3: 14,
  R3: 15,
  /** Not a RetroPad button: opens the TV's in-game menu. */
  MENU: 16,
} as const;
export type Button = (typeof Button)[keyof typeof Button];

export const BUTTON_COUNT = 17;

export const ButtonName: Record<number, string> = Object.fromEntries(
  Object.entries(Button).map(([k, v]) => [v, k]),
);

export const MenuAction = {
  OPEN: 1,
  RESUME: 2,
  SAVE_STATE: 3,
  LOAD_STATE: 4,
  QUIT: 5,
  RESET: 6,
} as const;
export type MenuAction = (typeof MenuAction)[keyof typeof MenuAction];

export const TransportKind = {
  UNKNOWN: 0,
  WEBRTC_P2P: 1,
  WEBRTC_RELAY: 2,
  WS_LAN: 3,
  WS_RELAY: 4,
  BT_HID: 5,
} as const;
export type TransportKind = (typeof TransportKind)[keyof typeof TransportKind];

export const TransportLabel: Record<TransportKind, string> = {
  0: 'unknown',
  1: 'WebRTC P2P',
  2: 'WebRTC TURN',
  3: 'WebSocket LAN',
  4: 'WebSocket relay',
  5: 'Bluetooth HID',
};

export const CONSOLES = [
  'nes',
  'snes',
  'genesis',
  'gb',
  'gbc',
  'gba',
  'psx',
  'n64',
  'psp',
  'nds',
  'ps2',
  'atari2600',
  'pce',
] as const;
export type ConsoleId = (typeof CONSOLES)[number];
/** A skin id is a console id or the console-agnostic "modern" pad. */
export type SkinId = ConsoleId | 'modern';

export const INPUT_PACKET_SIZE = 18;
export const INPUT_PACKET_SIZE_GYRO = 24;
export const ECHO_PACKET_SIZE = 12;

/** Heartbeat periods for the input stream (brief §4). */
export const HEARTBEAT_ACTIVE_MS = 1000 / 60;
export const HEARTBEAT_IDLE_MS = 1000 / 20;
export const CLOCK_SYNC_INTERVAL_MS = 2000;

/** Data channel labels / negotiated ids, identical on every peer. */
export const CHANNEL_INPUT = { label: 'input', id: 0 } as const;
export const CHANNEL_CTRL = { label: 'ctrl', id: 1 } as const;

export const MAX_PLAYERS = 8;
export const PLAYER_COLORS = [
  '#ff4d5e',
  '#3d9bff',
  '#2ed47a',
  '#ffc83d',
  '#b06bff',
  '#ff8a3d',
  '#2fd6d0',
  '#ff6bcb',
] as const;
