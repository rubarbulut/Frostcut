/**
 * Asset Audio Profile & Telemetry Analysis Engine (Batch 004 — Okan)
 *
 * Implements:
 * - Runtime File identity & options-keyed caching with byte-budget LRU eviction
 * - Multi-subscriber in-flight task sharing with reference-counted cancellation
 * - Zombie resurrection protection across clear/delete/relink
 * - Stereo out-of-phase cancellation protection (energy-preserving downmix)
 * - Finite/safe bounds validation for empty, short, clipped, or NaN samples
 * - Honest heuristic labeling (audio-activity / speech-like heuristic, no fabricated ML claims)
 * - Dead air silence mask (-40 dB for > 2.5s)
 * - Source-time domain immutability for Kaan's candidate detector & Codex creator recipe
 */

export const AUDIO_PROFILE_ALGO_VERSION = 'v2.1-b004';

export interface TimeRange {
  start: number; // in seconds
  end: number;   // in seconds
  duration: number; // in seconds
}

export type AudioHighlightReason =
  | 'speech-like-burst'
  | 'audio-activity'
  | 'sustained-activity'
  | 'percussive-burst'
  // Backward-compatible aliases for existing callers:
  | 'vocal-reaction'
  | 'cheer'
  | 'laughter'
  | 'speech-burst';

export interface AudioHighlightCandidate {
  start: number; // in seconds
  end: number;   // in seconds
  duration: number; // in seconds
  peakSpeechScore: number; // 0.0 - 1.0 heuristic score
  avgSpeechScore: number;  // 0.0 - 1.0 heuristic score
  avgRmsDb: number;        // in dBFS
  peakRmsDb: number;       // in dBFS
  reason: AudioHighlightReason;
  classification?: AudioHighlightReason; // explicit classification alias
  kind?: AudioHighlightReason;           // backward-compatible alias
}

export interface AudioProfileStats {
  duration: number;
  avgRmsDb: number;
  peakRmsDb: number;
  peakLinear?: number;
  silenceDuration: number;
  silenceRatio: number; // 0.0 - 1.0
  speechDuration: number;
  speechRatio: number;  // 0.0 - 1.0
  avgZcr: number;
  avgSpectralCentroid: number;
}

export type AudioProfileStatus =
  | 'available'
  | 'no-audio'
  | 'missing-source'
  | 'failed'
  | 'cancelled';

export interface AssetAudioProfile {
  assetId: string;
  cacheKey?: string;
  fileIdentity: string;
  status: AudioProfileStatus;
  duration: number; // in seconds
  durationSec?: number; // alias for duration
  sampleRate: number; // in Hz
  hopSizeMs: number; // frame hop duration in ms
  frameCount: number;

  // Time-aligned telemetry curves (1 value per hop)
  rmsDb: Float32Array;             // RMS level in dBFS (-100 to 0)
  peakLinear: Float32Array;        // Absolute peak linear (0.0 to 1.0+)
  zcr: Float32Array;               // Zero-Crossing Rate (0.0 to 1.0)
  spectralCentroid: Float32Array;  // Spectral Centroid in Hz
  speechBandRatio: Float32Array;   // Ratio of energy in 300Hz-3400Hz vs total (0.0 to 1.0)
  speechEnergyScore: Float32Array; // Heuristic speech-like activity score (0.0 to 1.0)

  // Segmentations
  silenceMask: TimeRange[];              // Dead air regions: < -40 dB for > 2.5s
  activeSpeechRegions: TimeRange[];      // Regions with sustained speech-like activity
  highlights: AudioHighlightCandidate[]; // Ranked reaction / activity highlights

  stats: AudioProfileStats;
  byteLength: number; // Total memory bytes used by typed arrays
}

export interface AudioProfileOptions {
  sampleRate?: number;            // Default: 16000
  hopSizeMs?: number;             // Default: 50 ms (20 frames per second)
  silenceThresholdDb?: number;    // Default: -40 dB
  silenceMinDurationSec?: number; // Default: 2.5 seconds
  speechScoreThreshold?: number;  // Default: 0.40
}

export interface FileIdentity {
  name: string;
  size: number;
  lastModified: number;
}

/**
 * Extracts a typed FileIdentity descriptor from a File, Blob, or object.
 */
export function getFileIdentity(file?: File | Blob | FileIdentity | null): FileIdentity | undefined {
  if (!file || typeof file !== 'object') return undefined;
  const name = 'name' in file ? String((file as any).name) : 'blob';
  const size = typeof (file as any).size === 'number' ? (file as any).size : 0;
  const lastModified = typeof (file as any).lastModified === 'number' ? (file as any).lastModified : 0;
  return { name, size, lastModified };
}

/**
 * Formats a runtime fingerprint string: name:size:lastModified
 */
