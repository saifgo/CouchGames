/**
 * Game library: ROMs from the couch server (roms/ + test-roms/) plus files the
 * user dropped onto the TV page (kept in IndexedDB, never uploaded anywhere).
 * Also recents, favourites and save states.
 */
import { createStore, del, entries, get, set } from 'idb-keyval';
import { getSystem, SYSTEMS, systemsForExtension, titleFromFilename } from '@couch/systems';
import type { ConsoleId } from '@couch/protocol';

export interface Game {
  id: string;
  system: ConsoleId;
  title: string;
  file: string;
  size: number;
  source: 'user' | 'homebrew' | 'local';
  /** Server URL path (server games) */
  url?: string;
  extra?: string[];
  /** Canonical No-Intro name from the server's CRC lookup, when known. */
  canonical?: string | null;
}

const romStore = createStore('couch-roms', 'files');
const saveStore = createStore('couch-saves', 'states');

/** Progress of a server library load, one console at a time. */
export interface LibraryProgress {
  done: number;
  total: number;
  /** Consoles being fetched right now. */
  loading: ConsoleId[];
  /** Consoles that could not be fetched (server unreachable, timeout). */
  failed: ConsoleId[];
}

const SERVER_CACHE = 'couch.serverLibrary.v1';
interface ServerCache {
  at: number;
  roms: Game[];
}

/**
 * The server's games as last loaded, or null. The library rarely changes, so the TV uses
 * this copy and only asks the server again when someone presses Refresh.
 */
export function cachedServerLibrary(): ServerCache | null {
  try {
    const c = JSON.parse(localStorage.getItem(SERVER_CACHE) ?? 'null') as ServerCache | null;
    return c && Array.isArray(c.roms) ? { at: c.at, roms: c.roms.filter((g) => getSystem(g.system)) } : null;
  } catch {
    return null;
  }
}

/**
 * Loads the server's games console by console (a few requests at a time), so each row
 * appears as soon as it is ready and the screen shows what is happening. `fresh` makes
 * the server list its storage again instead of using its own copy. Saved for next time
 * when every console loaded.
 */
