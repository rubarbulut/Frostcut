import { describe, expect, it } from 'vitest';
import {
  applyAscCdl,
  applyExposure,
  applyLiftGammaGain,
  applyWhiteBalance,
  gradePixel,
  linearToRgb,
  luminance,
  rgbToLinear,
  srgbToLinear,
  linearToSrgb,
} from './color-science';

describe('color science engine', () => {
  it('performs accurate round-trip sRGB to Linear and back', () => {
    const samples = [0, 0.01, 0.04045, 0.18, 0.5, 0.75, 1.0];
    for (const s of samples) {
      const lin = srgbToLinear(s);
      const roundTrip = linearToSrgb(lin);
      expect(roundTrip).toBeCloseTo(s, 4);
    }

    const rgb: [number, number, number] = [0.2, 0.5, 0.8];
    const linear = rgbToLinear(rgb);
    const back = linearToRgb(linear);
    expect(back[0]).toBeCloseTo(rgb[0], 4);
    expect(back[1]).toBeCloseTo(rgb[1], 4);
    expect(back[2]).toBeCloseTo(rgb[2], 4);
  });

  it('calculates standard Rec.709 luminance', () => {
    expect(luminance([1, 1, 1])).toBeCloseTo(1.0, 4);
    expect(luminance([0, 0, 0])).toBe(0);
    // Pure green is highest luminance contributor
    expect(luminance([0, 1, 0])).toBeCloseTo(0.7152, 4);
  });

  it('applies ASC-CDL slope, offset, power, and saturation', () => {
    const color: [number, number, number] = [0.5, 0.5, 0.5];
    const cdlIdentity = applyAscCdl(color, {
      slope: [1, 1, 1],
      offset: [0, 0, 0],
      power: [1, 1, 1],
      saturation: 1,
    });
    expect(cdlIdentity[0]).toBeCloseTo(0.5, 4);
    expect(cdlIdentity[1]).toBeCloseTo(0.5, 4);
    expect(cdlIdentity[2]).toBeCloseTo(0.5, 4);

    // Test slope scaling
    const cdlSlope = applyAscCdl(color, { slope: [2, 1, 0.5] });
    expect(cdlSlope[0]).toBeCloseTo(1.0, 4);
    expect(cdlSlope[1]).toBeCloseTo(0.5, 4);
    expect(cdlSlope[2]).toBeCloseTo(0.25, 4);

    // Test desaturation to gray
    const desaturated = applyAscCdl([0.8, 0.2, 0.1], { saturation: 0 });
    expect(desaturated[0]).toBeCloseTo(desaturated[1], 4);
    expect(desaturated[1]).toBeCloseTo(desaturated[2], 4);
  });

  it('applies Lift Gamma Gain grading correctly', () => {
    const dark: [number, number, number] = [0.05, 0.05, 0.05];
    const lifted = applyLiftGammaGain(dark, { lift: [0.1, 0, 0] });
    expect(lifted[0]).toBeGreaterThan(dark[0]);
    expect(lifted[1]).toBeCloseTo(dark[1], 4);

    const mid: [number, number, number] = [0.5, 0.5, 0.5];
    const gammaBoost = applyLiftGammaGain(mid, { gamma: [1.5, 1.5, 1.5] });
    expect(gammaBoost[0]).toBeGreaterThan(0.5);

    const bright: [number, number, number] = [0.8, 0.8, 0.8];
    const gainAttenuate = applyLiftGammaGain(bright, { gain: [0.5, 0.5, 0.5] });
    expect(gainAttenuate[0]).toBeCloseTo(0.4, 4);
  });

  it('applies exposure stops cleanly', () => {
    const color: [number, number, number] = [0.25, 0.25, 0.25];
    const plusOne = applyExposure(color, 1);
    expect(plusOne[0]).toBeCloseTo(0.5, 4);
    const minusOne = applyExposure(color, -1);
    expect(minusOne[0]).toBeCloseTo(0.125, 4);
  });

  it('adjusts temperature and tint without negative channel blowouts', () => {
    const neutral: [number, number, number] = [0.5, 0.5, 0.5];
    const warmer = applyWhiteBalance(neutral, 50, 0);
    expect(warmer[0]).toBeGreaterThan(warmer[2]);

    const cooler = applyWhiteBalance(neutral, -50, 0);
    expect(cooler[2]).toBeGreaterThan(cooler[0]);
  });

  it('performs full grading pipeline in gradePixel', () => {
    const original: [number, number, number] = [0.4, 0.4, 0.4];
    const graded = gradePixel(original, {
      enabled: true,
      exposure: 0.5,
      temperature: 10,
      tint: -5,
      cdl: { slope: [1.1, 1.0, 0.9], saturation: 1.1 },
    });

    expect(graded.every((c) => c >= 0 && c <= 1)).toBe(true);
  });
});