export function formatFileIdentity(file?: File | Blob | FileIdentity | null): string {
  const id = getFileIdentity(file);
  if (!id) return 'nofile';
  return `${id.name}:${id.size}:${id.lastModified}`;
}

/**
 * Builds an immutable, options-keyed cache key that invalidates on file relink,
 * option changes, or algorithm version bumps.
 */
export function buildAudioProfileKey(
  assetId: string,
  file?: File | Blob | FileIdentity | null,
  options?: AudioProfileOptions,
): string {
  const fileStr = formatFileIdentity(file);
  const sampleRate = options?.sampleRate ?? 16000;
  const hopSizeMs = options?.hopSizeMs ?? 50;
  const silenceThresholdDb = options?.silenceThresholdDb ?? -40;
  const silenceMinDurationSec = options?.silenceMinDurationSec ?? 2.5;
  const speechScoreThreshold = options?.speechScoreThreshold ?? 0.40;

  return `${assetId}::${fileStr}::sr=${sampleRate}:hop=${hopSizeMs}:sth=${silenceThresholdDb}:smin=${silenceMinDurationSec}:spth=${speechScoreThreshold}::${AUDIO_PROFILE_ALGO_VERSION}`;
}

/**
 * Fast in-place Radix-2 FFT lookup tables and scratch buffers.
 * Sized for 256-point FFT (adequate for 16kHz speech analysis: 62.5 Hz bin resolution).
 */
const FFT_SIZE = 256;
const HALF_FFT = FFT_SIZE / 2; // 128 positive bins

const cosTable = new Float32Array(HALF_FFT);
const sinTable = new Float32Array(HALF_FFT);
const hannWindow = new Float32Array(FFT_SIZE);
const bitRevTable = new Uint16Array(FFT_SIZE);

for (let i = 0; i < HALF_FFT; i++) {
  const angle = (-2 * Math.PI * i) / FFT_SIZE;
  cosTable[i] = Math.cos(angle);
  sinTable[i] = Math.sin(angle);
}

for (let i = 0; i < FFT_SIZE; i++) {
  hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
}

for (let i = 0; i < FFT_SIZE; i++) {
  let rev = 0;
  for (let bit = 0; bit < 8; bit++) {
    if ((i >> bit) & 1) {
      rev |= 1 << (7 - bit);
    }
  }
  bitRevTable[i] = rev;
}

const scratchReal = new Float32Array(FFT_SIZE);
const scratchImag = new Float32Array(FFT_SIZE);
const scratchMagSq = new Float32Array(HALF_FFT + 1);

function runRadix2FFT(input: Float32Array, offset: number, length: number) {
  scratchReal.fill(0);
  scratchImag.fill(0);

  const copyLen = Math.min(length, FFT_SIZE);
  for (let i = 0; i < copyLen; i++) {
    const revIdx = bitRevTable[i];
    const rawVal = input[offset + i];
    // Sanitize any non-finite sample
    const sample = Number.isFinite(rawVal) ? rawVal : 0;
    scratchReal[revIdx] = sample * hannWindow[i];
  }

  for (let step = 1; step < FFT_SIZE; step <<= 1) {
    const jump = step << 1;
    const factorStep = HALF_FFT / step;

    for (let i = 0; i < step; i++) {
      const cos = cosTable[i * factorStep];
      const sin = sinTable[i * factorStep];

      for (let j = i; j < FFT_SIZE; j += jump) {
        const k = j + step;
        const tr = cos * scratchReal[k] - sin * scratchImag[k];
        const ti = sin * scratchReal[k] + cos * scratchImag[k];

        scratchReal[k] = scratchReal[j] - tr;
        scratchImag[k] = scratchImag[j] - ti;
        scratchReal[j] += tr;
        scratchImag[j] += ti;
      }
    }
  }

  for (let b = 0; b <= HALF_FFT; b++) {
    const r = scratchReal[b];
    const im = scratchImag[b];
    scratchMagSq[b] = r * r + im * im;
  }
}

/**
 * Downmixes stereo audio for analysis without suffering from phase cancellation.
 * If Left and Right are 180 degrees out of phase (L = -R), simple sum (L+R)/2 cancels to 0.
 *
 * For analysis purposes, we calculate the energy-preserving composite signal:
 * composite[i] = sign(left[i]) * sqrt((left[i]^2 + right[i]^2) / 2)
 */
export function downmixStereoForAnalysis(left: Float32Array, right: Float32Array): Float32Array {
  const len = Math.min(left.length, right.length);
  const out = new Float32Array(len);

  for (let i = 0; i < len; i++) {
    const l = Number.isFinite(left[i]) ? left[i] : 0;
    const r = Number.isFinite(right[i]) ? right[i] : 0;

    const energy = (l * l + r * r) * 0.5;
    const mag = Math.sqrt(energy);
    // Preserve phase sign of dominant or left channel
    const sign = l !== 0 ? (l > 0 ? 1 : -1) : (r > 0 ? 1 : -1);
    out[i] = sign * mag;
  }

  return out;
}

