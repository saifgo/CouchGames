/**
 * CouchPad brand tokens (docs/brand/identity.md). The web reads these through tokens.css; Android
 * mirrors them in ui/Brand.kt. Change a value here, in tokens.css and in Brand.kt together.
 */
export * from './mark.js';

export const BRAND_NAME = 'CouchPad';
export const TAGLINE = 'Scan. Sit. Play.';

/** Core palette. Yellow always sits next to Ink; Cream is the light ground, Ink the dark one. */
export const COLORS = {
  yellow: '#F7C948', // Cozy Yellow: logo body, primary buttons, focus ring
  yellowDeep: '#D9A520', // yellow text/icons on Cream (20 px+ bold only), pressed states
  ink: '#1C1814', // outlines, text, TV background. Warm near-black, never #000
  cream: '#FFF6E0', // light ground, phone screens in the mark, sticker border on dark
  mocha: '#7A6F5E', // secondary text on Cream (4.6:1)
  sand: '#B8AE9C', // secondary text on Ink
  linen: '#E8DCC0', // borders on Cream, soft text on Ink
} as const;

/** Mark colours for each ground (brand kit board 03). */
export const MARK_ON = {
  cream: { y: COLORS.yellow, i: COLORS.ink, p: COLORS.cream },
  yellow: { y: COLORS.yellow, i: COLORS.ink, p: COLORS.cream, b: COLORS.ink },
  ink: { y: COLORS.yellow, i: COLORS.ink, p: COLORS.cream, b: COLORS.cream },
  mono: { y: '#FFFFFF', i: '#000000', p: '#FFFFFF' },
  monoReversed: { y: '#000000', i: '#FFFFFF', p: '#000000' },
} as const;

export const FONTS = {
  display: "Fredoka, Nunito, ui-rounded, 'SF Pro Rounded', system-ui, sans-serif",
  body: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
} as const;
