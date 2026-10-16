import {
  createInputState,
  encodeInputInto,
  HEARTBEAT_ACTIVE_MS,
  HEARTBEAT_IDLE_MS,
  u32Now,
  type InputState,
} from '@couch/protocol';

export interface InputSink {
  sendInput(bytes: Uint8Array<ArrayBuffer>): void;
}

/**
 * Owns the phone's input state and puts it on the wire.
 * - On every change: sent synchronously from the pointer handler (no frame wait).
 * - Heartbeat: 60 Hz while anything is held, 20 Hz when idle (brief §4), so a
 *   lost unreliable packet is corrected within one frame.
 * Always full state, never deltas. Zero allocation per packet.
 */
export class InputSender {
  readonly state: InputState = createInputState();
  sent = 0;
  private readonly buf = new Uint8Array(24);
  private readonly view = new DataView(this.buf.buffer);
  private readonly packets = [new Uint8Array(this.buf.buffer, 0, 18), new Uint8Array(this.buf.buffer, 0, 24)] as const;
  private lastSend = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private sink: InputSink | null = null) {}

  setSink(sink: InputSink | null): void {
    this.sink = sink;
  }

  get active(): boolean {
    const s = this.state;
    return s.buttons !== 0 || s.lx !== 0 || s.ly !== 0 || s.rx !== 0 || s.ry !== 0 || s.l2 !== 0 || s.r2 !== 0;
  }

  /** Send now (call after mutating `state`). */
  flush(now = performance.now()): void {
    if (!this.sink) return;
    const s = this.state;
    s.seq = (s.seq + 1) & 0xffff;
    s.clientTimeMs = u32Now(now);
    const len = encodeInputInto(s, this.view);
    this.sink.sendInput(len === 18 ? this.packets[0] : this.packets[1]);
    this.lastSend = now;
    this.sent++;
  }

  start(): void {
    if (this.timer) return;
    // 8 ms tick: fine enough to hold 60 Hz with setInterval jitter.
    this.timer = setInterval(() => {
      const now = performance.now();
      const period = this.active ? HEARTBEAT_ACTIVE_MS : HEARTBEAT_IDLE_MS;
      if (now - this.lastSend >= period - 2) this.flush(now);
    }, 8);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Release everything (e.g. app backgrounded) and tell the host. */
  releaseAll(): void {
    const s = this.state;
    s.buttons = 0;
    s.lx = s.ly = s.rx = s.ry = s.l2 = s.r2 = 0;
    this.flush();
  }
}