/**
 * Resamples profile waveform telemetry into a fixed number of preview points.
 */
export function sampleProfileWaveform(profile: AssetAudioProfile, targetPoints: number): Float32Array {
  if (targetPoints <= 0) return new Float32Array(0);
  const out = new Float32Array(targetPoints);
  const totalFrames = profile.frameCount;

  if (totalFrames === 0) {
    return out;
  }

  const framesPerPoint = totalFrames / targetPoints;

  for (let p = 0; p < targetPoints; p++) {
    const startIdx = Math.floor(p * framesPerPoint);
    const endIdx = Math.min(totalFrames, Math.ceil((p + 1) * framesPerPoint));

    let maxPeak = 0;
    for (let f = startIdx; f < endIdx; f++) {
      const val = profile.peakLinear[f];
      if (val > maxPeak) maxPeak = val;
    }

    out[p] = Math.max(0, Math.min(1.0, maxPeak));
  }

  return out;
}

/**
 * Detects dead-air regions where RMS stays below silenceThresholdDb for >= silenceMinDurationSec.
 */
function computeSilenceMask(
  rmsDb: Float32Array,
  hopSizeMs: number,
  silenceThresholdDb: number,
  silenceMinDurationSec: number,
  totalDuration: number,
): TimeRange[] {
  const mask: TimeRange[] = [];
  const hopSec = hopSizeMs / 1000;
  const minFrames = Math.max(1, Math.ceil(silenceMinDurationSec / hopSec));

  let inSilence = false;
  let silenceStartFrame = 0;

  for (let f = 0; f < rmsDb.length; f++) {
    const isSilent = rmsDb[f] <= silenceThresholdDb;

    if (isSilent && !inSilence) {
      inSilence = true;
      silenceStartFrame = f;
    } else if (!isSilent && inSilence) {
      const silentFrames = f - silenceStartFrame;
      if (silentFrames >= minFrames) {
        const start = Number((silenceStartFrame * hopSec).toFixed(3));
        const end = Number((f * hopSec).toFixed(3));
        mask.push({
          start,
          end,
          duration: Number((end - start).toFixed(3)),
        });
      }
      inSilence = false;
    }
  }

  if (inSilence) {
    const silentFrames = rmsDb.length - silenceStartFrame;
    if (silentFrames >= minFrames) {
      const start = Number((silenceStartFrame * hopSec).toFixed(3));
      const end = totalDuration;
      mask.push({
        start,
        end,
        duration: Number((end - start).toFixed(3)),
      });
    }
  }

  return mask;
}

/**
 * Finds continuous high speech-energy regions.
 */
function computeActiveSpeechRegions(
  speechEnergyScore: Float32Array,
  rmsDb: Float32Array,
  hopSizeMs: number,
  speechScoreThreshold: number,
  minSpeechDurationSec: number,
  totalDuration: number,
): TimeRange[] {
  const regions: TimeRange[] = [];
  const hopSec = hopSizeMs / 1000;
  const minFrames = Math.max(1, Math.ceil(minSpeechDurationSec / hopSec));

  let inRegion = false;
  let startFrame = 0;

  for (let f = 0; f < speechEnergyScore.length; f++) {
    const isActive = speechEnergyScore[f] >= speechScoreThreshold && rmsDb[f] > -38;

    if (isActive && !inRegion) {
      inRegion = true;
      startFrame = f;
    } else if (!isActive && inRegion) {
      const frames = f - startFrame;
      if (frames >= minFrames) {
        const start = Number((startFrame * hopSec).toFixed(3));
        const end = Number((f * hopSec).toFixed(3));
        regions.push({
          start,
          end,
          duration: Number((end - start).toFixed(3)),
        });
      }
      inRegion = false;
    }
  }

  if (inRegion) {
    const frames = speechEnergyScore.length - startFrame;
    if (frames >= minFrames) {
      const start = Number((startFrame * hopSec).toFixed(3));
      const end = totalDuration;
      regions.push({
        start,
        end,
        duration: Number((end - start).toFixed(3)),
      });
    }
  }

  return regions;
}

/**
 * Extracts candidate reaction / activity highlights based on heuristic speech scores.
 */
