import { randomBytes } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  frameForPeer,
  generateRoomCode,
  HOST_PEER,
  normalizeRoomCode,
  parseHostFrame,
  type ClientToServer,
  type RTCIceServerLike,
  type ServerToClient,
} from '@couch/protocol';

export interface RoomsOptions {
  iceServers: RTCIceServerLike[];
  /** Keep a room alive this long after its host disconnects (host page reload). */
  hostGraceMs: number;
  maxPeersPerRoom: number;
  /** Artificial one-way delay added to relayed binary frames, to emulate a distant cloud relay. */
  relayDelayMs: number;
  log: (msg: string) => void;
}

interface Peer {
  id: number;
  ws: WebSocket;
  clientId: string;
  remote: string;
}

interface Room {
  code: string;
  secret: string;
  name: string;
  host: WebSocket | null;
  peers: Map<number, Peer>;
  nextPeer: number;
  graceTimer: NodeJS.Timeout | null;
}

type Role = { kind: 'none' } | { kind: 'host'; room: Room } | { kind: 'peer'; room: Room; peer: Peer };

const send = (ws: WebSocket, msg: ServerToClient) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
};

export class Rooms {
  private readonly rooms = new Map<string, Room>();
  private readonly roles = new WeakMap<WebSocket, Role>();

  constructor(private readonly opts: RoomsOptions) {}

  get size(): number {
    return this.rooms.size;
  }

  attach(ws: WebSocket, remote: string): void {
    this.roles.set(ws, { kind: 'none' });
    ws.on('message', (data, isBinary) => {
      try {
        if (isBinary) this.onBinary(ws, toBytes(data));
        else this.onText(ws, data.toString(), remote);
      } catch (err) {
        this.opts.log(`message error from ${remote}: ${(err as Error).message}`);
        send(ws, { t: 'error', code: 'bad-request', message: 'malformed message' });
      }
    });
    ws.on('error', (err) => this.opts.log(`socket error from ${remote}: ${err.message}`));
    ws.on('close', (code, reason) => {
      const role = this.roles.get(ws);
      if (role && role.kind !== 'none') this.opts.log(`${role.kind} ${role.kind === 'peer' ? role.peer.id : ''} in ${role.room.code} closed: ${code} ${reason.toString()}`);
      this.onClose(ws);
    });
  }

  private onText(ws: WebSocket, text: string, remote: string): void {
    const msg = JSON.parse(text) as ClientToServer;
    const role = this.roles.get(ws) ?? { kind: 'none' };
    switch (msg.t) {
      case 'ping':
        send(ws, { t: 'pong', at: msg.at });
        return;
      case 'host':
        return this.onHost(ws, msg);
      case 'join':
        return this.onJoin(ws, msg.room, String(msg.clientId ?? ''), remote);
      case 'signal': {
        if (role.kind === 'host') {
          const peer = role.room.peers.get(msg.to);
          if (peer) send(peer.ws, { t: 'signal', from: HOST_PEER, data: msg.data });
        } else if (role.kind === 'peer') {
          if (role.room.host) send(role.room.host, { t: 'signal', from: role.peer.id, data: msg.data });
        }
        return;
      }
      case 'kick': {
        if (role.kind !== 'host') return;
        const peer = role.room.peers.get(msg.peer);
        if (peer) {
          send(peer.ws, { t: 'error', code: 'kicked', message: 'Removed by host' });
          peer.ws.close(4000, 'kicked');
        }
        return;
      }
      default:
        send(ws, { t: 'error', code: 'bad-request', message: 'unknown message' });
    }
  }

  private onHost(ws: WebSocket, msg: Extract<ClientToServer, { t: 'host' }>): void {
    const wanted = msg.room ? normalizeRoomCode(msg.room) : null;
    let room = wanted ? this.rooms.get(wanted) : undefined;
    if (room) {
      if (room.secret !== msg.secret) {
        send(ws, { t: 'error', code: 'room-taken', message: 'Room code in use' });
        return;
      }
      // Host is back (page reload): reattach and tell phones to reconnect their WebRTC link.
      if (room.graceTimer) clearTimeout(room.graceTimer);
      room.graceTimer = null;
      if (room.host && room.host !== ws) room.host.close(4001, 'replaced');
      room.host = ws;
      this.roles.set(ws, { kind: 'host', room });
      send(ws, { t: 'hosted', room: room.code, secret: room.secret, iceServers: this.opts.iceServers });
      for (const p of room.peers.values()) {
        send(ws, { t: 'peer', peer: p.id, clientId: p.clientId, remote: p.remote });
        send(p.ws, { t: 'host-back' });
      }
      this.opts.log(`room ${room.code} reclaimed by host`);
      return;
    }
    let code = wanted ?? generateRoomCode();
    while (!wanted && this.rooms.has(code)) code = generateRoomCode();
    room = {
      code,
      secret: randomBytes(16).toString('hex'),
      name: (msg.name ?? 'Couch').slice(0, 40),
      host: ws,
      peers: new Map(),
      nextPeer: 1,
      graceTimer: null,
    };
    this.rooms.set(code, room);
    this.roles.set(ws, { kind: 'host', room });
    send(ws, { t: 'hosted', room: code, secret: room.secret, iceServers: this.opts.iceServers });
    this.opts.log(`room ${code} created (${this.rooms.size} rooms)`);
  }

