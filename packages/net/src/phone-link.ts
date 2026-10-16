import { frameFromPhone, HOST_PEER, RelayChannel, TransportKind, type ServerToClient } from '@couch/protocol';
import { Emitter } from './emitter.js';
import { candidateSignal, createRtcPeer, INPUT_BACKPRESSURE_BYTES, rtcTransportKind, SignalApplier, webrtcSupported, type RtcPeer } from './rtc.js';
import { SignalSocket, wsUrlFor } from './signal-socket.js';

export type PhoneLinkState = 'connecting' | 'waiting-host' | 'open' | 'reconnecting' | 'closed' | 'error';

/**
 * - auto: start on the WebSocket path immediately, upgrade to WebRTC when the channel opens.
 * - webrtc: WebRTC only (benchmarks).
 * - ws: WebSocket only (relay or direct-to-host).
 */
export type PhoneLinkMode = 'auto' | 'webrtc' | 'ws';

export interface PhoneLinkOptions {
  /** http(s) base URL of the signaling server, or of the TV's own LAN server. */
  server: string;
  room: string;
  clientId: string;
  mode?: PhoneLinkMode;
}

type Events = {
  state: [PhoneLinkState];
  transport: [TransportKind];
  joined: [{ peer: number; hostName: string; direct: boolean }];
  /** Unreliable-channel message from the host (input echo). */
  input: [DataView];
  /** Reliable-channel message from the host. */
  ctrl: [Uint8Array];
  error: [{ code: string; message: string }];
};

const BACKOFF_MS = [300, 700, 1500, 3000, 5000];

export class PhoneLink extends Emitter<Events> {
  readonly mode: PhoneLinkMode;
  state: PhoneLinkState = 'connecting';
  transport: TransportKind = TransportKind.UNKNOWN;
  /** Input packets dropped because a path was backed up (should stay ~0). */
  dropped = 0;

  private readonly socket: SignalSocket;
  private rtc: RtcPeer | null = null;
  /** False while ICE is disconnected even though the channel still reports "open". */
  private rtcUsable = false;
  private applier: SignalApplier | null = null;
  private joinedDirect = false;
  private canUseSocket = false;
  private closed = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private iceServers: RTCIceServer[] = [];
  private readonly relayScratch = new Uint8Array(64);

