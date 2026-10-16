import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32, headerSkip, MetadataStore, parseDat } from '../src/metadata.js';

const DAT = `clrmamepro ( name "Nintendo - Nintendo Entertainment System" )
game (
	name "Cool Game (USA)"
	rom ( name "Cool Game (USA).nes" size 4 crc D87F7E0C md5 0 sha1 0 )
)
game (
	name "Other \\"Quoted\\" (Europe)"
	rom ( name "x.nes" size 1 crc 00000001 )
)`;

describe('metadata', () => {
  it('parses clrmamepro DATs', () => {
    const m = parseDat(DAT);
    expect(m.get('D87F7E0C')).toBe('Cool Game (USA)');
    expect(m.size).toBe(2);
  });

  it('skips iNES and SNES copier headers', () => {
    expect(headerSkip('nes', 40976, new Uint8Array([0x4e, 0x45, 0x53, 0x1a]))).toBe(16);
    expect(headerSkip('snes', 1024 * 512 + 512, new Uint8Array(4))).toBe(512);
    expect(headerSkip('snes', 1024 * 512, new Uint8Array(4))).toBe(0);
  });

  it('looks a headered NES ROM up by its headerless CRC (no network: DAT injected)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'couch-meta-'));
    const rom = join(dir, 'whatever.nes');
    writeFileSync(rom, Buffer.concat([Buffer.from('NES\x1a'), Buffer.alloc(12), Buffer.from('test')]));
    expect(await crc32(rom, 16)).toBe('D87F7E0C'); // CRC32("test")
    const fakeFetch = (async () => new Response(DAT)) as typeof fetch;
    const store = new MetadataStore(join(dir, 'cache'), () => {}, fakeFetch);
    expect(await store.lookup('nes', rom)).toEqual({ crc: 'D87F7E0C', name: 'Cool Game (USA)' });
    expect(await store.peek(rom)).toEqual({ crc: 'D87F7E0C', name: 'Cool Game (USA)' });
  });
});
