#!/usr/bin/env node
/**
 * Downloads a few freely distributable homebrew ROMs into test-roms/ (git-ignored)
 * for automated tests and demos. Nothing here is committed or redistributed by us.
 *
 *   pnpm test-roms            # download missing files
 *   pnpm test-roms --force    # re-download everything
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import sevenBin from '7zip-bin';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'test-roms');
const force = process.argv.includes('--force');
// pnpm can drop the execute bit on the bundled 7-Zip binary (Linux/Docker).
if (process.platform !== 'win32') chmodSync(sevenBin.path7za, 0o755);

/** @type {{system:string,file:string,url:string,title:string,license:string,source:string,zipEntry?:string}[]} */
const MANIFEST = [
  {
    system: 'nes',
    file: '240pee.nes',
    title: '240p Test Suite (NES)',
    url: 'https://github.com/pinobatch/240p-test-mini/releases/download/v0.23/240pee.nes',
    license: 'zlib',
    source: 'https://github.com/pinobatch/240p-test-mini',
  },
  {
    system: 'gb',
    file: 'gb240p.gb',
    title: '240p Test Suite (Game Boy)',
    url: 'https://github.com/pinobatch/240p-test-mini/releases/download/v0.23/gb240p.gb',
    license: 'zlib',
    source: 'https://github.com/pinobatch/240p-test-mini',
  },
  {
    system: 'gba',
    file: '240pee_mb.gba',
    title: '240p Test Suite (GBA)',
    url: 'https://github.com/pinobatch/240p-test-mini/releases/download/v0.23/240pee_mb.gba',
    license: 'zlib',
    source: 'https://github.com/pinobatch/240p-test-mini',
  },
  {
    system: 'snes',
    file: 'horizontal-shooter.sfc',
    title: 'Horizontal Shooter',
    url: 'https://raw.githubusercontent.com/retrobrews/snes-games/master/horizontal-shooter.sfc',
    license: 'free homebrew (retrobrews, free distribution approved by author)',
    source: 'https://github.com/retrobrews/snes-games',
  },
  {
    system: 'snes',
    file: 'blt.sfc',
    title: 'BLT',
    url: 'https://raw.githubusercontent.com/retrobrews/snes-games/master/blt.sfc',
    license: 'free homebrew (retrobrews, free distribution approved by author)',
    source: 'https://github.com/retrobrews/snes-games',
  },
  {
    system: 'genesis',
    file: 'bombx.bin',
    title: 'BombX',
    url: 'https://raw.githubusercontent.com/retrobrews/md-games/master/bombx.bin',
    license: 'free homebrew (retrobrews, free distribution approved by author)',
    source: 'https://github.com/retrobrews/md-games',
  },
  {
    system: 'atari2600',
    file: 'halo2600.bin',
    title: 'Halo 2600',
    url: 'https://raw.githubusercontent.com/retrobrews/atari2600-games/master/halo2600.bin',
    license: 'free homebrew (retrobrews, free distribution approved by author)',
    source: 'https://github.com/retrobrews/atari2600-games',
  },
  {
    system: 'pce',
    file: 'pcengine-polygon-sample.pce',
    title: 'P.C.Engine polygon sample',
    url: 'https://raw.githubusercontent.com/yhzmr442/P.C.Engine/main/sample.pce',
    license: 'GPL-3.0',
    source: 'https://github.com/yhzmr442/P.C.Engine',
  },
  {
    system: 'n64',
    file: 'FlappyBird-v1.7.z64',
    title: 'Flappy Bird 64',
    url: 'https://github.com/meeq/flappybird-n64/releases/download/v1.7/FlappyBird-v1.7.z64',
    license: 'open source homebrew (see repo; local testing only)',
    source: 'https://github.com/meeq/FlappyBird-N64',
  },
  {
    system: 'n64',
    file: 'gamejam2024.z64',
    title: 'N64brew Game Jam 2024 (4-player minigames)',
    url: 'https://github.com/n64brew/N64brew-GameJam2024/releases/download/1.2.1/gamejam2024.z64',
    license: 'MIT',
    source: 'https://github.com/n64brew/N64brew-GameJam2024',
  },
  {
    system: 'nds',
    file: 'ds-craft-beta1.7.1.nds',
    title: 'DS-Craft',
    url: 'https://github.com/moltony/ds-craft/releases/download/beta1.7.1/ds-craft-beta1.7.1.nds',
    license: 'MIT',
    source: 'https://github.com/moltony/ds-craft',
  },
  {
    system: 'psp',
    file: 'BounceZero.pbp',
    title: 'Bounce Zero',
    url: 'https://github.com/amdray/bounce_zero/releases/download/v1.1/BounceZero-v1.1.zip',
    zipEntry: 'EBOOT.PBP',
    license: 'MIT',
    source: 'https://github.com/amdray/bounce_zero',
  },
  {
    system: 'ps2',
    file: '500_Card_Game_PS2_501B.elf',
    title: '500 Card Game (PS2 homebrew ELF)',
    url: 'https://github.com/khant735/500-Card-Game-PS2/releases/download/v501B/500_Card_Game_PS2_501B.ELF',
    license: 'free homebrew download, no licence stated (local testing only)',
    source: 'https://github.com/khant735/500-Card-Game-PS2',
  },
  {
    system: 'psx',
    file: 'celeste.cue',
    title: 'Celeste Classic PSX',
    url: 'https://github.com/wildmonkeydan/ccleste-psx/releases/download/v1.1/celeste.cue',
    license: 'fan port, free download (local testing only)',
    source: 'https://github.com/wildmonkeydan/ccleste-psx',
  },
  {
    system: 'psx',
    file: 'celeste.bin',
    title: 'Celeste Classic PSX (track)',
    url: 'https://github.com/wildmonkeydan/ccleste-psx/releases/download/v1.1/celeste.bin',
    license: 'fan port, free download (local testing only)',
    source: 'https://github.com/wildmonkeydan/ccleste-psx',
  },
];