  constructor(private readonly opts: PhoneLinkOptions) {
    super();
    this.mode = opts.mode ?? 'auto';
    this.socket = new SignalSocket(wsUrlFor(opts.server));
    this.socket.on('message', (m) => this.onSignal(m));
    this.socket.on('binary', (b) => this.onRelay(b));
    this.socket.on('close', (code) => this.onSocketClose(code));
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.checkHealth();
      });
    }
  }

  start(): void {
    this.closed = false;
    void this.connect();
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.teardownRtc();
    this.socket.close();
    this.setState('closed');
  }

  /** Hot path. Never queues: if the path is backed up the packet is dropped (next one carries full state). */
  sendInput(bytes: Uint8Array<ArrayBuffer>): void {
    const ch = this.rtc?.input;
    if (ch && this.rtcUsable && ch.readyState === 'open') {
      if (ch.bufferedAmount > INPUT_BACKPRESSURE_BYTES) {
        this.dropped++;
        return;
      }
      ch.send(bytes);
      return;
    }
    if (this.canUseSocket && this.socket.isOpen) {
      if (this.socket.bufferedAmount > INPUT_BACKPRESSURE_BYTES) {
        this.dropped++;
        return;
      }
      this.socket.sendBinary(frameFromPhone(RelayChannel.INPUT, bytes, this.relayScratch));
    }
  }

  sendCtrl(bytes: Uint8Array<ArrayBuffer>): void {
    const ch = this.rtc?.ctrl;
    if (ch && this.rtcUsable && ch.readyState === 'open') ch.send(bytes);
    else if (this.canUseSocket) this.socket.sendBinary(frameFromPhone(RelayChannel.CTRL, bytes));
  }

  get rtcState(): RTCPeerConnectionState | 'none' {
    return this.rtc?.pc.connectionState ?? 'none';
  }

  private setState(s: PhoneLinkState) {
    if (this.state === s) return;
    this.state = s;
    this.emit('state', s);
  }

  private setTransport(k: TransportKind) {
    if (this.transport === k) return;
    this.transport = k;
    this.emit('transport', k);
  }

  private async connect(): Promise<void> {
    if (this.closed) return;
    this.setState(this.attempt === 0 ? 'connecting' : 'reconnecting');
    try {
      await this.socket.open();
      this.socket.send({ t: 'join', room: this.opts.room, clientId: this.opts.clientId });
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return;
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)]!;
    this.attempt++;
    this.setState('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private onSocketClose(code: number) {
    this.canUseSocket = false;
    if (this.closed) return;
    if (code === 4000) {
      this.emit('error', { code: 'kicked', message: 'Removed by the TV' });
      this.close();
      return;
    }
    // A live WebRTC link survives a signaling outage; keep using it and rejoin quietly.
    if (this.rtc?.input.readyState !== 'open') this.setTransport(TransportKind.UNKNOWN);
    this.scheduleReconnect();
  }

  private checkHealth() {
    if (this.closed) return;
    if (!this.socket.isOpen && !this.reconnectTimer) {
      this.attempt = 0;
      void this.connect();
    } else if (this.rtc && ['failed', 'closed', 'disconnected'].includes(this.rtc.pc.connectionState)) {
      this.restartRtc();
    }
  }

  private onSignal(m: ServerToClient) {
    switch (m.t) {
      case 'joined':
        this.attempt = 0;
        this.joinedDirect = !!m.direct;
        this.iceServers = m.iceServers as RTCIceServer[];
        this.canUseSocket = this.mode !== 'webrtc';
        this.emit('joined', { peer: m.peer, hostName: m.hostName, direct: this.joinedDirect });
        if (this.canUseSocket) {
          this.setTransport(this.joinedDirect ? TransportKind.WS_LAN : TransportKind.WS_RELAY);
          this.setState('open');
        }
        if (this.mode !== 'ws' && webrtcSupported()) this.restartRtc();
        return;
      case 'signal':
        if (m.from === HOST_PEER && this.applier) void this.applier.apply(m.data).catch(() => {});
        return;
      case 'host-left':
        this.teardownRtc();
        this.setState('waiting-host');
        return;
      case 'host-back':
        if (this.canUseSocket) this.setState('open');
        if (this.mode !== 'ws' && webrtcSupported()) this.restartRtc();
        return;
      case 'error':
        this.emit('error', { code: m.code, message: m.message });
        if (m.code === 'no-room' || m.code === 'room-full') {
          this.closed = true;
          this.socket.close();
          this.setState('error');
        }
        return;
      default:
        return;
    }
  }

  private onRelay(bytes: Uint8Array) {
    if (bytes.length < 2) return;
    const payload = bytes.subarray(1);
    if (bytes[0] === RelayChannel.INPUT) this.emit('input', new DataView(payload.buffer, payload.byteOffset, payload.byteLength));
    else this.emit('ctrl', payload);
  }

  private teardownRtc() {
    if (!this.rtc) return;
    const { pc, input, ctrl } = this.rtc;
    input.onmessage = ctrl.onmessage = input.onopen = input.onclose = null;
    pc.onicecandidate = pc.onconnectionstatechange = null;
    pc.close();
    this.rtc = null;
    this.rtcUsable = false;
    this.applier = null;
  }

  private restartRtc() {
    this.teardownRtc();
    const rtc = createRtcPeer(this.iceServers);
    this.rtc = rtc;
    this.applier = new SignalApplier(rtc.pc);
    rtc.pc.onicecandidate = (e) => this.socket.send({ t: 'signal', to: HOST_PEER, data: candidateSignal(e.candidate) });
    rtc.input.onmessage = (e) => this.emit('input', new DataView(e.data as ArrayBuffer));
    rtc.ctrl.onmessage = (e) => this.emit('ctrl', new Uint8Array(e.data as ArrayBuffer));
    rtc.input.onopen = async () => {
      if (this.rtc !== rtc) return;
      this.rtcUsable = true;
      this.setTransport(await rtcTransportKind(rtc.pc));
      this.setState('open');
    };
    const fallBack = () => {
      if (this.rtc !== rtc) return;
      this.rtcUsable = false;
      this.setTransport(this.canUseSocket ? (this.joinedDirect ? TransportKind.WS_LAN : TransportKind.WS_RELAY) : TransportKind.UNKNOWN);
      if (!this.canUseSocket) this.setState('reconnecting');
    };
    rtc.input.onclose = fallBack;
    rtc.pc.onconnectionstatechange = () => {
      const s = rtc.pc.connectionState;
      if (s === 'failed') {
        fallBack();
        // Try again later; the WebSocket path carries input meanwhile.
        setTimeout(() => this.rtc === rtc && !this.closed && this.socket.isOpen && this.restartRtc(), 5000);
      } else if (s === 'disconnected') {
        fallBack();
      } else if (s === 'connected' && rtc.input.readyState === 'open' && !this.rtcUsable) {
        this.rtcUsable = true;
        void rtcTransportKind(rtc.pc).then((k) => this.rtc === rtc && this.setTransport(k));
        this.setState('open');
      }
    };
    void (async () => {
      const offer = await rtc.pc.createOffer();
      await rtc.pc.setLocalDescription(offer);
      this.socket.send({ t: 'signal', to: HOST_PEER, data: { kind: 'offer', sdp: rtc.pc.localDescription!.sdp } });
    })().catch(() => fallBack());
  }
}
