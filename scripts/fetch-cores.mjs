#!/usr/bin/env node
/**
 * Downloads libretro WebAssembly cores for the web host into
 * apps/host-web/cores/ (git-ignored), so the TV works offline and never
 * depends on a third-party CDN at play time.
 *
 *  - retroarch/<core>_libretro.{js,wasm}   official RetroArch Emscripten builds
 *    (arianrhodsandlot/retroarch-emscripten-build, the Nostalgist.js default set)
 *  - ejs/<core>_libretro.{js,wasm}          EmulatorJS builds (adds N64 / PSP / NDS;
 *    exports simulate_input for direct, frame-accurate input injection)
 *  - ejs-thread/...                         pthread builds (need cross-origin isolation)
 *
 *   node scripts/fetch-cores.mjs [--only=snes9x,mupen64plus_next] [--force]
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sevenBin from '7zip-bin';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = join(root, 'apps/host-web/cores');
const force = process.argv.includes('--force');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');

const RETROARCH_VERSION = 'v1.22.2';
const EJS_VERSION = '4.2.3';

const RETROARCH_CORES = ['fceumm', 'snes9x', 'genesis_plus_gx', 'gambatte', 'mgba', 'pcsx_rearmed'];
const EJS_CORES = [
  'fceumm',
  'snes9x',
  'genesis_plus_gx',
  'gambatte',
  'mgba',
  'pcsx_rearmed',
  'mupen64plus_next',
  'parallel_n64',
  'ppsspp',
  'melonds',
  'desmume2015',
];

const want = (c) => !only || only.includes(c);
const sevenZip = sevenBin.path7za;

function extract(archive, dest) {
  execFileSync(sevenZip, ['x', '-y', `-o${dest}`, archive], { stdio: 'ignore' });
}

async function download(url, file) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

/**
 * EmulatorJS cores ship as a CommonJS/AMD factory (`var EJS_Runtime = …`). Nostalgist
 * expects the ESM shape of the official builds (`var libretro_<core> = …; export default`),
 * so rewrite the wrapper. The emulator code itself is untouched.
 */
export function ejsToEsm(js, core) {
  const name = `libretro_${core.replaceAll('-', '_')}`;
  if (!js.includes('var EJS_Runtime')) return js;
  let out = js.replace('var EJS_Runtime = ', `var ${name} = `);
  out = out.replace(/var _scriptName = [^;]*;/, 'var _scriptName = import.meta.url;');
  const tail = out.indexOf("if (typeof exports === 'object' && typeof module === 'object')");
  if (tail > 0) out = out.slice(0, tail);
  return `${out}
export default ${name};
`;
}

function placeCore(fromDir, core, destDir, toEsm = false) {
  mkdirSync(destDir, { recursive: true });
  const files = readdirSync(fromDir, { recursive: true }).map(String);
  const js = files.find((f) => f.endsWith(`${core}_libretro.js`)) ?? files.find((f) => f.endsWith('_libretro.js'));
  const wasm = files.find((f) => f.endsWith(`${core}_libretro.wasm`)) ?? files.find((f) => f.endsWith('_libretro.wasm'));
  if (!js || !wasm) throw new Error(`no js/wasm for ${core} in archive`);
  if (toEsm) {
    const original = readFileSync(join(fromDir, js), 'utf8');
    writeFileSync(join(destDir, `${core}_libretro.js`), ejsToEsm(original, core));
    // pthread workers re-load the core script as a classic worker (Module.mainScriptUrlOrBlob),
    // so keep the untouched original next to the ESM copy.
    if (original.includes('em-pthread')) writeFileSync(join(destDir, `${core}_libretro.classic.js`), original);
  } else {
    copyFileSync(join(fromDir, js), join(destDir, `${core}_libretro.js`));
  }
  copyFileSync(join(fromDir, wasm), join(destDir, `${core}_libretro.wasm`));
  const lic = files.find((f) => /license|copying/i.test(f));
  if (lic) copyFileSync(join(fromDir, lic), join(destDir, `${core}_LICENSE.txt`));
  for (const extra of files.filter((f) => f.endsWith('.worker.js'))) copyFileSync(join(fromDir, extra), join(destDir, extra.split(/[\\/]/).pop()));
}

