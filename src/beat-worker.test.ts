import { describe, expect, it } from 'vitest';
import { detectAudioBeatsAsync } from './beat-worker';
import { snapToNearestBeat } from './beat-detection';

describe('Beat Detection Worker & 8ms Magnetic Snapping', () => {
  it('detects percussive onsets and estimates BPM asynchronously', async () => {
    const sampleRate = 16000;
    const durationSec = 4;
    const samples = new Float32Array(sampleRate * durationSec);

    // Create pulses every 0.5s (120 BPM)
    const beatInterval = 0.5;
    for (let t = 0.5; t < durationSec; t += beatInterval) {
      const startIdx = Math.round(t * sampleRate);
      for (let i = 0; i < 400; i++) {
        samples[startIdx + i] = Math.sin(i * 0.1) * Math.exp(-i / 100);
      }
    }

    const progressMessages: string[] = [];
    const result = await detectAudioBeatsAsync(
      samples,
      { sampleRate, sensitivity: 1.0 },
      undefined,
      (msg) => progressMessages.push(msg),
    );

    expect(result.beats.length).toBeGreaterThan(0);
    expect(result.beatTimes.length).toBe(result.beats.length);
    expect(result.bpm).toBeGreaterThanOrEqual(60);
    expect(result.bpm).toBeLessThanOrEqual(180);

    // Beat times should align closely with the 0.5s intervals
    const firstBeat = result.beatTimes[0];
    expect(firstBeat).toBeGreaterThan(0.3);
    expect(firstBeat).toBeLessThan(0.7);
  });

  it('magnetically snaps within 8ms tolerance', () => {
    const beats = [
      { time: 1.0, intensity: 0.9, kind: 'downbeat' as const },
      { time: 1.5, intensity: 0.8, kind: 'beat' as const },
      { time: 2.0, intensity: 0.9, kind: 'downbeat' as const },
    ];

    // Inside 8ms (0.008s) window -> snaps
    const closeSnap = snapToNearestBeat(1.006, beats, 0.008);
    expect(closeSnap.snapped).toBe(true);
    expect(closeSnap.time).toBe(1.0);

    // Outside 8ms (0.008s) window -> does not snap
    const farSnap = snapToNearestBeat(1.012, beats, 0.008);
    expect(farSnap.snapped).toBe(false);
    expect(farSnap.time).toBe(1.012);
  });

  it('handles silence gracefully with no false positives', async () => {
    const silentSamples = new Float32Array(16000);
    const result = await detectAudioBeatsAsync(silentSamples, { sampleRate: 16000 });
    expect(result.beats).toHaveLength(0);
    expect(result.beatTimes).toHaveLength(0);
  });
});
