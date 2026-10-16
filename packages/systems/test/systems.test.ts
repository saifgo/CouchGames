import { describe, expect, it } from 'vitest';
import { CONSOLES } from '@couch/protocol';
import { SYSTEMS, SYSTEM_BY_ID, titleFromFilename } from '../src/index.js';

describe('system catalog', () => {
  it('defines every console exactly once', () => {
    expect(SYSTEMS.map((s) => s.id).sort()).toEqual([...CONSOLES].sort());
    for (const c of CONSOLES) expect(SYSTEM_BY_ID[c].id).toBe(c);
  });

  it('uses lower-case dotted extensions', () => {
    for (const s of SYSTEMS) for (const e of s.extensions) expect(e).toMatch(/^\.[a-z0-9]+$/);
  });
});

describe('titleFromFilename', () => {
  it.each([
    ['Super Mario World (USA).sfc', 'Super Mario World'],
    ['Legend of Zelda, The (U) [!].nes', 'The Legend of Zelda'],
    ['240p_test_suite.md', '240p test suite'],
    ['Sonic (Rev 1) (World).gen', 'Sonic'],
  ])('%s → %s', (input, out) => expect(titleFromFilename(input)).toBe(out));
});