const tmp = mkdtempSync(join(tmpdir(), 'couch-cores-'));
let failures = 0;
try {
  for (const core of RETROARCH_CORES.filter(want)) {
    const dest = join(outRoot, 'retroarch');
    if (!force && existsSync(join(dest, `${core}_libretro.wasm`))) {
      console.log(`✓ retroarch/${core}`);
      continue;
    }
    try {
      const zip = join(tmp, `${core}.zip`);
      await download(`https://cdn.jsdelivr.net/gh/arianrhodsandlot/retroarch-emscripten-build@${RETROARCH_VERSION}/retroarch/${core}_libretro.zip`, zip);
      const x = join(tmp, `ra-${core}`);
      extract(zip, x);
      placeCore(x, core, dest);
      console.log(`↓ retroarch/${core}`);
    } catch (err) {
      failures++;
      console.log(`✗ retroarch/${core}: ${err.message}`);
    }
  }

  for (const core of EJS_CORES.filter(want)) {
    const done = existsSync(join(outRoot, 'ejs', `${core}_libretro.wasm`)) || existsSync(join(outRoot, 'ejs-thread', `${core}_libretro.wasm`));
    if (!force && done) {
      console.log(`✓ ejs/${core}`);
      continue;
    }
    try {
      const tgz = join(tmp, `${core}.tgz`);
      await download(`https://registry.npmjs.org/@emulatorjs/core-${core}/-/core-${core}-${EJS_VERSION}.tgz`, tgz);
      const pkgDir = join(tmp, `ejs-${core}`);
      mkdirSync(pkgDir, { recursive: true });
      // .tgz → .tar → files (7-Zip handles both steps on every OS; GNU tar on Windows chokes on "C:")
      extract(tgz, pkgDir);
      const tar = readdirSync(pkgDir).find((f) => f.endsWith('.tar'));
      if (tar) extract(join(pkgDir, tar), pkgDir);
      const dataFiles = readdirSync(join(pkgDir, 'package')).filter((f) => f.endsWith('.data'));
      const variants = [
        [`${core}-wasm.data`, 'ejs'],
        [`${core}-thread-wasm.data`, 'ejs-thread'],
      ];
      let placed = 0;
      for (const [file, dir] of variants) {
        if (!dataFiles.includes(file)) continue;
        const x = join(tmp, `x-${core}-${dir}`);
        extract(join(pkgDir, 'package', file), x);
        placeCore(x, core, join(outRoot, dir), true);
        placed++;
        console.log(`↓ ${dir}/${core}`);
        // PPSSPP needs its asset bundle (fonts, compat.ini) mounted at /PPSSPP.
        const assets = readdirSync(join(pkgDir, 'package')).find((f) => f.endsWith('-assets.zip'));
        if (assets) copyFileSync(join(pkgDir, 'package', assets), join(outRoot, dir, assets));
      }
      if (!placed) throw new Error(`no wasm variants (have: ${dataFiles.join(', ')})`);
    } catch (err) {
      failures++;
      console.log(`✗ ejs/${core}: ${err.message}`);
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

writeFileSync(
  join(outRoot, 'SOURCES.md'),
  `# Downloaded cores (not committed)\n\n- retroarch/: arianrhodsandlot/retroarch-emscripten-build ${RETROARCH_VERSION} (jsDelivr)\n- ejs/, ejs-thread/: @emulatorjs/core-* ${EJS_VERSION} (npm)\n\nLicenses: see *_LICENSE.txt next to each core and docs/LICENSES.md.\n`,
);
if (failures) process.exit(1);
