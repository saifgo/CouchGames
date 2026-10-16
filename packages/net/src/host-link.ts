import { frameForPeer, RelayChannel, TransportKind, type RTCIceServerLike, type ServerToClient } from '@couch/protocol';
import { Emitter } from './emitter.js';
import { candidateSignal, createRtcPeer, INPUT_BACKPRESSURE_BYTES, rtcTransportKind, SignalApplier, type RtcPeer } from './rtc.js';
import { SignalSocket, wsUrlFor } from './signal-socket.js';

export interface HostLinkOptions {
  /** http(s) base URL of the signaling server. */
  server: string;
  name: string;
  /** Reclaim an existing room after a page reload. */
  room?: string;
  secret?: string;
}

export interface HostPeerInfo {
  id: number;
  clientId: string;
  remote: string;
  transport: TransportKind;
}

export type HostLinkState = 'connecting' | 'open' | 'reconnecting' | 'closed';

type Events = {
  state: [HostLinkState];
  hosted: [{ room: string; secret: string }];
  peerJoin: [HostPeerInfo];
  peerLeave: [number];
  transport: [number, TransportKind];
  /** Hot path: unreliable-channel packet from a phone. The DataView is only valid during the call. */
  input: [number, DataView];
  ctrl: [number, Uint8Array];
};

interface HostPeer extends HostPeerInfo {
  rtc: RtcPeer | null;
  applier: SignalApplier | null;
  rtcUsable: boolean;
}

export class HostLink extends Emitter<Events> {
  state: HostLinkState = 'connecting';
  room: string | null = null;
  secret: string | null = null;
  private readonly socket: SignalSocket;
  private readonly peers = new Map<number, HostPeer>();
  private iceServers: RTCIceServerLike[] = [];
  private closed = false;
  private attempt = 0;

  constructor(private readonly opts: HostLinkOptions) {
    super();
    this.room = opts.room ?? null;
    this.secret = opts.secret ?? null;
    this.socket = new SignalSocket(wsUrlFor(opts.server));
    this.socket.on('message', (m) => this.onSignal(m));
    this.socket.on('binary', (b) => this.onRelay(b));
    this.socket.on('close', () => this.onSocketClose());
  }

  start(): void {
    this.closed = false;
    void this.connect();
  }

  close(): void {
    this.closed = true;
    for (const id of [...this.peers.keys()]) this.dropPeer(id);
    this.socket.close();
    this.setState('closed');
  }

  peer(id: number): HostPeerInfo | undefined {
    return this.peers.get(id);
  }

  sendCtrl(peerId: number, bytes: Uint8Array<ArrayBuffer>): void {
    const p = this.peers.get(peerId);
    if (!p) return;
    if (p.rtc && p.rtcUsable && p.rtc.ctrl.readyState === 'open') p.rtc.ctrl.send(bytes);
    else this.socket.sendBinary(frameForPeer(RelayChannel.CTRL, peerId, bytes));
  }

  /** Unreliable send (input echo). Dropped, never queued, when the path is backed up. */
  sendInput(peerId: number, bytes: Uint8Array<ArrayBuffer>): void {
    const p = this.peers.get(peerId);
    if (!p) return;
    const ch = p.rtc?.input;
    if (ch && p.rtcUsable && ch.readyState === 'open') {
      if (ch.bufferedAmount <= INPUT_BACKPRESSURE_BYTES) ch.send(bytes);
    } else if (this.socket.bufferedAmount <= INPUT_BACKPRESSURE_BYTES * 4) {
      this.socket.sendBinary(frameForPeer(RelayChannel.INPUT, peerId, bytes));
    }
  }

  kick(peerId: number): void {
    this.socket.send({ t: 'kick', peer: peerId });
  }

  private setState(s: HostLinkState) {
    if (this.state === s) return;
    this.state = s;
    this.emit('state', s);
  }

  private async connect() {
    if (this.closed) return;
    this.setState(this.attempt ? 'reconnecting' : 'connecting');
    try {
      await this.socket.open();
      this.socket.send({
        t: 'host',
        name: this.opts.name,
        ...(this.room ? { room: this.room } : {}),
        ...(this.secret ? { secret: this.secret } : {}),
      });
    } catch {
      this.onSocketClose();
    }
  }

  private onSocketClose() {
    if (this.closed) return;
    // WebRTC links keep working without the server, but relayed phones are gone.
    for (const p of [...this.peers.values()]) if (!p.rtcUsable) this.dropPeer(p.id);
    this.setState('reconnecting');
    const delay = Math.min(5000, 300 * 2 ** this.attempt++);
    setTimeout(() => void this.connect(), delay);
  }

