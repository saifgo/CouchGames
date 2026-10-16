/**
 * Couch server: signaling + WebSocket relay + ROM library + static hosting of the
 * built web apps. Run on the laptop that drives the TV (web host), or in the cloud
 * (signaling/relay only).
 *
 *   PORT=8787 RELAY_DELAY_MS=0 STUN=1 pnpm --filter @couch/signaling start
 *
 * ROMs come from roms/ (or ROMS_DIR), or from an S3 bucket when S3_BUCKET is set:
 *   S3_BUCKET=my-games S3_PREFIX=roms/ S3_REGION=eu-west-3 \
 *   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... pnpm --filter @couch/signaling start
 * Layout under the prefix is the same as roms/: <system>/<file>, BIOS in bios/.
 * S3_ENDPOINT (+ S3_FORCE_PATH_STYLE=1) points at R2, MinIO, B2 and other S3-compatibles.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lanAddresses, startCouchServer } from './server.js';
import { FsStore, S3Store, type RomStore } from './store.js';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const env = process.env;

const tls =
  env.TLS_CERT && env.TLS_KEY ? { cert: readFileSync(env.TLS_CERT), key: readFileSync(env.TLS_KEY) } : undefined;

const roms: RomStore = env.S3_BUCKET
  ? new S3Store({
      bucket: env.S3_BUCKET,
      prefix: env.S3_PREFIX ?? '',
      region: env.S3_REGION ?? env.AWS_REGION ?? 'us-east-1',
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
      forcePathStyle: env.S3_FORCE_PATH_STYLE === '1',
    })
  : new FsStore(env.ROMS_DIR ?? `${repo}roms`);
const bios: RomStore = roms instanceof S3Store ? roms.sub('bios') : new FsStore(env.BIOS_DIR ?? `${repo}roms/bios`);

const srv = await startCouchServer({
  port: Number(env.PORT ?? 8787),
  ...(tls ? { tls } : {}),
  relayDelayMs: Number(env.RELAY_DELAY_MS ?? 0),
  iceServers: env.STUN === '1' ? [{ urls: 'stun:stun.l.google.com:19302' }] : [],
  libraryRoots: [
    { store: roms, source: 'user', urlPrefix: '/roms' },
    { dir: env.TEST_ROMS_DIR ?? `${repo}test-roms`, source: 'homebrew', urlPrefix: '/test-roms' },
  ],
  bios,
  crossOriginIsolation: env.COI === '1',
  metadataCacheDir: env.METADATA === '0' ? undefined : `${repo}.cache/metadata`,
  diagnosticsDir: `${repo}.cache/logs`,
  ...(env.TELEMETRY_URL ? { telemetryUrl: env.TELEMETRY_URL } : {}),
  ...(env.LAB === '1' ? { labResultsDir: `${repo}packages/latency-lab/results/raw` } : {}),
  static: [
    { prefix: '/c', dir: `${repo}apps/controller-web/dist`, spa: true },
    { prefix: '/lab', dir: `${repo}packages/latency-lab/dist`, spa: false },
    { prefix: '/cores', dir: `${repo}apps/host-web/cores`, spa: false },
    { prefix: '/', dir: `${repo}apps/host-web/dist`, spa: true },
  ],
});

const port = (srv.server.address() as { port: number }).port;
if (roms instanceof S3Store) console.log(`ROM library: s3://${roms.bucket}/${roms.prefix}`);
const scheme = tls ? 'https' : 'http';
console.log(`Couch server on ${scheme}://localhost:${port}`);
for (const a of lanAddresses()) console.log(`  ${a.virtual ? '(virtual) ' : ''}${scheme}://${a.address}:${port}  [${a.name}]`);

const shutdown = () => void srv.close().then(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
