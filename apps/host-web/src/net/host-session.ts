/**
 * TV-side session: rooms, player slots, clock sync, stats and the input hot path.
 *
 * Hot path (per input packet): decode into the player's preallocated InputState,
 * drop stale seq, record one-way latency, echo, and notify listeners. Nothing
 * here allocates per packet; the engine reads player state at its next frame.
 */
import {
  ClockSync,
  CLOCK_SYNC_INTERVAL_MS,
  createInputState,
  decodeControl,
  decodeInputInto,
  encodeControl,
  encodeEchoInto,
  LinkStats,
  MAX_PLAYERS,
  MsgType,
  PLAYER_COLORS,
  ProtocolError,
  summarize,
  TransportKind,
  u32Now,
  type ControlMsg,
  type HostScreen,
  type InputEcho,
  type InputState,
  type MenuAction,
  type RosterEntry,
  type SkinId,
} from '@couch/protocol';
import { Emitter, HostLink } from '@couch/net';

export interface Player {
  slot: number;
  clientId: string;
  name: string;
  color: string;
  peerId: number | null;
  connected: boolean;
  transport: TransportKind;
  /** Latest full input state (written in place by the hot path). */
  input: InputState;
  clock: ClockSync;
  stats: LinkStats;
  lastSeen: number;
  caps: { vibrate: boolean; gyro: boolean; ios: boolean };
}

export interface PlayerView {
  slot: number;
  name: string;
  color: string;
  connected: boolean;
  transport: TransportKind;
  rttMs: number;
  oneWayP50: number;
  oneWayP95: number;
  jitterMs: number;
  lossPct: number;
  /** The phone is an iPhone/iPad (picks the lobby icon). */
  ios: boolean;
}

export interface SessionView {
  state: 'connecting' | 'open' | 'reconnecting' | 'closed';
  room: string | null;
  players: PlayerView[];
}

type Events = {
  change: [SessionView];
  /** Fired for every accepted input packet (hot path, keep handlers tiny). */
  input: [Player];
  menu: [{ slot: number; action: MenuAction; arg: number }];
  join: [Player];
  leave: [Player];
};

const SESSION_KEY = 'couch.host.room';
/** A disconnected phone keeps its slot this long. */
const SLOT_HOLD_MS = 5 * 60_000;

export class HostSession extends Emitter<Events> {
  readonly link: HostLink;
  readonly players: (Player | null)[] = new Array(MAX_PLAYERS).fill(null);
  maxPlayers = 4;
  private readonly peerSlot = new Map<number, number>();
  private readonly pending = new Set<number>();
  private skin: SkinId = 'modern';
  private gameTitle: string | null = null;
  private hostState: { screen: HostScreen; paused: boolean; saveSlots: number[] } = { screen: 'library', paused: false, saveSlots: [] };
  private pingId = 0;
  private readonly echo: InputEcho = { seq: 0, clientTimeMs: 0, hostTimeMs: 0 };
  private readonly echoBuf = new Uint8Array(12);
  private readonly echoView = new DataView(this.echoBuf.buffer);
  private readonly scratch = createInputState();
  private timers: ReturnType<typeof setInterval>[] = [];
  view: SessionView = { state: 'connecting', room: null, players: [] };

  constructor(server: string, readonly hostName = 'Couch') {
    super();
    const saved = safeSession()?.getItem(SESSION_KEY);
    const prev = saved ? (JSON.parse(saved) as { room: string; secret: string }) : null;
    this.link = new HostLink({ server, name: hostName, ...(prev ? { room: prev.room, secret: prev.secret } : {}) });
    this.link.on('hosted', (h) => {
      safeSession()?.setItem(SESSION_KEY, JSON.stringify(h));
      this.publish();
    });
    this.link.on('state', () => this.publish());
    this.link.on('peerJoin', (p) => this.pending.add(p.id));
    this.link.on('peerLeave', (id) => this.onPeerLeave(id));
    this.link.on('transport', (id, k) => {
      const p = this.byPeer(id);
      if (p) {
        // New path, new statistics: don't mix WebSocket and WebRTC samples.
        if (p.transport !== k) p.stats.reset();
        p.transport = k;
        this.publish();
      }
    });
    this.link.on('input', (id, view) => this.onInput(id, view));
    this.link.on('ctrl', (id, bytes) => this.onCtrl(id, bytes));
  }

