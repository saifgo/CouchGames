import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { networkInterfaces } from 'node:os';
import { extname, join } from 'node:path';
import { WebSocketServer } from 'ws';
import type { ConsoleId, RTCIceServerLike } from '@couch/protocol';
import { crc32, scanLibrary, type LibraryRoot, type ResolvedRoot, type RomEntry } from './library.js';
import { MetadataStore, type Meta } from './metadata.js';
import { FsStore, type RomStore } from './store.js';
import { getSystem, SYSTEMS, titleFromFilename } from '@couch/systems';
import { Rooms } from './rooms.js';
import { checkStorage, type StorageReport } from './storage-check.js';
import { findApk, type ApkSource } from './apk.js';

export interface StaticMount {
  /** URL prefix, e.g. "/" or "/c". */
  prefix: string;
  dir: string;
  /** Serve index.html for unknown paths (single-page app). */
  spa: boolean;
}

export interface CouchServerOptions {
  port: number;
  host?: string;
  tls?: { cert: string | Buffer; key: string | Buffer };
  iceServers?: RTCIceServerLike[];
  hostGraceMs?: number;
  maxPeersPerRoom?: number;
  relayDelayMs?: number;
  libraryRoots?: LibraryRoot[];
  /** BIOS files, served under /bios/: a local directory or a store (e.g. S3). */
  biosDir?: string;
  bios?: RomStore;
  /** Where the Android TV app (APK) offered on the TV page comes from. */
  apk?: ApkSource;
  static?: StaticMount[];
  /** Send COOP/COEP so pages are cross-origin isolated (needed by threaded WASM cores). */
  crossOriginIsolation?: boolean;
  /** When set, POST /api/lab/results stores latency-lab results here (dev only). */
  labResultsDir?: string;
  /** Enables CRC → No-Intro name lookups for user ROMs; caches DATs + hashes here. */
  metadataCacheDir?: string;
  /**
   * Local diagnostics (M6): crash reports and opt-in anonymous latency summaries
   * are appended as JSONL here. Telemetry is forwarded only if telemetryUrl is set.
   */
  diagnosticsDir?: string;
  telemetryUrl?: string;
  log?: (msg: string) => void;
}

export interface CouchServer {
  server: Server;
  rooms: Rooms;
  url: string;
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
  '.apk': 'application/vnd.android.package-archive',
};

/** LAN IPv4 addresses, Wi-Fi/Ethernet first, virtual adapters (WSL, Hyper-V, Docker) last. */
export function lanAddresses(): { name: string; address: string; virtual: boolean }[] {
  const out: { name: string; address: string; virtual: boolean }[] = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const virtual = /vEthernet|WSL|Hyper-V|docker|VirtualBox|VMware|br-|veth|Loopback/i.test(name);
      out.push({ name, address: a.address, virtual });
    }
  }
  return out.sort((a, b) => Number(a.virtual) - Number(b.virtual));
}

