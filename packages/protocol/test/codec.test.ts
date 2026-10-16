import { describe, expect, it } from 'vitest';
import golden from '../vectors/golden.json' with { type: 'json' };
import {
  createInputState,
  decodeControl,
  decodeEchoInto,
  decodeInputInto,
  encodeControl,
  encodeEchoInto,
  encodeInputInto,
  fromHex,
  ProtocolError,
  seqNewer,
  toHex,
  u32Diff,
  type ControlMsg,
  type InputEcho,
  type InputState,
} from '../src/codec.js';
import { PROTOCOL_VERSION } from '../src/constants.js';
import { controlCases, echoCases, inputCases } from './cases.js';

const scratch = new DataView(new ArrayBuffer(64));
const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

describe('golden vectors', () => {
  it('match the current protocol version', () => {
    expect(golden.protocolVersion).toBe(PROTOCOL_VERSION);
  });

  it('cover every test case (regenerate with `pnpm vectors` after an intentional change)', () => {
    expect(golden.input.map((v) => v.name)).toEqual(inputCases.map((c) => c.name));
    expect(golden.control.map((v) => v.name)).toEqual(controlCases.map((c) => c.name));
    expect(golden.echo.map((v) => v.name)).toEqual(echoCases.map((c) => c.name));
  });

  for (const v of golden.input) {
    it(`input ${v.name}: encode → exact bytes, decode → exact value`, () => {
      const n = encodeInputInto(v.value as InputState, scratch);
      expect(toHex(new Uint8Array(scratch.buffer, 0, n))).toBe(v.hex);
      const out = createInputState();
      expect(decodeInputInto(viewOf(fromHex(v.hex)), out)).toBe(true);
      expect(out).toEqual(v.value);
    });
  }

  for (const v of golden.echo) {
    it(`echo ${v.name}`, () => {
      const n = encodeEchoInto(v.value as InputEcho, scratch);
      expect(toHex(new Uint8Array(scratch.buffer, 0, n))).toBe(v.hex);
      const out: InputEcho = { seq: 0, clientTimeMs: 0, hostTimeMs: 0 };
      expect(decodeEchoInto(viewOf(fromHex(v.hex)), out)).toBe(true);
      expect(out).toEqual(v.value);
    });
  }

  for (const v of golden.control) {
    it(`control ${v.name}`, () => {
      expect(toHex(encodeControl(v.value as ControlMsg))).toBe(v.hex);
      expect(decodeControl(fromHex(v.hex))).toEqual(v.value);
    });
  }

  for (const v of golden.invalid) {
    it(`rejects ${v.name} (${v.reason})`, () => {
      const bytes = fromHex(v.hex);
      if (bytes[0] === 0x01) {
        expect(decodeInputInto(viewOf(bytes), createInputState())).toBe(false);
      } else {
        expect(() => decodeControl(bytes)).toThrow(ProtocolError);
      }
    });
  }
});

describe('input codec', () => {
  it('clamps out-of-range axes instead of wrapping', () => {
    const s = createInputState();
    s.lx = 500;
    s.ly = -500;
    s.l2 = 999;
    encodeInputInto(s, scratch);
    const out = createInputState();
    decodeInputInto(new DataView(scratch.buffer, 0, 18), out);
    expect([out.lx, out.ly, out.l2]).toEqual([127, -127, 255]);
  });

  it('encode/decode does not allocate per call (smoke: 1e5 round trips stay fast)', () => {
    const s = createInputState();
    const out = createInputState();
    const view = new DataView(scratch.buffer, 0, 18);
    const t0 = performance.now();
    for (let i = 0; i < 100_000; i++) {
      s.seq = i;
      s.buttons = i;
      encodeInputInto(s, scratch);
      decodeInputInto(view, out);
    }
    expect(out.seq).toBe(99_999 & 0xffff);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe('sequence + clock arithmetic', () => {
  it('handles u16 wraparound', () => {
    expect(seqNewer(1, 0)).toBe(true);
    expect(seqNewer(0, 65535)).toBe(true);
    expect(seqNewer(65535, 0)).toBe(false);
    expect(seqNewer(5, 5)).toBe(false);
    expect(seqNewer(100, 40000)).toBe(true);
  });

  it('handles u32 ms wraparound', () => {
    expect(u32Diff(5, 4294967290)).toBe(11);
    expect(u32Diff(4294967290, 5)).toBe(-11);
  });
});

describe('control codec', () => {
  it('rejects a version mismatch', () => {
    const bytes = encodeControl({ type: 0x12 as const });
    bytes[1] = PROTOCOL_VERSION + 1;
    expect(() => decodeControl(bytes)).toThrow(/version/);
  });

  it('rejects non-object JSON bodies', () => {
    expect(() => decodeControl(new Uint8Array([0x10, PROTOCOL_VERSION, 0x31]))).toThrow(ProtocolError);
  });
});
