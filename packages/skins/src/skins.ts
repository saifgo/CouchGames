/**
 * Per-console controller skins. Original artwork "in the spirit of" each pad:
 * colours and button arrangement only, no logos or trademarks.
 *
 * Button effects are written in RetroPad terms using each core's default
 * libretro mapping, so the host never needs per-console remapping:
 *  - Genesis Plus GX: Y→A, B→B, A→C, L→X, X→Y, R→Z, SELECT→MODE
 *  - PCSX-ReARMed / PPSSPP / Play!: B→✕, A→○, Y→□, X→△
 *  - Mupen64Plus-Next: B→A, Y→B, L2→Z, right analog→C-buttons
 */
import { Button, type SkinId } from '@couch/protocol';
import type { ButtonControl, Control, Effect, Glyph, Pos, Skin, SkinBody } from './types.js';

const L = (x: number, y: number): Pos => ({ anchor: 'left', x, y });
const R = (x: number, y: number): Pos => ({ anchor: 'right', x, y });
const C = (x: number, y: number): Pos => ({ anchor: 'center', x, y });
const bit = (b: Button): Effect => ({ bit: b });

function btn(
  id: string,
  pos: Pos,
  effects: Effect[],
  style: { color: string; ink: string; r?: number; label?: string; glyph?: Glyph },
): ButtonControl {
  return { kind: 'button', id, pos, shape: 'circle', r: style.r ?? 0.085, effects, color: style.color, ink: style.ink, label: style.label, glyph: style.glyph };
}

function pill(id: string, pos: Pos, effects: Effect[], label: string, color: string, ink: string, w = 0.095, h = 0.042): ButtonControl {
  return { kind: 'button', id, pos, shape: 'pill', w, h, effects, label, color, ink };
}

function shoulder(id: string, pos: Pos, effects: Effect[], label: string, color: string, ink: string, w = 0.2, h = 0.06): ButtonControl {
  return { kind: 'button', id, pos, shape: 'rect', w, h, effects, label, color, ink };
}

/** Four face buttons in a diamond around (x, y) on the right side. */
function diamond(
  x: number,
  y: number,
  spread: number,
  r: number,
  top: Omit<ButtonControl, 'kind' | 'pos' | 'shape' | 'r'>,
  rightB: Omit<ButtonControl, 'kind' | 'pos' | 'shape' | 'r'>,
  bottom: Omit<ButtonControl, 'kind' | 'pos' | 'shape' | 'r'>,
  left: Omit<ButtonControl, 'kind' | 'pos' | 'shape' | 'r'>,
): ButtonControl[] {
  return [
    { kind: 'button', shape: 'circle', r, pos: R(x, y - spread), ...top },
    { kind: 'button', shape: 'circle', r, pos: R(x - spread, y), ...rightB },
    { kind: 'button', shape: 'circle', r, pos: R(x, y + spread), ...bottom },
    { kind: 'button', shape: 'circle', r, pos: R(x + spread, y), ...left },
  ];
}

const selectStart = (ink: string, color: string, y = 0.8): Control[] => [
  pill('select', C(-0.125, y), [bit(Button.SELECT)], 'SELECT', color, ink),
  pill('start', C(0.125, y), [bit(Button.START)], 'START', color, ink),
];

const body = (b: Partial<SkinBody> & Pick<SkinBody, 'background' | 'shell'>): SkinBody => ({
  well: 'rgba(0,0,0,.25)',
  accent: 'rgba(255,255,255,.08)',
  print: 'rgba(255,255,255,.75)',
  ...b,
});

/* ------------------------------------------------------------------ NES */
const nes: Skin = {
  id: 'nes',
  name: '8-bit pad',
  analog: false,
  body: body({ background: 'linear-gradient(#cfcfcf,#b9b9b9)', shell: '#1b1b1b', well: '#0d0d0d', accent: '#9a9a9a', print: '#c8202d' }),
  controls: [
    { kind: 'dpad', id: 'dpad', pos: L(0.45, 0.58), size: 0.56, style: 'cross', color: '#1d1d1d' },
    ...selectStart('#c8202d', '#3a3a3a', 0.66),
    btn('b', R(0.62, 0.62), [bit(Button.B)], { color: '#d8262f', ink: '#5e0b12', label: 'B', r: 0.11 }),
    btn('a', R(0.3, 0.62), [bit(Button.A)], { color: '#d8262f', ink: '#5e0b12', label: 'A', r: 0.11 }),
  ],
};