export async function startCouchServer(opts: CouchServerOptions): Promise<CouchServer> {
  const log = opts.log ?? ((m: string) => console.log(`[couch] ${m}`));
  const rooms = new Rooms({
    iceServers: opts.iceServers ?? [],
    hostGraceMs: opts.hostGraceMs ?? 60_000,
    maxPeersPerRoom: opts.maxPeersPerRoom ?? 16,
    relayDelayMs: opts.relayDelayMs ?? 0,
    log,
  });
  const roots: ResolvedRoot[] = (opts.libraryRoots ?? []).map((r) => {
    const store = r.store ?? (r.dir !== undefined ? new FsStore(r.dir) : null);
    if (!store) throw new Error(`library root ${r.urlPrefix} needs a dir or a store`);
    return { ...r, store };
  });
  const bios = opts.bios ?? (opts.biosDir ? new FsStore(opts.biosDir) : null);
  const mounts = [...(opts.static ?? [])]
    .sort((a, b) => b.prefix.length - a.prefix.length) // longest first so "/c" wins over "/"
    .map((m) => ({ ...m, store: new FsStore(m.dir) }));
  const crcCache = new Map<string, string>();

  const metadata = opts.metadataCacheDir ? new MetadataStore(opts.metadataCacheDir, log) : null;
  /** Games waiting for a CRC lookup; one background worker drains it. */
  const pending: { e: RomEntry; store: RomStore; rel: string }[] = [];
  let enriching = false;
  /** Attach cached CRC metadata now; compute the missing ones in the background. */
  const enrich = async (entries: RomEntry[]) => {
    if (!metadata) return;
    for (const e of entries) {
      if (e.source !== 'user') continue;
      const store = roots.find((r) => r.source === e.source)!.store;
      const rel = `${e.system}/${e.file}`;
      const m = await metadata.peek(store, rel, { size: e.size, mtimeMs: e.mtimeMs });
      if (m) applyMeta(e, m);
      else pending.push({ e, store, rel });
    }
    if (pending.length && !enriching) {
      enriching = true;
      void (async () => {
        // Entries are updated in place, so the cached library picks up the names.
        for (let job = pending.shift(); job; job = pending.shift()) {
          const m = await metadata.lookup(job.e.system, job.store, job.rel, { size: job.e.size, mtimeMs: job.e.mtimeMs }).catch(() => null);
          if (m) applyMeta(job.e, m);
        }
        enriching = false;
      })();
    }
  };

  // Connection status of the user's ROM store (local folder or S3), for the TV's status chip.
  const userStore = roots.find((r) => r.source === 'user')?.store ?? null;
  let storage: { at: number; report: Promise<StorageReport> } | null = null;
  const getStorage = (fresh: boolean): Promise<StorageReport> | null => {
    if (!userStore) return null;
    if (!fresh && storage && Date.now() - storage.at < 300_000) return storage.report;
    const report = checkStorage(userStore);
    storage = { at: Date.now(), report };
    return report;
  };

  /**
   * The library, one console at a time. Kept until someone asks for a fresh scan (the
   * Refresh button): the files rarely change, and listing an S3 bucket is slow.
   * A scan that failed (e.g. S3 down) is not kept, so the next request tries again.
   */
  const bySystem = new Map<ConsoleId, Promise<RomEntry[]>>();
  const getSystemLibrary = (id: ConsoleId, fresh: boolean): Promise<RomEntry[]> => {
    const cached = bySystem.get(id);
    if (cached && !fresh) return cached;
    let scan: Promise<RomEntry[]> | null = null;
    scan = (async () => {
      let scanFailed = false;
      const entries = await scanLibrary(
        roots,
        (root, err) => {
          if (root.store !== userStore) return;
          scanFailed = true;
          log(`library: can't list ${id} in ${JSON.stringify(root.store.describe())}: ${(err as Error).message}`);
        },
        [id],
      );
      if (scanFailed) {
        if (bySystem.get(id) === scan) bySystem.delete(id);
        if (storage) storage.at = 0; // the last "connected" status may be stale: check again
      }
      await enrich(entries);
      return entries;
    })();
    const p = scan;
    bySystem.set(id, p);
    p.catch(() => bySystem.get(id) === p && bySystem.delete(id));
    return p;
  };
  const getLibrary = async (fresh: boolean) => (await Promise.all(SYSTEMS.map((s) => getSystemLibrary(s.id, fresh)))).flat();

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = decodeURIComponent(url.pathname);
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (opts.crossOriginIsolation) {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      // credentialless (not require-corp) so cross-origin box art still loads.
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.writeHead(204).end();
      return;
    }
    try {
      if (req.method === 'POST' && path === '/api/lab/results' && opts.labResultsDir) {
        const body = await readBody(req, 4 * 1024 * 1024);
        const parsed = JSON.parse(body) as { label?: string; mode?: string };
        const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${String(parsed.mode ?? 'x')}-${String(parsed.label ?? 'phone').replace(/[^\w-]/g, '_').slice(0, 40)}.json`;
        await mkdir(opts.labResultsDir, { recursive: true });
        await writeFile(join(opts.labResultsDir, name), body);
        log(`lab result saved: ${name}`);
        return json(res, { saved: name });
      }
      if (req.method === 'POST' && (path === '/api/crash' || path === '/api/telemetry') && opts.diagnosticsDir) {
        const body = await readBody(req, 64 * 1024);
        const record = { ...(JSON.parse(body) as object), receivedAt: new Date().toISOString() };
        const file = path === '/api/crash' ? 'crash.jsonl' : 'latency-sessions.jsonl';
        await mkdir(opts.diagnosticsDir, { recursive: true });
        await appendFile(join(opts.diagnosticsDir, file), JSON.stringify(record) + '\n');
        if (path === '/api/telemetry' && opts.telemetryUrl) {
          void fetch(opts.telemetryUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(record) }).catch(() => {});
        }
        return json(res, { ok: true });
      }
      if (path === '/api/telemetry/summary' && opts.diagnosticsDir) {
        const text = await readFile(join(opts.diagnosticsDir, 'latency-sessions.jsonl'), 'utf8').catch(() => '');
        const rows = text.split('\n').filter(Boolean).slice(-200).map((l) => JSON.parse(l) as { system: string; players: { transport: string; p95: number }[] });
        return json(res, { sessions: rows.length, recent: rows.slice(-10) });
      }
      if (path === '/api/health') return json(res, { ok: true, rooms: rooms.size });
      if (path === '/api/lan') {
        const port = (server.address() as { port: number }).port;
        return json(res, { port, secure: !!opts.tls, addresses: lanAddresses() });
      }
      if (path === '/api/library') {
        const fresh = url.searchParams.has('fresh');
        const system = url.searchParams.get('system');
        // ?source=homebrew: the web host asks for homebrew only and never sees the roms/ folder or S3 games.
        const source = url.searchParams.get('source');
        const only = (roms: RomEntry[]) => (source ? roms.filter((r) => r.source === source) : roms);
        if (system === null) return json(res, { roms: only(await getLibrary(fresh)) });
        if (!getSystem(system as ConsoleId)) return notFound(res);
        return json(res, { system, roms: only(await getSystemLibrary(system as ConsoleId, fresh)) });
      }
      if (path === '/api/apk') {
        const found = opts.apk ? await findApk(opts.apk) : null;
        return found ? json(res, found.info) : notFound(res);
      }
      if (path.startsWith('/download/') && opts.apk) {
        const found = await findApk(opts.apk);
        const name = path.slice('/download/'.length);
        // Only the APK the page offers, never other files from the store.
        if (!found?.store || found.info.file !== name) return notFound(res);
        res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`);
        return sendFile(req, res, found.store, name);
      }
      if (path === '/api/storage') {
        const report = await getStorage(url.searchParams.has('fresh'));
        return report ? json(res, await report) : notFound(res);
      }
      if (path.startsWith('/api/library/') && path.endsWith('/crc')) {
        const id = path.split('/')[3]!;
        const entry = (await getLibrary(false)).find((e) => e.id === id);
        if (!entry) return notFound(res);
        const store = roots.find((r) => r.source === entry.source)!.store;
        let crc = crcCache.get(id);
        if (!crc) {
          crc = await crc32(await store.open(`${entry.system}/${entry.file}`));
          crcCache.set(id, crc);
        }
        return json(res, { id, crc });
      }
      for (const root of roots) {
        if (path.startsWith(root.urlPrefix + '/')) return sendFile(req, res, root.store, path.slice(root.urlPrefix.length + 1));
      }
      if (bios && path.startsWith('/bios/')) return sendFile(req, res, bios, path.slice('/bios/'.length));
      for (const m of mounts) {
        const bare = m.prefix.replace(/\/+$/, '');
        if (bare && path === bare) {
          res.writeHead(302, { Location: `${bare}/${url.search}` }).end();
          return;
        }
        const prefix = bare + '/';
        if (!path.startsWith(prefix)) continue;
        const rel = path.slice(prefix.length) || 'index.html';
        const st = await m.store.stat(rel);
        if (st) return sendFile(req, res, m.store, rel, st);
        if (!extname(rel)) {
          // Clean URLs for static pages: /privacy serves privacy.html (Play Store legal pages).
          const page = `${rel.replace(/\/+$/, '')}.html`;
          const pageSt = rel ? await m.store.stat(page) : null;
          if (pageSt) return sendFile(req, res, m.store, page, pageSt);
          if (m.spa) return sendFile(req, res, m.store, 'index.html');
        }
        return notFound(res);
      }
      notFound(res);
    } catch (err) {
      log(`http error ${path}: ${(err as Error).message}`);
      if (!res.headersSent) res.writeHead(500).end('internal error');
    }
  };

  const server: Server = opts.tls
    ? (createHttpsServer({ cert: opts.tls.cert, key: opts.tls.key }, handler) as unknown as Server)
    : createHttpServer(handler);

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '/', 'http://x').pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      // Input frames are tiny; never let Nagle batch them.
      (req.socket as { setNoDelay?: (v: boolean) => void }).setNoDelay?.(true);
      rooms.attach(ws, req.socket.remoteAddress ?? '?');
    });
  });

  await new Promise<void>((ok, fail) => {
    server.once('error', fail);
    server.listen(opts.port, opts.host ?? '0.0.0.0', () => ok());
  });
  const port = (server.address() as { port: number }).port;
  const url = `${opts.tls ? 'https' : 'http'}://localhost:${port}`;
  void getStorage(true)?.then((r) => {
    const where = r.store.kind === 's3' ? `s3://${r.store.bucket}/${r.store.prefix}` : r.store.path;
    if (r.ok) log(`ROM storage ${where}: connected, ${r.games} game${r.games === 1 ? '' : 's'}${r.misplacedTotal ? `, ${r.misplacedTotal} misplaced file(s)` : ''}`);
    else log(`ROM storage ${where}: NOT CONNECTED: ${r.error} [${r.errorCode}]`);
  });
  // Warm the library cache so the first TV to connect gets it straight away.
  void getLibrary(false).catch(() => {});

  return {
    server,
    rooms,
    url,
    close: () =>
      new Promise<void>((ok) => {
        rooms.close();
        for (const c of wss.clients) c.terminate();
        wss.close();
        server.close(() => ok());
        server.closeAllConnections?.();
      }),
  };
}

