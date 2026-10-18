/**
 * The Android TV app (CoucheTV APK), offered for download on the TV page.
 *
 * The Docker image does not build the APK (that needs the Android SDK), so the server
 * looks for one, in order:
 *  1. APK_URL: an external link (e.g. a GitHub release); the page links straight to it
 *  2. apps/ in the ROM store, e.g. s3://<bucket>/<prefix>apps/CoucheTV-0.4.0-release.apk
 *  3. the Gradle output in this repo (local runs after ./gradlew :app:assembleRelease)
 * Several APKs: release beats debug, then the highest version, then the newest file.
 */
import type { RomStore, StoredFile } from './store.js';

export interface ApkInfo {
  file: string;
  version: string | null;
  /** Bytes; null for an external link. */
  size: number | null;
  /** Where the page sends people: /download/<file> or the external link. */
  url: string;
}

export interface ApkSource {
  url?: string;
  stores: RomStore[];
}

export function apkVersion(name: string): string | null {
  return /(\d+\.\d+\.\d+)/.exec(name)?.[1] ?? null;
}

const cmpVersion = (a: string | null, b: string | null) => {
  const pa = (a ?? '0.0.0').split('.').map(Number);
  const pb = (b ?? '0.0.0').split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i]! - pb[i]!;
  return 0;
};

/** Best APK among `files`, or null. */
export function pickApk(files: StoredFile[]): StoredFile | null {
  const apks = files.filter((f) => f.name.toLowerCase().endsWith('.apk') && f.size > 0);
  apks.sort((a, b) => {
    const debug = Number(/debug/i.test(a.name)) - Number(/debug/i.test(b.name));
    return debug || -cmpVersion(apkVersion(a.name), apkVersion(b.name)) || b.mtimeMs - a.mtimeMs;
  });
  return apks[0] ?? null;
}

/** Finds the APK; `store` is set when it is served by this server (/download/<file>). */
export async function findApk(src: ApkSource): Promise<{ info: ApkInfo; store?: RomStore } | null> {
  if (src.url) {
    const file = decodeURIComponent(new URL(src.url).pathname.split('/').pop() || 'CoucheTV.apk');
    return { info: { file, version: apkVersion(file), size: null, url: src.url } };
  }
  for (const store of src.stores) {
    const best = pickApk(await store.list('').catch(() => []));
    if (best) return { info: { file: best.name, version: apkVersion(best.name), size: best.size, url: `/download/${encodeURIComponent(best.name)}` }, store };
  }
  return null;
}
