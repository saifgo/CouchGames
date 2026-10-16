import { Readable } from 'node:stream';
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startCouchServer, type CouchServer } from '../src/server.js';
import { S3Store, type S3StoreOptions } from '../src/store.js';

/** In-memory bucket answering the three commands S3Store uses (incl. Range and pagination). */
function fakeBucket(objects: Record<string, Buffer>, pageSize = 2) {
  const calls: string[] = [];
  const notFound = () => Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
  const send = async (cmd: unknown): Promise<unknown> => {
    if (cmd instanceof ListObjectsV2Command) {
      const { Prefix = '', Delimiter, ContinuationToken } = cmd.input;
      calls.push(`list ${Prefix}`);
      const keys = Object.keys(objects)
        .sort()
        .filter((k) => k.startsWith(Prefix) && !(Delimiter && k.slice(Prefix.length).includes(Delimiter)));
      const from = Number(ContinuationToken ?? 0);
      const page = keys.slice(from, from + pageSize);
      const more = from + pageSize < keys.length;
      return {
        Contents: page.map((Key) => ({ Key, Size: objects[Key]!.length, LastModified: new Date(1_700_000_000_000) })),
        IsTruncated: more,
        NextContinuationToken: more ? String(from + pageSize) : undefined,
      };
    }
    if (cmd instanceof HeadObjectCommand) {
      const o = objects[cmd.input.Key!];
      if (!o) throw notFound();
      return { ContentLength: o.length, LastModified: new Date(1_700_000_000_000) };
    }
    if (cmd instanceof GetObjectCommand) {
      const o = objects[cmd.input.Key!];
      if (!o) throw notFound();
      calls.push(`get ${cmd.input.Key} ${cmd.input.Range ?? ''}`);
      const m = /^bytes=(\d+)-(\d*)$/.exec(cmd.input.Range ?? '');
      const body = m ? o.subarray(Number(m[1]), m[2] ? Number(m[2]) + 1 : undefined) : o;
      return { Body: Readable.from([body]) };
    }
    throw new Error('unexpected command');
  };
  return { client: { send } as unknown as S3StoreOptions['client'], calls };
}

let srv: CouchServer;
const bucket = fakeBucket({
  'couch/roms/nes/A Game (USA).nes': Buffer.from('NES\x1aABCDEFGH'),
  'couch/roms/nes/B Game.nes': Buffer.from('NES\x1a'),
  'couch/roms/nes/C Game.nes': Buffer.from('NES\x1a'),
  'couch/roms/nes/notes.txt': Buffer.from('ignored'),
  'couch/roms/nes/sub/deeper.nes': Buffer.from('not listed'),
  'couch/roms/psx/Disc.cue': Buffer.from('FILE "Disc (Track 1).bin" BINARY\n  TRACK 01 MODE2/2352\n'),
  'couch/roms/psx/Disc (Track 1).bin': Buffer.alloc(16),
  'couch/roms/bios/scph5501.bin': Buffer.from('BIOS'),
  'elsewhere/nes/Outside.nes': Buffer.from('secret'),
});

beforeAll(async () => {
  const store = new S3Store({ bucket: 'b', prefix: '/couch/roms', client: bucket.client });
  srv = await startCouchServer({
    port: 0,
    host: '127.0.0.1',
    libraryRoots: [{ store, source: 'user', urlPrefix: '/roms' }],
    bios: store.sub('bios'),
    log: () => {},
  });
});
afterAll(() => srv.close());

describe('S3 library', () => {
  it('lists objects per system (paginated), links cue tracks', async () => {
    const { roms } = (await (await fetch(`${srv.url}/api/library`)).json()) as {
      roms: { title: string; system: string; url: string; extra: string[]; size: number }[];
    };
    expect(roms.map((r) => [r.system, r.title, r.size])).toEqual([
      ['nes', 'A Game', 12],
      ['nes', 'B Game', 4],
      ['nes', 'C Game', 4],
      ['psx', 'Disc', 55],
    ]);
    expect(roms[0]!.url).toBe('/roms/nes/A%20Game%20(USA).nes');
    expect(roms[3]!.extra).toEqual(['/roms/psx/Disc%20(Track%201).bin']);
  });

  it('streams objects through the server with Range support', async () => {
    const whole = await fetch(`${srv.url}/roms/nes/A%20Game%20(USA).nes`);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('content-length')).toBe('12');
    expect(await whole.text()).toBe('NES\x1aABCDEFGH');

    const part = await fetch(`${srv.url}/roms/nes/A%20Game%20(USA).nes`, { headers: { Range: 'bytes=4-6' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 4-6/12');
    expect(await part.text()).toBe('ABC');
    expect(bucket.calls).toContain('get couch/roms/nes/A Game (USA).nes bytes=4-6');

    const tail = await fetch(`${srv.url}/roms/nes/A%20Game%20(USA).nes`, { headers: { Range: 'bytes=-2' } });
    expect(await tail.text()).toBe('GH');
  });

  it('serves BIOS from the bios/ prefix and refuses keys outside the prefix', async () => {
    expect(await (await fetch(`${srv.url}/bios/scph5501.bin`)).text()).toBe('BIOS');
    expect((await fetch(`${srv.url}/roms/nes/missing.nes`)).status).toBe(404);
    expect((await fetch(`${srv.url}/roms/..%2F..%2Felsewhere/nes/Outside.nes`)).status).toBe(404);
    expect((await fetch(`${srv.url}/roms/nes//B%20Game.nes`)).status).toBe(404);
  });
});
