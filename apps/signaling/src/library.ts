import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { SYSTEMS, titleFromFilename } from '@couch/systems';
import type { ConsoleId } from '@couch/protocol';

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
}

export interface LibraryRoot {
  dir: string;
  source: RomSource;
  /** URL prefix the files are served under, e.g. "/roms". */
  urlPrefix: string;
}

const enc = (s: string) => s.split('/').map(encodeURIComponent).join('/');

export async function scanLibrary(roots: LibraryRoot[]): Promise<RomEntry[]> {
  const out: RomEntry[] = [];
  for (const root of roots) {
    for (const sys of SYSTEMS) {
      const dir = join(root.dir, sys.id);
      let names: string[];
      try {
        names = await readdir(dir);
      } catch {
        continue;
      }
      for (const name of names.sort((a, b) => a.localeCompare(b))) {
        const ext = extname(name).toLowerCase();
        if (!sys.extensions.includes(ext)) continue;
        const full = join(dir, name);
        const st = await stat(full).catch(() => null);
        if (!st?.isFile()) continue;
        const extra = ext === '.cue' ? await cueTracks(full) : [];
        out.push({
          id: createHash('sha1').update(`${root.source}/${sys.id}/${name}`).digest('hex').slice(0, 12),
          system: sys.id,
          file: name,
          title: titleFromFilename(name),
          size: st.size,
          mtimeMs: st.mtimeMs,
          source: root.source,
          url: `${root.urlPrefix}/${enc(`${sys.id}/${name}`)}`,
          extra: extra.map((t) => `${root.urlPrefix}/${enc(`${sys.id}/${t}`)}`),
        });
      }
    }
  }
  return out;
}

/** Track files referenced by a .cue sheet (same directory only). */
async function cueTracks(cuePath: string): Promise<string[]> {
  const text = await readFile(cuePath, 'utf8').catch(() => '');
  const files: string[] = [];
  for (const m of text.matchAll(/^\s*FILE\s+"?([^"\r\n]+?)"?\s+\w+\s*$/gim)) {
    const f = m[1]!;
    if (!f.includes('/') && !f.includes('\\') && !files.includes(f)) files.push(f);
  }
  return files;
}

/** Resolves `rel` inside `root`, refusing path traversal. */
export function safeJoin(root: string, rel: string): string | null {
  const base = resolve(root);
  const full = resolve(base, rel);
  return full === base || full.startsWith(base + sep) ? full : null;
}

/** CRC32 (IEEE) of a file, streamed. Used for metadata lookup by hash. */
export async function crc32File(path: string): Promise<string> {
  const table = crcTable();
  let crc = 0xffffffff;
  for await (const chunk of createReadStream(path)) {
    const buf = chunk as Buffer;
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
