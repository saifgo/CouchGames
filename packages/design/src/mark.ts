/**
 * The CouchPad mark, defined once (docs/brand/CouchPad Brand Kit.html, boards 01–06).
 *
 * An upside-down gamepad body is the seat; two landscape phones lie along its top as the back
 * cushions. Shoulder buttons are the feet.
 *
 * Three drawings share this geometry:
 * - `full`: the primary mark (viewBox 0 0 140 104).
 * - `mini`: below ~96 px. No phone screens or start/select, thicker outline and controls.
 * - `cut`: `full` on a die-cut sticker border (viewBox -8 -8 156 120). Used on Yellow (Ink border)
 *   and on Ink (Cream border).
 *
 * Every shape is a rounded rect, a circle or a straight line, so the same list renders to SVG
 * (web) and to Android VectorDrawable path data (scripts/build-assets.ts). Dashes are pre-split
 * into short segments because VectorDrawable has no stroke-dasharray.
 */

/** Colour roles. y = body (Yellow), i = outline and controls (Ink), p = phone screens (Cream), b = sticker border. */
export type Role = 'y' | 'i' | 'p' | 'b';
export type Shape =
  | { k: 'rr'; x: number; y: number; w: number; h: number; r: number }
  | { k: 'c'; cx: number; cy: number; r: number }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number };
export interface Layer {
  shapes: Shape[];
  fill?: Role;
  stroke?: Role;
  width?: number;
  opacity?: number;
}
export interface Drawing {
  viewBox: [number, number, number, number];
  layers: Layer[];
}

const rr = (x: number, y: number, w: number, h: number, r: number): Shape => ({ k: 'rr', x, y, w, h, r });
const c = (cx: number, cy: number, r: number): Shape => ({ k: 'c', cx, cy, r });
const line = (x1: number, y1: number, x2: number, y2: number): Shape => ({ k: 'line', x1, y1, x2, y2 });

const PHONES = [rr(16, 12, 52, 36, 8), rr(72, 12, 52, 36, 8)];
const SEAT = rr(10, 44, 120, 42, 16);
const FEET = [rr(26, 84, 22, 12, 6), rr(92, 84, 22, 12, 6)];
/** Seat stitching: dashes 4 on, 5 off from x 30 to 110 (round caps). */
const STITCHES: Shape[] = [];
for (let x = 30; x < 110; x += 9) STITCHES.push(line(x, 72, Math.min(x + 4, 110), 72));

export const FULL: Drawing = {
  viewBox: [0, 0, 140, 104],
  layers: [
    { shapes: [...PHONES, SEAT], stroke: 'i', width: 12 },
    { shapes: FEET, fill: 'i' },
    { shapes: [SEAT, ...PHONES], fill: 'y' },
    { shapes: [line(70, 16, 70, 46)], stroke: 'i', width: 3 },
    { shapes: [rr(23, 17, 40, 26, 5), rr(77, 17, 40, 26, 5)], fill: 'p', stroke: 'i', width: 2.5 },
    {
      fill: 'i',
      shapes: [
        c(19.5, 30, 1.5), c(120.5, 30, 1.5), // cameras
        rr(39.5, 20, 7, 20, 2.5), rr(33, 26.5, 20, 7, 2.5), // D-pad
        c(97, 22, 3.2), c(89.5, 30, 3.2), c(104.5, 30, 3.2), c(97, 38, 3.2), // face buttons
        rr(61, 58, 8, 4, 2), rr(71, 58, 8, 4, 2), // start / select
      ],
    },
    { shapes: STITCHES, stroke: 'i', width: 2.5, opacity: 0.55 },
  ],
};

export const MINI: Drawing = {
  viewBox: [0, 0, 140, 104],
  layers: [
    { shapes: [...PHONES, SEAT], stroke: 'i', width: 14 },
    { shapes: FEET, fill: 'i' },
    { shapes: [SEAT, ...PHONES], fill: 'y' },
    { shapes: [line(70, 16, 70, 46)], stroke: 'i', width: 5 },
    {
      fill: 'i',
      shapes: [rr(36, 18, 12, 28, 4), rr(28, 26, 28, 12, 4), c(97, 21, 5), c(86, 32, 5), c(108, 32, 5), c(97, 43, 5)],
    },
  ],
};

