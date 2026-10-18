/**
 * Connection check for the ROM store (local folder or S3), shown on the TV.
 *
 * Lists everything under the root once, sorts files into games / BIOS / misplaced,
 * and reads one byte of a game to prove read access. AWS errors are turned into
 * plain explanations ("the secret key is wrong") so a bad config is obvious.
 */
import { extname } from 'node:path';
import type { ConsoleId } from '@couch/protocol';
import { getSystem, SYSTEMS } from '@couch/systems';
import type { RomStore, StoreInfo } from './store.js';

/** Enough for a big library; the check stops listing after this many files. */
const MAX_FILES = 20_000;
const MAX_MISPLACED = 25;

export interface MisplacedFile {
  path: string;
  reason: string;
}

export interface StorageReport {
  store: StoreInfo;
  ok: boolean;
  /** Plain-language problem when ok is false. */
  error?: string;
  /** Raw error name/code from the SDK or the OS, for searching. */
  errorCode?: string;
  /** Listing worked, and so did reading the first game (null: no game to read). */
  canList: boolean;
  canRead: boolean | null;
  games: number;
  perSystem: Partial<Record<ConsoleId, number>>;
  bios: string[];
  misplaced: MisplacedFile[];
  misplacedTotal: number;
  /** More files than the check lists: counts are a lower bound. */
  truncated: boolean;
  checkedAt: string;
  ms: number;
}

const SYSTEM_IDS = SYSTEMS.map((s) => s.id).join(', ');

/**
 * What the server does with a file: a game, a BIOS, ignored, or not picked up (with why).
 * `caseInsensitive`: local folders on Windows/macOS, where "SNES/" and "snes/" are the same.
 */
export function classify(path: string, caseInsensitive = false): { kind: 'game'; system: ConsoleId } | { kind: 'bios' } | { kind: 'ignore' } | { kind: 'misplaced'; reason: string } {
  const parts = path.split('/');
  const name = parts[parts.length - 1]!;
  if (name.startsWith('.') || /^readme(\.\w+)?$/i.test(name)) return { kind: 'ignore' };
  const folder = parts[0]!;
  if (folder === 'bios') return parts.length === 2 ? { kind: 'bios' } : { kind: 'misplaced', reason: 'BIOS files go directly in bios/, not in a sub-folder' };
  if (parts.length === 1) return { kind: 'misplaced', reason: `at the top level: put it in a system folder (${SYSTEM_IDS})` };
  const sys = getSystem(caseInsensitive ? folder.toLowerCase() : folder);
  if (!sys) {
    const lower = getSystem(folder.toLowerCase());
    return lower
      ? { kind: 'misplaced', reason: `folder names are case-sensitive: rename "${folder}/" to "${lower.id}/"` }
      : { kind: 'misplaced', reason: `"${folder}/" is not a system folder (use one of: ${SYSTEM_IDS})` };
  }
  if (parts.length > 2) return { kind: 'misplaced', reason: `in a sub-folder: the server only reads ${sys.id}/<file>, move it up one level` };
  const ext = extname(name).toLowerCase();
  if (sys.extensions.includes(ext)) return { kind: 'game', system: sys.id };
  // Systems with .cue sheets keep their track files (.bin, .wav...) next to them: not an error.
  if (sys.extensions.includes('.cue')) return { kind: 'ignore' };
  return { kind: 'misplaced', reason: `"${ext || 'no extension'}" is not a ${sys.name} format (use ${sys.extensions.join(', ')})` };
}