/* ----------------------------------------------------------------- SNES */
const snes: Skin = {
  id: 'snes',
  name: '16-bit pad',
  analog: false,
  body: body({ background: 'linear-gradient(#dcdce4,#c4c4cf)', shell: '#cfcfd8', well: '#a9a9b6', accent: '#8f8fa3', print: '#4b4b5c' }),
  controls: [
    shoulder('l', L(0.38, 0.085), [bit(Button.L)], 'L', '#b7b7c3', '#4b4b5c', 0.26),
    shoulder('r', R(0.38, 0.085), [bit(Button.R)], 'R', '#b7b7c3', '#4b4b5c', 0.26),
    { kind: 'dpad', id: 'dpad', pos: L(0.42, 0.56), size: 0.52, style: 'cross', color: '#2b2b33' },
    ...selectStart('#4b4b5c', '#5c5c6b', 0.6),
    ...diamond(
      0.42,
      0.56,
      0.165,
      0.088,
      { id: 'x', effects: [bit(Button.X)], color: '#2f6fd6', ink: '#fff', label: 'X' },
      { id: 'a', effects: [bit(Button.A)], color: '#d6312f', ink: '#fff', label: 'A' },
      { id: 'b', effects: [bit(Button.B)], color: '#e8b81f', ink: '#fff', label: 'B' },
      { id: 'y', effects: [bit(Button.Y)], color: '#2a9a4a', ink: '#fff', label: 'Y' },
    ),
  ],
};

/* -------------------------------------------------------------- Genesis */
const genesisBtn = (id: string, x: number, y: number, effect: Button, small = false): ButtonControl =>
  btn(id, R(x, y), [bit(effect)], { color: small ? '#3a3a3f' : '#2b2b30', ink: '#e8e8ee', label: id.toUpperCase(), r: small ? 0.068 : 0.09 });

const genesis: Skin = {
  id: 'genesis',
  name: '6-button pad',
  analog: false,
  body: body({ background: 'linear-gradient(#26262b,#141417)', shell: '#1d1d21', well: '#0b0b0d', accent: '#c4152b', print: '#d0d0d8' }),
  controls: [
    { kind: 'dpad', id: 'dpad', pos: L(0.44, 0.58), size: 0.54, style: 'disc', color: '#2a2a30' },
    pill('mode', C(-0.125, 0.4), [bit(Button.SELECT)], 'MODE', '#3a3a40', '#d0d0d8', 0.1),
    pill('start', C(0.125, 0.4), [bit(Button.START)], 'START', '#3a3a40', '#d0d0d8', 0.1),
    // Bottom row A B C, top row X Y Z, slanted like the original.
    genesisBtn('a', 0.74, 0.7, Button.Y),
    genesisBtn('b', 0.52, 0.64, Button.B),
    genesisBtn('c', 0.3, 0.58, Button.A),
    genesisBtn('x', 0.74, 0.43, Button.L, true),
    genesisBtn('y', 0.52, 0.37, Button.X, true),
    genesisBtn('z', 0.3, 0.31, Button.R, true),
  ],
};

/* --------------------------------------------------------------- GB/GBC */
const gb: Skin = {
  id: 'gb',
  name: 'Handheld (classic)',
  analog: false,
  body: body({ background: 'linear-gradient(#d8d4c8,#c3beb0)', shell: '#cdc8bb', well: '#aaa596', accent: '#7d7aa6', print: '#2d2b6b' }),
  controls: [
    { kind: 'dpad', id: 'dpad', pos: L(0.44, 0.55), size: 0.5, style: 'cross', color: '#24242a' },
    btn('b', R(0.6, 0.62), [bit(Button.B)], { color: '#9b1d4f', ink: '#2d2b6b', label: 'B', r: 0.1 }),
    btn('a', R(0.33, 0.5), [bit(Button.A)], { color: '#9b1d4f', ink: '#2d2b6b', label: 'A', r: 0.1 }),
    pill('select', C(-0.1, 0.86), [bit(Button.SELECT)], 'SELECT', '#8f8b80', '#2d2b6b', 0.11),
    pill('start', C(0.1, 0.86), [bit(Button.START)], 'START', '#8f8b80', '#2d2b6b', 0.11),
  ],
};

