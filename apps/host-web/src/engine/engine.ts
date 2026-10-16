/**
 * Emulator engine adapter over Nostalgist.js (ADR-001).
 *
 * Backends:
 *  - retroarch   official RetroArch Emscripten cores; input via virtual gamepads
 *  - ejs         EmulatorJS core builds; input via exported simulate_input()
 *  - ejs-thread  EmulatorJS pthread builds (PSP); needs crossOriginIsolated
 *
 * Input is applied the moment a packet arrives by writing the player's latest
 * state where the core reads it at its next input poll (start of the next frame).
 */
import { unzipSync } from 'fflate';
import { Nostalgist } from 'nostalgist';
import type { InputState } from '@couch/protocol';
import type { SystemDef } from '@couch/systems';
import { VirtualPads, type RumbleSink } from './virtual-pads.js';

export type Backend = 'retroarch' | 'ejs' | 'ejs-thread';

export interface LaunchOptions {
  system: SystemDef;
  core: string;
  backend: Backend;
  /** Main ROM + companion files (cue tracks). */
  files: { name: string; data: Blob | string }[];
  bios?: { name: string; data: Blob | string }[];
  stage: HTMLElement;
  players: number;
  onRumble: RumbleSink;
  /** Initial save state to restore (e.g. "Continue"). */
  state?: Blob;
  /** Frames of run-ahead (0 = off). Only for cores that support savestates cheaply. */
  runAhead?: number;
}

export interface EngineStats {
  fps: number;
  frameMs: number;
}

type EmModule = {
  _simulate_input?: (player: number, index: number, value: number) => void;
  _get_current_frame_count?: () => number;
};

/** Per-system core options so analog pads and multitap behave. */
function coreOptions(system: SystemDef, players: number): Record<string, string> {
  switch (system.id) {
    case 'psx': {
      const o: Record<string, string> = { pcsx_rearmed_multitap: players > 2 ? 'port 1 only' : 'disabled' };
      for (let i = 1; i <= 8; i++) o[`pcsx_rearmed_pad${i}type`] = 'analog';
      return o;
    }
    case 'snes':
      return players > 2 ? { snes9x_up_down_allowed: 'disabled' } : {};
    case 'nes':
      return players > 2 ? { fceumm_nes_four_score: 'enabled' } : {};
    default:
      return {};
  }
}

/**
 * Explicit RetroArch joypad binds for the virtual "standard" gamepads. Without an
 * autoconfig profile RetroArch expects the d-pad on a hat, which rwebpad never
 * reports, so every button and axis is bound by index.
 */
function standardBinds(players: number): Record<string, string | number> {
  const btn: Record<string, number> = {
    b: 0, a: 1, y: 2, x: 3, l: 4, r: 5, l2: 6, r2: 7, select: 8, start: 9, l3: 10, r3: 11, up: 12, down: 13, left: 14, right: 15,
  };
  const axes: Record<string, string> = {
    l_x_plus: '+0', l_x_minus: '-0', l_y_plus: '+1', l_y_minus: '-1',
    r_x_plus: '+2', r_x_minus: '-2', r_y_plus: '+3', r_y_minus: '-3',
  };
  const out: Record<string, string | number> = {};
  for (let p = 1; p <= players; p++) {
    out[`input_player${p}_joypad_index`] = p - 1;
    for (const [k, v] of Object.entries(btn)) out[`input_player${p}_${k}_btn`] = v;
    for (const [k, v] of Object.entries(axes)) out[`input_player${p}_${k}_axis`] = v;
  }
  return out;
}

export class Engine {
  private nostalgist: Nostalgist | null = null;
  private pads: VirtualPads | null = null;
  private mod: EmModule | null = null;
  /** Last values sent through simulate_input, per port (ejs backends). */
  private readonly sent: Int32Array[] = [];
  private frames = 0;
  private frameMs = 0;
  private lastFrameT = 0;
  private fps = 0;
  private fpsWindow: number[] = [];
  paused = false;

  constructor(readonly opts: LaunchOptions) {}

  static supports(backend: Backend): { ok: boolean; reason?: string } {
    if (backend === 'ejs-thread' && !self.crossOriginIsolated) {
      return { ok: false, reason: 'Needs cross-origin isolation (open the TV page on localhost or HTTPS with COI=1)' };
    }
    return { ok: true };
  }