  private onJoin(ws: WebSocket, rawRoom: string, clientId: string, remote: string): void {
    const code = normalizeRoomCode(String(rawRoom));
    const room = code ? this.rooms.get(code) : undefined;
    if (!room) {
      send(ws, { t: 'error', code: 'no-room', message: 'No TV with that code' });
      return;
    }
    // A phone that reconnects with the same clientId replaces its old socket.
    for (const p of room.peers.values()) {
      if (p.clientId === clientId && clientId) {
        room.peers.delete(p.id);
        this.opts.log(`peer ${p.id} in ${room.code} superseded by a reconnect of the same device`);
        p.ws.close(4002, 'superseded');
        if (room.host) send(room.host, { t: 'peer-left', peer: p.id });
      }
    }
    if (room.peers.size >= this.opts.maxPeersPerRoom) {
      send(ws, { t: 'error', code: 'room-full', message: 'Too many devices in this room' });
      return;
    }
    const peer: Peer = { id: room.nextPeer++, ws, clientId, remote };
    if (room.nextPeer > 0xffff) room.nextPeer = 1;
    room.peers.set(peer.id, peer);
    this.roles.set(ws, { kind: 'peer', room, peer });
    send(ws, { t: 'joined', room: room.code, peer: peer.id, hostName: room.name, iceServers: this.opts.iceServers });
    if (room.host) send(room.host, { t: 'peer', peer: peer.id, clientId, remote });
    else send(ws, { t: 'host-left' });
  }

  private onBinary(ws: WebSocket, bytes: Uint8Array): void {
    const role = this.roles.get(ws);
    if (!role || role.kind === 'none') return;
    if (role.kind === 'peer') {
      const host = role.room.host;
      if (!host || bytes.length < 2) return;
      const channel = bytes[0]!;
      if (channel > 1) return;
      const framed = frameForPeer(channel as 0 | 1, role.peer.id, bytes.subarray(1));
      this.deliver(host, framed);
    } else {
      const f = parseHostFrame(bytes);
      if (!f) return;
      const peer = role.room.peers.get(f.peer);
      if (!peer) return;
      const out = new Uint8Array(f.payload.length + 1);
      out[0] = f.channel;
      out.set(f.payload, 1);
      this.deliver(peer.ws, out);
    }
  }

  private deliver(ws: WebSocket, bytes: Uint8Array): void {
    if (this.opts.relayDelayMs > 0) {
      setTimeout(() => ws.readyState === ws.OPEN && ws.send(bytes), this.opts.relayDelayMs);
    } else if (ws.readyState === ws.OPEN) {
      ws.send(bytes);
    }
  }

  private onClose(ws: WebSocket): void {
    const role = this.roles.get(ws);
    this.roles.delete(ws);
    if (!role || role.kind === 'none') return;
    if (role.kind === 'peer') {
      const { room, peer } = role;
      if (room.peers.get(peer.id)?.ws === ws) {
        room.peers.delete(peer.id);
        if (room.host) send(room.host, { t: 'peer-left', peer: peer.id });
      }
      return;
    }
    const { room } = role;
    if (room.host !== ws) return;
    room.host = null;
    for (const p of room.peers.values()) send(p.ws, { t: 'host-left' });
    room.graceTimer = setTimeout(() => {
      for (const p of room.peers.values()) p.ws.close(4003, 'room closed');
      this.rooms.delete(room.code);
      this.opts.log(`room ${room.code} closed`);
    }, this.opts.hostGraceMs);
  }

  close(): void {
    for (const room of this.rooms.values()) if (room.graceTimer) clearTimeout(room.graceTimer);
    this.rooms.clear();
  }
}

function toBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data as Buffer[]));
  throw new Error('unsupported frame');
}
