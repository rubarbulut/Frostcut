import { describe, expect, it } from 'vitest';
import {
  applyDespillBlue,
  applyDespillGreen,
  computeMatte,
  defaultKeyerConfig,
  processKey,
} from './matte-keyer';

describe('advanced matte keyer and despill engine', () => {
  it('suppresses green spill using average and maximum methods', () => {
    // Pure green spill on neutral hair: [0.2, 0.6, 0.2]
    const hairWithSpill: [number, number, number] = [0.2, 0.6, 0.2];

    const despilledAvg = applyDespillGreen(hairWithSpill, 'average', 1.0);
    // Limit is (0.2 + 0.2) * 0.5 = 0.2
    expect(despilledAvg[1]).toBeCloseTo(0.2, 4);

    const despilledMax = applyDespillGreen(hairWithSpill, 'maximum', 1.0);
    expect(despilledMax[1]).toBeCloseTo(0.2, 4);

    // Non-spill color: [0.8, 0.2, 0.2] (red) -> green unchanged
    const red: [number, number, number] = [0.8, 0.2, 0.2];
    expect(applyDespillGreen(red, 'average', 1.0)).toEqual(red);
  });

  it('preserves perceived luminance in luminance-preserving despill', () => {
    const hairWithSpill: [number, number, number] = [0.3, 0.7, 0.3];
    const despilled = applyDespillGreen(hairWithSpill, 'luminance-preserving', 1.0);

    // Green is reduced
    expect(despilled[1]).toBeLessThan(hairWithSpill[1]);
    // Red and Blue receive compensation so subject doesn't turn unnaturally dark
    expect(despilled[0]).toBeGreaterThan(hairWithSpill[0]);
    expect(despilled[2]).toBeGreaterThan(hairWithSpill[2]);
  });

  it('suppresses blue spill correctly', () => {
    const blueSpill: [number, number, number] = [0.2, 0.2, 0.8];
    const despilled = applyDespillBlue(blueSpill, 'average', 1.0);
    expect(despilled[2]).toBeCloseTo(0.2, 4);
  });

  it('computes color-difference matte for green screen', () => {
    const config = defaultKeyerConfig();

    // Pure green screen background
    const screenPixel: [number, number, number] = [0, 1, 0];
    const screenMatte = computeMatte(screenPixel, config);
    expect(screenMatte).toBeCloseTo(0, 2); // Transparent

    // Subject pixel (e.g. skin tone: [0.8, 0.5, 0.4])
    const subjectPixel: [number, number, number] = [0.8, 0.5, 0.4];
    const subjectMatte = computeMatte(subjectPixel, config);
    expect(subjectMatte).toBeCloseTo(1, 2); // Opaque
  });

  it('computes luma matte for dark/light extraction', () => {
    const lumaConfig = {
      ...defaultKeyerConfig(),
      type: 'luma' as const,
      thresholdLow: 0.2,
      thresholdHigh: 0.8,
    };

    // Black pixel -> transparent
    expect(computeMatte([0, 0, 0], lumaConfig)).toBe(0);
    // White pixel -> opaque
    expect(computeMatte([1, 1, 1], lumaConfig)).toBe(1);
  });

  it('runs complete processKey pipeline', () => {
    const config = defaultKeyerConfig();
    const input: [number, number, number, number] = [0, 1, 0, 1]; // pure green screen
    const output = processKey(input, config);

    expect(output[3]).toBeCloseTo(0, 2); // Alpha knocked out
  });
});