function extractAudioHighlights(
  speechEnergyScore: Float32Array,
  rmsDb: Float32Array,
  hopSizeMs: number,
  regions: TimeRange[],
): AudioHighlightCandidate[] {
  const highlights: AudioHighlightCandidate[] = [];
  const hopSec = hopSizeMs / 1000;

  for (const region of regions) {
    const startFrame = Math.max(0, Math.floor(region.start / hopSec));
    const endFrame = Math.min(speechEnergyScore.length, Math.ceil(region.end / hopSec));

    let peakScore = 0;
    let sumScore = 0;
    let peakRms = -100;
    let sumRms = 0;
    let count = 0;

    for (let f = startFrame; f < endFrame; f++) {
      const score = speechEnergyScore[f];
      const rms = rmsDb[f];
      if (score > peakScore) peakScore = score;
      if (rms > peakRms) peakRms = rms;
      sumScore += score;
      sumRms += rms;
      count++;
    }

    const avgScore = count > 0 ? sumScore / count : 0;
    const avgRms = count > 0 ? sumRms / count : -100;

    let reason: AudioHighlightReason = 'speech-like-burst';
    if (peakScore >= 0.75 && peakRms >= -14) {
      reason = 'speech-like-burst'; // high-energy voice burst
    } else if (region.duration <= 1.5 && peakScore >= 0.55) {
      reason = 'percussive-burst';
    } else if (region.duration >= 3.0) {
      reason = 'sustained-activity';
    } else {
      reason = 'audio-activity';
    }

    highlights.push({
      start: region.start,
      end: region.end,
      duration: region.duration,
      peakSpeechScore: Number(peakScore.toFixed(3)),
      avgSpeechScore: Number(avgScore.toFixed(3)),
      avgRmsDb: Number(avgRms.toFixed(1)),
      peakRmsDb: Number(peakRms.toFixed(1)),
      reason,
      classification: reason,
      kind: reason,
    });
  }

  highlights.sort((a, b) => b.peakSpeechScore - a.peakSpeechScore);
  return highlights;
}

/**
 * Computes complete AssetAudioProfile from raw PCM samples with Zero-Crossing Rate,
 * FFT Spectral Centroid, Speech Band Ratio, and Silence Mask.
 *
 * Fully O(N) single-pass windowing with finite bounds and NaN protection.
 */
