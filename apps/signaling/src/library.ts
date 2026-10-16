import { createHash } from 'node:crypto';
import { extname, resolve, sep } from 'node:path';
import { SYSTEMS, titleFromFilename } from '@couch/systems';
import type { ConsoleId } from '@couch/protocol';
import type { RomStore } from './store.js';

export type RomSource = 'user' | 'homebrew';

export interface RomEntry {
  id: string;
  system: ConsoleId;
  file: string;
  title: string;
  size: number;
  mtimeMs: number;
  source: RomSource;
  /** URL path the host fetches the main file from. */
  url: string;
  /** Companion files (e.g. .bin tracks referenced by a .cue), as URL paths. */
  extra: string[];
  /** Canonical No-Intro name from the CRC lookup (M6), when known. */
  canonical?: string | null;
  crc?: string;
}

export interface LibraryRoot {
  /** Where the files live: a local directory (shorthand for an FsStore), or a store. */
  dir?: string;
  store?: RomStore;
  source: RomSource;
  /** URL prefix the files are served under, e.g. "/roms". */
  urlPrefix: string;
}

export interface ResolvedRoot extends LibraryRoot {
  store: RomStore;
}

const enc = (s: string) => s.split('/').map(encodeURIComponent).join('/');

export async function scanLibrary(roots: ResolvedRoot[]): Promise<RomEntry[]> {
  const out: RomEntry[] = [];
  for (const root of roots) {
    // Systems in parallel (one LIST each on S3), kept in catalog order.
    const perSystem = await Promise.all(
      SYSTEMS.map(async (sys) => {
        const files = (await root.store.list(sys.id).catch(() => []))
          .filter((f) => sys.extensions.includes(extname(f.name).toLowerCase()))
          .sort((a, b) => a.name.localeCompare(b.name));
        return Promise.all(
          files.map(async (f): Promise<RomEntry> => {
            const extra = extname(f.name).toLowerCase() === '.cue' ? await cueTracks(root.store, `${sys.id}/${f.name}`) : [];
            return {
              id: createHash('sha1').update(`${root.source}/${sys.id}/${f.name}`).digest('hex').slice(0, 12),
              system: sys.id,
              file: f.name,
              title: titleFromFilename(f.name),
              size: f.size,
              mtimeMs: f.mtimeMs,
              source: root.source,
              url: `${root.urlPrefix}/${enc(`${sys.id}/${f.name}`)}`,
              extra: extra.map((t) => `${root.urlPrefix}/${enc(`${sys.id}/${t}`)}`),
            };
          }),
        );
      }),
    );
    out.push(...perSystem.flat());
  }
  return out;
}

/** Track files referenced by a .cue sheet (same directory only). */
async function cueTracks(store: RomStore, rel: string): Promise<string[]> {
  const text = await readText(store, rel, 256 * 1024).catch(() => '');
  const files: string[] = [];
  for (const m of text.matchAll(/^\s*FILE\s+"?([^"\r\n]+?)"?\s+\w+\s*$/gim)) {
    const f = m[1]!;
    if (!f.includes('/') && !f.includes('\\') && !files.includes(f)) files.push(f);
  }
  return files;
}

async function readText(store: RomStore, rel: string, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of await store.open(rel, 0, maxBytes - 1)) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** Resolves `rel` inside `root`, refusing path traversal. */
export function safeJoin(root: string, rel: string): string | null {
  const base = resolve(root);
  const full = resolve(base, rel);
  return full === base || full.startsWith(base + sep) ? full : null;
}

/** CRC32 (IEEE) of a byte stream. Used for metadata lookup by hash. */
export async function crc32(chunks: AsyncIterable<unknown>): Promise<string> {
  const table = crcTable();
  let crc = 0xffffffff;
  for await (const chunk of chunks) {
    const buf = chunk as Uint8Array;
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

let table: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (table) return table;
  table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}