  private onSignal(m: ServerToClient) {
    switch (m.t) {
      case 'hosted':
        this.attempt = 0;
        this.room = m.room;
        this.secret = m.secret;
        this.iceServers = m.iceServers;
        this.setState('open');
        this.emit('hosted', { room: m.room, secret: m.secret });
        return;
      case 'error':
        if (m.code === 'room-taken') {
          // Our old room expired and someone else took the code: start a fresh room.
          this.room = null;
          this.secret = null;
          this.socket.send({ t: 'host', name: this.opts.name });
        }
        return;
      case 'peer': {
        const existing = this.peers.get(m.peer);
        if (existing) return;
        const p: HostPeer = {
          id: m.peer,
          clientId: m.clientId,
          remote: m.remote,
          transport: TransportKind.WS_RELAY,
          rtc: null,
          applier: null,
          rtcUsable: false,
        };
        this.peers.set(p.id, p);
        this.emit('peerJoin', { id: p.id, clientId: p.clientId, remote: p.remote, transport: p.transport });
        return;
      }
      case 'peer-left':
        this.dropPeer(m.peer);
        return;
      case 'signal': {
        const p = this.peers.get(m.from);
        if (!p) return;
        if (m.data.kind === 'offer') this.newRtc(p);
        void p.applier
          ?.apply(m.data, (sdp) => this.socket.send({ t: 'signal', to: p.id, data: { kind: 'answer', sdp } }))
          .catch(() => {});
        return;
      }
      default:
        return;
    }
  }

  private onRelay(bytes: Uint8Array) {
    if (bytes.length < 4) return;
    const peer = bytes[1]! | (bytes[2]! << 8);
    if (!this.peers.has(peer)) return;
    if (bytes[0] === RelayChannel.INPUT) {
      this.emit('input', peer, new DataView(bytes.buffer, bytes.byteOffset + 3, bytes.byteLength - 3));
    } else {
      this.emit('ctrl', peer, bytes.subarray(3));
    }
  }

  private setPeerTransport(p: HostPeer, k: TransportKind) {
    if (p.transport === k) return;
    p.transport = k;
    this.emit('transport', p.id, k);
  }

  private newRtc(p: HostPeer) {
    this.closeRtc(p);
    const rtc = createRtcPeer(this.iceServers);
    p.rtc = rtc;
    p.applier = new SignalApplier(rtc.pc);
    rtc.pc.onicecandidate = (e) => this.socket.send({ t: 'signal', to: p.id, data: candidateSignal(e.candidate) });
    rtc.input.onmessage = (e) => this.emit('input', p.id, new DataView(e.data as ArrayBuffer));
    rtc.ctrl.onmessage = (e) => this.emit('ctrl', p.id, new Uint8Array(e.data as ArrayBuffer));
    rtc.input.onopen = async () => {
      if (p.rtc !== rtc) return;
      p.rtcUsable = true;
      this.setPeerTransport(p, await rtcTransportKind(rtc.pc));
    };
    const down = () => {
      if (p.rtc !== rtc) return;
      p.rtcUsable = false;
      this.setPeerTransport(p, this.socket.isOpen ? TransportKind.WS_RELAY : TransportKind.UNKNOWN);
      if (!this.socket.isOpen) this.dropPeer(p.id);
    };
    rtc.input.onclose = down;
    rtc.pc.onconnectionstatechange = () => {
      const s = rtc.pc.connectionState;
      if (s === 'failed' || s === 'disconnected' || s === 'closed') down();
      else if (s === 'connected' && rtc.input.readyState === 'open' && !p.rtcUsable) {
        p.rtcUsable = true;
        void rtcTransportKind(rtc.pc).then((k) => p.rtc === rtc && this.setPeerTransport(p, k));
      }
    };
  }

  private closeRtc(p: HostPeer) {
    if (!p.rtc) return;
    const { pc, input, ctrl } = p.rtc;
    input.onmessage = ctrl.onmessage = input.onopen = input.onclose = null;
    pc.onicecandidate = pc.onconnectionstatechange = null;
    pc.close();
    p.rtc = null;
    p.applier = null;
    p.rtcUsable = false;
  }

  private dropPeer(id: number) {
    const p = this.peers.get(id);
    if (!p) return;
    this.closeRtc(p);
    this.peers.delete(id);
    this.emit('peerLeave', id);
  }
}