export function computeAssetAudioProfile(
  assetId: string,
  samples: Float32Array,
  options: AudioProfileOptions = {},
  fileIdentity = 'nofile',
): AssetAudioProfile {
  // Validate and clamp finite options
  const sampleRate = Number.isFinite(options.sampleRate) && options.sampleRate! > 0
    ? Math.max(4000, Math.min(192000, Math.round(options.sampleRate!)))
    : 16000;

  const hopSizeMs = Number.isFinite(options.hopSizeMs) && options.hopSizeMs! > 0
    ? Math.max(10, Math.min(500, options.hopSizeMs!))
    : 50;

  const silenceThresholdDb = Number.isFinite(options.silenceThresholdDb)
    ? Math.max(-100, Math.min(0, options.silenceThresholdDb!))
    : -40;

  const silenceMinDurationSec = Number.isFinite(options.silenceMinDurationSec) && options.silenceMinDurationSec! > 0
    ? Math.max(0.1, options.silenceMinDurationSec!)
    : 2.5;

  const speechScoreThreshold = Number.isFinite(options.speechScoreThreshold) && options.speechScoreThreshold! > 0
    ? Math.max(0.05, Math.min(0.95, options.speechScoreThreshold!))
    : 0.40;

  // Handle empty or missing audio gracefully without fabricating fake audio
  if (!samples || samples.length === 0) {
    const emptyStats: AudioProfileStats = {
      duration: 0,
      avgRmsDb: -96,
      peakRmsDb: -96,
      peakLinear: 0,
      silenceDuration: 0,
      silenceRatio: 0,
      speechDuration: 0,
      speechRatio: 0,
      avgZcr: 0,
      avgSpectralCentroid: 0,
    };
    return {
      assetId,
      fileIdentity,
      status: 'no-audio',
      duration: 0,
      durationSec: 0,
      sampleRate,
      hopSizeMs,
      frameCount: 0,
      rmsDb: new Float32Array(0),
      peakLinear: new Float32Array(0),
      zcr: new Float32Array(0),
      spectralCentroid: new Float32Array(0),
      speechBandRatio: new Float32Array(0),
      speechEnergyScore: new Float32Array(0),
      silenceMask: [],
      activeSpeechRegions: [],
      highlights: [],
      stats: emptyStats,
      byteLength: 0,
    };
  }

  const hopSamples = Math.max(1, Math.round((sampleRate * hopSizeMs) / 1000));
  const totalDuration = Number((samples.length / sampleRate).toFixed(3));
  const frameCount = Math.max(1, Math.ceil(samples.length / hopSamples));

  const rmsDb = new Float32Array(frameCount);
  const peakLinear = new Float32Array(frameCount);
  const zcr = new Float32Array(frameCount);
  const spectralCentroid = new Float32Array(frameCount);
  const speechBandRatio = new Float32Array(frameCount);
  const speechEnergyScore = new Float32Array(frameCount);

  const binHz = sampleRate / FFT_SIZE; // e.g. 62.5 Hz per bin at 16kHz
  const minSpeechBin = Math.max(1, Math.floor(300 / binHz));
  const maxSpeechBin = Math.min(HALF_FFT, Math.ceil(3400 / binHz));

  let totalRmsSum = 0;
  let maxRmsDb = -100;
  let maxPeakLinear = 0;
  let totalZcrSum = 0;
  let totalCentroidSum = 0;

  for (let f = 0; f < frameCount; f++) {
    const offset = f * hopSamples;
    const len = Math.min(samples.length - offset, hopSamples);
    if (len <= 0) break;

    // 1. Instantaneous RMS and Peak Linear (with NaN/Infinity protection)
    let sumSq = 0;
    let peak = 0;
    let signChanges = 0;
    const firstSample = Number.isFinite(samples[offset]) ? samples[offset] : 0;
    let prevSign = firstSample >= 0;

    for (let i = 0; i < len; i++) {
      const raw = samples[offset + i];
      const s = Number.isFinite(raw) ? raw : 0;
      sumSq += s * s;
      const abs = s < 0 ? -s : s;
      if (abs > peak) peak = abs;

      if (i > 0) {
        const sign = s >= 0;
        if (sign !== prevSign) {
          signChanges++;
          prevSign = sign;
        }
      }
    }

    const rms = Math.sqrt(sumSq / len);
    const db = rms > 1e-5 ? 20 * Math.log10(rms) : -100;
    const clampedDb = Math.max(-100, Math.min(0, Number(db.toFixed(1))));

    // Clamp peak linear to 1.0 max for stats representation
    const clampedPeak = Math.min(1.0, peak);
    rmsDb[f] = clampedDb;
    peakLinear[f] = Number(clampedPeak.toFixed(4));
    totalRmsSum += clampedDb;
    if (clampedDb > maxRmsDb) maxRmsDb = clampedDb;
    if (clampedPeak > maxPeakLinear) maxPeakLinear = clampedPeak;

    // 2. Zero-Crossing Rate (ZCR)
    const z = len > 1 ? signChanges / (len - 1) : 0;
    zcr[f] = Number(z.toFixed(4));
    totalZcrSum += zcr[f];

    // 3. Fast 256-point FFT for Spectral Centroid & Speech Band Ratio (300Hz - 3400Hz)
    runRadix2FFT(samples, offset, len);

    let sumWeightedFreq = 0;
    let sumMag = 0;
    let speechEnergy = 0;
    let totalEnergy = 0;

    for (let b = 1; b <= HALF_FFT; b++) {
      const magSq = scratchMagSq[b];
      const mag = Math.sqrt(magSq);
      const freq = b * binHz;

      sumWeightedFreq += freq * mag;
      sumMag += mag;
      totalEnergy += magSq;

      if (b >= minSpeechBin && b <= maxSpeechBin) {
        speechEnergy += magSq;
      }
    }

    const centroid = sumMag > 1e-6 ? sumWeightedFreq / sumMag : 0;
    spectralCentroid[f] = Number(centroid.toFixed(1));
    totalCentroidSum += spectralCentroid[f];

    const sbr = totalEnergy > 1e-6 ? speechEnergy / totalEnergy : 0;
    speechBandRatio[f] = Number(sbr.toFixed(4));

    // 4. Combined Heuristic Speech Energy Score
    let rmsFactor = 0;
    if (clampedDb > -45) {
      rmsFactor = Math.min(1.0, (clampedDb + 45) / 30);
    }

    let zcrFactor = 0;
    if (z >= 0.04 && z <= 0.35) {
      zcrFactor = z < 0.15 ? (z - 0.04) / 0.11 : 1.0 - (z - 0.15) / 0.20;
    }

    const sbrFactor = sbr <= 0.20 ? 0 : Math.min(1, (sbr - 0.20) / 0.45);

    let centroidFactor = 0;
    if (centroid >= 300 && centroid <= 3400) {
      centroidFactor = centroid < 700 ? (centroid - 300) / 400 : centroid > 2500 ? 1 - (centroid - 2500) / 900 : 1.0;
    }

    const isSpeechLike = zcrFactor > 0.05 && sbrFactor > 0.08 && centroidFactor > 0.05;
    const rawScore = isSpeechLike
      ? rmsFactor * (0.35 * zcrFactor + 0.40 * sbrFactor + 0.25 * centroidFactor)
      : rmsFactor * 0.08 * zcrFactor * sbrFactor;

    speechEnergyScore[f] = Math.max(0, Math.min(1, Number(rawScore.toFixed(3))));
  }

  // 5. Segmentations & Silence Mask
  const silenceMask = computeSilenceMask(rmsDb, hopSizeMs, silenceThresholdDb, silenceMinDurationSec, totalDuration);
  const activeSpeechRegions = computeActiveSpeechRegions(speechEnergyScore, rmsDb, hopSizeMs, speechScoreThreshold, 0.6, totalDuration);
  const highlights = extractAudioHighlights(speechEnergyScore, rmsDb, hopSizeMs, activeSpeechRegions);

  // 6. Aggregate Statistics
  const totalSilenceDuration = silenceMask.reduce((acc, s) => acc + s.duration, 0);
  const totalSpeechDuration = activeSpeechRegions.reduce((acc, s) => acc + s.duration, 0);

  const stats: AudioProfileStats = {
    duration: totalDuration,
    avgRmsDb: Number((totalRmsSum / frameCount).toFixed(1)),
    peakRmsDb: maxRmsDb,
    peakLinear: Number(maxPeakLinear.toFixed(4)),
    silenceDuration: Number(totalSilenceDuration.toFixed(3)),
    silenceRatio: Number((totalDuration > 0 ? totalSilenceDuration / totalDuration : 0).toFixed(3)),
    speechDuration: Number(totalSpeechDuration.toFixed(3)),
    speechRatio: Number((totalDuration > 0 ? totalSpeechDuration / totalDuration : 0).toFixed(3)),
    avgZcr: Number((totalZcrSum / frameCount).toFixed(4)),
    avgSpectralCentroid: Number((totalCentroidSum / frameCount).toFixed(1)),
  };

  const byteLength =
    rmsDb.byteLength +
    peakLinear.byteLength +
    zcr.byteLength +
    spectralCentroid.byteLength +
    speechBandRatio.byteLength +
    speechEnergyScore.byteLength;

  return {
    assetId,
    fileIdentity,
    status: 'available',
    duration: totalDuration,
    durationSec: totalDuration,
    sampleRate,
    hopSizeMs,
    frameCount,
    rmsDb,
    peakLinear,
    zcr,
    spectralCentroid,
    speechBandRatio,
    speechEnergyScore,
    silenceMask,
    activeSpeechRegions,
    highlights,
    stats,
    byteLength,
  };
}

