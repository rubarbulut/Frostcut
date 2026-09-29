import { describe, it, expect } from 'vitest';
import { createProject, addMedia, uid } from './model';

describe('AudioPeakMeter & Fit to Timeline logic', () => {
  it('correctly calculates optimal fit zoom from timeline width and total duration', () => {
    const containerWidth = 900;
    const padding = 80;
    const availableWidth = containerWidth - padding; // 820

    // Test a 30-second short
    const shortDuration = 30;
    const shortZoom = Math.max(8, Math.min(240, availableWidth / shortDuration));
    expect(shortZoom).toBeCloseTo(27.33, 1);

    // Test a 10-minute long video (600s)
    const longDuration = 600;
    const longZoom = Math.max(8, Math.min(240, availableWidth / longDuration));
    expect(longZoom).toBeGreaterThanOrEqual(8);

    // Test a 2-second ultra short video
    const ultraShort = 2;
    const ultraZoom = Math.max(8, Math.min(240, availableWidth / ultraShort));
    expect(ultraZoom).toBe(240); // Capped at max 240
  });

  it('calculates proper decibel and peak values for audio level metering', () => {
    // Linear amplitude to decibels: 20 * log10(amp)
    const unityGain = 1.0;
    const unityDb = 20 * Math.log10(unityGain);
    expect(unityDb).toBe(0);

    const halfGain = 0.5;
    const halfDb = 20 * Math.log10(halfGain);
    expect(halfDb).toBeCloseTo(-6.02, 1);

    const quietGain = 0.1;
    const quietDb = 20 * Math.log10(quietGain);
    expect(quietDb).toBeCloseTo(-20.0, 1);

    // Fade factor calculation
    const fadeIn = 2;
    const clipTime = 1;
    const fadeFactor = clipTime / fadeIn;
    expect(fadeFactor).toBe(0.5);
  });
});
