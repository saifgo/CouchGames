/**
 * Where ROM and BIOS files live: a local directory, or an S3 bucket (AWS S3 or any
 * S3-compatible service: Cloudflare R2, MinIO, Backblaze B2, Wasabi...).
 *
 * Paths are "/"-separated and relative to the store root, e.g. "snes/Game.sfc".
 * The server streams S3 objects through itself, so the bucket stays private and
 * needs no CORS rules, and the TV keeps fetching same-origin /roms/* URLs.
 */
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { safeJoin } from './library.js';

export interface StoredFile {
  name: string;
  size: number;
  mtimeMs: number;
}

export interface RomStore {
  /** Stable key for caches (metadata by CRC): absolute path or s3://bucket/key. */
  id(rel: string): string;
  /** Files directly inside `dir`. Missing directory → []. */
  list(dir: string): Promise<StoredFile[]>;
  /** null when the file does not exist (or the path is not allowed). */
  stat(rel: string): Promise<{ size: number; mtimeMs: number } | null>;
  /** Bytes [start, end], inclusive; end defaults to the last byte. */
  open(rel: string, start?: number, end?: number): Promise<Readable>;
}

export class FsStore implements RomStore {
  constructor(readonly dir: string) {}

  id(rel: string) {
    return join(this.dir, rel);
  }

  async list(dir: string): Promise<StoredFile[]> {
    const full = safeJoin(this.dir, dir);
    const names = full ? await readdir(full).catch(() => [] as string[]) : [];
    const out: StoredFile[] = [];
    for (const name of names) {
      const st = await stat(join(full!, name)).catch(() => null);
      if (st?.isFile()) out.push({ name, size: st.size, mtimeMs: st.mtimeMs });
    }
    return out;
  }

  async stat(rel: string) {
    const full = safeJoin(this.dir, rel);
    const st = full ? await stat(full).catch(() => null) : null;
    return st?.isFile() ? { size: st.size, mtimeMs: st.mtimeMs } : null;
  }

  async open(rel: string, start?: number, end?: number) {
    const full = safeJoin(this.dir, rel);
    if (!full) throw new Error(`path outside store: ${rel}`);
    return createReadStream(full, { start, end });
  }
}

export interface S3StoreOptions {
  bucket: string;
  /** Key prefix the library lives under, e.g. "couch/roms/". Empty = bucket root. */
  prefix?: string;
  region?: string;
  /** Custom endpoint for S3-compatible services (R2, MinIO, B2...). */
  endpoint?: string;
  /** Path-style URLs (bucket in the path): needed by MinIO and some others. */
  forcePathStyle?: boolean;
  /** Injected client (tests). Credentials otherwise come from the AWS default chain. */
  client?: Pick<S3Client, 'send'>;
}

export class S3Store implements RomStore {
  readonly bucket: string;
  readonly prefix: string;
  private readonly client: Pick<S3Client, 'send'>;

  constructor(opts: S3StoreOptions) {
    this.bucket = opts.bucket;
    const p = (opts.prefix ?? '').replace(/^\/+/, '');
    this.prefix = p && !p.endsWith('/') ? `${p}/` : p;
    this.client =
      opts.client ??
      new S3Client({
        region: opts.region ?? 'us-east-1',
        ...(opts.endpoint ? { endpoint: opts.endpoint } : {}),
        forcePathStyle: opts.forcePathStyle ?? false,
      });
  }

  /** A store for a sub-folder of this one (e.g. "bios"), same bucket and client. */
  sub(dir: string): S3Store {
    return new S3Store({ bucket: this.bucket, prefix: this.prefix + dir, client: this.client });
  }

  id(rel: string) {
    return `s3://${this.bucket}/${this.key(rel)}`;
  }

  /** Object key for `rel`, or null for paths with empty / "." / ".." segments. */
  private key(rel: string): string | null {
    const parts = rel.split('/');
    return parts.every((s) => s && s !== '.' && s !== '..') ? this.prefix + rel : null;
  }

  async list(dir: string): Promise<StoredFile[]> {
    const key = this.key(dir);
    if (!key) return [];
    const out: StoredFile[] = [];
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: `${key}/`, Delimiter: '/', ContinuationToken: token }),
      );
      for (const o of page.Contents ?? []) {
        const name = o.Key!.slice(key.length + 1);
        if (name) out.push({ name, size: o.Size ?? 0, mtimeMs: o.LastModified?.getTime() ?? 0 });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  async stat(rel: string) {
    const key = this.key(rel);
    if (!key) return null;
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: head.ContentLength ?? 0, mtimeMs: head.LastModified?.getTime() ?? 0 };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async open(rel: string, start?: number, end?: number) {
    const key = this.key(rel);
    if (!key) throw new Error(`invalid key: ${rel}`);
    const range = start !== undefined || end !== undefined ? `bytes=${start ?? 0}-${end ?? ''}` : undefined;
    const obj = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: range }));
    return obj.Body as Readable;
  }
}

function isNotFound(err: unknown) {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NotFound' || e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404;
}
