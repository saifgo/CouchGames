/**
 * Virtual W3C gamepads for the official RetroArch Emscripten builds.
 *
 * RetroArch's `rwebpad` driver calls navigator.getGamepads() at every input poll
 * (once per emulated frame), so writing phone state into these objects is
 * "latest state at the start of the frame": no queue, no extra latency.
 * Rumble from the core arrives via vibrationActuator.playEffect().
 */
import { Button, type InputState } from '@couch/protocol';

/** RetroPad id → W3C "standard" gamepad button index (rwebpad's layout). */
const RETRO_TO_STD: readonly number[] = (() => {
  const m: number[] = [];
  m[Button.B] = 0;
  m[Button.A] = 1;
  m[Button.Y] = 2;
  m[Button.X] = 3;
  m[Button.L] = 4;
  m[Button.R] = 5;
  m[Button.L2] = 6;
  m[Button.R2] = 7;
  m[Button.SELECT] = 8;
  m[Button.START] = 9;
  m[Button.L3] = 10;
  m[Button.R3] = 11;
  m[Button.UP] = 12;
  m[Button.DOWN] = 13;
  m[Button.LEFT] = 14;
  m[Button.RIGHT] = 15;
  return m;
})();

interface VButton {
  pressed: boolean;
  touched: boolean;
  value: number;
}

export interface VirtualPad {
  id: string;
  index: number;
  connected: boolean;
  mapping: GamepadMappingType;
  timestamp: number;
  axes: number[];
  buttons: VButton[];
  vibrationActuator: { type: string; playEffect: (type: string, p: { duration?: number; strongMagnitude?: number; weakMagnitude?: number }) => Promise<string>; reset: () => Promise<string> };
}

export type RumbleSink = (port: number, strong: number, weak: number, durationMs: number) => void;

export class VirtualPads {
  readonly pads: VirtualPad[];
  private visible = false;
  private readonly list: (VirtualPad | null)[];
  private original: (() => (Gamepad | null)[]) | null = null;

  constructor(
    readonly count: number,
    private readonly onRumble: RumbleSink,
  ) {
    this.pads = Array.from({ length: count }, (_, i) => this.makePad(i));
    this.list = new Array(Math.max(4, count)).fill(null);
  }

  private makePad(index: number): VirtualPad {
    return {
      id: `Couch phone ${index + 1} (STANDARD GAMEPAD Vendor: c0c0 Product: 0001)`,
      index,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      vibrationActuator: {
        type: 'dual-rumble',
        playEffect: (_t, p) => {
          this.onRumble(index, Math.round((p.strongMagnitude ?? 0) * 255), Math.round((p.weakMagnitude ?? 0) * 255), p.duration ?? 200);
          return Promise.resolve('complete');
        },
        reset: () => Promise.resolve('complete'),
      },
    };
  }

  /**
   * Install the navigator.getGamepads override. Pads stay hidden until show():
   * Nostalgist re-dispatches real GamepadEvents for visible pads at launch, and
   * the GamepadEvent constructor rejects non-native objects.
   */
  install(): void {
    if (this.original) return;
    this.original = navigator.getGamepads?.bind(navigator) ?? (() => []);
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => {
        if (!this.visible) return this.original!();
        return this.list;
      },
    });
  }

  show(): void {
    this.visible = true;
    for (let i = 0; i < this.pads.length; i++) {
      this.list[i] = this.pads[i]!;
      window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: this.pads[i] }));
    }
  }

  uninstall(): void {
    if (!this.original) return;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: this.original });
    this.original = null;
    this.visible = false;
  }

  /** Hot path: copy one player's state into their pad. No allocation. */
  write(port: number, s: InputState): void {
    const pad = this.pads[port];
    if (!pad) return;
    const b = pad.buttons;
    const bits = s.buttons;
    for (let id = 0; id < 16; id++) {
      const btn = b[RETRO_TO_STD[id]!]!;
      const down = (bits & (1 << id)) !== 0;
      btn.pressed = btn.touched = down;
      btn.value = down ? 1 : 0;
    }
    // Analog triggers override the digital value when present.
    if (s.l2) b[6]!.value = s.l2 / 255;
    if (s.r2) b[7]!.value = s.r2 / 255;
    pad.axes[0] = s.lx / 127;
    pad.axes[1] = s.ly / 127;
    pad.axes[2] = s.rx / 127;
    pad.axes[3] = s.ry / 127;
    pad.timestamp = performance.now();
  }

  clear(port: number): void {
    const pad = this.pads[port];
    if (!pad) return;
    for (const btn of pad.buttons) {
      btn.pressed = btn.touched = false;
      btn.value = 0;
    }
    pad.axes.fill(0);
  }
}
