/**
 * The touch controller surface: hot path.
 *
 * Every pointer owns at most one control "role" (buttons, d-pad or stick) from
 * pointerdown to pointerup. Input state is recomputed from all live pointers on
 * every event and sent synchronously when it changes, with no frame wait and no
 * framework re-render. DOM feedback is applied by diffing pressed flags.
 *
 * Supports: multi-touch, sliding between buttons, two-button chords when the
 * thumb sits between two face buttons, 8-way d-pad, fixed or floating analog
 * sticks with radial dead zone, double-tap stick click (L3/R3), Home button.
 */
import { Button } from '@couch/protocol';
import {
  dpadDirections,
  HIT_SLOP,
  resolveLayout,
  stickAxes,
  type ButtonControl,
  type ResolvedControl,
  type Skin,
  type StickControl,
} from '@couch/skins';
import type { Haptics } from '../haptics.js';
import type { InputSender } from '../sender.js';
import type { Settings } from '../settings.js';
import { renderSkin, type RenderResult } from './render.js';

const enum Role {
  Buttons,
  Dpad,
  Stick,
  Menu,
}

interface Owner {
  role: Role;
  /** Buttons: up to two control indices (chord), -1 = none. Dpad/Stick: control index in `a`. */
  a: number;
  b: number;
  /** Dpad direction mask (1 up, 2 down, 4 left, 8 right). */
  dirs: number;
  /** Stick origin + current offset, CSS px. */
  ox: number;
  oy: number;
  dx: number;
  dy: number;
  click: boolean;
}

const CHORD_MARGIN = 0.38;
const DOUBLE_TAP_MS = 280;