  start(): void {
    this.link.start();
    this.timers.push(setInterval(() => this.tick(), CLOCK_SYNC_INTERVAL_MS / 2));
    this.timers.push(setInterval(() => this.publish(), 1000));
  }

  close(): void {
    for (const t of this.timers) clearInterval(t);
    this.link.close();
  }

  /* ------------------------------------------------------------ public */

  setSkin(skin: SkinId, gameTitle: string | null): void {
    this.skin = skin;
    this.gameTitle = gameTitle;
    this.broadcast(encodeControl({ type: MsgType.SKIN, skin, gameTitle }));
  }

  setHostState(screen: HostScreen, paused: boolean, saveSlots: number[]): void {
    this.hostState = { screen, paused, saveSlots };
    this.broadcast(encodeControl({ type: MsgType.HOST_STATE, ...this.hostState }));
  }

  rumble(slot: number, strong: number, weak: number, durationMs: number): void {
    const p = this.players[slot];
    if (p?.peerId != null) this.link.sendCtrl(p.peerId, encodeControl({ type: MsgType.RUMBLE, strong, weak, durationMs }));
  }

  /** Swap two slots (controller reassignment from the TV menu). */
  swapSlots(a: number, b: number): void {
    if (a === b) return;
    const pa = this.players[a] ?? null;
    const pb = this.players[b] ?? null;
    this.players[a] = pb;
    this.players[b] = pa;
    for (const [slot, p] of [
      [a, pb],
      [b, pa],
    ] as const) {
      if (!p) continue;
      p.slot = slot;
      p.color = PLAYER_COLORS[slot]!;
      if (p.peerId != null) {
        this.peerSlot.set(p.peerId, slot);
        this.link.sendCtrl(p.peerId, encodeControl({ type: MsgType.SLOT, slot, color: p.color }));
      }
    }
    this.sendRoster();
    this.publish();
  }

  removePlayer(slot: number): void {
    const p = this.players[slot];
    if (!p) return;
    if (p.peerId != null) {
      this.link.sendCtrl(p.peerId, encodeControl({ type: MsgType.LEAVE }));
      this.link.kick(p.peerId);
      this.peerSlot.delete(p.peerId);
    }
    this.players[slot] = null;
    this.emit('leave', p);
    this.sendRoster();
    this.publish();
  }

  /**
   * Frees the slots of phones that left (kept 5 minutes for a reconnect), then moves everyone
   * up so players fill P1, P2, … in their current order. Fixes "P1 left and the game only
   * listens to P1". Returns how many away players were removed.
   */
  tidySlots(): number {
    const away = this.players.filter((p): p is NonNullable<typeof p> => !!p && !p.connected).map((p) => p.slot);
    for (const slot of away) this.removePlayer(slot);
    const list = this.players.filter((p): p is NonNullable<typeof p> => !!p).sort((a, b) => a.slot - b.slot);
    this.players.fill(null);
    let moved = false;
    list.forEach((p, i) => {
      this.players[i] = p;
      if (p.slot === i) return;
      moved = true;
      p.slot = i;
      p.color = PLAYER_COLORS[i]!;
      if (p.peerId != null) {
        this.peerSlot.set(p.peerId, i);
        this.link.sendCtrl(p.peerId, encodeControl({ type: MsgType.SLOT, slot: i, color: p.color }));
      }
    });
    if (moved) {
      this.sendRoster();
      this.publish();
    }
    return away.length;
  }

  /* --------------------------------------------------------- hot path */