export const CUT: Drawing = {
  viewBox: [-8, -8, 156, 120],
  layers: [{ shapes: [...PHONES, SEAT, ...FEET], fill: 'b', stroke: 'b', width: 24 }, ...FULL.layers],
};

export type Variant = 'full' | 'mini' | 'cut';
export const DRAWINGS: Record<Variant, Drawing> = { full: FULL, mini: MINI, cut: CUT };

export interface MarkColors {
  y: string;
  i: string;
  p: string;
  b?: string;
}

const n = (v: number) => +v.toFixed(3);

function svgShape(s: Shape): string {
  if (s.k === 'rr') return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.r}"/>`;
  if (s.k === 'c') return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}"/>`;
  return `<path d="M${s.x1} ${s.y1}L${s.x2} ${s.y2}"/>`;
}

/** The mark's inner SVG markup (no outer <svg>), for a viewBox of DRAWINGS[variant].viewBox. */
export function markSvgBody(variant: Variant, colors: MarkColors): string {
  return DRAWINGS[variant].layers
    .map((l) => {
      const a = [
        `fill="${l.fill ? colors[l.fill] : 'none'}"`,
        l.stroke ? `stroke="${colors[l.stroke]}" stroke-width="${l.width}" stroke-linejoin="round" stroke-linecap="round"` : '',
        l.opacity != null ? `opacity="${l.opacity}"` : '',
      ].filter(Boolean);
      return `<g ${a.join(' ')}>${l.shapes.map(svgShape).join('')}</g>`;
    })
    .join('');
}

/** A standalone SVG of the mark. */
export function markSvg(variant: Variant, colors: MarkColors, attrs = ''): string {
  const vb = DRAWINGS[variant].viewBox.join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${attrs ? ' ' + attrs : ''}>${markSvgBody(variant, colors)}</svg>`;
}

/** Android VectorDrawable path data for one shape, after scaling by k and moving by (dx, dy). */
export function pathData(s: Shape, k = 1, dx = 0, dy = 0): string {
  const X = (v: number) => n(v * k + dx);
  const Y = (v: number) => n(v * k + dy);
  const L = (v: number) => n(v * k);
  if (s.k === 'c') {
    const r = L(s.r);
    return `M${n(X(s.cx) - r)},${Y(s.cy)}a${r},${r} 0,1 0,${n(2 * r)},0a${r},${r} 0,1 0,${n(-2 * r)},0z`;
  }
  if (s.k === 'line') return `M${X(s.x1)},${Y(s.y1)}L${X(s.x2)},${Y(s.y2)}`;
  const r = L(Math.min(s.r, s.w / 2, s.h / 2));
  const w = L(s.w) - 2 * r;
  const h = L(s.h) - 2 * r;
  return (
    `M${n(X(s.x) + r)},${Y(s.y)}h${n(w)}a${r},${r} 0,0 1,${r},${r}v${n(h)}a${r},${r} 0,0 1,${-r},${r}` +
    `h${n(-w)}a${r},${r} 0,0 1,${-r},${-r}v${n(-h)}a${r},${r} 0,0 1,${r},${-r}z`
  );
}

/** VectorDrawable <path> elements for the mark, drawn at scale k with its viewBox origin at (dx, dy). */
export function markVectorPaths(variant: Variant, colors: MarkColors, k: number, dx: number, dy: number): string {
  const [vx, vy] = DRAWINGS[variant].viewBox;
  const ox = dx - vx * k;
  const oy = dy - vy * k;
  const argb = (hex: string, a = 1) => '#' + Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase() + hex.slice(1).toUpperCase();
  const out: string[] = [];
  for (const l of DRAWINGS[variant].layers) {
    const d = l.shapes.map((s) => pathData(s, k, ox, oy)).join(' ');
    const a = [`android:pathData="${d}"`];
    if (l.fill) a.push(`android:fillColor="${argb(colors[l.fill]!, l.opacity)}"`);
    if (l.stroke) {
      a.push(`android:strokeColor="${argb(colors[l.stroke]!, l.opacity)}"`, `android:strokeWidth="${n(l.width! * k)}"`);
      a.push('android:strokeLineJoin="round"', 'android:strokeLineCap="round"');
    }
    out.push(`    <path ${a.join(' ')} />`);
  }
  return out.join('\n');
}
