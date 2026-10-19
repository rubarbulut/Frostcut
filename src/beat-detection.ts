export type BeatMarker = {
  time: number; // in seconds
  intensity: number; // 0 to 1
  kind: 'downbeat' | 'beat' | 'snare';
};

export type BeatAnalysisResult = {
  bpm: number;
  beats: BeatMarker[];
  downbeats: number[];
  averageEnergy: number;
};

export type BeatDetectionOptions = {
  sampleRate?: number;
  minBpm?: number;
  maxBpm?: number;
  sensitivity?: number; // 0.5 to 2.0 (higher = detects more beats)
  band?: 'all' | 'bass' | 'mids';
};

/**
 * Calculates instantaneous short-term energy envelopes across sliding analysis windows.
 */
export function computeEnergyEnvelope(
  samples: Float32Array,
  windowSize = 1024,
  hopSize = 512,
): Float32Array {
  const numHops = Math.max(1, Math.floor((samples.length - windowSize) / hopSize));
  const envelope = new Float32Array(numHops);

  for (let h = 0; h < numHops; h++) {
    const start = h * hopSize;
    let sum = 0;
    for (let i = 0; i < windowSize; i++) {
      const s = samples[start + i];
      sum += s * s;
    }
    envelope[h] = Math.sqrt(sum / windowSize);
  }

  return envelope;
}

/**
 * Computes Spectral Flux / positive energy increase over time.
 */
export function computeSpectralFlux(envelope: Float32Array): Float32Array {
  const flux = new Float32Array(envelope.length);
  for (let i = 1; i < envelope.length; i++) {
    const diff = envelope[i] - envelope[i - 1];
    flux[i] = diff > 0 ? diff : 0;
  }
  return flux;
}

/**
 * Estimates BPM from inter-onset intervals (IOI histogram).
 */
export function estimateBpmFromIntervals(
  beatTimes: number[],
  minBpm = 60,
  maxBpm = 180,
): number {
  if (beatTimes.length < 3) return 120; // sensible fallback

  const intervals: number[] = [];
  for (let i = 1; i < beatTimes.length; i++) {
    const dt = beatTimes[i] - beatTimes[i - 1];
    if (dt >= 60 / maxBpm && dt <= 60 / minBpm) {
      intervals.push(dt);
    }
  }

  if (intervals.length === 0) return 120;

  // Find median interval
  intervals.sort((a, b) => a - b);
  const medianDt = intervals[Math.floor(intervals.length / 2)];
  const rawBpm = Math.round(60 / medianDt);

  return Math.max(minBpm, Math.min(maxBpm, rawBpm));
}

/**
 * Core beat and rhythm detection engine.
 * Analyzes audio PCM buffers, detects transient onsets, estimates BPM, and generates beat markers.
 */
export function analyzeAudioBeats(
  samples: Float32Array,
  options: BeatDetectionOptions = {},
): BeatAnalysisResult {
  const sampleRate = options.sampleRate ?? 44100;
  const minBpm = options.minBpm ?? 60;
  const maxBpm = options.maxBpm ?? 180;
  const sensitivity = options.sensitivity ?? 1.0;

  const windowSize = 1024;
  const hopSize = 512;
  const secondsPerHop = hopSize / sampleRate;

  const envelope = computeEnergyEnvelope(samples, windowSize, hopSize);
  const flux = computeSpectralFlux(envelope);

  // Adaptive thresholding using local moving average
  const localWindow = Math.round(sampleRate / (2 * hopSize)); // ~0.5 second window
  const beats: BeatMarker[] = [];
  let totalEnergy = 0;

  for (let i = 0; i < flux.length; i++) {
    totalEnergy += envelope[i];
    const wStart = Math.max(0, i - localWindow);
    const wEnd = Math.min(flux.length, i + localWindow);

    let localMean = 0;
    for (let k = wStart; k < wEnd; k++) {
      localMean += flux[k];
    }
    localMean /= Math.max(1, wEnd - wStart);

    const threshold = localMean * (1.5 / Math.max(0.1, sensitivity));

    // Peak picking: flux must exceed adaptive threshold and be a local maximum
    if (flux[i] > threshold && flux[i] > 0.005) {
      const isPeak =
        (i === 0 || flux[i] >= flux[i - 1]) &&
        (i === flux.length - 1 || flux[i] >= flux[i + 1]);

      if (isPeak) {
        const time = i * secondsPerHop;
        // Avoid duplicate detections closer than min interval (e.g. 150ms)
        const lastTime = beats.length > 0 ? beats[beats.length - 1].time : -1;
        if (time - lastTime > 0.15) {
          const intensity = Math.min(1.0, flux[i] / (threshold * 2.0));
          beats.push({
            time,
            intensity,
            kind: intensity > 0.8 ? 'downbeat' : 'beat',
          });
        }
      }
    }
  }

  const beatTimes = beats.map((b) => b.time);
  const bpm = estimateBpmFromIntervals(beatTimes, minBpm, maxBpm);
  const downbeats = beats.filter((b) => b.kind === 'downbeat').map((b) => b.time);
  const averageEnergy = totalEnergy / Math.max(1, flux.length);

  return {
    bpm,
    beats,
    downbeats,
    averageEnergy,
  };
}

/**
 * Snaps a timeline timestamp to the nearest detected beat within a tolerance window.
 * If no beat is within tolerance, returns the original timestamp unchanged.
 */
export function snapToNearestBeat(
  time: number,
  beats: BeatMarker[],
  tolerance = 0.1, // seconds
): { time: number; snapped: boolean; beat?: BeatMarker } {
  if (!beats.length) return { time, snapped: false };

  let closestDist = Infinity;
  let closestBeat: BeatMarker | undefined;

  for (const b of beats) {
    const dist = Math.abs(b.time - time);
    if (dist < closestDist) {
      closestDist = dist;
      closestBeat = b;
    }
  }

  if (closestBeat && closestDist <= tolerance) {
    return { time: closestBeat.time, snapped: true, beat: closestBeat };
  }

  return { time, snapped: false };
}
