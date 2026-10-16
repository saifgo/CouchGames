/**
 * Metadata by hash (M6): CRC32 of the ROM → canonical No-Intro name from the
 * libretro-database DAT files (CC-BY-SA-4.0). The canonical name is what box-art
 * lookups (thumbnails.libretro.com) key on, so badly named files still get art.
 *
 * Only public DAT files are downloaded; nothing about the user's ROMs leaves the
 * machine. Disc systems (PS1/PSP/PS2) are skipped: CRC-ing gigabytes is too slow
 * and their DATs are per-track.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConsoleId } from '@couch/protocol';
import { crc32 } from './library.js';
import type { RomStore } from './store.js';

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
  async peek(store: RomStore, rel: string): Promise<Meta | null> {
    await this.load();
    const st = await store.stat(rel).catch(() => null);
    if (!st) return null;
    const hit = this.cache[store.id(rel)];
    return hit && hit.key === `${st.size}:${st.mtimeMs}` ? { crc: hit.crc, name: hit.name } : null;
  }

  async lookup(system: ConsoleId, store: RomStore, rel: string): Promise<Meta | null> {
    if (!DAT_NAMES[system]) return null;
    await this.load();
    const st = await store.stat(rel).catch(() => null);
    if (!st || st.size > MAX_BYTES) return null;
    const key = `${st.size}:${st.mtimeMs}`;
    const id = store.id(rel);
    const hit = this.cache[id];
    if (hit && hit.key === key && hit.name !== undefined) return { crc: hit.crc, name: hit.name };
    const chunks: Buffer[] = [];
    for await (const c of await store.open(rel, 0, 15)) chunks.push(c as Buffer);
    const head = new Uint8Array(Buffer.concat(chunks));
    const crc = await crc32(await store.open(rel, headerSkip(system, st.size, head)));
    const dat = await this.dat(system);
    const name = dat?.get(crc) ?? null;
    this.cache[id] = { key, crc, name };
    this.save();
    return { crc, name };
  }
}