/* ------------------------------------------------------------------ GBA */
const gba: Skin = {
  id: 'gba',
  name: 'Handheld (advance)',
  analog: false,
  body: body({ background: 'linear-gradient(#5a50b8,#3e3592)', shell: '#4b42a6', well: '#2f2878', accent: '#7c74d6', print: '#e4e1ff' }),
  controls: [
    shoulder('l', L(0.36, 0.085), [bit(Button.L)], 'L', '#8f88d8', '#1e1960', 0.26),
    shoulder('r', R(0.36, 0.085), [bit(Button.R)], 'R', '#8f88d8', '#1e1960', 0.26),
    { kind: 'dpad', id: 'dpad', pos: L(0.42, 0.55), size: 0.5, style: 'cross', color: '#1f1a52' },
    btn('b', R(0.58, 0.62), [bit(Button.B)], { color: '#2b2475', ink: '#e4e1ff', label: 'B', r: 0.095 }),
    btn('a', R(0.33, 0.5), [bit(Button.A)], { color: '#2b2475', ink: '#e4e1ff', label: 'A', r: 0.095 }),
    pill('select', C(-0.1, 0.86), [bit(Button.SELECT)], 'SELECT', '#2b2475', '#e4e1ff', 0.11),
    pill('start', C(0.1, 0.86), [bit(Button.START)], 'START', '#2b2475', '#e4e1ff', 0.11),
  ],
};

/* ---------------------------------------------------------- PS1 / PS2 */
function dualshock(id: 'psx' | 'ps2', name: string, shellColor: string, bg: string): Skin {
  const ink = '#d9dbe0';
  return {
    id,
    name,
    analog: true,
    body: body({ background: bg, shell: shellColor, well: 'rgba(0,0,0,.35)', accent: 'rgba(255,255,255,.06)', print: ink }),
    controls: [
      shoulder('l2', L(0.3, 0.06), [bit(Button.L2), { trigger: 'l2', value: 255 }], 'L2', '#3b3d44', ink, 0.2, 0.05),
      shoulder('l1', L(0.3, 0.17), [bit(Button.L)], 'L1', '#4a4c54', ink, 0.2, 0.05),
      shoulder('r2', R(0.3, 0.06), [bit(Button.R2), { trigger: 'r2', value: 255 }], 'R2', '#3b3d44', ink, 0.2, 0.05),
      shoulder('r1', R(0.3, 0.17), [bit(Button.R)], 'R1', '#4a4c54', ink, 0.2, 0.05),
      { kind: 'dpad', id: 'dpad', pos: L(0.33, 0.47), size: 0.4, style: 'buttons', color: '#2a2c32' },
      { kind: 'stick', id: 'lstick', pos: L(0.72, 0.76), r: 0.15, side: 'left', click: Button.L3, color: '#202227' },
      { kind: 'stick', id: 'rstick', pos: R(0.72, 0.76), r: 0.15, side: 'right', click: Button.R3, color: '#202227' },
      pill('select', C(-0.11, 0.47), [bit(Button.SELECT)], 'SELECT', '#33353b', ink, 0.1, 0.04),
      pill('start', C(0.11, 0.47), [bit(Button.START)], 'START', '#33353b', ink, 0.1, 0.04),
      ...diamond(
        0.33,
        0.47,
        0.135,
        0.072,
        { id: 'triangle', effects: [bit(Button.X)], color: '#2a2c32', ink: '#3ec7a4', glyph: 'triangle' },
        { id: 'circle', effects: [bit(Button.A)], color: '#2a2c32', ink: '#ff6b6b', glyph: 'circle' },
        { id: 'cross', effects: [bit(Button.B)], color: '#2a2c32', ink: '#7aa7ff', glyph: 'cross' },
        { id: 'square', effects: [bit(Button.Y)], color: '#2a2c32', ink: '#e98ad8', glyph: 'square' },
      ),
    ],
  };
}

