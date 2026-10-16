import { describe, expect, it } from 'vitest';
import { CONSOLES } from '@couch/protocol';
import { SKINS, dpadDirections, hitTest, resolveLayout, stickAxes, type Skin } from '../src/index.js';

const phones = [
  { name: '19.5:9 phone', width: 844, height: 390 },
  { name: '16:9 phone', width: 640, height: 360 },
  { name: '4:3 tablet', width: 1024, height: 768 },
];

describe('skins', () => {
  it('exist for every console plus modern', () => {
    for (const c of CONSOLES) expect(SKINS[c]).toBeDefined();
    expect(SKINS.modern.analog).toBe(true);
  });

  for (const [id, skin] of Object.entries(SKINS) as [string, Skin][]) {
    for (const vp of phones) {
      it(`${id} fits on a ${vp.name} without overlapping hit centres`, () => {
        const r = resolveLayout(skin, vp);
        for (const rc of r) {
          expect(rc.cx).toBeGreaterThan(0);
          expect(rc.cx).toBeLessThan(vp.width);
          expect(rc.cy).toBeGreaterThan(0);
          expect(rc.cy).toBeLessThan(vp.height);
          // Tapping exactly on a control's centre must hit that control.
          if (rc.control.kind === 'button') expect(r[hitTest(r, rc.cx, rc.cy, vp.height)]).toBe(rc);
        }
      });
    }
  }

  it('mirrors clusters for left-handed play', () => {
    const vp = { width: 844, height: 390 };
    const normal = resolveLayout(SKINS.snes, vp).find((r) => r.control.id === 'dpad')!;
    const mirrored = resolveLayout(SKINS.snes, { ...vp, mirror: true }).find((r) => r.control.id === 'dpad')!;
    expect(normal.cx).toBeLessThan(vp.width / 2);
    expect(mirrored.cx).toBeGreaterThan(vp.width / 2);
  });
});

describe('dpad + sticks', () => {
  it('maps angles to 8 directions with a dead zone', () => {
    expect(dpadDirections(0, -10, 50)).toBe(1);
    expect(dpadDirections(10, 10, 50)).toBe(8 | 2);
    expect(dpadDirections(-10, 0, 50)).toBe(4);
    expect(dpadDirections(1, 1, 50)).toBe(0);
  });

  it('rescales stick output outside the dead zone', () => {
    expect(stickAxes(0, 0, 100, 0.1)).toEqual({ x: 0, y: 0 });
    expect(stickAxes(5, 0, 100, 0.1)).toEqual({ x: 0, y: 0 });
    expect(stickAxes(100, 0, 100, 0.1)).toEqual({ x: 127, y: 0 });
    expect(stickAxes(300, 0, 100, 0.1)).toEqual({ x: 127, y: 0 });
    const half = stickAxes(55, 0, 100, 0.1).x;
    expect(half).toBeGreaterThan(55);
    expect(half).toBeLessThan(70);
  });
});
