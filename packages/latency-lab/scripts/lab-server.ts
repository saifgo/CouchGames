import { fileURLToPath } from 'node:url';
import { startCouchServer, type CouchServer } from '@couch/signaling';

const repo = fileURLToPath(new URL('../../../', import.meta.url));

/** Couch server configured for lab runs (serves /lab, /cores, test ROMs, saves results). */
export function startLabServer(opts: { port?: number; relayDelayMs?: number; coi?: boolean } = {}): Promise<CouchServer> {
  return startCouchServer({
    port: opts.port ?? 0,
    relayDelayMs: opts.relayDelayMs ?? 0,
    crossOriginIsolation: opts.coi ?? false,
    libraryRoots: [
      { dir: `${repo}roms`, source: 'user', urlPrefix: '/roms' },
      { dir: `${repo}test-roms`, source: 'homebrew', urlPrefix: '/test-roms' },
    ],
    labResultsDir: `${repo}packages/latency-lab/results/raw`,
    static: [
      { prefix: '/lab', dir: `${repo}packages/latency-lab/dist`, spa: false },
      { prefix: '/cores', dir: `${repo}apps/host-web/cores`, spa: false },
    ],
    log: () => {},
  });
}

export const resultsDir = `${repo}packages/latency-lab/results`;
