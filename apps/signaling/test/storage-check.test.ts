import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { startCouchServer } from '../src/server.js';
import { checkStorage, classify } from '../src/storage-check.js';
import { FsStore, S3Store, type S3StoreOptions } from '../src/store.js';

/** Bucket answering List (paginated, 2 per page) and Get; `fail` makes every call throw it. */
function bucket(objects: Record<string, string>, fail?: object, failGet?: object) {
  const send = async (cmd: unknown): Promise<unknown> => {
    if (fail) throw fail;
    if (cmd instanceof ListObjectsV2Command) {
      const { Prefix = '', Delimiter, ContinuationToken } = cmd.input;
      const keys = Object.keys(objects)
        .sort()
        .filter((k) => k.startsWith(Prefix) && !(Delimiter && k.slice(Prefix.length).includes(Delimiter)));
      const from = Number(ContinuationToken ?? 0);
      const more = from + 2 < keys.length;
      return {
        Contents: keys.slice(from, from + 2).map((Key) => ({ Key, Size: objects[Key]!.length })),
        IsTruncated: more,
        NextContinuationToken: more ? String(from + 2) : undefined,
      };
    }
    if (cmd instanceof GetObjectCommand) {
      if (failGet) throw failGet;
      return { Body: Readable.from([Buffer.from(objects[cmd.input.Key!] ?? '')]) };
    }
    throw new Error('unexpected command');
  };
  return { send } as unknown as S3StoreOptions['client'];
}

const awsError = (name: string, status: number) => Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } });

describe('classify', () => {
  it('accepts <system>/<file> and bios/<file>', () => {
    expect(classify('snes/Game.sfc')).toEqual({ kind: 'game', system: 'snes' });
    expect(classify('pce/Bonk.pce')).toEqual({ kind: 'game', system: 'pce' });
    expect(classify('bios/scph5501.bin')).toEqual({ kind: 'bios' });
  });

  it('explains files the server will not pick up', () => {
    const reason = (p: string) => (classify(p) as { reason?: string }).reason ?? '';
    expect(reason('Game.sfc')).toMatch(/top level/);
    expect(reason('SNES/Game.sfc')).toMatch(/rename "SNES\/" to "snes\/"/);
    expect(reason('roms/snes/Game.sfc')).toMatch(/not a system folder/);
    expect(reason('snes/USA/Game.sfc')).toMatch(/sub-folder/);
    expect(reason('snes/Game.7z')).toMatch(/not a Super Nintendo format/);
  });

  it('ignores cue track files, dotfiles and readmes', () => {
    expect(classify('psx/Disc (Track 1).bin').kind).toBe('ignore');
    expect(classify('nes/.gitkeep').kind).toBe('ignore');
    expect(classify('README.md').kind).toBe('ignore');
  });
});

describe('checkStorage on S3', () => {
  const objects = {
    'couch/roms/nes/A.nes': 'NES',
    'couch/roms/nes/B.nes': 'NES',
    'couch/roms/snes/': '', // folder placeholder from an upload tool
    'couch/roms/snes/C.sfc': 'SFC',
    'couch/roms/SNES/D.sfc': 'SFC',
    'couch/roms/bios/scph5501.bin': 'BIOS',
    'other/nes/Outside.nes': 'NES',
  };

  it('counts games per system, lists BIOS and misplaced files, proves read access', async () => {
    const r = await checkStorage(new S3Store({ bucket: 'b', prefix: 'couch/roms/', region: 'eu-west-3', client: bucket(objects) }));
    expect(r.ok).toBe(true);
    expect(r.store).toEqual({ kind: 's3', bucket: 'b', prefix: 'couch/roms/', region: 'eu-west-3' });
    expect([r.canList, r.canRead]).toEqual([true, true]);
    expect(r.games).toBe(3);
    expect(r.perSystem).toEqual({ nes: 2, snes: 1 });
    expect(r.bios).toEqual(['scph5501.bin']);
    expect(r.misplaced).toEqual([{ path: 'SNES/D.sfc', reason: expect.stringMatching(/case-sensitive/) }]);
  });

  it.each([
    ['InvalidAccessKeyId', 403, /access key ID/],
    ['SignatureDoesNotMatch', 403, /secret key is wrong/],
    ['NoSuchBucket', 404, /does not exist/],
    ['AccessDenied', 403, /s3:ListBucket/],
    ['PermanentRedirect', 301, /S3_REGION/],
  ])('explains %s', async (name, status, msg) => {
    const r = await checkStorage(new S3Store({ bucket: 'b', client: bucket({}, awsError(name, status)) }));
    expect(r.ok).toBe(false);
    expect(r.canList).toBe(false);
    expect(r.errorCode).toBe(name);
    expect(r.error).toMatch(msg);
  });

  it('reports a key that can list but not read', async () => {
    const r = await checkStorage(new S3Store({ bucket: 'b', prefix: 'couch/roms', client: bucket(objects, undefined, awsError('AccessDenied', 403)) }));
    expect([r.ok, r.canList, r.canRead]).toEqual([false, true, false]);
    expect(r.error).toMatch(/reading files fails/);
  });
});

describe('/api/storage', () => {
  it('serves the report, and a missing local folder is an error', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'couch-store-'));
    mkdirSync(join(dir, 'gba'));
    writeFileSync(join(dir, 'gba', 'Game.gba'), 'GBA');
    const srv = await startCouchServer({ port: 0, host: '127.0.0.1', libraryRoots: [{ store: new FsStore(dir), source: 'user', urlPrefix: '/roms' }], log: () => {} });
    try {
      const r = (await (await fetch(`${srv.url}/api/storage?fresh`)).json()) as { ok: boolean; games: number; store: { kind: string } };
      expect(r).toMatchObject({ ok: true, games: 1, store: { kind: 'local' } });
    } finally {
      await srv.close();
    }
    const missing = await checkStorage(new FsStore(join(dir, 'nope')));
    expect(missing.ok).toBe(false);
    expect(missing.error).toMatch(/does not exist/);
  });
});
