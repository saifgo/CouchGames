import { CHANNEL_CTRL, CHANNEL_INPUT, TransportKind, type RTCIceServerLike, type SignalData } from '@couch/protocol';

export interface RtcPeer {
  pc: RTCPeerConnection;
  /** Unordered, no retransmits: UDP-like, no head-of-line blocking. Latest state wins. */
  input: RTCDataChannel;
  /** Ordered + reliable: join/slot/skin/menu/rumble/clock sync. */
  ctrl: RTCDataChannel;
}

export const webrtcSupported = (): boolean => typeof RTCPeerConnection !== 'undefined';

/**
 * Both sides create the same two pre-negotiated channels, so no in-band
 * DATA_CHANNEL_OPEN round trip is needed and the ids are fixed by protocol.
 */
export function createRtcPeer(iceServers: RTCIceServerLike[]): RtcPeer {
  const pc = new RTCPeerConnection({ iceServers: iceServers as RTCIceServer[] });
  const input = pc.createDataChannel(CHANNEL_INPUT.label, {
    negotiated: true,
    id: CHANNEL_INPUT.id,
    ordered: false,
    maxRetransmits: 0,
  });
  const ctrl = pc.createDataChannel(CHANNEL_CTRL.label, { negotiated: true, id: CHANNEL_CTRL.id, ordered: true });
  input.binaryType = 'arraybuffer';
  ctrl.binaryType = 'arraybuffer';
  return { pc, input, ctrl };
}

/** Applies remote SDP/ICE, buffering candidates that arrive before the description. */
export class SignalApplier {
  private pending: RTCIceCandidateInit[] = [];

  constructor(private readonly pc: RTCPeerConnection) {}

  async apply(data: SignalData, onAnswer?: (sdp: string) => void): Promise<void> {
    const pc = this.pc;
    switch (data.kind) {
      case 'offer':
      case 'answer':
        await pc.setRemoteDescription({ type: data.kind, sdp: data.sdp });
        for (const c of this.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        if (data.kind === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          onAnswer?.(pc.localDescription!.sdp);
        }
        return;
      case 'candidate': {
        const init: RTCIceCandidateInit = { candidate: data.candidate, sdpMid: data.sdpMid, sdpMLineIndex: data.sdpMLineIndex };
        if (pc.remoteDescription) await pc.addIceCandidate(init).catch(() => {});
        else this.pending.push(init);
        return;
      }
      case 'end-of-candidates':
        return;
    }
  }
}

export function candidateSignal(c: RTCIceCandidate | null): SignalData {
  return c
    ? { kind: 'candidate', candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex }
    : { kind: 'end-of-candidates' };
}

/** P2P vs TURN, from the selected candidate pair. */
export async function rtcTransportKind(pc: RTCPeerConnection): Promise<TransportKind> {
  try {
    const stats = await pc.getStats();
    let pairId: string | undefined;
    stats.forEach((s) => {
      if (s.type === 'transport' && s.selectedCandidatePairId) pairId = s.selectedCandidatePairId;
    });
    if (!pairId) {
      stats.forEach((s) => {
        if (s.type === 'candidate-pair' && (s.selected || (s.nominated && s.state === 'succeeded'))) pairId ??= s.id;
      });
    }
    const pair = pairId ? stats.get(pairId) : undefined;
    const local = pair ? stats.get(pair.localCandidateId) : undefined;
    const remote = pair ? stats.get(pair.remoteCandidateId) : undefined;
    if (local?.candidateType === 'relay' || remote?.candidateType === 'relay') return TransportKind.WEBRTC_RELAY;
    return TransportKind.WEBRTC_P2P;
  } catch {
    return TransportKind.WEBRTC_P2P;
  }
}

/** Above this many queued bytes we drop input packets instead of queueing them (latest state wins). */
export const INPUT_BACKPRESSURE_BYTES = 256;
