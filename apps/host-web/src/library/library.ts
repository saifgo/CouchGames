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
}

const romStore = createStore('couch-roms', 'files');
const saveStore = createStore('couch-saves', 'states');

export async function loadLibrary(): Promise<Game[]> {
  const games: Game[] = [];
  try {
    const res = await fetch('/api/library');
    if (res.ok) {
      const { roms } = (await res.json()) as { roms: Game[] };
      games.push(...roms);
    }
  } catch {
    /* server unreachable: local files only */
  }
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

/** Files to hand to the emulator for a game. */
export async function gameFiles(g: Game): Promise<{ name: string; data: Blob | string }[]> {
  if (g.source === 'local') {
    const v = await get<{ meta: Game; blob: Blob }>(g.id, romStore);
    if (!v) throw new Error('This game was removed from the browser storage');
    return [{ name: g.file, data: v.blob }];
  }
  const main = { name: g.file, data: new URL(g.url!, location.origin).toString() };
  const extra = (g.extra ?? []).map((u) => ({ name: decodeURIComponent(u.split('/').pop()!), data: new URL(u, location.origin).toString() }));
  return [main, ...extra];
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
