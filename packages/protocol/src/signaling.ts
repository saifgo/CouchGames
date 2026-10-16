/**
 * Signaling + relay protocol, spoken over one WebSocket per participant.
 *  - Text frames: JSON control (room management, SDP/ICE forwarding). Never on the hot path.
 *  - Binary frames: relayed controller traffic, used when WebRTC is unavailable.
 *
 * The same framing is used when the host itself runs the WebSocket server
 * (Android TV host, LAN mode). In that case the phone talks to the host directly
 * and the host never sees `peer` prefixes (the socket identifies the peer).
 */

export type SignalData =
  | { kind: 'offer' | 'answer'; sdp: string }
  | { kind: 'candidate'; candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }
  | { kind: 'end-of-candidates' };

export type ClientToServer =
  | { t: 'host'; room?: string; secret?: string; name?: string }
  | { t: 'join'; room: string; clientId: string }
  | { t: 'signal'; to: number; data: SignalData }
  | { t: 'kick'; peer: number }
  | { t: 'ping'; at: number };

export type ServerToClient =
  | { t: 'hosted'; room: string; secret: string; iceServers: RTCIceServerLike[] }
  | {
      t: 'joined';
      room: string;
      peer: number;
      hostName: string;
      iceServers: RTCIceServerLike[];
      /** True when this socket terminates at the host itself (LAN server on the TV), not a relay. */
      direct?: boolean;
    }
  | { t: 'peer'; peer: number; clientId: string; remote: string }
  | { t: 'peer-left'; peer: number }
  | { t: 'signal'; from: number; data: SignalData }
  | { t: 'host-left' }
  | { t: 'host-back' }
  | { t: 'pong'; at: number }
  | { t: 'error'; code: SignalErrorCode; message: string };

export type SignalErrorCode = 'no-room' | 'room-taken' | 'bad-request' | 'room-full' | 'kicked';

export interface RTCIceServerLike {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Peer id 0 always means "the host" in `signal.to` / `signal.from`. */
export const HOST_PEER = 0;

export const RelayChannel = { INPUT: 0, CTRL: 1 } as const;
export type RelayChannel = (typeof RelayChannel)[keyof typeof RelayChannel];

/** Phone-side relay frame: [u8 channel][payload]. */
export function frameFromPhone(channel: RelayChannel, payload: Uint8Array, scratch?: Uint8Array): Uint8Array {
  const out = scratch && scratch.length >= payload.length + 1 ? scratch.subarray(0, payload.length + 1) : new Uint8Array(payload.length + 1);
  out[0] = channel;
  out.set(payload, 1);
  return out;
}

/** Host-side relay frame: [u8 channel][u16 LE peer][payload]. */
export function frameForPeer(channel: RelayChannel, peer: number, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(payload.length + 3);
  out[0] = channel;
  out[1] = peer & 0xff;
  out[2] = (peer >> 8) & 0xff;
  out.set(payload, 3);
  return out;
}

export interface ParsedHostFrame {
  channel: RelayChannel;
  peer: number;
  payload: Uint8Array;
}

export function parseHostFrame(bytes: Uint8Array): ParsedHostFrame | null {
  if (bytes.length < 3) return null;
  const channel = bytes[0]!;
  if (channel !== RelayChannel.INPUT && channel !== RelayChannel.CTRL) return null;
  return { channel, peer: bytes[1]! | (bytes[2]! << 8), payload: bytes.subarray(3) };
}
