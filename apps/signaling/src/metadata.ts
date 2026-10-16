/**
 * Metadata by hash (M6): CRC32 of the ROM → canonical No-Intro name from the
 * libretro-database DAT files (CC-BY-SA-4.0). The canonical name is what box-art
 * lookups (thumbnails.libretro.com) key on, so badly named files still get art.
 *
 * Only public DAT files are downloaded; nothing about the user's ROMs leaves the
 * machine. Disc systems (PS1/PSP/PS2) are skipped: CRC-ing gigabytes is too slow
 * and their DATs are per-track.
 */
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConsoleId } from '@couch/protocol';

const DAT_NAMES: Partial<Record<ConsoleId, string>> = {
  nes: 'Nintendo - Nintendo Entertainment System',
  snes: 'Nintendo - Super Nintendo Entertainment System',
  genesis: 'Sega - Mega Drive - Genesis',
  gb: 'Nintendo - Game Boy',
  gbc: 'Nintendo - Game Boy Color',
  gba: 'Nintendo - Game Boy Advance',
  n64: 'Nintendo - Nintendo 64',
  nds: 'Nintendo - Nintendo DS',
};
const MAX_BYTES = 64 * 1024 * 1024;

export interface Meta {
  crc: string;
  /** Canonical No-Intro name, e.g. "Super Mario World (USA)". */
  name: string | null;
}

/** Bytes to skip before hashing: iNES header, SNES copier header. */
export function headerSkip(system: ConsoleId, size: number, firstBytes: Uint8Array): number {
  if (system === 'nes' && firstBytes[0] === 0x4e && firstBytes[1] === 0x45 && firstBytes[2] === 0x53 && firstBytes[3] === 0x1a) return 16;
  if (system === 'snes' && size % 1024 === 512) return 512;
  return 0;
}

let crcTable: Uint32Array | null = null;
function table(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

export async function crc32(path: string, skip = 0): Promise<string> {
  const t = table();
  let crc = 0xffffffff;
  for await (const chunk of createReadStream(path, { start: skip })) {
    const buf = chunk as Buffer;
    for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

/** Parses clrmamepro DAT text into CRC → game name. */
export function parseDat(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /game \(\s*name "((?:[^"\\]|\\.)*)"[\s\S]*?rom \( name "[^"]*" size \d+ crc ([0-9A-Fa-f]{8})/g;
  for (const m of text.matchAll(re)) out.set(m[2]!.toUpperCase(), m[1]!);
  return out;
}

export class MetadataStore {
  private dats = new Map<string, Promise<Map<string, string> | null>>();
  private cache: Record<string, Meta & { key: string }> = {};
  private loaded = false;
  private saving: Promise<void> | null = null;

  constructor(
    private readonly cacheDir: string,
    private readonly log: (m: string) => void = () => {},
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      this.cache = JSON.parse(await readFile(join(this.cacheDir, 'crc.json'), 'utf8'));
    } catch {
      this.cache = {};
    }
  }

  private save() {
    this.saving ??= (async () => {
      await new Promise((r) => setTimeout(r, 500));
      await mkdir(this.cacheDir, { recursive: true });
      await writeFile(join(this.cacheDir, 'crc.json'), JSON.stringify(this.cache));
      this.saving = null;
    })();
  }

  private dat(system: ConsoleId): Promise<Map<string, string> | null> {
    const name = DAT_NAMES[system];
    if (!name) return Promise.resolve(null);
    let p = this.dats.get(name);
    if (!p) {
      p = (async () => {
        const file = join(this.cacheDir, 'dat', `${name}.dat`);
        let text: string | null = null;
        try {
          text = await readFile(file, 'utf8');
        } catch {
          try {
            const url = `https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/no-intro/${encodeURIComponent(name)}.dat`;
            const res = await this.fetchImpl(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            text = await res.text();
            await mkdir(join(this.cacheDir, 'dat'), { recursive: true });
            await writeFile(file, text);
            this.log(`downloaded DAT ${name}`);
          } catch (err) {
            this.log(`no DAT for ${name}: ${(err as Error).message}`);
            this.dats.delete(name);
            return null;
          }
        }
        return parseDat(text);
      })();
      this.dats.set(name, p);
    }
    return p;
  }

  /** Cached metadata, or null if not computed yet (call lookup() to compute). */
  async peek(path: string): Promise<Meta | null> {
    await this.load();
    const st = await stat(path).catch(() => null);
    if (!st) return null;
    const hit = this.cache[path];
    return hit && hit.key === `${st.size}:${st.mtimeMs}` ? { crc: hit.crc, name: hit.name } : null;
  }

  async lookup(system: ConsoleId, path: string): Promise<Meta | null> {
    if (!DAT_NAMES[system]) return null;
    await this.load();
    const st = await stat(path).catch(() => null);
    if (!st || st.size > MAX_BYTES) return null;
    const key = `${st.size}:${st.mtimeMs}`;
    const hit = this.cache[path];
    if (hit && hit.key === key && hit.name !== undefined) return { crc: hit.crc, name: hit.name };
    const head = new Uint8Array(16);
    const fh = await (await import('node:fs/promises')).open(path, 'r');
    try {
      await fh.read(head, 0, 16, 0);
    } finally {
      await fh.close();
    }
    const crc = await crc32(path, headerSkip(system, st.size, head));
    const dat = await this.dat(system);
    const name = dat?.get(crc) ?? null;
    this.cache[path] = { key, crc, name };
    this.save();
    return { crc, name };
  }
}
