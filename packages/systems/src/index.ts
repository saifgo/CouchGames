import type { ConsoleId, SkinId } from '@couch/protocol';

/** Rough CPU/GPU demand; device tiers unlock systems by this value (see ADR-001). */
export type PerfTier = 1 | 2 | 3 | 4 | 5;

export interface BiosFile {
  file: string;
  required: boolean;
  note: string;
}

export interface SystemDef {
  id: ConsoleId;
  name: string;
  shortName: string;
  maker: string;
  year: number;
  /** Lower-case, with dot. `.zip` is accepted where the core can open archives. */
  extensions: string[];
  skin: SkinId;
  maxPlayers: number;
  /** Demand on the host: 1 = trivially light (8-bit), 5 = PS2. */
  tier: PerfTier;
  /** Accent colour for the TV carousel. */
  accent: string;
  /**
   * Web host cores (Nostalgist.js / RetroArch Emscripten build), preferred first.
   * null when no usable web core exists.
   */
  web: {
    cores: string[];
    backend: 'retroarch' | 'ejs' | 'ejs-thread';
    analog: boolean;
    experimental?: boolean;
    /** Measured too heavy for phone/TV-class SoCs in WASM (ADR-001): desktop CPUs only. */
    desktopOnly?: boolean;
  } | null;
  /** Android TV host cores (LibretroDroid, libretro buildbot arm64-v8a names), preferred first. */
  android: { cores: string[]; experimental?: boolean };
  bios: BiosFile[];
}

