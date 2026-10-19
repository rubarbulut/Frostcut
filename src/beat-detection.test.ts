import { describe, expect, it } from 'vitest';
import {
  analyzeAudioBeats,
  computeEnergyEnvelope,
  computeSpectralFlux,
  estimateBpmFromIntervals,
  snapToNearestBeat,
} from './beat-detection';

describe('audio beat and rhythm detection engine', () => {
  it('computes short-term energy envelope and spectral flux', () => {
    // Generate synthetic audio with sudden volume bursts
    const sampleRate = 44100;
    const duration = 1.0;
    const samples = new Float32Array(sampleRate * duration);

    // Add a transient spike at 0.5s
    const spikeIdx = Math.floor(sampleRate * 0.5);
    for (let i = 0; i < 200; i++) {
      samples[spikeIdx + i] = 0.9 * Math.sin(i * 0.5);
    }

    const envelope = computeEnergyEnvelope(samples, 1024, 512);
    expect(envelope.length).toBeGreaterThan(0);

    const flux = computeSpectralFlux(envelope);
    expect(flux.length).toBe(envelope.length);

    // The flux should spike near 0.5s
    const expectedHop = Math.floor(spikeIdx / 512);
    const peakFlux = Math.max(...flux.slice(Math.max(0, expectedHop - 2), expectedHop + 3));
    expect(peakFlux).toBeGreaterThan(0);
  });

  it('detects rhythmic beats at 120 BPM from synthetic metronome audio', () => {
    const sampleRate = 44100;
    const duration = 3.0; // 3 seconds
    const samples = new Float32Array(sampleRate * duration);

    // 120 BPM = 2 beats per second = 1 beat every 0.5 seconds
    const intervalSeconds = 0.5;
    for (let t = 0; t < duration; t += intervalSeconds) {
      const idx = Math.floor(t * sampleRate);
      for (let i = 0; i < 500 && idx + i < samples.length; i++) {
        samples[idx + i] = 0.8 * Math.exp(-i / 100);
      }
    }

    const result = analyzeAudioBeats(samples, { sampleRate, sensitivity: 1.2 });
    expect(result.beats.length).toBeGreaterThanOrEqual(4);
    expect(result.bpm).toBeCloseTo(120, -1); // Close to 120 BPM
  });

  it('estimates BPM accurately from clean interval sequence', () => {
    // 0.5s intervals corresponds to 120 BPM
    const beatTimes = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0];
    const bpm = estimateBpmFromIntervals(beatTimes);
    expect(bpm).toBe(120);

    // 0.4s intervals corresponds to 150 BPM
    const beatTimes150 = [0.4, 0.8, 1.2, 1.6, 2.0];
    const bpm150 = estimateBpmFromIntervals(beatTimes150);
    expect(bpm150).toBe(150);
  });

  it('snaps timestamps to nearest beat within tolerance window', () => {
    const beats = [
      { time: 1.0, intensity: 0.9, kind: 'downbeat' as const },
      { time: 2.0, intensity: 0.8, kind: 'beat' as const },
    ];

    // Timestamp 1.04s should snap to 1.0s (within 0.1s tolerance)
    const snapped = snapToNearestBeat(1.04, beats, 0.1);
    expect(snapped.snapped).toBe(true);
    expect(snapped.time).toBe(1.0);

    // Timestamp 1.3s is outside 0.1s tolerance -> not snapped
    const unSnapped = snapToNearestBeat(1.3, beats, 0.1);
    expect(unSnapped.snapped).toBe(false);
    expect(unSnapped.time).toBe(1.3);
  });
});
