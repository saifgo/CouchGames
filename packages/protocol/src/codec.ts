import {
  ECHO_PACKET_SIZE,
  INPUT_PACKET_SIZE,
  INPUT_PACKET_SIZE_GYRO,
  MsgType,
  PROTOCOL_VERSION,
  type MenuAction,
  type SkinId,
  type TransportKind,
} from './constants.js';

/**
 * Full controller state. Mutable on purpose: the hot path reuses one instance
 * per player instead of allocating per packet.
 *
 * Axes are i8 in [-127, 127]; Y is positive DOWN (libretro convention).
 * Gyro is i16 in 1/16 deg/s units.
 */
export interface InputState {
  seq: number;
  clientTimeMs: number;
  buttons: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  l2: number;
  r2: number;
  hasGyro: boolean;
  gx: number;
  gy: number;
  gz: number;
}

export function createInputState(): InputState {
  return {
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
}

export function copyInputState(from: InputState, to: InputState): void {
  to.seq = from.seq;
  to.clientTimeMs = from.clientTimeMs;
  to.buttons = from.buttons;
  to.lx = from.lx;
  to.ly = from.ly;
  to.rx = from.rx;
  to.ry = from.ry;
  to.l2 = from.l2;
  to.r2 = from.r2;
  to.hasGyro = from.hasGyro;
  to.gx = from.gx;
  to.gy = from.gy;
  to.gz = from.gz;
}

const clampI8 = (v: number) => (v > 127 ? 127 : v < -127 ? -127 : v | 0);
const clampU8 = (v: number) => (v > 255 ? 255 : v < 0 ? 0 : v | 0);
const clampI16 = (v: number) => (v > 32767 ? 32767 : v < -32767 ? -32767 : v | 0);

/** Writes an INPUT packet into `view` at offset 0. Returns the byte length. No allocation. */
export function encodeInputInto(s: InputState, view: DataView): number {
  view.setUint8(0, MsgType.INPUT);
  view.setUint8(1, PROTOCOL_VERSION);
  view.setUint16(2, s.seq & 0xffff, true);
  view.setUint32(4, s.clientTimeMs >>> 0, true);
  view.setUint32(8, s.buttons >>> 0, true);
  view.setInt8(12, clampI8(s.lx));
  view.setInt8(13, clampI8(s.ly));
  view.setInt8(14, clampI8(s.rx));
  view.setInt8(15, clampI8(s.ry));
  view.setUint8(16, clampU8(s.l2));
  view.setUint8(17, clampU8(s.r2));
  if (!s.hasGyro) return INPUT_PACKET_SIZE;
  view.setInt16(18, clampI16(s.gx), true);
  view.setInt16(20, clampI16(s.gy), true);
  view.setInt16(22, clampI16(s.gz), true);
  return INPUT_PACKET_SIZE_GYRO;
}

/**
 * Decodes an INPUT packet into `out`. Returns false (leaving `out` untouched)
 * for wrong type, unknown version or bad length. No allocation.
 */
export function decodeInputInto(view: DataView, out: InputState): boolean {
  const len = view.byteLength;
  if (len !== INPUT_PACKET_SIZE && len !== INPUT_PACKET_SIZE_GYRO) return false;
  if (view.getUint8(0) !== MsgType.INPUT || view.getUint8(1) !== PROTOCOL_VERSION) return false;
  out.seq = view.getUint16(2, true);
  out.clientTimeMs = view.getUint32(4, true);
  out.buttons = view.getUint32(8, true);
  out.lx = view.getInt8(12);
  out.ly = view.getInt8(13);
  out.rx = view.getInt8(14);
  out.ry = view.getInt8(15);
  out.l2 = view.getUint8(16);
  out.r2 = view.getUint8(17);
  if (len === INPUT_PACKET_SIZE_GYRO) {
    out.hasGyro = true;
    out.gx = view.getInt16(18, true);
    out.gy = view.getInt16(20, true);
    out.gz = view.getInt16(22, true);
  } else {
    out.hasGyro = false;
    out.gx = out.gy = out.gz = 0;
  }
  return true;
}

/** Host → phone echo of an input packet (debug/latency measurement). */
export interface InputEcho {
  seq: number;
  clientTimeMs: number;
  hostTimeMs: number;
}

export function encodeEchoInto(e: InputEcho, view: DataView): number {
  view.setUint8(0, MsgType.INPUT_ECHO);
  view.setUint8(1, PROTOCOL_VERSION);
  view.setUint16(2, e.seq & 0xffff, true);
  view.setUint32(4, e.clientTimeMs >>> 0, true);
  view.setUint32(8, e.hostTimeMs >>> 0, true);
  return ECHO_PACKET_SIZE;
}

export function decodeEchoInto(view: DataView, out: InputEcho): boolean {
  if (view.byteLength !== ECHO_PACKET_SIZE) return false;
  if (view.getUint8(0) !== MsgType.INPUT_ECHO || view.getUint8(1) !== PROTOCOL_VERSION) return false;
  out.seq = view.getUint16(2, true);
  out.clientTimeMs = view.getUint32(4, true);
  out.hostTimeMs = view.getUint32(8, true);
  return true;
}

/** True when 16-bit sequence `a` is newer than `b` (RFC 1982 serial arithmetic). */
export function seqNewer(a: number, b: number): boolean {
  const d = (a - b) & 0xffff;
  return d !== 0 && d < 0x8000;
}

/** Signed difference a - b of two u32 millisecond clocks, wrap-safe. */
export function u32Diff(a: number, b: number): number {
  return (a - b) | 0;
}

/** Truncate a high-resolution clock to the u32 ms clock used on the wire. */
export function u32Now(nowMs: number): number {
  return Math.floor(nowMs) >>> 0;
}

/* ------------------------------------------------------------------------ */
/* Reliable control messages                                                */
/* ------------------------------------------------------------------------ */

export interface HelloMsg {
  type: typeof MsgType.HELLO;
  /** Stable per-device id (localStorage) used to restore the same slot on reconnect. */
  clientId: string;
  name: string;
  wantSlot: number | null;
  caps: { vibrate: boolean; gyro: boolean; ios: boolean };
}
export interface WelcomeMsg {
  type: typeof MsgType.WELCOME;
  slot: number;
  color: string;
  name: string;
  skin: SkinId;
  hostName: string;
}
export interface LeaveMsg {
  type: typeof MsgType.LEAVE;
}
export interface SlotMsg {
  type: typeof MsgType.SLOT;
  slot: number;
  color: string;
}
export interface SkinMsg {
  type: typeof MsgType.SKIN;
  skin: SkinId;
  gameTitle: string | null;
}
export interface RumbleMsg {
  type: typeof MsgType.RUMBLE;
  strong: number;
  weak: number;
  durationMs: number;
}
export interface MenuMsg {
  type: typeof MsgType.MENU;
  action: MenuAction;
  arg: number;
}
export interface PingMsg {
  type: typeof MsgType.PING;
  id: number;
  hostTimeMs: number;
}
export interface PongMsg {
  type: typeof MsgType.PONG;
  id: number;
  hostTimeMs: number;
  clientTimeMs: number;
}
export interface StatsMsg {
  type: typeof MsgType.STATS;
  /** Round-trip time, ms (0.1 ms resolution on the wire). */
  rttMs: number;
  jitterMs: number;
  lossPermille: number;
  transport: TransportKind;
  slot: number;
}
export interface RosterEntry {
  slot: number;
  name: string;
  color: string;
  connected: boolean;
}
export interface RosterMsg {
  type: typeof MsgType.ROSTER;
  players: RosterEntry[];
}
export interface ErrorMsg {
  type: typeof MsgType.ERROR;
  code: string;
  message: string;
}
export type HostScreen = 'lobby' | 'library' | 'game' | 'menu';
export interface HostStateMsg {
  type: typeof MsgType.HOST_STATE;
  screen: HostScreen;
  paused: boolean;
  /** Save-state slots that hold data, for the phone's menu. */
  saveSlots: number[];
}

export type ControlMsg =
  | HelloMsg
  | WelcomeMsg
  | LeaveMsg
  | SlotMsg
  | SkinMsg
  | RumbleMsg
  | MenuMsg
  | PingMsg
  | PongMsg
  | StatsMsg
  | RosterMsg
  | ErrorMsg
  | HostStateMsg;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** JSON payload field order is fixed so encodings are byte-stable across languages. */
function jsonBody(msg: ControlMsg): unknown {
  switch (msg.type) {
    case MsgType.HELLO:
      return {
        clientId: msg.clientId,
        name: msg.name,
        wantSlot: msg.wantSlot,
        caps: { vibrate: msg.caps.vibrate, gyro: msg.caps.gyro, ios: msg.caps.ios },
      };
    case MsgType.WELCOME:
      return { slot: msg.slot, color: msg.color, name: msg.name, skin: msg.skin, hostName: msg.hostName };
    case MsgType.SLOT:
      return { slot: msg.slot, color: msg.color };
    case MsgType.SKIN:
      return { skin: msg.skin, gameTitle: msg.gameTitle };
    case MsgType.ROSTER:
      return {
        players: msg.players.map((p) => ({ slot: p.slot, name: p.name, color: p.color, connected: p.connected })),
      };
    case MsgType.ERROR:
      return { code: msg.code, message: msg.message };
    case MsgType.HOST_STATE:
      return { screen: msg.screen, paused: msg.paused, saveSlots: msg.saveSlots };
    default:
      throw new Error(`message type ${msg.type} is not JSON-bodied`);
  }
}

export function encodeControl(msg: ControlMsg): Uint8Array<ArrayBuffer> {
  let out: Uint8Array<ArrayBuffer>;
  let v: DataView;
  switch (msg.type) {
    case MsgType.LEAVE:
      out = new Uint8Array(2);
      break;
    case MsgType.RUMBLE:
      out = new Uint8Array(6);
      v = new DataView(out.buffer);
      v.setUint8(2, clampU8(msg.strong));
      v.setUint8(3, clampU8(msg.weak));
      v.setUint16(4, Math.min(0xffff, Math.max(0, msg.durationMs | 0)), true);
      break;
    case MsgType.MENU:
      out = new Uint8Array(4);
      out[2] = msg.action;
      out[3] = clampU8(msg.arg);
      break;
    case MsgType.PING:
      out = new Uint8Array(8);
      v = new DataView(out.buffer);
      v.setUint16(2, msg.id & 0xffff, true);
      v.setUint32(4, msg.hostTimeMs >>> 0, true);
      break;
    case MsgType.PONG:
      out = new Uint8Array(12);
      v = new DataView(out.buffer);
      v.setUint16(2, msg.id & 0xffff, true);
      v.setUint32(4, msg.hostTimeMs >>> 0, true);
      v.setUint32(8, msg.clientTimeMs >>> 0, true);
      break;
    case MsgType.STATS:
      out = new Uint8Array(10);
      v = new DataView(out.buffer);
      v.setUint16(2, Math.min(0xffff, Math.round(msg.rttMs * 10)), true);
      v.setUint16(4, Math.min(0xffff, Math.round(msg.jitterMs * 10)), true);
      v.setUint16(6, Math.min(1000, Math.max(0, Math.round(msg.lossPermille))), true);
      v.setUint8(8, msg.transport);
      v.setUint8(9, msg.slot);
      break;
    default: {
      const body = textEncoder.encode(JSON.stringify(jsonBody(msg)));
      out = new Uint8Array(2 + body.length);
      out.set(body, 2);
    }
  }
  out[0] = msg.type;
  out[1] = PROTOCOL_VERSION;
  return out;
}

export class ProtocolError extends Error {}

export function decodeControl(bytes: Uint8Array): ControlMsg {
  if (bytes.length < 2) throw new ProtocolError('message too short');
  const type = bytes[0]!;
  const version = bytes[1]!;
  if (version !== PROTOCOL_VERSION) throw new ProtocolError(`unsupported protocol version ${version}`);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const need = (n: number) => {
    if (bytes.length !== n) throw new ProtocolError(`type 0x${type.toString(16)} expects ${n} bytes, got ${bytes.length}`);
  };
  switch (type) {
    case MsgType.LEAVE:
      need(2);
      return { type };
    case MsgType.RUMBLE:
      need(6);
      return { type, strong: v.getUint8(2), weak: v.getUint8(3), durationMs: v.getUint16(4, true) };
    case MsgType.MENU:
      need(4);
      return { type, action: v.getUint8(2) as MenuAction, arg: v.getUint8(3) };
    case MsgType.PING:
      need(8);
      return { type, id: v.getUint16(2, true), hostTimeMs: v.getUint32(4, true) };
    case MsgType.PONG:
      need(12);
      return { type, id: v.getUint16(2, true), hostTimeMs: v.getUint32(4, true), clientTimeMs: v.getUint32(8, true) };
    case MsgType.STATS:
      need(10);
      return {
        type,
        rttMs: v.getUint16(2, true) / 10,
        jitterMs: v.getUint16(4, true) / 10,
        lossPermille: v.getUint16(6, true),
        transport: v.getUint8(8) as TransportKind,
        slot: v.getUint8(9),
      };
    case MsgType.HELLO:
    case MsgType.WELCOME:
    case MsgType.SLOT:
    case MsgType.SKIN:
    case MsgType.ROSTER:
    case MsgType.ERROR:
    case MsgType.HOST_STATE: {
      let body: unknown;
      try {
        body = JSON.parse(textDecoder.decode(bytes.subarray(2)));
      } catch {
        throw new ProtocolError('invalid JSON body');
      }
      if (typeof body !== 'object' || body === null) throw new ProtocolError('JSON body must be an object');
      return { ...(body as object), type } as ControlMsg;
    }
    default:
      throw new ProtocolError(`unknown control type 0x${type.toString(16)}`);
  }
}

/** Peeks the message type without decoding. */
export function messageType(bytes: Uint8Array | DataView): number {
  return bytes instanceof DataView ? bytes.getUint8(0) : (bytes[0] ?? -1);
}

export function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

export function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0) throw new Error('odd hex length');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
