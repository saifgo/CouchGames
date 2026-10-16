import type { Control, Pos, ResolvedControl, Skin } from './types.js';

export interface LayoutOptions {
  /** Viewport size in CSS pixels (landscape). */
  width: number;
  height: number;
  /** Global size multiplier from user settings (0.8–1.3). */
  scale?: number;
  /** Left-handed mode: swap left and right clusters. */
  mirror?: boolean;
  /** Safe-area insets (notches), CSS pixels. */
  insetLeft?: number;
  insetRight?: number;
}

/** Extra hit radius beyond the drawn shape: thumbs are imprecise and you can't look down. */
export const HIT_SLOP = 1.25;

export function resolvePos(pos: Pos, o: LayoutOptions): { x: number; y: number } {
  const H = o.height;
  const s = o.scale ?? 1;
  const il = o.insetLeft ?? 0;
  const ir = o.insetRight ?? 0;
  let anchor = pos.anchor;
  let dx = pos.x;
  if (o.mirror) {
    if (anchor === 'left') anchor = 'right';
    else if (anchor === 'right') anchor = 'left';
    else dx = -dx;
  }
  // Scale clusters around their anchor so bigger buttons stay reachable.
  const x =
    anchor === 'left' ? il + dx * H * s : anchor === 'right' ? o.width - ir - dx * H * s : o.width / 2 + dx * H;
  const y = anchor === 'center' ? pos.y * H : H / 2 + (pos.y - 0.5) * H * Math.min(s, 1.1);
  return { x, y };
}

/** Drawn radius of a control in screen heights (bounding circle). */
export function controlRadius(c: Control): number {
  switch (c.kind) {
    case 'dpad':
      return c.size / 2;
    case 'stick':
      return c.r;
    case 'button':
      return c.shape === 'circle' ? (c.r ?? 0.08) : Math.max(c.w ?? 0.1, c.h ?? 0.05);
  }
}

export function resolveLayout(skin: Skin, o: LayoutOptions): ResolvedControl[] {
  const s = o.scale ?? 1;
  return skin.controls.map((control) => {
    const { x, y } = resolvePos(control.pos, o);
    const scale = control.pos.anchor === 'center' ? 1 : s;
    const base = controlRadius(control) * o.height * scale;
    // Sticks and d-pads get a larger capture zone than their drawing.
    const slop = control.kind === 'stick' ? 1.6 : control.kind === 'dpad' ? 1.2 : HIT_SLOP;
    return { control, cx: x, cy: y, hit: base * slop };
  });
}

/**
 * Hit test for buttons: nearest control whose (slop-expanded) area contains the
 * point. Pills/rects use an expanded rectangle; circles use distance.
 * Returns -1 if none.
 */
export function hitTest(resolved: ResolvedControl[], x: number, y: number, height: number, scale = 1): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < resolved.length; i++) {
    const rc = resolved[i]!;
    const c = rc.control;
    let d: number;
    if (c.kind === 'button' && c.shape !== 'circle') {
      const sc = c.pos.anchor === 'center' ? 1 : scale;
      const hw = (c.w ?? 0.1) * height * sc * HIT_SLOP;
      const hh = Math.max((c.h ?? 0.05) * height * sc * HIT_SLOP, 0.06 * height);
      const ox = Math.abs(x - rc.cx) - hw;
      const oy = Math.abs(y - rc.cy) - hh;
      if (ox > 0 || oy > 0) continue;
      d = Math.hypot(x - rc.cx, y - rc.cy) / Math.max(hw, hh);
    } else {
      const dist = Math.hypot(x - rc.cx, y - rc.cy);
      if (dist > rc.hit) continue;
      d = dist / rc.hit;
    }
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * D-pad direction from a point relative to its centre. 8-way with 22.5° sectors,
 * plus a small dead zone. Returns a 4-bit mask: 1=up 2=down 4=left 8=right.
 */
export function dpadDirections(dx: number, dy: number, radius: number, deadZone = 0.18): number {
  if (Math.hypot(dx, dy) < radius * deadZone) return 0;
  const a = Math.atan2(dy, dx); // 0 = right, +π/2 = down
  const sector = Math.round(a / (Math.PI / 4));
  switch ((sector + 8) % 8) {
    case 0:
      return 8;
    case 1:
      return 8 | 2;
    case 2:
      return 2;
    case 3:
      return 4 | 2;
    case 4:
      return 4;
    case 5:
      return 4 | 1;
    case 6:
      return 1;
    case 7:
      return 8 | 1;
  }
  return 0;
}

/** Stick vector → i8 axes with radial dead zone and rescaling (no "jump" at the edge of the dead zone). */
export function stickAxes(dx: number, dy: number, radius: number, deadZone: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  const norm = Math.min(1, len / radius);
  if (norm <= deadZone) return { x: 0, y: 0 };
  const scaled = (norm - deadZone) / (1 - deadZone);
  const k = (scaled / (len || 1)) * 127;
  return { x: Math.round(Math.max(-127, Math.min(127, dx * k))), y: Math.round(Math.max(-127, Math.min(127, dy * k))) };
}