  private onInput(peerId: number, view: DataView): void {
    const now = performance.now();
    const slot = this.peerSlot.get(peerId);
    if (slot === undefined) return;
    const p = this.players[slot];
    if (!p) return;
    // Decode into scratch first so a stale packet never touches live state.
    if (!decodeInputInto(view, this.scratch)) return;
    const s = this.scratch;
    const transit = p.clock.synced ? p.clock.oneWay(s.clientTimeMs, now) : NaN;
    if (!p.stats.onPacket(s.seq, transit)) return;
    const d = p.input;
    d.seq = s.seq;
    d.clientTimeMs = s.clientTimeMs;
    d.buttons = s.buttons;
    d.lx = s.lx;
    d.ly = s.ly;
    d.rx = s.rx;
    d.ry = s.ry;
    d.l2 = s.l2;
    d.r2 = s.r2;
    d.hasGyro = s.hasGyro;
    d.gx = s.gx;
    d.gy = s.gy;
    d.gz = s.gz;
    p.lastSeen = now;
    // Echo on the same path so the phone can measure RTT.
    this.echo.seq = s.seq;
    this.echo.clientTimeMs = s.clientTimeMs;
    this.echo.hostTimeMs = u32Now(now);
    encodeEchoInto(this.echo, this.echoView);
    this.link.sendInput(peerId, this.echoBuf);
    this.emit('input', p);
  }

  /* ----------------------------------------------------------- control */

  private onCtrl(peerId: number, bytes: Uint8Array): void {
    let msg: ControlMsg;
    try {
      msg = decodeControl(bytes);
    } catch (err) {
      if (err instanceof ProtocolError) console.warn(`[couch] peer ${peerId}: ${err.message}`);
      return;
    }
    switch (msg.type) {
      case MsgType.HELLO:
        return this.onHello(peerId, msg);
      case MsgType.PONG: {
        const p = this.byPeer(peerId);
        p?.clock.onPong(msg.hostTimeMs, msg.clientTimeMs, u32Now(performance.now()));
        return;
      }
      case MsgType.MENU: {
        const slot = this.peerSlot.get(peerId);
        if (slot !== undefined) this.emit('menu', { slot, action: msg.action, arg: msg.arg });
        return;
      }
      case MsgType.LEAVE: {
        const slot = this.peerSlot.get(peerId);
        if (slot !== undefined) this.removePlayer(slot);
        return;
      }
      default:
        return;
    }
  }