  async launch(): Promise<void> {
    const o = this.opts;
    const base = `${location.origin}/cores/${o.backend}`;
    if (o.backend === 'retroarch') {
      this.pads = new VirtualPads(Math.max(4, o.players), o.onRumble);
      this.pads.install();
    }
    for (let i = 0; i < 8; i++) this.sent.push(new Int32Array(24));
    const canvas = document.createElement('canvas');
    canvas.className = 'game-canvas';
    o.stage.replaceChildren(canvas);
    const analog = o.system.web?.analog ?? false;

    this.nostalgist = await Nostalgist.launch({
      core: o.core,
      rom: o.files.map((f) => ({ fileName: f.name, fileContent: f.data })),
      ...(o.bios?.length ? { bios: o.bios.map((b) => ({ fileName: b.name, fileContent: b.data })) } : {}),
      ...(o.state ? { state: o.state } : {}),
      element: canvas,
      size: 'auto',
      respondToGlobalEvents: false,
      resolveCoreJs: () => `${base}/${o.core}_libretro.js`,
      resolveCoreWasm: () => `${base}/${o.core}_libretro.wasm`,
      retroarchConfig: {
        video_vsync: true,
        rewind_enable: false,
        input_max_users: Math.max(4, o.players),
        savestate_thumbnail_enable: true,
        run_ahead_enabled: (o.runAhead ?? 0) > 0,
        run_ahead_frames: Math.max(1, o.runAhead ?? 1),
        run_ahead_secondary_instance: false,
        ...Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`input_player${i + 1}_analog_dpad_mode`, analog ? 0 : 1])),
        ...(o.backend === 'retroarch' ? { input_joypad_driver: 'rwebpad', input_autodetect_enable: false, ...standardBinds(Math.max(4, o.players)) } : {}),
      } as never,
      retroarchCoreConfig: coreOptions(o.system, o.players) as never,
      ...(o.backend === 'retroarch'
        ? {}
        : {
            emscriptenModule: {
              parent: o.stage,
              callbacks: { setupCoreSettingFile: () => {} },
              getSavExt: () => '.srm',
              ...(o.backend === 'ejs-thread' ? { mainScriptUrlOrBlob: `${base}/${o.core}_libretro.classic.js` } : {}),
            } as never,
          }),
      beforeLaunch: async (n) => {
        if (o.core !== 'ppsspp') return;
        const FS = n.getEmscriptenFS() as { mkdirTree(p: string): void; writeFile(p: string, d: Uint8Array): void };
        const files = unzipSync(new Uint8Array(await (await fetch(`${base}/ppsspp-assets.zip`)).arrayBuffer()));
        for (const [name, data] of Object.entries(files)) {
          if (name.endsWith('/')) continue;
          const path = `/PPSSPP/${name}`;
          FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
          FS.writeFile(path, data);
        }
      },
    });
    this.mod = this.nostalgist.getEmscriptenModule() as unknown as EmModule;
    this.pads?.show();
    this.trackFrames();
  }

  /** Hot path: apply a player's latest state. */
  setInput(port: number, s: InputState): void {
    if (this.pads) {
      this.pads.write(port, s);
      return;
    }
    const sim = this.mod?._simulate_input;
    if (!sim) return;
    const last = this.sent[port]!;
    const bits = s.buttons;
    for (let id = 0; id < 16; id++) {
      const v = (bits >>> id) & 1;
      if (last[id] !== v) {
        last[id] = v;
        sim(port, id, v);
      }
    }
    // EmulatorJS analog ids: 16/17 = LX+/−, 18/19 = LY+/−, 20/21 = RX+/−, 22/23 = RY+/−; 0..0x7fff.
    const ax = (id: number, v: number) => {
      const val = Math.round(Math.abs(v) * 258); // 127 * 258 ≈ 0x7fff
      const pos = v > 0 ? val : 0;
      const neg = v < 0 ? val : 0;
      if (last[id] !== pos) sim(port, id, (last[id] = pos));
      if (last[id + 1] !== neg) sim(port, id + 1, (last[id + 1] = neg));
    };
    ax(16, s.lx);
    ax(18, s.ly);
    ax(20, s.rx);
    ax(22, s.ry);
  }

  clearInput(port: number): void {
    if (this.pads) this.pads.clear(port);
    else {
      const sim = this.mod?._simulate_input;
      const last = this.sent[port];
      if (!sim || !last) return;
      for (let id = 0; id < 24; id++) if (last[id]) sim(port, id, (last[id] = 0));
    }
  }

  pause(): void {
    if (!this.nostalgist || this.paused) return;
    this.nostalgist.pause();
    this.paused = true;
  }

  resume(): void {
    if (!this.nostalgist || !this.paused) return;
    this.nostalgist.resume();
    this.paused = false;
  }

  restart(): void {
    this.nostalgist?.restart();
  }

  async saveState(): Promise<{ state: Blob; thumbnail?: Blob }> {
    if (!this.nostalgist) throw new Error('not running');
    const r = await withTimeout(this.nostalgist.saveState(), 5000, 'save state timed out');
    return { state: r.state, ...(r.thumbnail ? { thumbnail: r.thumbnail } : {}) };
  }

  async loadState(state: Blob): Promise<void> {
    if (!this.nostalgist) throw new Error('not running');
    await withTimeout(this.nostalgist.loadState(state), 5000, 'load state timed out');
  }

  async screenshot(): Promise<Blob | null> {
    try {
      return this.nostalgist ? await withTimeout(this.nostalgist.screenshot(), 3000, 'screenshot timed out') : null;
    } catch {
      return null;
    }
  }

  stats(): EngineStats {
    return { fps: this.fps, frameMs: this.frameMs };
  }

  async exit(): Promise<void> {
    this.frames = -1;
    try {
      await this.nostalgist?.exit({ removeCanvas: true });
    } catch {
      /* already gone */
    }
    this.nostalgist = null;
    this.pads?.uninstall();
    this.pads = null;
  }

  private trackFrames(): void {
    const tick = (t: number) => {
      if (this.frames < 0) return;
      const fc = this.mod?._get_current_frame_count?.();
      if (this.lastFrameT) this.frameMs = this.frameMs * 0.9 + (t - this.lastFrameT) * 0.1;
      this.lastFrameT = t;
      this.fpsWindow.push(fc ?? t);
      if (this.fpsWindow.length > 60) this.fpsWindow.shift();
      if (this.fpsWindow.length > 1) {
        // With a core frame counter, fps = frames advanced per wall second; else rAF rate.
        if (fc !== undefined) this.fps = ((this.fpsWindow.at(-1)! - this.fpsWindow[0]!) * 1000) / (this.frameMs * (this.fpsWindow.length - 1) || 1);
        else this.fps = 1000 / (this.frameMs || 16.7);
      }
      this.frames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms))]);
}