export class PadSurface {
  private skin: Skin | null = null;
  private settings: Settings;
  private resolved: ResolvedControl[] = [];
  private rendered: RenderResult | null = null;
  private readonly owners = new Map<number, Owner>();
  /** Double buffer of per-control pressed flags (no allocation per event). */
  private pressedPrev: Uint8Array = new Uint8Array(0);
  private pressedNext: Uint8Array = new Uint8Array(0);
  private dpadPrev = 0;
  private menuPrev = false;
  private W = 0;
  private H = 0;
  private left = 0;
  private top = 0;
  private lastStickTap = new Map<number, number>();
  /** Gyro-driven stick values (−127..127), merged when that stick is not touched. */
  gyroX = 0;
  gyroY = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly sender: InputSender,
    private readonly haptics: Haptics,
  ) {
    this.settings = {} as Settings;
    const opts = { passive: true } as const;
    root.addEventListener('pointerdown', (e) => this.onDown(e), opts);
    root.addEventListener('pointermove', (e) => this.onMove(e), opts);
    root.addEventListener('pointerup', (e) => this.onUp(e), opts);
    root.addEventListener('pointercancel', (e) => this.onUp(e), opts);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    new ResizeObserver(() => this.relayout()).observe(root);
  }

  setSkin(skin: Skin): void {
    if (this.skin?.id === skin.id) return;
    this.skin = skin;
    this.releaseAll();
    this.relayout();
  }

  applySettings(s: Settings): void {
    this.settings = s;
    this.haptics.enabled = s.haptics;
    this.relayout();
  }

  /** Drop every touch (skin change, app hidden). */
  releaseAll(): void {
    this.owners.clear();
    this.aggregate();
  }

  relayout(): void {
    const skin = this.skin;
    if (!skin) return;
    const rect = this.root.getBoundingClientRect();
    this.W = rect.width;
    this.H = rect.height;
    this.left = rect.left;
    this.top = rect.top;
    if (!this.W || !this.H) return;
    const cs = getComputedStyle(document.documentElement);
    const insetL = parseFloat(cs.getPropertyValue('--sal')) || 0;
    const insetR = parseFloat(cs.getPropertyValue('--sar')) || 0;
    this.resolved = resolveLayout(skin, {
      width: this.W,
      height: this.H,
      scale: this.settings.scale ?? 1,
      mirror: this.settings.mirror ?? false,
      insetLeft: insetL,
      insetRight: insetR,
    });
    this.rendered = renderSkin(skin, this.resolved, this.W, this.H, this.settings.scale ?? 1);
    this.root.replaceChildren(this.rendered.svg);
    this.root.style.background = skin.body.background;
    this.rendered.svg.style.opacity = String(this.settings.opacity ?? 1);
    this.pressedPrev = new Uint8Array(this.resolved.length);
    this.pressedNext = new Uint8Array(this.resolved.length);
    this.dpadPrev = 0;
    this.menuPrev = false;
    this.owners.clear();
  }

  /* ----------------------------------------------------------- pointers */

  private onDown(e: PointerEvent): void {
    if (!this.skin) return;
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    const x = e.clientX - this.left;
    const y = e.clientY - this.top;
    const o: Owner = { role: Role.Buttons, a: -1, b: -1, dirs: 0, ox: 0, oy: 0, dx: 0, dy: 0, click: false };

    if (Math.hypot(x - this.W / 2, y - this.H * 0.12) < this.H * 0.075) {
      o.role = Role.Menu;
    } else {
      const i = this.nearestNonButton(x, y);
      if (i >= 0) {
        const rc = this.resolved[i]!;
        if (rc.control.kind === 'dpad') {
          o.role = Role.Dpad;
          o.a = i;
          o.dirs = dpadDirections(x - rc.cx, y - rc.cy, (rc.control.size / 2) * this.H * (this.settings.scale ?? 1));
        } else {
          this.claimStick(o, i, x, y, e.timeStamp);
        }
      } else {
        this.chordHits(x, y, o);
        if (o.a < 0 && this.settings.stickMode === 'floating') {
          // Floating stick: any touch on an empty area of that half becomes the stick.
          const s = this.stickForHalf(x);
          if (s >= 0) this.claimStick(o, s, x, y, e.timeStamp);
        }
      }
    }
    this.owners.set(e.pointerId, o);
    this.aggregate();
  }

  private onMove(e: PointerEvent): void {
    const o = this.owners.get(e.pointerId);
    if (!o) return;
    const x = e.clientX - this.left;
    const y = e.clientY - this.top;
    switch (o.role) {
      case Role.Buttons: {
        const a = o.a;
        const b = o.b;
        this.chordHits(x, y, o);
        if (a === o.a && b === o.b) return;
        break;
      }
      case Role.Dpad: {
        const rc = this.resolved[o.a]!;
        const dirs = dpadDirections(x - rc.cx, y - rc.cy, ((rc.control as { size: number }).size / 2) * this.H * (this.settings.scale ?? 1));
        if (dirs === o.dirs) return;
        o.dirs = dirs;
        break;
      }
      case Role.Stick:
        o.dx = x - o.ox;
        o.dy = y - o.oy;
        break;
      case Role.Menu:
        return;
    }
    this.aggregate();
  }

  private onUp(e: PointerEvent): void {
    if (!this.owners.delete(e.pointerId)) return;
    this.aggregate();
  }

  /* -------------------------------------------------------- hit testing */

  /** Index of the d-pad or stick whose capture zone contains the point, preferring the closest. */
  private nearestNonButton(x: number, y: number): number {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.resolved.length; i++) {
      const rc = this.resolved[i]!;
      if (rc.control.kind === 'button') continue;
      const d = Math.hypot(x - rc.cx, y - rc.cy) / rc.hit;
      if (d <= 1 && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    // A button drawn closer than the stick/dpad edge wins (e.g. L3 area vs face buttons).
    if (best >= 0) {
      const probe: Owner = { role: Role.Buttons, a: -1, b: -1, dirs: 0, ox: 0, oy: 0, dx: 0, dy: 0, click: false };
      this.chordHits(x, y, probe);
      if (probe.a >= 0) {
        const rb = this.resolved[probe.a]!;
        const dButton = Math.hypot(x - rb.cx, y - rb.cy) / rb.hit;
        if (dButton < bestD * 0.8) return -1;
      }
    }
    return best;
  }

  /** Buttons under the point: nearest, plus a second circle button if the thumb sits between two. */
  private chordHits(x: number, y: number, o: Owner): void {
    let a = -1;
    let da = Infinity;
    let b = -1;
    let db = Infinity;
    const H = this.H;
    const scale = this.settings.scale ?? 1;
    for (let i = 0; i < this.resolved.length; i++) {
      const rc = this.resolved[i]!;
      const c = rc.control;
      if (c.kind !== 'button') continue;
      let d: number;
      if (c.shape === 'circle') {
        d = Math.hypot(x - rc.cx, y - rc.cy) / rc.hit;
      } else {
        const sc = c.pos.anchor === 'center' ? 1 : scale;
        const hw = (c.w ?? 0.1) * H * sc * HIT_SLOP;
        const hh = Math.max((c.h ?? 0.05) * H * sc * HIT_SLOP, 0.06 * H);
        if (Math.abs(x - rc.cx) > hw || Math.abs(y - rc.cy) > hh) continue;
        d = Math.max(Math.abs(x - rc.cx) / hw, Math.abs(y - rc.cy) / hh);
      }
      if (d > 1) continue;
      if (d < da) {
        b = a;
        db = da;
        a = i;
        da = d;
      } else if (d < db) {
        b = i;
        db = d;
      }
    }
    o.a = a;
    const chord =
      b >= 0 &&
      db - da < CHORD_MARGIN &&
      (this.resolved[a]!.control as ButtonControl).shape === 'circle' &&
      (this.resolved[b]!.control as ButtonControl).shape === 'circle';
    o.b = chord ? b : -1;
  }

  private stickForHalf(x: number): number {
    const leftHalf = x < this.W / 2;
    for (let i = 0; i < this.resolved.length; i++) {
      const rc = this.resolved[i]!;
      if (rc.control.kind === 'stick' && rc.cx < this.W / 2 === leftHalf) return i;
    }
    return -1;
  }

  private claimStick(o: Owner, i: number, x: number, y: number, t: number): void {
    const rc = this.resolved[i]!;
    o.role = Role.Stick;
    o.a = i;
    const floating = this.settings.stickMode === 'floating';
    o.ox = floating ? x : rc.cx;
    o.oy = floating ? y : rc.cy;
    o.dx = x - o.ox;
    o.dy = y - o.oy;
    const last = this.lastStickTap.get(i) ?? -Infinity;
    o.click = t - last < DOUBLE_TAP_MS && (rc.control as StickControl).click !== undefined;
    this.lastStickTap.set(i, t);
  }

  /* ------------------------------------------------------- aggregation */

  private aggregate(): void {
    const s = this.sender.state;
    let bits = 0;
    let lx = 0;
    let ly = 0;
    let rx = 0;
    let ry = 0;
    let l2 = 0;
    let r2 = 0;
    let dpad = 0;
    let menu = false;
    let leftStickTouched = false;
    let rightStickTouched = false;
    const pressed = this.pressedNext;
    pressed.fill(0);
    const H = this.H;
    const scale = this.settings.scale ?? 1;
    const dz = this.settings.deadZone ?? 0.12;

    for (const o of this.owners.values()) {
      switch (o.role) {
        case Role.Menu:
          menu = true;
          bits |= 1 << Button.MENU;
          break;
        case Role.Dpad:
          dpad |= o.dirs;
          pressed[o.a] = o.dirs ? 1 : 0;
          break;
        case Role.Stick: {
          const c = this.resolved[o.a]!.control as StickControl;
          const v = stickAxes(o.dx, o.dy, c.r * H * scale, dz);
          if (c.side === 'left') {
            lx = v.x;
            ly = v.y;
            leftStickTouched = true;
          } else {
            rx = v.x;
            ry = v.y;
            rightStickTouched = true;
          }
          if (o.click && c.click !== undefined) bits |= 1 << c.click;
          pressed[o.a] = 1;
          break;
        }
        case Role.Buttons:
          for (let k = 0; k < 2; k++) {
            const idx = k === 0 ? o.a : o.b;
            if (idx < 0) continue;
            pressed[idx] = 1;
            const effects = (this.resolved[idx]!.control as ButtonControl).effects;
            for (let j = 0; j < effects.length; j++) {
              const eff = effects[j]!;
              if ('bit' in eff) bits |= 1 << eff.bit;
              else if ('axis' in eff) {
                if (eff.axis === 'lx') lx = eff.value;
                else if (eff.axis === 'ly') ly = eff.value;
                else if (eff.axis === 'rx') rx = eff.value;
                else ry = eff.value;
              } else if (eff.trigger === 'l2') l2 = eff.value;
              else r2 = eff.value;
            }
          }
          break;
      }
    }
    if (dpad & 1) bits |= 1 << Button.UP;
    if (dpad & 2) bits |= 1 << Button.DOWN;
    if (dpad & 4) bits |= 1 << Button.LEFT;
    if (dpad & 8) bits |= 1 << Button.RIGHT;

    const gyro = this.settings.gyro;
    if (gyro === 'left' && !leftStickTouched) {
      lx = this.gyroX;
      ly = this.gyroY;
    } else if (gyro === 'right' && !rightStickTouched) {
      rx = this.gyroX;
      ry = this.gyroY;
    }

    bits >>>= 0;
    const newPress = (bits & ~s.buttons) !== 0;
    const changed = bits !== s.buttons || lx !== s.lx || ly !== s.ly || rx !== s.rx || ry !== s.ry || l2 !== s.l2 || r2 !== s.r2;
    if (changed) {
      s.buttons = bits;
      s.lx = lx;
      s.ly = ly;
      s.rx = rx;
      s.ry = ry;
      s.l2 = l2;
      s.r2 = r2;
      this.sender.flush();
      if (newPress) this.haptics.tap();
    }
    this.paint(pressed, dpad, menu);
  }

  /** Called by the gyro module; merges like a stick that is not being touched. */
  setGyro(x: number, y: number): void {
    if (x === this.gyroX && y === this.gyroY) return;
    this.gyroX = x;
    this.gyroY = y;
    this.aggregate();
  }

  /* ----------------------------------------------------------- visuals */

  private paint(pressed: Uint8Array, dpad: number, menu: boolean): void {
    const r = this.rendered;
    if (!r) return;
    for (let i = 0; i < pressed.length; i++) {
      if (pressed[i] !== this.pressedPrev[i]) r.controls[i]!.root.classList.toggle('on', pressed[i] === 1);
    }
    if (dpad !== this.dpadPrev) {
      for (const rc of r.controls) {
        if (!rc.arms) continue;
        rc.arms[0]!.classList.toggle('on', (dpad & 1) !== 0);
        rc.arms[1]!.classList.toggle('on', (dpad & 2) !== 0);
        rc.arms[2]!.classList.toggle('on', (dpad & 4) !== 0);
        rc.arms[3]!.classList.toggle('on', (dpad & 8) !== 0);
      }
      this.dpadPrev = dpad;
    }
    if (menu !== this.menuPrev) {
      r.menu.classList.toggle('on', menu);
      this.menuPrev = menu;
    }
    // Stick knobs follow the thumb (clamped to travel radius).
    const H = this.H;
    const scale = this.settings.scale ?? 1;
    let seen = 0;
    for (const o of this.owners.values()) {
      if (o.role !== Role.Stick) continue;
      seen |= 1 << o.a;
      const rc = this.resolved[o.a]!;
      const travel = (rc.control as StickControl).r * H * scale;
      const len = Math.hypot(o.dx, o.dy);
      const k = len > travel ? travel / len : 1;
      const view = r.controls[o.a]!;
      view.knob!.setAttribute('transform', `translate(${o.dx * k},${o.dy * k})`);
      if (this.settings.stickMode === 'floating') view.base!.setAttribute('transform', `translate(${o.ox},${o.oy})`);
    }
    for (let i = 0; i < this.resolved.length; i++) {
      const rc = this.resolved[i]!;
      if (rc.control.kind !== 'stick' || seen & (1 << i)) continue;
      const view = r.controls[i]!;
      if (view.knob!.getAttribute('transform')) {
        view.knob!.removeAttribute('transform');
        view.base!.setAttribute('transform', `translate(${rc.cx},${rc.cy})`);
      }
    }
    this.pressedNext = this.pressedPrev;
    this.pressedPrev = pressed;
  }
}