/* ------------------------------------------------------------------ N64 */
const C_SPREAD = 0.1;
const n64: Skin = {
  id: 'n64',
  name: '64-bit three-prong pad',
  analog: true,
  body: body({ background: 'linear-gradient(#b8bbc2,#9a9ea6)', shell: '#a7abb3', well: '#7d818a', accent: '#d7dae0', print: '#2b2d33' }),
  controls: [
    shoulder('l', L(0.3, 0.085), [bit(Button.L)], 'L', '#8a8e97', '#1f2126', 0.22),
    shoulder('r', R(0.3, 0.085), [bit(Button.R)], 'R', '#8a8e97', '#1f2126', 0.22),
    { kind: 'dpad', id: 'dpad', pos: L(0.27, 0.36), size: 0.32, style: 'cross', color: '#3a3d44' },
    { kind: 'stick', id: 'lstick', pos: L(0.62, 0.66), r: 0.18, side: 'left', color: '#5d6069' },
    { kind: 'button', id: 'z', pos: L(0.24, 0.8), shape: 'rect', w: 0.13, h: 0.09, effects: [bit(Button.L2)], label: 'Z', color: '#3a3d44', ink: '#e8e9ec' },
    btn('start', C(0, 0.5), [bit(Button.START)], { color: '#c42b2b', ink: '#fff', label: 'START', r: 0.065 }),
    btn('a', R(0.6, 0.72), [bit(Button.B)], { color: '#2f5fd0', ink: '#fff', label: 'A', r: 0.1 }),
    btn('b', R(0.8, 0.54), [bit(Button.Y)], { color: '#2f9b4a', ink: '#fff', label: 'B', r: 0.09 }),
    btn('c-up', R(0.3, 0.38 - C_SPREAD), [{ axis: 'ry', value: -127 }], { color: '#e8c12a', ink: '#5a4a00', glyph: 'up', r: 0.06 }),
    btn('c-down', R(0.3, 0.38 + C_SPREAD), [{ axis: 'ry', value: 127 }], { color: '#e8c12a', ink: '#5a4a00', glyph: 'down', r: 0.06 }),
    btn('c-left', R(0.3 + C_SPREAD, 0.38), [{ axis: 'rx', value: -127 }], { color: '#e8c12a', ink: '#5a4a00', glyph: 'left', r: 0.06 }),
    btn('c-right', R(0.3 - C_SPREAD, 0.38), [{ axis: 'rx', value: 127 }], { color: '#e8c12a', ink: '#5a4a00', glyph: 'right', r: 0.06 }),
  ],
};

/* ------------------------------------------------------------------ PSP */
const psp: Skin = {
  id: 'psp',
  name: 'Portable (wide)',
  analog: true,
  body: body({ background: 'linear-gradient(#24262b,#101114)', shell: '#1a1b1f', well: '#08090a', accent: 'rgba(255,255,255,.05)', print: '#c9ccd3' }),
  controls: [
    shoulder('l', L(0.36, 0.085), [bit(Button.L)], 'L', '#2c2e34', '#c9ccd3', 0.26),
    shoulder('r', R(0.36, 0.085), [bit(Button.R)], 'R', '#2c2e34', '#c9ccd3', 0.26),
    { kind: 'dpad', id: 'dpad', pos: L(0.36, 0.42), size: 0.42, style: 'buttons', color: '#2a2c31' },
    { kind: 'stick', id: 'lstick', pos: L(0.36, 0.8), r: 0.12, side: 'left', color: '#3a3c42' },
    pill('select', C(-0.1, 0.88), [bit(Button.SELECT)], 'SELECT', '#2c2e34', '#c9ccd3', 0.1, 0.035),
    pill('start', C(0.1, 0.88), [bit(Button.START)], 'START', '#2c2e34', '#c9ccd3', 0.1, 0.035),
    ...diamond(
      0.36,
      0.48,
      0.14,
      0.075,
      { id: 'triangle', effects: [bit(Button.X)], color: '#26282d', ink: '#3ec7a4', glyph: 'triangle' },
      { id: 'circle', effects: [bit(Button.A)], color: '#26282d', ink: '#ff6b6b', glyph: 'circle' },
      { id: 'cross', effects: [bit(Button.B)], color: '#26282d', ink: '#7aa7ff', glyph: 'cross' },
      { id: 'square', effects: [bit(Button.Y)], color: '#26282d', ink: '#e98ad8', glyph: 'square' },
    ),
  ],
};

