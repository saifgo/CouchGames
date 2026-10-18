/**
 * Emulator frame-pacing benchmark (ADR-001).
 *
 *   engine.html?system=snes&engine=retroarch|ejs|ejs-thread&core=snes9x&seconds=20
 *
 * Measures the RetroArch main loop (one retro_run per requestAnimationFrame):
 * effective FPS, per-frame CPU time and the share of frames that overrun the
 * 16.7 ms budget (the cause of both stutter and audio crackle). Also checks that
 * injected input reaches the core. Results land on window.__engineResult.
 */
import { unzipSync } from 'fflate';
import { Nostalgist } from 'nostalgist';
import { summarize } from '@couch/protocol';

const params = new URLSearchParams(location.search);
const system = params.get('system') ?? 'nes';
const engine = (params.get('engine') ?? 'retroarch') as 'retroarch' | 'ejs' | 'ejs-thread';
const seconds = Number(params.get('seconds') ?? 20);
const hud = document.getElementById('hud')!;

const DEFAULT_CORE: Record<string, string> = {
  nes: 'fceumm',
  snes: 'snes9x',
  genesis: 'genesis_plus_gx',
  gb: 'gambatte',
  gbc: 'gambatte',
  gba: 'mgba',
  psx: 'pcsx_rearmed',
  n64: 'mupen64plus_next',
  psp: 'ppsspp',
  nds: 'melonds',
  atari2600: 'stella2014',
  pce: 'mednafen_pce_fast',
};
const core = params.get('core') ?? DEFAULT_CORE[system]!;

/* ---------- frame-loop instrumentation (installed before the core loads) ---------- */
const frameStarts: number[] = [];
const frameCosts: number[] = [];
let measuring = false;
const rawRaf = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = (cb: FrameRequestCallback) =>
  rawRaf((ts) => {
    const t0 = performance.now();
    cb(ts);
    if (measuring) {
      frameStarts.push(t0);
      frameCosts.push(performance.now() - t0);
    }
  });

/* ---------- virtual gamepad (RetroArch rwebpad reads navigator.getGamepads each poll) ---------- */
interface VButton {
  pressed: boolean;
  touched: boolean;
  value: number;
}
const vpad = {
  id: 'Couch Virtual Pad (STANDARD GAMEPAD)',
  index: 0,
  connected: true,
  mapping: 'standard' as GamepadMappingType,
  timestamp: performance.now(),
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, (): VButton => ({ pressed: false, touched: false, value: 0 })),
  hapticActuators: [],
  vibrationActuator: null,
};
const pads = [vpad, null, null, null];
// Hidden until the core is running: Nostalgist re-dispatches real GamepadEvents for
// every pad at launch, and GamepadEvent refuses non-native Gamepad objects.
let padsVisible = false;
if (engine === 'retroarch') {
  Object.defineProperty(navigator, 'getGamepads', { value: () => (padsVisible ? pads : [null, null, null, null]), configurable: true });
}

/** Standard-mapping index → press. 12 = d-pad up, 13 = down, 9 = start, 0 = bottom face. */
function stdPress(index: number, down: boolean) {
  const b = vpad.buttons[index]!;
  b.pressed = b.touched = down;
  b.value = down ? 1 : 0;
  vpad.timestamp = performance.now();
}

type EmModule = {
  _simulate_input?: (player: number, index: number, value: number) => void;
  _get_current_frame_count?: () => number;
};
let mod: EmModule | null = null;
/** RetroPad id (libretro) press via EmulatorJS's exported simulate_input. */
function ejsPress(retroId: number, down: boolean) {
  mod?._simulate_input?.(0, retroId, down ? 1 : 0);
}

async function romUrls(): Promise<string[]> {
  const explicit = params.get('rom');
  if (explicit) return [explicit];
  const { roms } = (await (await fetch('/api/library')).json()) as {
    roms: { system: string; url: string; extra: string[]; source: string }[];
  };
  const pick = roms.find((r) => r.system === system && r.source === 'homebrew') ?? roms.find((r) => r.system === system);
  if (!pick) throw new Error(`no ROM for ${system}; run pnpm test-roms or add one to roms/${system}`);
  return [pick.url, ...pick.extra];
}

