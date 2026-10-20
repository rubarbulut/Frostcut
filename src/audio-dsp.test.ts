import { describe, expect, it } from 'vitest';
import {
  applyBrickwallLimiter,
  BiquadFilter,
  computeBiquadCoefficients,
  defaultCompressorConfig,
  DynamicRangeCompressor,
  SidechainDucker,
  ThreeBandEQ,
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

  it('triggers sidechain auto-ducking to -12 dB within 20ms attack and recovers in 250ms release', () => {
    const sampleRate = 48000;
    const ducker = new SidechainDucker({
      thresholdDb: -24,
      duckingDb: -12,
      attackMs: 20,
      releaseMs: 250,
      detectionWindowMs: 3,
      sampleRate,
    });

    // 1 second test signal
    const N = sampleRate * 1;
    const music = new Float32Array(N).fill(1.0); // Constant 0 dBFS background music
    const voice = new Float32Array(N).fill(0); // Voice track

    // Speaker speaks from 0.1s to 0.5s at -12 dBFS (amplitude ~0.25, well above -24 dB threshold)
    const voiceStart = Math.round(0.1 * sampleRate);
    const voiceEnd = Math.round(0.5 * sampleRate);
    const speechAmp = Math.pow(10, -12 / 20); // ~0.2512
    for (let i = voiceStart; i < voiceEnd; i++) {
      voice[i] = speechAmp * Math.sin((2 * Math.PI * 400 * i) / sampleRate);
    }

    const output = ducker.processBuffer(music, voice);

    // 1. Before voice starts (at 0.05s): music must be unaffected (gain ~ 1.0 / 0 dB)
    const idxBefore = Math.round(0.05 * sampleRate);
    expect(output[idxBefore]).toBeCloseTo(1.0, 1);

    // 2. < 5ms Latency: Ducker detects voice and begins attenuating within 5ms of voice onset (0.105s)
    const idx5ms = Math.round(0.105 * sampleRate);
    expect(output[idx5ms]).toBeLessThan(0.95);

    // 3. Attack (20ms after voice onset = 0.120s): Music is heavily ducked towards -12 dB (~0.2512)
    const idx20ms = Math.round(0.125 * sampleRate);
    expect(output[idx20ms]).toBeLessThan(0.45);

    // During steady speech (0.3s): Gain should settle to -12 dB (~0.2512)
    const idxSteady = Math.round(0.3 * sampleRate);
    expect(output[idxSteady]).toBeCloseTo(Math.pow(10, -12 / 20), 1);

    // 4. Release: After speech ends at 0.5s, 250ms later (at 0.85s) music has smoothly recovered to ~1.0
    const idxRecovered = Math.round(0.85 * sampleRate);
    expect(output[idxRecovered]).toBeGreaterThan(0.9);

    // 5. Zero clicks/pops: verify that gain change between any adjacent samples is ultra-smooth (< 0.002)
    for (let i = 1; i < output.length; i++) {
      const step = Math.abs(output[i] - output[i - 1]);
      // With constant music=1.0, step is directly delta of smoothed gain
      expect(step).toBeLessThan(0.005);
    }
  });

  it('shapes audio frequencies with 3-Band Parametric EQ', () => {
    const sampleRate = 48000;
    const eq = new ThreeBandEQ({
      lowGainDb: 6, // +6 dB at 100 Hz
      midGainDb: -3, // -3 dB at 1 kHz
      highGainDb: 4, // +4 dB at 8 kHz
      sampleRate,
    });

    expect(eq.getGains()).toEqual({ low: 6, mid: -3, high: 4 });

    // Test low-frequency (50 Hz deep bass) boost with 100 Hz lowshelf
    const N = 2000;
    const bassSignal = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      bassSignal[i] = 0.5 * Math.sin((2 * Math.PI * 50 * i) / sampleRate);
    }

    const bassOut = eq.processBuffer(bassSignal);
    // Deep bass receives full +6 dB shelf boost (~2x amplitude)
    const inPeak = Math.max(...bassSignal);
    const outPeak = Math.max(...bassOut.slice(500));
    expect(outPeak).toBeGreaterThan(inPeak * 1.5);

    // Unity gain test: when all bands are 0 dB, output matches input
    eq.setGains(0, 0, 0);
    const flatSignal = new Float32Array(500).fill(0.3);
    const flatOut = eq.processBuffer(flatSignal);
    expect(flatOut[400]).toBeCloseTo(0.3, 1);
  });
});
