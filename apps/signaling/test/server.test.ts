import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { ServerToClient } from '@couch/protocol';
import { startCouchServer, type CouchServer } from '../src/server.js';

let srv: CouchServer;
let wsUrl: string;
const romDir = mkdtempSync(join(tmpdir(), 'couch-roms-'));

beforeAll(async () => {
  mkdirSync(join(romDir, 'nes'));
  mkdirSync(join(romDir, 'psx'));
  writeFileSync(join(romDir, 'nes', 'Cool Game (USA).nes'), Buffer.from('NES\x1a'));
  writeFileSync(join(romDir, 'nes', 'readme.txt'), 'ignored');
  writeFileSync(join(romDir, 'psx', 'Disc.cue'), 'FILE "Disc (Track 1).bin" BINARY\n  TRACK 01 MODE2/2352\n');
  writeFileSync(join(romDir, 'psx', 'Disc (Track 1).bin'), Buffer.alloc(16));
  srv = await startCouchServer({
    port: 0,
    host: '127.0.0.1',
    hostGraceMs: 200,
    libraryRoots: [{ dir: romDir, source: 'user', urlPrefix: '/roms' }],
    log: () => {},
  });
  wsUrl = srv.url.replace('http', 'ws') + '/ws';
});
afterAll(() => srv.close());

class Client {
  ws: WebSocket;
  inbox: (ServerToClient | Uint8Array)[] = [];
  waiters: (() => void)[] = [];
  constructor() {
    this.ws = new WebSocket(wsUrl);
    this.ws.on('message', (d, bin) => {
      this.inbox.push(bin ? new Uint8Array(d as Buffer) : (JSON.parse(d.toString()) as ServerToClient));
      this.waiters.splice(0).forEach((w) => w());
    });
  }
  open() {
    return new Promise<void>((ok) => this.ws.once('open', () => ok()));
  }
  send(m: unknown) {
    this.ws.send(JSON.stringify(m));
  }
  async next<T = ServerToClient>(pred: (m: ServerToClient | Uint8Array) => boolean = () => true): Promise<T> {
    for (;;) {
      const i = this.inbox.findIndex(pred);
      if (i >= 0) return this.inbox.splice(i, 1)[0] as T;
      await new Promise<void>((ok, fail) => {
        this.waiters.push(ok);
        setTimeout(() => fail(new Error('timeout')), 2000);
      });
    }
  }
}
const isT = (t: string) => (m: ServerToClient | Uint8Array) => !(m instanceof Uint8Array) && m.t === t;

describe('rooms + signaling', () => {
  it('creates a room, joins a phone, forwards signals and relays binary frames', async () => {
    const host = new Client();
    await host.open();
    host.send({ t: 'host', name: 'TV' });
    const hosted = await host.next<Extract<ServerToClient, { t: 'hosted' }>>(isT('hosted'));
    expect(hosted.room).toMatch(/^[A-Z]{4}$/);

    const phone = new Client();
    await phone.open();
    phone.send({ t: 'join', room: hosted.room.toLowerCase(), clientId: 'p1' });
    const joined = await phone.next<Extract<ServerToClient, { t: 'joined' }>>(isT('joined'));
    expect(joined.hostName).toBe('TV');
    const peer = await host.next<Extract<ServerToClient, { t: 'peer' }>>(isT('peer'));
    expect(peer.peer).toBe(joined.peer);

    phone.send({ t: 'signal', to: 0, data: { kind: 'offer', sdp: 'x' } });
    expect(await host.next(isT('signal'))).toEqual({ t: 'signal', from: joined.peer, data: { kind: 'offer', sdp: 'x' } });
    host.send({ t: 'signal', to: joined.peer, data: { kind: 'answer', sdp: 'y' } });
    expect(await phone.next(isT('signal'))).toEqual({ t: 'signal', from: 0, data: { kind: 'answer', sdp: 'y' } });

    // phone → host: [ch][payload] becomes [ch][peer u16][payload]
    phone.ws.send(new Uint8Array([0, 0xaa, 0xbb]));
    const up = await host.next<Uint8Array>((m) => m instanceof Uint8Array);
    expect(Array.from(up)).toEqual([0, joined.peer & 0xff, joined.peer >> 8, 0xaa, 0xbb]);
    // host → phone strips the peer id
    host.ws.send(new Uint8Array([1, joined.peer & 0xff, joined.peer >> 8, 0x42]));
    const down = await phone.next<Uint8Array>((m) => m instanceof Uint8Array);
    expect(Array.from(down)).toEqual([1, 0x42]);

    // Host reload: phones hear host-left, then host-back after reclaim with the secret.
    host.ws.close();
    await phone.next(isT('host-left'));
    const host2 = new Client();
    await host2.open();
    host2.send({ t: 'host', room: hosted.room, secret: 'wrong' });
    expect(await host2.next(isT('error'))).toMatchObject({ code: 'room-taken' });
    host2.send({ t: 'host', room: hosted.room, secret: hosted.secret });
    await host2.next(isT('hosted'));
    expect(await host2.next(isT('peer'))).toMatchObject({ peer: joined.peer, clientId: 'p1' });
    await phone.next(isT('host-back'));

    // Same clientId reconnecting supersedes the old socket.
    const phoneAgain = new Client();
    await phoneAgain.open();
    phoneAgain.send({ t: 'join', room: hosted.room, clientId: 'p1' });
    await phoneAgain.next(isT('joined'));
    expect(await host2.next(isT('peer-left'))).toMatchObject({ peer: joined.peer });
    host2.ws.close();
    phoneAgain.ws.close();
  });

  it('rejects unknown rooms', async () => {
    const phone = new Client();
    await phone.open();
    phone.send({ t: 'join', room: 'ZZZZ', clientId: 'x' });
    expect(await phone.next(isT('error'))).toMatchObject({ code: 'no-room' });
    phone.ws.close();
  });
});

describe('library API', () => {
  it('lists ROMs by system, links cue tracks and serves files with ranges', async () => {
    const res = await fetch(`${srv.url}/api/library`);
    const { roms } = (await res.json()) as { roms: { title: string; system: string; url: string; extra: string[] }[] };
    expect(roms.map((r) => [r.system, r.title])).toEqual([
      ['nes', 'Cool Game'],
      ['psx', 'Disc'],
    ]);
    expect(roms[1]!.extra).toEqual(['/roms/psx/Disc%20(Track%201).bin']);
    const file = await fetch(srv.url + roms[0]!.url, { headers: { Range: 'bytes=0-2' } });
    expect(file.status).toBe(206);
    expect(await file.text()).toBe('NES');
    expect((await fetch(`${srv.url}/roms/..%2F..%2Fsecret`)).status).toBe(404);
  });
});