export const SYSTEMS: readonly SystemDef[] = [
  {
    id: 'nes',
    name: 'Nintendo Entertainment System',
    shortName: 'NES',
    maker: 'Nintendo',
    year: 1985,
    extensions: ['.nes', '.fds', '.unf', '.unif', '.zip'],
    skin: 'nes',
    maxPlayers: 4,
    tier: 1,
    accent: '#d6262f',
    web: { cores: ['fceumm'], backend: 'retroarch', analog: false },
    android: { cores: ['fceumm', 'nestopia'] },
    bios: [],
  },
  {
    id: 'snes',
    name: 'Super Nintendo',
    shortName: 'SNES',
    maker: 'Nintendo',
    year: 1990,
    extensions: ['.sfc', '.smc', '.fig', '.swc', '.bs', '.zip'],
    skin: 'snes',
    maxPlayers: 5,
    tier: 2,
    accent: '#7b5fc7',
    web: { cores: ['snes9x'], backend: 'retroarch', analog: false },
    android: { cores: ['snes9x', 'bsnes_mercury_performance', 'bsnes'] },
    bios: [],
  },
  {
    id: 'genesis',
    name: 'Sega Genesis / Mega Drive',
    shortName: 'Genesis',
    maker: 'Sega',
    year: 1988,
    extensions: ['.md', '.gen', '.smd', '.bin', '.sms', '.gg', '.zip'],
    skin: 'genesis',
    maxPlayers: 4,
    tier: 1,
    accent: '#1f6fd1',
    web: { cores: ['genesis_plus_gx'], backend: 'retroarch', analog: false },
    android: { cores: ['genesis_plus_gx', 'clownmdemu', 'picodrive'] },
    bios: [],
  },
  {
    id: 'gb',
    name: 'Game Boy',
    shortName: 'GB',
    maker: 'Nintendo',
    year: 1989,
    extensions: ['.gb', '.zip'],
    skin: 'gb',
    maxPlayers: 1,
    tier: 1,
    accent: '#8bac0f',
    web: { cores: ['gambatte'], backend: 'retroarch', analog: false },
    android: { cores: ['gambatte', 'mgba'] },
    bios: [],
  },
  {
    id: 'gbc',
    name: 'Game Boy Color',
    shortName: 'GBC',
    maker: 'Nintendo',
    year: 1998,
    extensions: ['.gbc', '.zip'],
    skin: 'gb',
    maxPlayers: 1,
    tier: 1,
    accent: '#e0368f',
    web: { cores: ['gambatte'], backend: 'retroarch', analog: false },
    android: { cores: ['gambatte', 'mgba'] },
    bios: [],
  },
  {
    id: 'gba',
    name: 'Game Boy Advance',
    shortName: 'GBA',
    maker: 'Nintendo',
    year: 2001,
    extensions: ['.gba', '.zip'],
    skin: 'gba',
    maxPlayers: 1,
    tier: 2,
    accent: '#4b3fb5',
    web: { cores: ['mgba'], backend: 'retroarch', analog: false },
    android: { cores: ['mgba'] },
    bios: [{ file: 'gba_bios.bin', required: false, note: 'mGBA has a built-in HLE BIOS' }],
  },
  {
    id: 'psx',
    name: 'PlayStation',
    shortName: 'PS1',
    maker: 'Sony',
    year: 1994,
    extensions: ['.chd', '.cue', '.pbp', '.m3u', '.iso', '.img', '.ccd'],
    skin: 'psx',
    maxPlayers: 4,
    tier: 3,
    accent: '#8e9aa6',
    web: { cores: ['pcsx_rearmed'], backend: 'retroarch', analog: true, desktopOnly: true },
    android: { cores: ['pcsx_rearmed', 'swanstation'] },
    bios: [
      { file: 'scph5501.bin', required: false, note: 'USA BIOS; HLE fallback breaks some games' },
      { file: 'scph5500.bin', required: false, note: 'Japan BIOS' },
      { file: 'scph5502.bin', required: false, note: 'Europe BIOS' },
    ],
  },
  {
    id: 'n64',
    name: 'Nintendo 64',
    shortName: 'N64',
    maker: 'Nintendo',
    year: 1996,
    extensions: ['.z64', '.n64', '.v64', '.zip'],
    skin: 'n64',
    maxPlayers: 4,
    tier: 4,
    accent: '#2c8f3c',
    web: null,
    // mupen64plus_next aborts (destroyed-mutex in HWUI) under LibretroDroid on Android 15 /
    // Adreno 660; parallel_n64 runs. See docs/MILESTONES.md "Known issues".
    android: { cores: ['parallel_n64', 'mupen64plus_next_gles3'], experimental: true },
    bios: [],
  },
  {
    id: 'psp',
    name: 'PlayStation Portable',
    shortName: 'PSP',
    maker: 'Sony',
    year: 2004,
    extensions: ['.iso', '.cso', '.pbp', '.elf'],
    skin: 'psp',
    maxPlayers: 1,
    tier: 4,
    accent: '#30343b',
    web: { cores: ['ppsspp'], backend: 'ejs-thread', analog: true, experimental: true, desktopOnly: true },
    android: { cores: ['ppsspp'] },
    bios: [],
  },
  {
    id: 'nds',
    name: 'Nintendo DS',
    shortName: 'NDS',
    maker: 'Nintendo',
    year: 2004,
    extensions: ['.nds', '.zip'],
    skin: 'nds',
    maxPlayers: 1,
    tier: 4,
    accent: '#a7adb5',
    web: { cores: ['melonds', 'desmume2015'], backend: 'ejs', analog: false, desktopOnly: true },
    android: { cores: ['melonds', 'desmume'] },
    bios: [
      { file: 'bios7.bin', required: false, note: 'melonDS falls back to HLE' },
      { file: 'bios9.bin', required: false, note: 'melonDS falls back to HLE' },
      { file: 'firmware.bin', required: false, note: 'melonDS falls back to HLE' },
    ],
  },
  {
    id: 'ps2',
    name: 'PlayStation 2',
    shortName: 'PS2',
    maker: 'Sony',
    year: 2000,
    extensions: ['.iso', '.chd', '.cso', '.isz', '.elf'],
    skin: 'ps2',
    maxPlayers: 2,
    tier: 5,
    accent: '#1d3b8f',
    web: null,
    android: { cores: ['play', 'pcsx2'], experimental: true },
    bios: [{ file: 'ps2-bios.bin', required: false, note: 'Play! runs many titles with HLE; some need a real BIOS' }],
  },
];

export const SYSTEM_BY_ID: Readonly<Record<ConsoleId, SystemDef>> = Object.fromEntries(
  SYSTEMS.map((s) => [s.id, s]),
) as Record<ConsoleId, SystemDef>;

export function getSystem(id: string): SystemDef | undefined {
  return (SYSTEM_BY_ID as Record<string, SystemDef>)[id];
}

/** Systems whose folder could contain a file with this extension. */
export function systemsForExtension(ext: string): SystemDef[] {
  const e = ext.toLowerCase();
  return SYSTEMS.filter((s) => s.extensions.includes(e));
}

/** Pretty title from a ROM filename: strips extension, region/revision tags and dump flags. */
export function titleFromFilename(file: string): string {
  let t = file.replace(/\.[^.]+$/, '');
  t = t.replace(/\s*[([][^)\]]*[)\]]/g, '');
  t = t.replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim();
  // "Legend of Zelda, The" → "The Legend of Zelda"
  const m = /^(.*), (The|A|An)$/i.exec(t);
  if (m) t = `${m[2]} ${m[1]}`;
  return t || file;
}
