/**
 * Phone-side session: owns the PhoneLink, speaks the control protocol and
 * exposes a small observable snapshot for the UI. The input hot path does not
 * go through here (PadSurface → InputSender → PhoneLink directly).
 */
import {
  decodeControl,
  decodeEchoInto,
  encodeControl,
  MsgType,
  ProtocolError,
  Ring,
  summarize,
  TransportKind,
  u32Now,
  type ControlMsg,
  type HostScreen,
  type InputEcho,
  type MenuAction,
  type RosterEntry,
  type SkinId,
} from '@couch/protocol';
import { PhoneLink, type PhoneLinkState } from '@couch/net';
import { isIOS, type Haptics } from './haptics.js';
import { clientId, lastSlot, rememberSlot } from './settings.js';

export interface SessionSnapshot {
  link: PhoneLinkState;
  transport: TransportKind;
  hostName: string;
  slot: number | null;
  color: string;
  skin: SkinId;
  gameTitle: string | null;
  screen: HostScreen;
  paused: boolean;
  saveSlots: number[];
  roster: RosterEntry[];
  error: string | null;
  /** Phone-measured RTT from input echoes (ms). */
  rttP50: number;
  rttP95: number;
  /** Host-reported values (from STATS). */
  hostRtt: number;
  hostJitter: number;
  hostLoss: number;
}

type Listener = (s: SessionSnapshot) => void;

export class Session {
  readonly link: PhoneLink;
  snap: SessionSnapshot = {
    link: 'connecting',
    transport: TransportKind.UNKNOWN,
    hostName: '',
    slot: null,
    color: '#888',
    skin: 'modern',
    gameTitle: null,
    screen: 'lobby',
    paused: false,
    saveSlots: [],
    roster: [],
    error: null,
    rttP50: NaN,
    rttP95: NaN,
    hostRtt: NaN,
    hostJitter: NaN,
    hostLoss: 0,
  };
  private readonly listeners = new Set<Listener>();
  private readonly rtt = new Ring(240);
  private readonly sentAt = new Float64Array(65536);
  private readonly echo: InputEcho = { seq: 0, clientTimeMs: 0, hostTimeMs: 0 };
  private statsTimer: ReturnType<typeof setInterval>;

  constructor(
    readonly room: string,
    private name: string,
    private readonly haptics: Haptics,
    server = location.origin,
    caps = { gyro: typeof DeviceMotionEvent !== 'undefined' },
  ) {
    const mode = new URLSearchParams(location.search).get('transport');
    this.link = new PhoneLink({ server, room, clientId: clientId(), ...(mode === 'ws' || mode === 'webrtc' ? { mode } : {}) });
    this.link.on('state', (s) => {
      this.update({ link: s });
      if (s === 'open') this.hello(caps.gyro);
    });
    this.link.on('transport', (t) => this.update({ transport: t }));
    this.link.on('joined', (j) => this.update({ hostName: j.hostName, error: null }));
    this.link.on('error', (e) => this.update({ error: e.message }));
    this.link.on('ctrl', (bytes) => this.onCtrl(bytes));
    this.link.on('input', (view) => {
      if (!decodeEchoInto(view, this.echo)) return;
      const t = this.sentAt[this.echo.seq];
      if (t) this.rtt.push(performance.now() - t);
    });
    this.statsTimer = setInterval(() => {
      if (this.rtt.size < 5) return;
      const s = summarize(this.rtt.values());
      this.update({ rttP50: s.p50, rttP95: s.p95 });
    }, 1000);
  }

  /** Records the send time of each input seq so echoes give a precise RTT. */
  noteSent(seq: number, at: number): void {
    this.sentAt[seq & 0xffff] = at;
  }

  start(): void {
    this.link.start();
  }

  close(): void {
    clearInterval(this.statsTimer);
    try {
      this.link.sendCtrl(encodeControl({ type: MsgType.LEAVE }));
    } catch {
      /* not connected */
    }
    this.link.close();
  }

  setName(name: string): void {
    this.name = name;
    if (this.snap.link === 'open') this.hello(typeof DeviceMotionEvent !== 'undefined');
  }

  menu(action: MenuAction, arg = 0): void {
    this.link.sendCtrl(encodeControl({ type: MsgType.MENU, action, arg }));
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snap);
    return () => this.listeners.delete(fn);
  }

  private update(p: Partial<SessionSnapshot>) {
    this.snap = { ...this.snap, ...p };
    for (const fn of this.listeners) fn(this.snap);
  }

  private hello(gyro: boolean) {
    this.link.sendCtrl(
      encodeControl({
        type: MsgType.HELLO,
        clientId: clientId(),
        name: this.name || 'Player',
        wantSlot: this.snap.slot ?? lastSlot(this.room),
        caps: { vibrate: this.haptics.supported, gyro, ios: isIOS },
      }),
    );
  }

  private onCtrl(bytes: Uint8Array) {
    let msg: ControlMsg;
    try {
      msg = decodeControl(bytes);
    } catch (err) {
      if (err instanceof ProtocolError) console.warn('[couch] bad control message', err.message);
      return;
    }
    switch (msg.type) {
      case MsgType.PING:
        this.link.sendCtrl(encodeControl({ type: MsgType.PONG, id: msg.id, hostTimeMs: msg.hostTimeMs, clientTimeMs: u32Now(performance.now()) }));
        return;
      case MsgType.WELCOME:
        rememberSlot(this.room, msg.slot);
        this.update({ slot: msg.slot, color: msg.color, skin: msg.skin, hostName: msg.hostName, error: null });
        return;
      case MsgType.SLOT:
        rememberSlot(this.room, msg.slot);
        this.update({ slot: msg.slot, color: msg.color });
        return;
      case MsgType.SKIN:
        this.update({ skin: msg.skin, gameTitle: msg.gameTitle });
        return;
      case MsgType.RUMBLE:
        this.haptics.rumble(msg.strong, msg.weak, msg.durationMs);
        return;
      case MsgType.STATS:
        this.update({ hostRtt: msg.rttMs, hostJitter: msg.jitterMs, hostLoss: msg.lossPermille / 10 });
        return;
      case MsgType.ROSTER:
        this.update({ roster: msg.players });
        return;
      case MsgType.HOST_STATE:
        this.update({ screen: msg.screen, paused: msg.paused, saveSlots: msg.saveSlots });
        return;
      case MsgType.ERROR:
        this.update({ error: msg.message });
        return;
      case MsgType.LEAVE:
        this.update({ error: 'The TV removed this controller', slot: null });
        return;
      default:
        return;
    }
  }
}