export async function loadServerLibrary(opts: {
  fresh?: boolean;
  onProgress?: (p: LibraryProgress) => void;
  /** Games so far, in catalog order. */
  onGames?: (games: Game[]) => void;
  parallel?: number;
}): Promise<Game[]> {
  const ids = SYSTEMS.map((s) => s.id);
  const bySystem = new Map<ConsoleId, Game[]>();
  const p: LibraryProgress = { done: 0, total: ids.length, loading: [], failed: [] };
  const report = () => opts.onProgress?.({ ...p, loading: [...p.loading], failed: [...p.failed] });
  const collect = () => ids.flatMap((id) => bySystem.get(id) ?? []);
  report();
  const queue = [...ids];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      p.loading.push(id);
      report();
      try {
        const res = await fetch(`/api/library?system=${id}${opts.fresh ? '&fresh' : ''}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { roms } = (await res.json()) as { roms: Game[] };
        // An older server ignores ?system= and sends everything: keep this console's games.
        bySystem.set(id, roms.filter((g) => g.system === id));
        opts.onGames?.(collect());
      } catch {
        p.failed.push(id);
      }
      p.loading.splice(p.loading.indexOf(id), 1);
      p.done++;
      report();
    }
  };
  await Promise.all(Array.from({ length: opts.parallel ?? 4 }, worker));
  const games = collect();
  if (!p.failed.length && games.length) {
    try {
      localStorage.setItem(SERVER_CACHE, JSON.stringify({ at: Date.now(), roms: games } satisfies ServerCache));
    } catch {
      /* storage full: load from the server next time */
    }
  }
  return games;
}

/** Games dropped onto this TV page (IndexedDB). */
export async function loadLocalGames(): Promise<Game[]> {
  const games: Game[] = [];
  for (const [, value] of await entries<string, { meta: Game; blob: Blob }>(romStore)) games.push(value.meta);
  return games.filter((g) => getSystem(g.system));
}

/** Files dropped on the TV page. System is inferred from the extension (asks if ambiguous). */
export async function importLocalFiles(files: File[], pickSystem: (file: File, options: ConsoleId[]) => Promise<ConsoleId | null>): Promise<Game[]> {
  const added: Game[] = [];
  for (const f of files) {
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
    const candidates = systemsForExtension(ext).map((s) => s.id);
    if (!candidates.length) continue;
    const system = candidates.length === 1 ? candidates[0]! : await pickSystem(f, candidates);
    if (!system) continue;
    const id = `local-${await sha1Hex(`${system}/${f.name}/${f.size}`)}`;
    const meta: Game = { id, system, title: titleFromFilename(f.name), file: f.name, size: f.size, source: 'local' };
    await set(id, { meta, blob: f }, romStore);
    added.push(meta);
  }
  return added;
}

export async function removeLocal(id: string): Promise<void> {
  await del(id, romStore);
}

/** Bytes downloaded so far for a server game; `total` is 0 while unknown. */
export interface DownloadProgress {
  loaded: number;
  total: number;
}

/**
 * Files to hand to the emulator for a game. Server games (roms/ folder or S3, streamed by
 * the server) are downloaded here rather than by the emulator, so [onProgress] can drive
 * a progress bar.
 */
export async function gameFiles(g: Game, onProgress?: (p: DownloadProgress) => void, signal?: AbortSignal): Promise<{ name: string; data: Blob | string }[]> {
  if (g.source === 'local') {
    const v = await get<{ meta: Game; blob: Blob }>(g.id, romStore);
    if (!v) throw new Error('This game was removed from the browser storage');
    return [{ name: g.file, data: v.blob }];
  }
  const files = [
    { name: g.file, url: g.url! },
    ...(g.extra ?? []).map((u) => ({ name: decodeURIComponent(u.split('/').pop()!), url: u })),
  ];
  // Start every request first (resolves on headers) so the total size is known up front.
  const responses = await Promise.all(
    files.map(async (f) => {
      const res = await fetch(new URL(f.url, location.origin), signal ? { signal } : {});
      if (!res.ok) throw new Error(`Could not download ${f.name} from the server (HTTP ${res.status})`);
      return res;
    }),
  );
  const lengths = responses.map((r) => Number(r.headers.get('content-length')) || 0);
  const total = lengths.every((n) => n > 0) ? lengths.reduce((a, b) => a + b, 0) : 0;
  let loaded = 0;
  onProgress?.({ loaded, total });
  const out: { name: string; data: Blob }[] = [];
  for (let i = 0; i < files.length; i++) {
    const res = responses[i]!;
    const chunks: BlobPart[] = [];
    const reader = res.body?.getReader();
    if (!reader) {
      const b = await res.blob();
      loaded += b.size;
      chunks.push(b);
    } else {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        onProgress?.({ loaded, total });
      }
    }
    out.push({ name: files[i]!.name, data: new Blob(chunks) });
  }
  onProgress?.({ loaded, total: total || loaded });
  return out;
}

export async function biosFiles(system: ConsoleId): Promise<{ name: string; data: string }[]> {
  const sys = getSystem(system);
  const out: { name: string; data: string }[] = [];
  for (const b of sys?.bios ?? []) {
    const url = `/bios/${b.file}`;
    try {
      const r = await fetch(url, { method: 'HEAD' });
      if (r.ok) out.push({ name: b.file, data: new URL(url, location.origin).toString() });
    } catch {
      /* none */
    }
  }
  return out;
}

/* ------------------------------------------------- recents + favourites */

const RECENTS = 'couch.recents.v1';
const FAVS = 'couch.favourites.v1';

export function recents(): { id: string; at: number }[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS) ?? '[]') as { id: string; at: number }[];
  } catch {
    return [];
  }
}

export function touchRecent(id: string): void {
  const list = recents().filter((r) => r.id !== id);
  list.unshift({ id, at: Date.now() });
  localStorage.setItem(RECENTS, JSON.stringify(list.slice(0, 20)));
}

export function favourites(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAVS) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function toggleFavourite(id: string): boolean {
  const f = favourites();
  const on = !f.has(id);
  if (on) f.add(id);
  else f.delete(id);
  localStorage.setItem(FAVS, JSON.stringify([...f]));
  return on;
}

/* ------------------------------------------------------- save states */

export interface SaveSlot {
  slot: number | 'auto';
  at: number;
  state: Blob;
  thumbnail?: Blob;
}

const saveKey = (gameId: string, slot: number | 'auto') => `${gameId}:${slot}`;

export async function writeSave(gameId: string, s: SaveSlot): Promise<void> {
  await set(saveKey(gameId, s.slot), s, saveStore);
}

export async function readSave(gameId: string, slot: number | 'auto'): Promise<SaveSlot | undefined> {
  return get<SaveSlot>(saveKey(gameId, slot), saveStore);
}

export async function listSaves(gameId: string): Promise<SaveSlot[]> {
  const out: SaveSlot[] = [];
  for (const [k, v] of await entries<string, SaveSlot>(saveStore)) if (k.startsWith(`${gameId}:`)) out.push(v);
  return out.sort((a, b) => (a.slot === 'auto' ? -1 : b.slot === 'auto' ? 1 : (a.slot as number) - (b.slot as number)));
}

/* ------------------------------------------------------------ utils */

async function sha1Hex(s: string): Promise<string> {
  if (crypto.subtle) {
    const h = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
    return [...new Uint8Array(h)].slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

export const systemOrder = SYSTEMS.map((s) => s.id);