/** libretro RetroPad id → W3C standard-gamepad button index (RetroArch rwebpad layout). */
const RETRO_TO_STD: Record<number, number> = {
  0: 0, // B → bottom face
  8: 1, // A → right face
  1: 2, // Y → left face
  9: 3, // X → top face
  10: 4,
  11: 5,
  12: 6,
  13: 7,
  2: 8,
  3: 9,
  14: 10,
  15: 11,
  4: 12,
  5: 13,
  6: 14,
  7: 15,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (params.get('tapToStart') === '1') {
    // Mirrors the product: the user presses "Play", which also unlocks audio.
    hud.textContent = 'tap to start';
    await new Promise<void>((r) => window.addEventListener('pointerdown', () => r(), { once: true }));
  }
  const urls = await romUrls();
  const base = `${location.origin}/cores/${engine}`;
  hud.textContent = `launching ${engine}/${core} with ${urls[0]}`;
  const tLaunch = performance.now();
  const n = await Nostalgist.launch({
    core,
    rom: urls.map((u) => ({ fileName: decodeURIComponent(u.split('/').pop()!), fileContent: u })),
    element: document.getElementById('stage')!.appendChild(document.createElement('canvas')),
    resolveCoreJs: () => `${base}/${core}_libretro.js`,
    resolveCoreWasm: () => `${base}/${core}_libretro.wasm`,
    respondToGlobalEvents: false,
    // EmulatorJS's RetroArch fork looks these up on Module (keyboard target "!parent", core callbacks).
    ...(engine === 'retroarch'
      ? {}
      : {
          emscriptenModule: {
            parent: document.getElementById('stage'),
            callbacks: { setupCoreSettingFile: () => {} },
            getSavExt: () => '.srm',
            // pthread workers must load the untouched classic script, not Nostalgist's ESM blob.
            ...(engine === 'ejs-thread' ? { mainScriptUrlOrBlob: `${base}/${core}_libretro.classic.js` } : {}),
          } as never,
        }),
    retroarchConfig: {
      input_player1_analog_dpad_mode: 0,
      video_vsync: true,
      rewind_enable: false,
      ...(engine === 'retroarch' ? { input_joypad_driver: 'rwebpad', input_autodetect_enable: true } : {}),
      // Lab-only overrides: ?ra_<key>=<value>
      ...Object.fromEntries([...params].filter(([k]) => k.startsWith('ra_')).map(([k, v]) => [k.slice(3), v === 'true' ? true : v === 'false' ? false : v])),
    } as never,
    beforeLaunch: async (nostalgist) => {
      if (core !== 'ppsspp') return;
      const FS = nostalgist.getEmscriptenFS() as { mkdirTree: (p: string) => void; writeFile: (p: string, d: Uint8Array) => void };
      const files = unzipSync(new Uint8Array(await (await fetch(`${base}/ppsspp-assets.zip`)).arrayBuffer()));
      for (const [name, data] of Object.entries(files)) {
        if (name.endsWith('/')) continue;
        const path = `/PPSSPP/${name}`;
        FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
        FS.writeFile(path, data);
      }
    },
    retroarchCoreConfig: Object.fromEntries([...params].filter(([k]) => k.startsWith('co_')).map(([k, v]) => [k.slice(3), v])) as never,
  });
  const launchMs = performance.now() - tLaunch;
  mod = n.getEmscriptenModule() as unknown as EmModule;
  if (engine === 'retroarch') {
    padsVisible = true;
    window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: vpad }));
  }

  // Warm-up: let the game boot and JIT settle.
  await sleep(3000);

  // Input check is driven by the Playwright runner through window.__press, comparing
  // compositor screenshots (works for both engines; RetroArch's screenshot command does not
  // exist in the EmulatorJS build).
  const lab = window as unknown as { __press: (retroId: number, down: boolean) => void; __ready: boolean; __startMeasure: () => void };
  lab.__press = (retroId, down) => {
    if (engine === 'retroarch') stdPress(RETRO_TO_STD[retroId] ?? 0, down);
    else ejsPress(retroId, down);
  };
  lab.__ready = true;
  hud.textContent = `${engine}/${core} running (launch ${launchMs.toFixed(0)} ms)`;
  if (params.get('wait') === '1') await new Promise<void>((r) => (lab.__startMeasure = r));
  const inputReachedCore: boolean | null = null;

  measuring = true;
  const frame0 = mod?._get_current_frame_count?.() ?? null;
  const tStart = performance.now();
  while (performance.now() - tStart < seconds * 1000) {
    await sleep(500);
    const el = (performance.now() - tStart) / 1000;
    hud.textContent = `${engine}/${core}  ${(frameStarts.length / el).toFixed(1)} fps  (${el.toFixed(0)}/${seconds}s)`;
  }
  measuring = false;
  const elapsed = (performance.now() - tStart) / 1000;
  const frame1 = mod?._get_current_frame_count?.() ?? null;
  /** Frames actually emulated per second (core counter; EmulatorJS builds only). */
  const emulatedFps = frame0 !== null && frame1 !== null ? (frame1 - frame0) / elapsed : null;
  const intervals = frameStarts.slice(1).map((t, i) => t - frameStarts[i]!);
  const cost = summarize(frameCosts);
  const result = {
    system,
    engine,
    core,
    rom: urls[0],
    userAgent: navigator.userAgent,
    crossOriginIsolated: self.crossOriginIsolated,
    launchMs,
    seconds: elapsed,
    fps: emulatedFps ?? frameStarts.length / elapsed,
    rafFps: frameStarts.length / elapsed,
    emulatedFps,
    frameCostMs: cost,
    frameIntervalMs: summarize(intervals),
    /** Frames whose own work exceeded one 60 Hz vsync period. */
    overBudgetPct: (frameCosts.filter((c) => c > 16.7).length / frameCosts.length) * 100,
    /** Gaps between frames > 1.5 vsync periods: visible stutter + likely audio underrun. */
    hitchPct: (intervals.filter((d) => d > 25).length / intervals.length) * 100,
    inputReachedCore,
    gl: glInfo(),
  };
  hud.textContent = JSON.stringify({ ...result, frameCostMs: undefined, frameIntervalMs: undefined }, null, 1);
  (window as unknown as { __engineResult: unknown }).__engineResult = result;
  void fetch('/api/lab/results', { method: 'POST', body: JSON.stringify({ label: `engine-${system}-${engine}-${core}`, mode: 'engine', ...result }) }).catch(() => {});
}

function glInfo(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : gl ? 'webgl2 (renderer hidden)' : 'no webgl2';
  } catch {
    return 'unknown';
  }
}

main().catch((err) => {
  hud.textContent = `failed: ${(err as Error).stack ?? err}`;
  (window as unknown as { __engineError: string }).__engineError = String((err as Error).stack ?? err);
});