/* ------------------------------------------------------------------ NDS */
const nds: Skin = {
  id: 'nds',
  name: 'Dual-screen handheld',
  analog: false,
  body: body({ background: 'linear-gradient(#eef0f3,#cfd3d9)', shell: '#e1e4e9', well: '#b9bec7', accent: '#9aa1ad', print: '#3d434d' }),
  controls: [
    shoulder('l', L(0.36, 0.085), [bit(Button.L)], 'L', '#c3c8d0', '#3d434d', 0.26),
    shoulder('r', R(0.36, 0.085), [bit(Button.R)], 'R', '#c3c8d0', '#3d434d', 0.26),
    { kind: 'dpad', id: 'dpad', pos: L(0.42, 0.55), size: 0.48, style: 'cross', color: '#3a3f48' },
    pill('select', C(-0.1, 0.86), [bit(Button.SELECT)], 'SELECT', '#c3c8d0', '#3d434d', 0.1, 0.04),
    pill('start', C(0.1, 0.86), [bit(Button.START)], 'START', '#c3c8d0', '#3d434d', 0.1, 0.04),
    ...diamond(
      0.42,
      0.55,
      0.155,
      0.08,
      { id: 'x', effects: [bit(Button.X)], color: '#3a3f48', ink: '#f2f4f7', label: 'X' },
      { id: 'a', effects: [bit(Button.A)], color: '#3a3f48', ink: '#f2f4f7', label: 'A' },
      { id: 'b', effects: [bit(Button.B)], color: '#3a3f48', ink: '#f2f4f7', label: 'B' },
      { id: 'y', effects: [bit(Button.Y)], color: '#3a3f48', ink: '#f2f4f7', label: 'Y' },
    ),
  ],
};

/* --------------------------------------------------------------- modern */
const modern: Skin = {
  id: 'modern',
  name: 'Modern pad',
  analog: true,
  body: body({ background: 'radial-gradient(circle at 50% 30%,#1d2330,#0c0f15)', shell: '#151a24', well: '#0a0d13', accent: 'rgba(110,160,255,.08)', print: '#c6cfdf' }),
  controls: [
    shoulder('l2', L(0.3, 0.06), [bit(Button.L2), { trigger: 'l2', value: 255 }], 'LT', '#232a37', '#c6cfdf', 0.2, 0.05),
    shoulder('l1', L(0.3, 0.17), [bit(Button.L)], 'LB', '#2b3343', '#c6cfdf', 0.2, 0.05),
    shoulder('r2', R(0.3, 0.06), [bit(Button.R2), { trigger: 'r2', value: 255 }], 'RT', '#232a37', '#c6cfdf', 0.2, 0.05),
    shoulder('r1', R(0.3, 0.17), [bit(Button.R)], 'RB', '#2b3343', '#c6cfdf', 0.2, 0.05),
    { kind: 'stick', id: 'lstick', pos: L(0.36, 0.5), r: 0.15, side: 'left', click: Button.L3, color: '#1b212c' },
    { kind: 'dpad', id: 'dpad', pos: L(0.74, 0.76), size: 0.34, style: 'cross', color: '#1f2633' },
    { kind: 'stick', id: 'rstick', pos: R(0.74, 0.76), r: 0.13, side: 'right', click: Button.R3, color: '#1b212c' },
    pill('select', C(-0.1, 0.44), [bit(Button.SELECT)], 'VIEW', '#232a37', '#c6cfdf', 0.09, 0.04),
    pill('start', C(0.1, 0.44), [bit(Button.START)], 'MENU', '#232a37', '#c6cfdf', 0.09, 0.04),
    ...diamond(
      0.36,
      0.5,
      0.14,
      0.075,
      { id: 'x', effects: [bit(Button.X)], color: '#1f2633', ink: '#f2c94c', label: 'Y' },
      { id: 'a', effects: [bit(Button.A)], color: '#1f2633', ink: '#eb5757', label: 'B' },
      { id: 'b', effects: [bit(Button.B)], color: '#1f2633', ink: '#6fcf97', label: 'A' },
      { id: 'y', effects: [bit(Button.Y)], color: '#1f2633', ink: '#56ccf2', label: 'X' },
    ),
  ],
};

export const SKINS: Readonly<Record<SkinId, Skin>> = {
  nes,
  snes,
  genesis,
  gb,
  gbc: { ...gb, id: 'gbc', name: 'Handheld (color)', body: body({ background: 'linear-gradient(#7a4fd0,#5b34ad)', shell: '#6a42c0', well: '#46278a', accent: '#a585ff', print: '#f1eaff' }) },
  gba,
  psx: dualshock('psx', 'DualShock-style pad', '#c9ccd2', 'linear-gradient(#d7dade,#b8bcc3)'),
  ps2: dualshock('ps2', 'DualShock 2-style pad', '#16181c', 'linear-gradient(#1e2025,#0d0e11)'),
  n64,
  psp,
  nds,
  modern,
};

export function getSkin(id: string): Skin {
  return (SKINS as Record<string, Skin>)[id] ?? modern;
}
