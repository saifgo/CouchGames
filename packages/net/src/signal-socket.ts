import type { ClientToServer, ServerToClient } from '@couch/protocol';
import { Emitter } from './emitter.js';

type Events = {
  open: [];
  message: [ServerToClient];
  binary: [Uint8Array];
  close: [code: number];
};

/** One WebSocket to the signaling/relay server. Reconnection is the owner's job. */
export class SignalSocket extends Emitter<Events> {
  private ws: WebSocket | null = null;

  constructor(readonly url: string) {
    super();
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Bytes queued in the socket but not yet sent: used to drop stale input instead of queueing. */
  get bufferedAmount(): number {
    return this.ws?.bufferedAmount ?? 0;
  }

  private pending: { promise: Promise<void>; reject: (e: Error) => void } | null = null;

  /**
   * Opens a fresh socket. Concurrent callers share one attempt; closing a socket
   * that is still connecting rejects its promise (callers never hang).
   */
  open(timeoutMs = 8000): Promise<void> {
    if (this.pending) return this.pending.promise;
    this.close();
    let rejectFn!: (e: Error) => void;
    const promise = new Promise<void>((resolve, reject) => {
      rejectFn = reject;
      const ws = new WebSocket(this.url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      const done = () => {
        clearTimeout(timer);
        this.pending = null;
      };
      const timer = setTimeout(() => {
        done();
        ws.onopen = ws.onerror = ws.onclose = null;
        ws.close();
        if (this.ws === ws) this.ws = null;
        reject(new Error(`could not reach ${this.url}`));
      }, timeoutMs);
      ws.onopen = () => {
        done();
        this.emit('open');
        resolve();
      };
      ws.onerror = () => {
        if (ws.readyState !== WebSocket.OPEN) {
          done();
          reject(new Error(`could not reach ${this.url}`));
        }
      };
      ws.onclose = (ev) => {
        if (this.pending?.promise === promise) {
          done();
          reject(new Error(`closed while connecting (${ev.code})`));
        }
        if (this.ws === ws) {
          this.ws = null;
          this.emit('close', ev.code);
        }
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          let msg: ServerToClient;
          try {
            msg = JSON.parse(ev.data) as ServerToClient;
          } catch {
            return;
          }
          this.emit('message', msg);
        } else {
          this.emit('binary', new Uint8Array(ev.data as ArrayBuffer));
        }
      };
    });
    this.pending = { promise, reject: rejectFn };
    return promise;
  }

  send(msg: ClientToServer): void {
    if (this.isOpen) this.ws!.send(JSON.stringify(msg));
  }

  sendBinary(bytes: Uint8Array): void {
    if (this.isOpen) this.ws!.send(bytes);
  }

  close(): void {
    const ws = this.ws;
    this.ws = null;
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      p.reject(new Error('closed'));
    }
    if (ws) {
      ws.onclose = ws.onmessage = ws.onerror = ws.onopen = null;
      ws.close();
    }
  }
}

/** ws(s):// URL of the /ws endpoint for an http(s) base URL. */
export function wsUrlFor(base: string): string {
  const u = new URL(base);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = '/ws';
  u.search = '';
  u.hash = '';
  return u.toString();
}