  private onHello(peerId: number, msg: Extract<ControlMsg, { type: typeof MsgType.HELLO }>): void {
    this.pending.delete(peerId);
    const name = String(msg.name || 'Player').slice(0, 16);
    // 1) same device reconnecting → same slot
    let slot = this.players.findIndex((p) => p?.clientId === msg.clientId);
    // 2) the slot it asks for, if free
    if (slot < 0 && msg.wantSlot != null && msg.wantSlot >= 0 && msg.wantSlot < this.maxPlayers && !this.players[msg.wantSlot]) slot = msg.wantSlot;
    // 3) first free slot; else reuse the longest-disconnected one
    if (slot < 0) slot = this.players.slice(0, this.maxPlayers).findIndex((p) => !p);
    if (slot < 0) {
      const stale = this.players
        .slice(0, this.maxPlayers)
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p && !p.connected && performance.now() - p.lastSeen > 10_000)
        .sort((a, b) => a.p!.lastSeen - b.p!.lastSeen)[0];
      if (stale) slot = stale.i;
    }
    if (slot < 0) {
      this.link.sendCtrl(peerId, encodeControl({ type: MsgType.ERROR, code: 'room-full', message: `All ${this.maxPlayers} player slots are taken` }));
      return;
    }
    let p = this.players[slot];
    if (!p || p.clientId !== msg.clientId) {
      p = {
        slot,
        clientId: msg.clientId,
        name,
        color: PLAYER_COLORS[slot]!,
        peerId,
        connected: true,
        transport: this.link.peer(peerId)?.transport ?? TransportKind.UNKNOWN,
        input: createInputState(),
        clock: new ClockSync(),
        stats: new LinkStats(600),
        lastSeen: performance.now(),
        caps: msg.caps,
      };
      this.players[slot] = p;
    } else {
      if (p.peerId != null && p.peerId !== peerId) this.peerSlot.delete(p.peerId);
      p.peerId = peerId;
      p.name = name;
      p.connected = true;
      p.caps = msg.caps;
      p.transport = this.link.peer(peerId)?.transport ?? p.transport;
      p.clock.reset();
      p.stats.reset();
      p.lastSeen = performance.now();
    }
    this.peerSlot.set(peerId, slot);
    this.link.sendCtrl(peerId, encodeControl({ type: MsgType.WELCOME, slot, color: p.color, name, skin: this.skin, hostName: this.hostName }));
    this.link.sendCtrl(peerId, encodeControl({ type: MsgType.SKIN, skin: this.skin, gameTitle: this.gameTitle }));
    this.link.sendCtrl(peerId, encodeControl({ type: MsgType.HOST_STATE, ...this.hostState }));
    // Burst of pings so the clock offset converges within a second (min-RTT filter).
    for (let i = 0; i < 5; i++) setTimeout(() => this.ping(p!), i * 200);
    this.emit('join', p);
    this.sendRoster();
    this.publish();
  }

  private onPeerLeave(peerId: number): void {
    this.pending.delete(peerId);
    const slot = this.peerSlot.get(peerId);
    this.peerSlot.delete(peerId);
    if (slot === undefined) return;
    const p = this.players[slot];
    if (!p || p.peerId !== peerId) return;
    p.peerId = null;
    p.connected = false;
    p.lastSeen = performance.now();
    // Release everything so the character doesn't keep running.
    const s = p.input;
    s.buttons = 0;
    s.lx = s.ly = s.rx = s.ry = s.l2 = s.r2 = 0;
    this.emit('input', p);
    this.emit('leave', p);
    this.sendRoster();
    this.publish();
  }

  /* ------------------------------------------------------- periodic */

  private ping(p: Player): void {
    if (p.peerId == null) return;
    this.link.sendCtrl(p.peerId, encodeControl({ type: MsgType.PING, id: this.pingId++ & 0xffff, hostTimeMs: u32Now(performance.now()) }));
  }

  private tick(): void {
    const now = performance.now();
    for (const p of this.players) {
      if (!p) continue;
      if (!p.connected) {
        if (now - p.lastSeen > SLOT_HOLD_MS) {
          this.players[p.slot] = null;
          this.sendRoster();
        }
        continue;
      }
      this.ping(p);
      if (p.peerId != null) {
        this.link.sendCtrl(
          p.peerId,
          encodeControl({
            type: MsgType.STATS,
            rttMs: Number.isNaN(p.clock.srtt) ? 0 : p.clock.srtt,
            jitterMs: p.stats.jitter,
            lossPermille: p.stats.lossPermille,
            transport: p.transport,
            slot: p.slot,
          }),
        );
      }
    }
  }

  private sendRoster(): void {
    const players: RosterEntry[] = this.players.flatMap((p) => (p ? [{ slot: p.slot, name: p.name, color: p.color, connected: p.connected }] : []));
    this.broadcast(encodeControl({ type: MsgType.ROSTER, players }));
  }

  private broadcast(bytes: Uint8Array<ArrayBuffer>): void {
    for (const p of this.players) if (p?.peerId != null) this.link.sendCtrl(p.peerId, bytes);
  }

  private byPeer(peerId: number): Player | null {
    const slot = this.peerSlot.get(peerId);
    return slot === undefined ? null : (this.players[slot] ?? null);
  }

  private publish(): void {
    this.view = {
      state: this.link.state,
      room: this.link.room,
      players: this.players.flatMap((p) => {
        if (!p) return [];
        const lat = summarize(p.stats.latency.values());
        return [
          {
            slot: p.slot,
            name: p.name,
            color: p.color,
            connected: p.connected,
            transport: p.transport,
            rttMs: p.clock.srtt,
            oneWayP50: lat.p50,
            oneWayP95: lat.p95,
            jitterMs: p.stats.jitter,
            lossPct: p.stats.lossPermille / 10,
            ios: p.caps?.ios ?? false,
          },
        ];
      }),
    };
    this.emit('change', this.view);
  }
}

function safeSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