const lines = ['# test-roms (downloaded, never committed)', '', '| System | File | License | Source | SHA-1 |', '|---|---|---|---|---|'];
let failed = 0;
for (const rom of MANIFEST) {
  const dest = join(out, rom.system, rom.file);
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest) && !force) {
    console.log(`✓ ${rom.system}/${rom.file} (cached)`);
  } else {
    process.stdout.write(`↓ ${rom.system}/${rom.file} … `);
    try {
      const res = await fetch(rom.url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = Buffer.from(await res.arrayBuffer());
      if (rom.zipEntry) {
        const tmp = mkdtempSync(join(tmpdir(), 'couch-rom-'));
        writeFileSync(join(tmp, 'a.zip'), body);
        execFileSync(sevenBin.path7za, ['x', '-y', `-o${tmp}`, join(tmp, 'a.zip')], { stdio: 'ignore' });
        const found = readdirSync(tmp, { recursive: true }).map(String).find((f) => f.toUpperCase().endsWith(rom.zipEntry.toUpperCase()));
        if (!found) throw new Error(`${rom.zipEntry} not in archive`);
        copyFileSync(join(tmp, found), dest);
        rmSync(tmp, { recursive: true, force: true });
      } else {
        writeFileSync(dest, body);
      }
      console.log('ok');
    } catch (err) {
      failed++;
      console.log(`FAILED (${err.message})`);
      continue;
    }
  }
  const { readFileSync } = await import('node:fs');
  const sha1 = createHash('sha1').update(readFileSync(dest)).digest('hex');
  lines.push(`| ${rom.system} | ${rom.file} | ${rom.license} | ${rom.source} | \`${sha1}\` |`);
}
writeFileSync(join(out, 'MANIFEST.md'), lines.join('\n') + '\n');
if (failed) {
  console.error(`${failed} download(s) failed`);
  process.exit(1);
}
