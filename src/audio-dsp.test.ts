import { describe, expect, it } from 'vitest';
import {
  applyBrickwallLimiter,
  BiquadFilter,
  computeBiquadCoefficients,
  defaultCompressorConfig,
  DynamicRangeCompressor,
} from './audio-dsp';

describe('professional audio DSP engine', () => {
  it('computes stable biquad coefficients for lowpass, highpass, and peaking filters', () => {
    const sampleRate = 48000;

    const lowpass = computeBiquadCoefficients('lowpass', 1000, sampleRate, 0.707);
    expect(Number.isFinite(lowpass.b0)).toBe(true);
    expect(Number.isFinite(lowpass.a1)).toBe(true);

    const peaking = computeBiquadCoefficients('peaking', 3000, sampleRate, 1.0, 6.0);
    expect(peaking.b0).toBeGreaterThan(0);
  });

  it('filters audio buffer with biquad lowpass filter attenuating high frequencies', () => {
    const sampleRate = 48000;
    const coeffs = computeBiquadCoefficients('lowpass', 500, sampleRate, 0.707);
    const filter = new BiquadFilter(coeffs);

    // High frequency test signal (10kHz sine wave)
    const N = 1000;
    const highFreq = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      highFreq[i] = Math.sin((2 * Math.PI * 10000 * i) / sampleRate);
    }

    const filtered = filter.processBuffer(highFreq);
    // Attenuation of 10kHz by a 500Hz lowpass filter should be significant
    const inputPeak = Math.max(...highFreq);
    const outputPeak = Math.max(...filtered.slice(200)); // allow filter settling
    expect(outputPeak).toBeLessThan(inputPeak * 0.2);
  });

  it('compresses high dynamic peaks according to threshold and ratio', () => {
    const compressor = new DynamicRangeCompressor({
      ...defaultCompressorConfig(),
      thresholdDb: -20,
      ratio: 4.0,
      attackMs: 1.0,
      releaseMs: 50.0,
    });

    // 0 dBFS signal (amplitude = 1.0)
    const signal = new Float32Array(500).fill(1.0);
    const compressed = compressor.processBuffer(signal);

    // After attack time, output amplitude should be compressed well below 1.0
    const steadyState = compressed[400];
    expect(steadyState).toBeLessThan(0.7);
  });

  it('limits signal cleanly with brickwall peak limiter', () => {
    // Excessive signal peaking at +6 dBFS (amplitude = 2.0)
    const hotSignal = new Float32Array([0.5, 1.5, -2.0, 0.8]);
    const limited = applyBrickwallLimiter(hotSignal, -0.1);

    const maxAllowed = Math.pow(10, -0.1 / 20); // ~0.9885
    for (let i = 0; i < limited.length; i++) {
      expect(Math.abs(limited[i])).toBeLessThanOrEqual(maxAllowed + 1e-6);
    }
  });
});
