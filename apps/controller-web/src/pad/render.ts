/**
 * Builds the controller SVG for a skin. Pure DOM, no framework: the pad updates
 * its pressed states by toggling classes on the elements returned here.
 */
import type { ButtonControl, DpadControl, Glyph, ResolvedControl, Skin, StickControl } from '@couch/skins';

const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}

export interface RenderedControl {
  /** Element that gets the "on" class while pressed. */
  root: SVGGElement;
  /** D-pad arms: up, down, left, right. */
  arms?: SVGElement[];
  /** Stick knob (translated while dragging). */
  knob?: SVGGElement;
  /** Stick base, moved in floating mode. */
  base?: SVGGElement;
}

export interface RenderResult {
  svg: SVGSVGElement;
  controls: RenderedControl[];
  menu: SVGGElement;
}

function glyphPath(g: Glyph, r: number, ink: string, parent: Element) {
  const s = r * 0.42;
  const stroke = { fill: 'none', stroke: ink, 'stroke-width': Math.max(2, r * 0.13), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  switch (g) {
    case 'cross':
      el('path', { d: `M${-s},${-s}L${s},${s}M${s},${-s}L${-s},${s}`, ...stroke }, parent);
      break;
    case 'circle':
      el('circle', { r: s, ...stroke }, parent);
      break;
    case 'square':
      el('rect', { x: -s * 0.85, y: -s * 0.85, width: s * 1.7, height: s * 1.7, ...stroke }, parent);
      break;
    case 'triangle':
      el('path', { d: `M0,${-s}L${s * 0.95},${s * 0.7}L${-s * 0.95},${s * 0.7}Z`, ...stroke }, parent);
      break;
    default: {
      const rot = { up: 0, right: 90, down: 180, left: 270 }[g];
      el('path', { d: `M0,${-s}L${s * 0.8},${s * 0.55}L${-s * 0.8},${s * 0.55}Z`, fill: ink, transform: `rotate(${rot})` }, parent);
    }
  }
}

function renderButton(c: ButtonControl, rc: ResolvedControl, H: number, scale: number, parent: Element): RenderedControl {
  const g = el('g', { class: 'ctl btn', transform: `translate(${rc.cx},${rc.cy})` }, parent);
  const inner = el('g', { class: 'press' }, g);
  const k = c.pos.anchor === 'center' ? 1 : scale;
  if (c.shape === 'circle') {
    const r = (c.r ?? 0.08) * H * k;
    el('circle', { r: r * 1.12, class: 'well' }, inner);
    el('circle', { r, fill: c.color, class: 'face' }, inner);
    el('circle', { r: r * 0.92, fill: 'url(#gloss)', class: 'gloss' }, inner);
    if (c.glyph) glyphPath(c.glyph, r, c.ink, inner);
    else if (c.label) {
      const t = el('text', { class: 'label', fill: c.ink, 'font-size': r * (c.label.length > 2 ? 0.42 : 0.85), dy: '0.35em' }, inner);
      t.textContent = c.label;
    }
  } else {
    const w = (c.w ?? 0.1) * H * k;
    const h = (c.h ?? 0.05) * H * k;
    const rr = c.shape === 'pill' ? h : h * 0.45;
    el('rect', { x: -w - 3, y: -h - 3, width: 2 * w + 6, height: 2 * h + 6, rx: rr + 3, class: 'well' }, inner);
    el('rect', { x: -w, y: -h, width: 2 * w, height: 2 * h, rx: rr, fill: c.color, class: 'face' }, inner);
    if (c.label) {
      const t = el('text', { class: 'label', fill: c.ink, 'font-size': Math.min(h * 1.05, (w * 2) / (c.label.length * 0.7)), dy: '0.35em' }, inner);
      t.textContent = c.label;
    }
  }
  return { root: g };
}

function renderDpad(c: DpadControl, rc: ResolvedControl, H: number, scale: number, parent: Element): RenderedControl {
  const g = el('g', { class: 'ctl dpad', transform: `translate(${rc.cx},${rc.cy})` }, parent);
  const s = (c.size / 2) * H * scale;
  const a = s * 0.34; // arm half-width
  if (c.style === 'disc') el('circle', { r: s * 1.05, fill: c.color, class: 'face' }, g);
  else el('circle', { r: s * 1.08, class: 'well' }, g);
  const arms: SVGElement[] = [];
  // up, down, left, right
  const rots = [0, 180, 270, 90];
  for (const rot of rots) {
    const arm = el('g', { transform: `rotate(${rot})`, class: 'arm' }, g);
    if (c.style === 'buttons') {
      el('path', { d: `M${-a},${-s}h${2 * a}v${s * 0.62}l${-a},${a * 0.9}l${-a},${-a * 0.9}z`, fill: c.color, class: 'face', rx: 6 }, arm);
    } else {
      el('rect', { x: -a, y: -s, width: 2 * a, height: s, rx: a * 0.25, fill: c.style === 'disc' ? 'rgba(255,255,255,.07)' : c.color, class: 'face' }, arm);
    }
    el('path', { d: `M0,${-s * 0.82}l${a * 0.42},${a * 0.55}h${-a * 0.84}z`, fill: 'rgba(255,255,255,.35)' }, arm);
    arms.push(arm);
  }
  if (c.style === 'cross') el('rect', { x: -a, y: -a, width: 2 * a, height: 2 * a, fill: c.color }, g);
  el('circle', { r: a * 0.5, fill: 'rgba(0,0,0,.18)' }, g);
  return { root: g, arms };
}

function renderStick(c: StickControl, rc: ResolvedControl, H: number, scale: number, parent: Element): RenderedControl {
  const base = el('g', { class: 'ctl stick', transform: `translate(${rc.cx},${rc.cy})` }, parent);
  const r = c.r * H * scale;
  el('circle', { r: r * 1.15, class: 'well' }, base);
  el('circle', { r: r * 1.02, fill: 'rgba(0,0,0,.25)', stroke: 'rgba(255,255,255,.12)', 'stroke-width': 2 }, base);
  const knob = el('g', { class: 'knob' }, base);
  el('circle', { r: r * 0.62, fill: c.color, class: 'face' }, knob);
  el('circle', { r: r * 0.5, fill: 'url(#knob)' }, knob);
  return { root: base, knob, base };
}

export function renderSkin(skin: Skin, resolved: ResolvedControl[], W: number, H: number, scale: number): RenderResult {
  const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'pad-svg' });
  const defs = el('defs', {}, svg);
  const gloss = el('radialGradient', { id: 'gloss', cx: '35%', cy: '30%', r: '70%' }, defs);
  el('stop', { offset: '0%', 'stop-color': '#fff', 'stop-opacity': 0.35 }, gloss);
  el('stop', { offset: '60%', 'stop-color': '#fff', 'stop-opacity': 0 }, gloss);
  const knobG = el('radialGradient', { id: 'knob', cx: '40%', cy: '35%', r: '65%' }, defs);
  el('stop', { offset: '0%', 'stop-color': '#fff', 'stop-opacity': 0.22 }, knobG);
  el('stop', { offset: '100%', 'stop-color': '#000', 'stop-opacity': 0.25 }, knobG);

  // Controller shell: two grips joined by a bridge, in the console's colour.
  const shell = el('g', { class: 'shell', fill: skin.body.shell }, svg);
  const side = resolved.filter((r) => r.control.pos.anchor !== 'center' && r.cy > H * 0.2);
  const left = side.filter((r) => r.cx < W / 2);
  const right = side.filter((r) => r.cx > W / 2);
  const cluster = (rs: ResolvedControl[]) => {
    if (!rs.length) return null;
    const xs = rs.map((r) => r.cx);
    const ys = rs.map((r) => r.cy);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  };
  const lc = cluster(left);
  const rc = cluster(right);
  if (lc && rc) {
    el('rect', { x: lc.x, y: H * 0.24, width: rc.x - lc.x, height: H * 0.52, rx: H * 0.2 }, shell);
    el('circle', { cx: lc.x, cy: lc.y + H * 0.04, r: H * 0.42 }, shell);
    el('circle', { cx: rc.x, cy: rc.y + H * 0.04, r: H * 0.42 }, shell);
  }

  const layer = el('g', { class: 'controls' }, svg);
  const controls = resolved.map((r) => {
    const c = r.control;
    if (c.kind === 'button') return renderButton(c, r, H, scale, layer);
    if (c.kind === 'dpad') return renderDpad(c, r, H, scale, layer);
    return renderStick(c, r, H, scale, layer);
  });

  // Home/menu button (opens the TV's in-game menu).
  const menu = el('g', { class: 'ctl btn menu', transform: `translate(${W / 2},${H * 0.12})` }, svg);
  const mi = el('g', { class: 'press' }, menu);
  el('circle', { r: H * 0.055, class: 'well' }, mi);
  el('circle', { r: H * 0.047, fill: 'rgba(255,255,255,.14)', stroke: skin.body.print, 'stroke-width': 1.5, class: 'face' }, mi);
  el('path', {
    d: `M${-H * 0.022},${H * 0.002}L0,${-H * 0.02}L${H * 0.022},${H * 0.002}V${H * 0.02}H${-H * 0.022}Z`,
    fill: skin.body.print,
  }, mi);

  return { svg, controls, menu };
}
