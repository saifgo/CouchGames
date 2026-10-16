/**
 * Couch server: signaling + WebSocket relay + ROM library + static hosting of the
 * built web apps. Run on the laptop that drives the TV (web host), or in the cloud
 * (signaling/relay only).
 *
 *   PORT=8787 RELAY_DELAY_MS=0 STUN=1 pnpm --filter @couch/signaling start
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lanAddresses, startCouchServer } from './server.js';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const env = process.env;

const tls =
  env.TLS_CERT && env.TLS_KEY ? { cert: readFileSync(env.TLS_CERT), key: readFileSync(env.TLS_KEY) } : undefined;

const srv = await startCouchServer({
  port: Number(env.PORT ?? 8787),
  ...(tls ? { tls } : {}),
  relayDelayMs: Number(env.RELAY_DELAY_MS ?? 0),
  iceServers: env.STUN === '1' ? [{ urls: 'stun:stun.l.google.com:19302' }] : [],
  libraryRoots: [
    { dir: env.ROMS_DIR ?? `${repo}roms`, source: 'user', urlPrefix: '/roms' },
    { dir: env.TEST_ROMS_DIR ?? `${repo}test-roms`, source: 'homebrew', urlPrefix: '/test-roms' },
  ],
  biosDir: env.BIOS_DIR ?? `${repo}roms/bios`,
  crossOriginIsolation: env.COI === '1',
  ...(env.LAB === '1' ? { labResultsDir: `${repo}packages/latency-lab/results/raw` } : {}),
  static: [
    { prefix: '/c', dir: `${repo}apps/controller-web/dist`, spa: true },
    { prefix: '/lab', dir: `${repo}packages/latency-lab/dist`, spa: false },
    { prefix: '/cores', dir: `${repo}apps/host-web/public/cores`, spa: false },
    { prefix: '/', dir: `${repo}apps/host-web/dist`, spa: true },
  ],
});

const port = (srv.server.address() as { port: number }).port;
const scheme = tls ? 'https' : 'http';
console.log(`Couch server on ${scheme}://localhost:${port}`);
for (const a of lanAddresses()) console.log(`  ${a.virtual ? '(virtual) ' : ''}${scheme}://${a.address}:${port}  [${a.name}]`);

const shutdown = () => void srv.close().then(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
