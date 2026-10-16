import type { Button, SkinId } from '@couch/protocol';

/**
 * Layout units are fractions of the screen HEIGHT (landscape), so a skin adapts
 * to any aspect ratio: the left and right clusters stay under the thumbs and the
 * centre cluster stays centred.
 */
export type Anchor = 'left' | 'right' | 'center';

export interface Pos {
  anchor: Anchor;
  /** Horizontal offset from the anchor edge (or from centre), in screen heights. */
  x: number;
  /** Vertical position 0..1 (top → bottom). */
  y: number;
}

/** What pressing a control does to the RetroPad state. */
export type Effect =
  | { bit: Button }
  /** Drive an analog axis to a fixed value while held (N64 C-buttons → right stick). */
  | { axis: 'lx' | 'ly' | 'rx' | 'ry'; value: number }
  /** Analog trigger value while held. */
  | { trigger: 'l2' | 'r2'; value: number };

export type Glyph = 'cross' | 'circle' | 'square' | 'triangle' | 'up' | 'down' | 'left' | 'right';

export interface ButtonControl {
  kind: 'button';
  id: string;
  pos: Pos;
  shape: 'circle' | 'pill' | 'rect';
  /** Circle radius, or half-width/half-height for pill/rect, in screen heights. */
  r?: number;
  w?: number;
  h?: number;
  label?: string;
  glyph?: Glyph;
  color: string;
  ink: string;
  effects: Effect[];
}

export interface DpadControl {
  kind: 'dpad';
  id: string;
  pos: Pos;
  /** Full width of the cross, in screen heights. */
  size: number;
  style: 'cross' | 'buttons' | 'disc';
  color: string;
}

export interface StickControl {
  kind: 'stick';
  id: string;
  pos: Pos;
  /** Travel radius in screen heights. */
  r: number;
  side: 'left' | 'right';
  /** Bit pressed when the stick is double-tapped (L3 / R3). */
  click?: Button;
  color: string;
}

export type Control = ButtonControl | DpadControl | StickControl;

export interface SkinBody {
  /** Background (CSS colour or gradient). */
  background: string;
  /** Colour of the shell drawn behind each cluster. */
  shell: string;
  /** Recessed wells under buttons. */
  well: string;
  /** Faint decorative accent (stripe, logo-free). */
  accent: string;
  /** Text colour for labels printed on the shell. */
  print: string;
}

export interface Skin {
  id: SkinId;
  name: string;
  body: SkinBody;
  controls: Control[];
  /** Whether this pad has analog sticks (the phone may offer gyro → stick). */
  analog: boolean;
}

export interface ResolvedControl<C extends Control = Control> {
  control: C;
  /** Centre in CSS pixels. */
  cx: number;
  cy: number;
  /** Hit radius in pixels (generous: larger than the drawn size). */
  hit: number;
}
