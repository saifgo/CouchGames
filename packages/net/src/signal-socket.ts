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

  open(timeoutMs = 8000): Promise<void> {
    this.close();
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`could not reach ${this.url}`));
      }, timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        this.emit('open');
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`could not reach ${this.url}`));
      };
      ws.onclose = (ev) => {
        clearTimeout(timer);
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