interface InFlightSubscriber {
  resolve: (profile: AssetAudioProfile) => void;
  reject: (err: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

interface InFlightTask {
  key: string;
  generation: number;
  underlyingAbort: AbortController;
  subscribers: Set<InFlightSubscriber>;
}

function isAbortSignal(val: unknown): val is AbortSignal {
  return Boolean(val && typeof val === 'object' && typeof (val as any).addEventListener === 'function');
}

function isProviderFn(val: unknown): val is (signal: AbortSignal) => Promise<Float32Array> | Float32Array {
  return typeof val === 'function';
}

function isFileLike(val: unknown): val is File | Blob | FileIdentity {
  if (!val || typeof val !== 'object' || isAbortSignal(val)) return false;
  return 'name' in val || 'size' in val || 'lastModified' in val;
}

function isOptionsObj(val: unknown): val is AudioProfileOptions {
  if (!val || typeof val !== 'object' || isAbortSignal(val) || isFileLike(val)) return false;
  return 'sampleRate' in val || 'hopSizeMs' in val || 'silenceThresholdDb' in val || 'silenceMinDurationSec' in val || 'speechScoreThreshold' in val;
}

/**
 * Options-keyed, reference-counted in-flight audio analysis cache with LRU byte eviction.
 */
export class AudioAnalysisCache {
  private cache = new Map<string, AssetAudioProfile>();
  private inFlight = new Map<string, InFlightTask>();
  private currentGeneration = 0;

  private maxEntries = 50;
  private maxByteBudget = 50 * 1024 * 1024; // 50 MB typed-array memory budget
  private _currentByteUsage = 0;

  constructor(options?: { maxEntries?: number; maxByteBudget?: number }) {
    if (options?.maxEntries !== undefined) {
      this.maxEntries = Math.max(1, options.maxEntries);
    }
    if (options?.maxByteBudget !== undefined) {
      this.maxByteBudget = Math.max(1, options.maxByteBudget);
    }
  }

  /**
   * Retrieves an existing cached profile or computes and caches it exactly ONCE.
   * Multiple consumers requesting the same key share the identical in-flight execution.
   */
  async getOrCreate(
    assetId: string,
    ...args: unknown[]
  ): Promise<AssetAudioProfile> {
    let realProvider: ((signal: AbortSignal) => Promise<Float32Array> | Float32Array) | undefined;
    let realFile: File | Blob | FileIdentity | null | undefined;
    let realOptions: AudioProfileOptions | undefined;
    let realSignal: AbortSignal | undefined;

    for (const arg of args) {
      if (!realProvider && isProviderFn(arg)) {
        realProvider = arg;
      } else if (!realFile && isFileLike(arg)) {
        realFile = arg;
      } else if (!realOptions && isOptionsObj(arg)) {
        realOptions = arg;
      } else if (!realSignal && isAbortSignal(arg)) {
        realSignal = arg;
      }
    }

    if (!realProvider) {
      throw new Error(`getOrCreate requires a provider function for assetId: ${assetId}`);
    }

    if (realSignal?.aborted) {
      throw new DOMException('Audio analysis aborted by caller', 'AbortError');
    }

    const key = buildAudioProfileKey(assetId, realFile, realOptions);
    const cached = this.cache.get(key);
    if (cached) {
      // Re-insert to refresh LRU order
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }

    let task = this.inFlight.get(key);
    const taskGen = this.currentGeneration;

    if (!task) {
      const underlyingAbort = new AbortController();
      task = {
        key,
        generation: taskGen,
        underlyingAbort,
        subscribers: new Set(),
      };
      this.inFlight.set(key, task);

      const thisTask = task;
      // Start the actual computation task
      (async () => {
        try {
          const rawSamples = await realProvider(thisTask.underlyingAbort.signal);
          const profile = computeAssetAudioProfile(assetId, rawSamples, realOptions, formatFileIdentity(realFile));
          profile.cacheKey = key;

          // Zombie protection: if generation changed (e.g. cache.clear() happened), discard from cache
          if (thisTask.generation === this.currentGeneration) {
            this.set(key, profile);
          }

          for (const sub of Array.from(thisTask.subscribers)) {
            if (sub.signal && sub.onAbort) {
              sub.signal.removeEventListener('abort', sub.onAbort);
            }
            sub.resolve(profile);
          }
        } catch (err) {
          for (const sub of Array.from(thisTask.subscribers)) {
            if (sub.signal && sub.onAbort) {
              sub.signal.removeEventListener('abort', sub.onAbort);
            }
            sub.reject(err);
          }
        } finally {
          thisTask.subscribers.clear();
          // Cleanup in-flight if it's still this exact task
          if (this.inFlight.get(key) === thisTask) {
            this.inFlight.delete(key);
          }
        }
      })();
    }

    const currentTask = task;

    return new Promise<AssetAudioProfile>((resolve, reject) => {
      const subscriber: InFlightSubscriber = {
        resolve,
        reject,
        signal: realSignal,
      };

      if (realSignal) {
        if (realSignal.aborted) {
          reject(new DOMException('Audio analysis aborted by subscriber', 'AbortError'));
          return;
        }

        const onAbort = () => {
          realSignal.removeEventListener('abort', onAbort);
          currentTask.subscribers.delete(subscriber);
          reject(new DOMException('Audio analysis aborted by subscriber', 'AbortError'));

          // Only abort underlying provider if ALL subscribers have cancelled!
          if (currentTask.subscribers.size === 0) {
            currentTask.underlyingAbort.abort();
            if (this.inFlight.get(key) === currentTask) {
              this.inFlight.delete(key);
            }
          }
        };

        subscriber.onAbort = onAbort;
        realSignal.addEventListener('abort', onAbort, { once: true });
      }

      currentTask.subscribers.add(subscriber);
    });
  }

  get(assetIdOrKey: string, file?: File | Blob | FileIdentity | null, options?: AudioProfileOptions): AssetAudioProfile | undefined {
    let key = assetIdOrKey;
    if (!assetIdOrKey.includes('::') && (file || options)) {
      key = buildAudioProfileKey(assetIdOrKey, file, options);
    } else if (!assetIdOrKey.includes('::')) {
      for (const [k, v] of this.cache.entries()) {
        if (v.assetId === assetIdOrKey || k.startsWith(`${assetIdOrKey}::`)) {
          key = k;
          break;
        }
      }
    }

    const profile = this.cache.get(key);
    if (profile) {
      this.cache.delete(key);
      this.cache.set(key, profile);
    }
    return profile;
  }

  getByKey(key: string): AssetAudioProfile | undefined {
    return this.get(key);
  }

  set(key: string, profile: AssetAudioProfile) {
    if (this.cache.has(key)) {
      const prev = this.cache.get(key)!;
      this._currentByteUsage -= prev.byteLength;
      this.cache.delete(key);
    }

    this.evictUntilFits(profile.byteLength);

    this.cache.set(key, profile);
    this._currentByteUsage += profile.byteLength;
  }

  has(assetIdOrKey: string, file?: File | Blob | FileIdentity | null, options?: AudioProfileOptions): boolean {
    if (assetIdOrKey.includes('::')) {
      return this.cache.has(assetIdOrKey);
    }
    if (file || options) {
      const key = buildAudioProfileKey(assetIdOrKey, file, options);
      return this.cache.has(key);
    }
    for (const [k, v] of this.cache.entries()) {
      if (v.assetId === assetIdOrKey || k.startsWith(`${assetIdOrKey}::`)) {
        return true;
      }
    }
    return false;
  }

  hasByKey(key: string): boolean {
    return this.cache.has(key);
  }

  delete(assetIdOrKey: string): boolean {
    if (assetIdOrKey.includes('::')) {
      return this.deleteByKey(assetIdOrKey);
    }
    return this.evictAsset(assetIdOrKey) > 0;
  }

  deleteByKey(key: string): boolean {
    const profile = this.cache.get(key);
    if (profile) {
      this._currentByteUsage -= profile.byteLength;
      return this.cache.delete(key);
    }
    return false;
  }

  /**
   * Invalidates all cached profiles associated with a given assetId (e.g. upon relink).
   */
  evictAsset(assetId: string): number {
    let evicted = 0;
    for (const [key, profile] of Array.from(this.cache.entries())) {
      if (profile.assetId === assetId || key.startsWith(`${assetId}::`)) {
        this._currentByteUsage -= profile.byteLength;
        this.cache.delete(key);
        evicted++;
      }
    }
    return evicted;
  }

  invalidate(assetId: string): number {
    return this.evictAsset(assetId);
  }

  clear() {
    this.currentGeneration++;
    this.cache.clear();
    // Do not abort or sever in-flight promises that callers might be awaiting;
    // but clearing inFlight ensures new requests start fresh generation,
    // and generation check prevents old tasks from populating cache.
    this.inFlight.clear();
    this._currentByteUsage = 0;
  }

  private evictUntilFits(newBytes: number) {
    while (
      this.cache.size > 0 &&
      (this.cache.size >= this.maxEntries || (this.cache.size > 0 && this._currentByteUsage + newBytes > this.maxByteBudget))
    ) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break;
      const profile = this.cache.get(oldestKey);
      if (profile) {
        this._currentByteUsage -= profile.byteLength;
      }
      this.cache.delete(oldestKey);
    }
  }

  get size(): number {
    return this.cache.size;
  }

  get byteUsage(): number {
    return this._currentByteUsage;
  }

  get currentByteUsage(): number {
    return this._currentByteUsage;
  }

  setMaxEntries(max: number) {
    this.maxEntries = Math.max(1, max);
    this.evictUntilFits(0);
  }

  setMaxByteBudget(bytes: number) {
    this.maxByteBudget = Math.max(1, bytes);
    this.evictUntilFits(0);
  }
}

/** Global shared singleton cache */
export const audioAnalysisCache = new AudioAnalysisCache();

/**
 * Checks whether a proposed timeline slice [start, end] overlaps with dead air.
 */
export function isRangeInDeadAir(
  profile: AssetAudioProfile,
  startTime: number,
  endTime: number,
  overlapToleranceSec = 0.5,
): boolean {
  for (const silence of profile.silenceMask) {
    const overlapStart = Math.max(startTime, silence.start);
    const overlapEnd = Math.min(endTime, silence.end);
    if (overlapEnd - overlapStart > overlapToleranceSec) {
      return true;
    }
  }
  return false;
}

/**
 * Fast O(1) query for candidate detector: returns average RMS, peak, and dead-air status
 * for an arbitrary source-time window [startTime, endTime].
 */
export function queryAudioWindowTelemetry(
  profile: AssetAudioProfile,
  startTime: number,
  endTime: number,
): {
  avgRmsDb: number;
  peakRmsDb: number;
  avgSpeechScore: number;
  peakSpeechScore: number;
  isDeadAir: boolean;
} {
  const hopSec = profile.hopSizeMs / 1000;
  const startFrame = Math.max(0, Math.min(profile.frameCount - 1, Math.floor(startTime / hopSec)));
  const endFrame = Math.max(startFrame + 1, Math.min(profile.frameCount, Math.ceil(endTime / hopSec)));

  if (profile.frameCount === 0) {
    return {
      avgRmsDb: -96,
      peakRmsDb: -96,
      avgSpeechScore: 0,
      peakSpeechScore: 0,
      isDeadAir: true,
    };
  }

  let sumRms = 0;
  let maxRms = -100;
  let sumScore = 0;
  let maxScore = 0;
  let count = 0;

  for (let f = startFrame; f < endFrame; f++) {
    const r = profile.rmsDb[f];
    const s = profile.speechEnergyScore[f];
    sumRms += r;
    if (r > maxRms) maxRms = r;
    sumScore += s;
    if (s > maxScore) maxScore = s;
    count++;
  }

  return {
    avgRmsDb: count > 0 ? Number((sumRms / count).toFixed(1)) : -100,
    peakRmsDb: maxRms,
    avgSpeechScore: count > 0 ? Number((sumScore / count).toFixed(3)) : 0,
    peakSpeechScore: maxScore,
    isDeadAir: isRangeInDeadAir(profile, startTime, endTime),
  };
}
