import { describe, expect, it } from 'vitest';
import { MARK_ON, markSvg, markVectorPaths, pathData } from '../src/index.js';

describe('mark', () => {
  it('renders every variant to SVG with the brand colours', () => {
    const svg = markSvg('cut', MARK_ON.ink);
    expect(svg).toContain('viewBox="-8 -8 156 120"');
    expect(svg).toContain('#F7C948');
    expect(svg).toContain('#FFF6E0');
    expect(markSvg('mini', MARK_ON.cream)).not.toContain('rx="5"'); // no phone screens below 96 px
  });

  it('turns a rounded rect into closed VectorDrawable path data', () => {
    expect(pathData({ k: 'rr', x: 0, y: 0, w: 10, h: 6, r: 2 })).toBe('M2,0h6a2,2 0,0 1,2,2v2a2,2 0,0 1,-2,2h-6a2,2 0,0 1,-2,-2v-2a2,2 0,0 1,2,-2z');
  });

  it('writes ARGB colours with the layer opacity for Android', () => {
    const xml = markVectorPaths('full', MARK_ON.cream, 1, 0, 0);
    expect(xml).toContain('android:fillColor="#FFF7C948"');
    expect(xml).toContain('android:strokeColor="#8C1C1814"'); // stitching at 55 %
  });
});
