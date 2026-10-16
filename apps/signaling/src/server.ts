import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { networkInterfaces } from 'node:os';
import { extname, join } from 'node:path';
import { WebSocketServer } from 'ws';
import type { RTCIceServerLike } from '@couch/protocol';
import { crc32File, safeJoin, scanLibrary, type LibraryRoot, type RomEntry } from './library.js';
import { Rooms } from './rooms.js';

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
  biosDir?: string;
  static?: StaticMount[];
  /** Send COOP/COEP so pages are cross-origin isolated (needed by threaded WASM cores). */
  crossOriginIsolation?: boolean;
  /** When set, POST /api/lab/results stores latency-lab results here (dev only). */
  labResultsDir?: string;
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
  const roots = opts.libraryRoots ?? [];
  let libraryCache: { at: number; entries: RomEntry[] } | null = null;
  const crcCache = new Map<string, string>();

  const getLibrary = async (fresh: boolean) => {
    if (!fresh && libraryCache && Date.now() - libraryCache.at < 5000) return libraryCache.entries;
    libraryCache = { at: Date.now(), entries: await scanLibrary(roots) };
    return libraryCache.entries;
  };

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
      if (path === '/api/health') return json(res, { ok: true, rooms: rooms.size });
      if (path === '/api/lan') {
        const port = (server.address() as { port: number }).port;
        return json(res, { port, secure: !!opts.tls, addresses: lanAddresses() });
      }
      if (path === '/api/library') return json(res, { roms: await getLibrary(url.searchParams.has('fresh')) });
      if (path.startsWith('/api/library/') && path.endsWith('/crc')) {
        const id = path.split('/')[3]!;
        const entry = (await getLibrary(false)).find((e) => e.id === id);
        if (!entry) return notFound(res);
        const root = roots.find((r) => r.source === entry.source)!;
        let crc = crcCache.get(id);
        if (!crc) {
          crc = await crc32File(join(root.dir, entry.system, entry.file));
          crcCache.set(id, crc);
        }
        return json(res, { id, crc });
      }
      for (const root of roots) {
        if (path.startsWith(root.urlPrefix + '/')) {
          const file = safeJoin(root.dir, path.slice(root.urlPrefix.length + 1));
          return file ? sendFile(req, res, file) : notFound(res);
        }
      }
      if (opts.biosDir && path.startsWith('/bios/')) {
        const file = safeJoin(opts.biosDir, path.slice('/bios/'.length));
        return file ? sendFile(req, res, file) : notFound(res);
      }
      // Longest prefix first so "/c" wins over "/".
      const mounts = [...(opts.static ?? [])].sort((a, b) => b.prefix.length - a.prefix.length);
      for (const m of mounts) {
        const bare = m.prefix.replace(/\/+$/, '');
        if (bare && path === bare) {
          res.writeHead(302, { Location: `${bare}/${url.search}` }).end();
          return;
        }
        const prefix = bare + '/';
        if (!path.startsWith(prefix)) continue;
        const rel = path.slice(prefix.length);
        const file = safeJoin(m.dir, rel || 'index.html');
        if (file && (await isFile(file))) return sendFile(req, res, file);
        if (m.spa && !extname(rel)) return sendFile(req, res, join(m.dir, 'index.html'));
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

async function isFile(p: string) {
  return (await stat(p).catch(() => null))?.isFile() ?? false;
}

async function sendFile(req: IncomingMessage, res: ServerResponse, file: string) {
  const st = await stat(file).catch(() => null);
  if (!st?.isFile()) return notFound(res);
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  const headers: Record<string, string | number> = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': type.startsWith('text/html') ? 'no-cache' : 'public, max-age=3600',
  };
  const range = req.headers.range ? /^bytes=(\d*)-(\d*)$/.exec(req.headers.range) : null;
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    if (start > end || start >= st.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end();
      return;
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': st.size });
  if (req.method === 'HEAD') return void res.end();
  createReadStream(file).pipe(res);
}
