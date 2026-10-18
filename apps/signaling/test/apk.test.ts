import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findApk, pickApk } from '../src/apk.js';
import { startCouchServer } from '../src/server.js';
import { FsStore } from '../src/store.js';

const f = (name: string, mtimeMs = 0, size = 10) => ({ name, size, mtimeMs });

describe('pickApk', () => {
  it('prefers release, then the highest version, then the newest file', () => {
    expect(pickApk([f('CoucheTV-0.4.0-debug.apk'), f('CoucheTV-0.3.0-release.apk')])!.name).toBe('CoucheTV-0.3.0-release.apk');
    expect(pickApk([f('CoucheTV-0.4.0-release.apk'), f('CoucheTV-0.10.0-release.apk')])!.name).toBe('CoucheTV-0.10.0-release.apk');
    expect(pickApk([f('a.apk', 1), f('b.apk', 2)])!.name).toBe('b.apk');
    expect(pickApk([f('notes.txt'), f('empty.apk', 0, 0)])).toBeNull();
  });

  it('uses APK_URL as is', async () => {
    const r = await findApk({ url: 'https://github.com/x/y/releases/download/v1/CoucheTV-0.4.0-release.apk', stores: [] });
    expect(r!.info).toEqual({ file: 'CoucheTV-0.4.0-release.apk', version: '0.4.0', size: null, url: 'https://github.com/x/y/releases/download/v1/CoucheTV-0.4.0-release.apk' });
  });
});

describe('/api/apk + /download', () => {
  it('offers the APK from apps/ and serves only that file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'couch-apk-'));
    mkdirSync(join(dir, 'apps'));
    writeFileSync(join(dir, 'apps', 'CoucheTV-0.4.0-release.apk'), 'APKDATA');
    writeFileSync(join(dir, 'apps', 'secret.txt'), 'no');
    const srv = await startCouchServer({ port: 0, host: '127.0.0.1', apk: { stores: [new FsStore(join(dir, 'apps'))] }, log: () => {} });
    try {
      const info = await (await fetch(`${srv.url}/api/apk`)).json();
      expect(info).toEqual({ file: 'CoucheTV-0.4.0-release.apk', version: '0.4.0', size: 7, url: '/download/CoucheTV-0.4.0-release.apk' });
      const res = await fetch(`${srv.url}${info.url}`);
      expect(res.headers.get('content-type')).toBe('application/vnd.android.package-archive');
      expect(res.headers.get('content-disposition')).toContain('attachment');
      expect(await res.text()).toBe('APKDATA');
      expect((await fetch(`${srv.url}/download/secret.txt`)).status).toBe(404);
    } finally {
      await srv.close();
    }
    const none = await startCouchServer({ port: 0, host: '127.0.0.1', apk: { stores: [new FsStore(join(dir, 'nope'))] }, log: () => {} });
    try {
      expect((await fetch(`${none.url}/api/apk`)).status).toBe(404);
    } finally {
      await none.close();
    }
  });
});
