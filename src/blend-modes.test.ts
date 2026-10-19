import { describe, expect, it } from 'vitest';
import {
  compositeBlend,
  porterDuff,
  premultiply,
  unpremultiply,
  type RGBA,
} from './blend-modes';

describe('alpha compositing and blend modes engine', () => {
  it('correctly premultiplies and unpremultiplies color channels', () => {
    const raw: RGBA = [0.8, 0.4, 0.2, 0.5];
    const premult = premultiply(raw);
    expect(premult[0]).toBeCloseTo(0.4, 4);
    expect(premult[1]).toBeCloseTo(0.2, 4);
    expect(premult[2]).toBeCloseTo(0.1, 4);
    expect(premult[3]).toBe(0.5);

    const unpremult = unpremultiply(premult);
    expect(unpremult[0]).toBeCloseTo(0.8, 4);
    expect(unpremult[1]).toBeCloseTo(0.4, 4);
    expect(unpremult[2]).toBeCloseTo(0.2, 4);
    expect(unpremult[3]).toBe(0.5);

    // Epsilon protection for zero alpha
    const zeroAlpha: RGBA = [0.5, 0.5, 0.5, 0];
    expect(unpremultiply(zeroAlpha)).toEqual([0, 0, 0, 0]);
  });

  it('evaluates Porter-Duff operators correctly', () => {
    const src: RGBA = [1, 0, 0, 1]; // Opaque red
    const dst: RGBA = [0, 0, 1, 1]; // Opaque blue

    // Over: src over dst -> src
    const over = porterDuff(src, dst, 'over');
    expect(over).toEqual([1, 0, 0, 1]);

    // Clear: returns 0
    const clear = porterDuff(src, dst, 'clear');
    expect(clear).toEqual([0, 0, 0, 0]);

    // Semi-transparent Over:
    const semiSrc: RGBA = [1, 0, 0, 0.5];
    const semiDst: RGBA = [0, 0, 1, 1];
    const semiOver = porterDuff(semiSrc, semiDst, 'over');
    expect(semiOver[0]).toBeCloseTo(0.5, 4);
    expect(semiOver[2]).toBeCloseTo(0.5, 4);
    expect(semiOver[3]).toBe(1.0);
  });

  it('evaluates standard blend modes accurately', () => {
    const src: RGBA = [0.5, 0.5, 0.5, 1];
    const dst: RGBA = [0.5, 0.5, 0.5, 1];

    // Multiply: 0.5 * 0.5 = 0.25
    const mul = compositeBlend(src, dst, 'multiply');
    expect(mul[0]).toBeCloseTo(0.25, 4);

    // Screen: 0.5 + 0.5 - 0.25 = 0.75
    const screen = compositeBlend(src, dst, 'screen');
    expect(screen[0]).toBeCloseTo(0.75, 4);

    // Add: 0.5 + 0.5 = 1.0
    const add = compositeBlend(src, dst, 'add');
    expect(add[0]).toBeCloseTo(1.0, 4);

    // Difference: |0.5 - 0.5| = 0
    const diff = compositeBlend(src, dst, 'difference');
    expect(diff[0]).toBeCloseTo(0, 4);

    // Subtract: max(0, 0.5 - 0.5) = 0
    const sub = compositeBlend(src, dst, 'subtract');
    expect(sub[0]).toBeCloseTo(0, 4);
  });

  it('respects source layer opacity in blending', () => {
    const src: RGBA = [1, 1, 1, 1];
    const dst: RGBA = [0, 0, 0, 1];

    const halfBlend = compositeBlend(src, dst, 'normal', 0.5);
    expect(halfBlend[0]).toBeCloseTo(0.5, 4);
    expect(halfBlend[1]).toBeCloseTo(0.5, 4);
    expect(halfBlend[2]).toBeCloseTo(0.5, 4);
    expect(halfBlend[3]).toBe(1.0);
  });
});
