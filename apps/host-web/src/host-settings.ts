import { SYSTEMS, type SystemDef } from '@couch/systems';
import type { ConsoleId } from '@couch/protocol';

/**
 * The web host is CouchPad Free: one player. Multiplayer (2 to 8) is CouchPad Pro on the
 * Android TV app (ADR-005).
 */
export const WEB_PLAYERS = 1;

export interface HostSettings {
  hostName: string;
  /** Show systems measured too heavy for this device (ADR-001). */
  showAllSystems: boolean;
  /** Enable PSP (EmulatorJS pthread build, needs cross-origin isolation). */
  experimentalPsp: boolean;
  /** Run-ahead frames (0 = off); cuts 1 frame of game-logic lag on light cores. */
  runAhead: 0 | 1 | 2;
  latencyOverlay: boolean;
  ambientMusic: boolean;
  /** Per-system core override (ADR-004: GPL alternatives). */
  cores: Partial<Record<ConsoleId, string>>;
  /** Fetch box art from thumbnails.libretro.com by game name (M6). */
  onlineArt: boolean;
  /** Opt-in: store anonymous per-session latency summaries (no names/ids) on the server. */
  telemetry: boolean;
  /** midnight = the CouchPad look (default; the id predates the rebrand). pixel = Arcade Pixel Art, neon = Neon Arcade; both restyle per console. */
  theme: 'midnight' | 'sunset' | 'pixel' | 'neon';
  onboardingDone: boolean;
}

const DEFAULTS: HostSettings = {
  hostName: 'Living room',
  showAllSystems: false,
  experimentalPsp: false,
  runAhead: 0,
  latencyOverlay: false,
  ambientMusic: false,
  cores: {},
  onlineArt: true,
  telemetry: false,
  theme: 'midnight',
  onboardingDone: false,
};

const KEY = 'couch.host.settings.v1';

export const THEMES: HostSettings['theme'][] = ['midnight', 'pixel', 'neon', 'sunset'];
export const THEME_NAMES: Record<HostSettings['theme'], string> = { midnight: 'CouchPad', pixel: 'Arcade Pixel Art', neon: 'Neon Arcade', sunset: 'Sunset' };

export function loadHostSettings(): HostSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Omit<Partial<HostSettings>, 'theme'> & { theme?: string };
    // 'arcade' (a green recolour) was replaced by Arcade Pixel Art.
    if (saved.theme === 'arcade') saved.theme = 'pixel';
    if (saved.theme && !THEMES.includes(saved.theme as HostSettings['theme'])) delete saved.theme;
    // Older versions stored a player count (4 or 8); the web host is single-player now.
    delete (saved as { maxPlayers?: unknown }).maxPlayers;
    return { ...DEFAULTS, ...(saved as Partial<HostSettings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveHostSettings(s: HostSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/** Desktop-class CPU? WASM PS1/NDS/PSP were measured too slow on phone/TV SoCs. */
export function isDesktopClass(): boolean {
  const ua = navigator.userAgent;
  const mobile = /Android|Mobile|CrKey|SMART-TV|SmartTV|AFT|BRAVIA|Tizen|Web0S|iPhone|iPad/i.test(ua);
  return !mobile && (navigator.hardwareConcurrency ?? 4) >= 4;
}

export type Availability = { ok: true } | { ok: false; reason: string };

export function systemAvailability(sys: SystemDef, s: HostSettings): Availability {
  if (!sys.web) return { ok: false, reason: `${sys.shortName} runs on the Android TV app only` };
  if (sys.web.experimental && sys.id === 'psp' && !s.experimentalPsp) return { ok: false, reason: 'PSP is experimental: enable it in Settings' };
  if (sys.web.backend === 'ejs-thread' && !self.crossOriginIsolated)
    return { ok: false, reason: 'Needs cross-origin isolation: start the server with COI=1 and open the TV page on localhost' };
  if (sys.web.desktopOnly && !isDesktopClass() && !s.showAllSystems) return { ok: false, reason: 'Too heavy for this device (needs a desktop CPU)' };
  return { ok: true };
}

export function coreFor(sys: SystemDef, s: HostSettings): string {
  const pref = s.cores[sys.id];
  return pref && sys.web?.cores.includes(pref) ? pref : sys.web!.cores[0]!;
}

export const systemsInOrder = SYSTEMS;