export async function checkStorage(store: RomStore): Promise<StorageReport> {
  const t0 = Date.now();
  const report: StorageReport = {
    store: store.describe(),
    ok: false,
    canList: false,
    canRead: null,
    games: 0,
    perSystem: {},
    bios: [],
    misplaced: [],
    misplacedTotal: 0,
    truncated: false,
    checkedAt: new Date().toISOString(),
    ms: 0,
  };
  const done = () => ((report.ms = Date.now() - t0), report);

  let files: string[];
  try {
    const listed = await store.walk(MAX_FILES);
    files = listed.files;
    report.truncated = listed.truncated;
    report.canList = true;
  } catch (err) {
    Object.assign(report, explain(err, report.store));
    return done();
  }

  const caseInsensitive = report.store.kind === 'local' && (process.platform === 'win32' || process.platform === 'darwin');
  let firstGame: string | null = null;
  for (const path of files) {
    const c = classify(path, caseInsensitive);
    if (c.kind === 'game') {
      report.games++;
      report.perSystem[c.system] = (report.perSystem[c.system] ?? 0) + 1;
      firstGame ??= path;
    } else if (c.kind === 'bios') report.bios.push(path.slice('bios/'.length));
    else if (c.kind === 'misplaced') {
      report.misplacedTotal++;
      if (report.misplaced.length < MAX_MISPLACED) report.misplaced.push({ path, reason: c.reason });
    }
  }

  if (firstGame) {
    try {
      for await (const _ of await store.open(firstGame, 0, 0)) break;
      report.canRead = true;
    } catch (err) {
      report.canRead = false;
      const e = explain(err, report.store);
      report.error = `Listing works, but reading files fails: ${e.error}`;
      report.errorCode = e.errorCode;
      return done();
    }
  }
  report.ok = true;
  return done();
}

/** SDK / OS error → sentence a person can act on. */
export function explain(err: unknown, store: StoreInfo): { error: string; errorCode: string } {
  const e = err as { name?: string; code?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  const code = e.name && e.name !== 'Error' ? e.name : (e.code ?? String(e.$metadata?.httpStatusCode ?? 'Error'));
  const status = e.$metadata?.httpStatusCode;
  const msg = e.message ?? String(err);
  if (store.kind === 'local') {
    if (e.code === 'ENOENT') return { error: `The ROM folder ${store.path} does not exist`, errorCode: code };
    if (e.code === 'EACCES' || e.code === 'EPERM') return { error: `No permission to read ${store.path}`, errorCode: code };
    return { error: msg, errorCode: code };
  }
  const where = `bucket "${store.bucket}"`;
  const known: Record<string, string> = {
    CredentialsProviderError: 'No credentials: set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY on the server',
    InvalidAccessKeyId: 'The access key ID is not recognised (AWS_ACCESS_KEY_ID), or it belongs to another provider/endpoint',
    SignatureDoesNotMatch: 'The secret key is wrong (AWS_SECRET_ACCESS_KEY)',
    NoSuchBucket: `The ${where} does not exist (check S3_BUCKET, and S3_ENDPOINT for non-AWS services)`,
    AccessDenied: `The key is not allowed to read ${where}${store.prefix ? ` under "${store.prefix}"` : ''}: it needs s3:ListBucket and s3:GetObject`,
    PermanentRedirect: `The ${where} is in another region: set S3_REGION to the bucket's region`,
    AuthorizationHeaderMalformed: `Wrong region for ${where}: set S3_REGION to the bucket's region`,
    IllegalLocationConstraintException: `Wrong region for ${where}: set S3_REGION to the bucket's region`,
    InvalidBucketName: `"${store.bucket}" is not a valid bucket name (S3_BUCKET is just the name, no s3:// or URL)`,
    RequestTimeTooSkewed: "The server's clock is off by more than 15 minutes; fix its time sync",
    ENOTFOUND: `Can't find the S3 endpoint ${store.endpoint ?? `(AWS ${store.region})`}: check S3_ENDPOINT / S3_REGION`,
    ECONNREFUSED: `The S3 endpoint ${store.endpoint ?? ''} refused the connection`,
    ETIMEDOUT: `Timed out reaching the S3 endpoint ${store.endpoint ?? ''}`,
    TimeoutError: `Timed out reaching the S3 endpoint ${store.endpoint ?? ''}`,
  };
  const hit = known[code] ?? (e.code ? known[e.code] : undefined);
  if (hit) return { error: hit, errorCode: code };
  if (status === 301) return { error: known.PermanentRedirect!, errorCode: code };
  if (status === 403) return { error: known.AccessDenied!, errorCode: code };
  if (status === 404) return { error: known.NoSuchBucket!, errorCode: code };
  return { error: msg, errorCode: code };
}