function applyMeta(e: RomEntry, m: Meta) {
  e.crc = m.crc;
  e.canonical = m.name;
  if (m.name) e.title = titleFromFilename(m.name);
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, body: unknown) {
  res.writeHead(200, { 'Content-Type': MIME['.json']!, 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function notFound(res: ServerResponse) {
  res.writeHead(404, { 'Content-Type': MIME['.txt']! }).end('not found');
}

async function sendFile(
  req: IncomingMessage,
  res: ServerResponse,
  store: RomStore,
  rel: string,
  known?: { size: number } | null,
) {
  const st = known ?? (await store.stat(rel));
  if (!st) return notFound(res);
  const type = MIME[extname(rel).toLowerCase()] ?? 'application/octet-stream';
  const headers: Record<string, string | number> = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': type.startsWith('text/html') ? 'no-cache' : 'public, max-age=3600',
  };
  const range = req.headers.range ? /^bytes=(\d*)-(\d*)$/.exec(req.headers.range) : null;
  let start = 0;
  let end = st.size - 1;
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
    end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    if (start > end || start >= st.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end();
      return;
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
  } else {
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
  }
  if (req.method === 'HEAD' || st.size === 0) return void res.end();
  const body = await store.open(rel, start, end).catch((err: Error) => {
    res.destroy(err);
    return null;
  });
  body?.on('error', (err) => res.destroy(err)).pipe(res);
}
