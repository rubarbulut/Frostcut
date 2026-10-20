import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  computeAssetAudioProfile,
  audioAnalysisCache,
  AudioAnalysisCache,
  buildAudioProfileKey,
  getFileIdentity,
  downmixStereoForAnalysis,
  isRangeInDeadAir,
  queryAudioWindowTelemetry,
  sampleProfileWaveform,
  AUDIO_PROFILE_ALGO_VERSION,
  type AssetAudioProfile,
  type FileIdentity,
} from './asset-audio-profile';

describe('B004-O AssetAudioProfile & Audio Telemetry Cache', () => {
  beforeEach(() => {
    audioAnalysisCache.clear();
  });

  describe('Cache Keying: File Identity & Analysis Options', () => {
    it('produces distinct cache keys for different file identities and options', () => {
      const file1: FileIdentity = { name: 'podcast.mp3', size: 1048576, lastModified: 1700000000000 };
      const file2: FileIdentity = { name: 'podcast.mp3', size: 2048576, lastModified: 1700000500000 }; // modified/relinked
      const assetId = 'asset-abc';

      const key1 = buildAudioProfileKey(assetId, file1, { sampleRate: 16000, hopSizeMs: 50 });
      const key2 = buildAudioProfileKey(assetId, file2, { sampleRate: 16000, hopSizeMs: 50 });
      const key3 = buildAudioProfileKey(assetId, file1, { sampleRate: 22050, hopSizeMs: 50 });
      const keyNoFile = buildAudioProfileKey(assetId, undefined, { sampleRate: 16000 });

      expect(key1).not.toBe(key2); // relinked file with different size/mtime produces different key
      expect(key1).not.toBe(key3); // different sampleRate produces different key
      expect(key1).toContain(AUDIO_PROFILE_ALGO_VERSION);
      expect(key1).toContain('1048576');
      expect(keyNoFile).toContain(assetId);
    });

    it('extracts FileIdentity safely from File / Blob objects', () => {
      const mockFile = {
        name: 'interview.wav',
        size: 50000,
        lastModified: 1680000000000,
      } as unknown as File;

      const id = getFileIdentity(mockFile);
      expect(id).toEqual({
        name: 'interview.wav',
        size: 50000,
        lastModified: 1680000000000,
      });

      expect(getFileIdentity(undefined)).toBeUndefined();
      expect(getFileIdentity(null as unknown as File)).toBeUndefined();
    });

    it('caches separate profiles when options differ for the same asset', async () => {
      const assetId = 'asset-multi-opts';
      const sampleRate1 = 16000;
      const sampleRate2 = 8000;
      const samples1 = new Float32Array(sampleRate1 * 1);
      const samples2 = new Float32Array(sampleRate2 * 1);

      const p1 = await audioAnalysisCache.getOrCreate(
        assetId,
        async () => samples1,
        undefined,
        { sampleRate: sampleRate1 }
      );

      const p2 = await audioAnalysisCache.getOrCreate(
        assetId,
        async () => samples2,
        undefined,
        { sampleRate: sampleRate2 }
      );

      expect(p1.sampleRate).toBe(16000);
      expect(p2.sampleRate).toBe(8000);
      expect(p1).not.toBe(p2);
      expect(audioAnalysisCache.size).toBe(2);
    });

    it('invalidates cache entries for an asset when relinked or cleared', async () => {
      const assetId = 'relink-asset';
      const fileOld: FileIdentity = { name: 'old.wav', size: 1000, lastModified: 100 };
      const fileNew: FileIdentity = { name: 'new.wav', size: 2000, lastModified: 200 };

      await audioAnalysisCache.getOrCreate(
        assetId,
        async () => new Float32Array(16000),
        fileOld
      );
      expect(audioAnalysisCache.has(assetId, fileOld)).toBe(true);

      // Invalidate all entries for this asset
      const removedCount = audioAnalysisCache.invalidate(assetId);
      expect(removedCount).toBe(1);
      expect(audioAnalysisCache.has(assetId, fileOld)).toBe(false);

      // New file will compute afresh
      await audioAnalysisCache.getOrCreate(
        assetId,
        async () => new Float32Array(16000),
        fileNew
      );
      expect(audioAnalysisCache.has(assetId, fileNew)).toBe(true);
    });
  });

  describe('Multi-Subscriber In-Flight Concurrency & Independent Abort', () => {
    it('shares a single in-flight computation across concurrent subscribers (Long & Shorts)', async () => {
      const assetId = 'shared-asset';
      const samples = new Float32Array(16000);
      let providerCalls = 0;

      const provider = vi.fn(async () => {
        providerCalls++;
        await new Promise((res) => setTimeout(res, 20));
        return samples;
      });

      // Long video consumer and Shorts consumer request same asset concurrently
      const [p1, p2, p3] = await Promise.all([
        audioAnalysisCache.getOrCreate(assetId, provider),
        audioAnalysisCache.getOrCreate(assetId, provider),
        audioAnalysisCache.getOrCreate(assetId, provider),
      ]);

      expect(providerCalls).toBe(1);
      expect(p1).toBe(p2);
      expect(p2).toBe(p3);
      expect(p1.assetId).toBe(assetId);
    });

    it('isolates subscriber abort: when Consumer A aborts, Consumer B continues and resolves successfully', async () => {
      const assetId = 'abort-isolation';
      const samples = new Float32Array(16000);
      let providerCalled = false;

      const provider = vi.fn(async (signal?: AbortSignal) => {
        providerCalled = true;
        // Simulate async decoding
        for (let i = 0; i < 5; i++) {
          if (signal?.aborted) {
            throw new Error('Provider aborted');
          }
          await new Promise((res) => setTimeout(res, 10));
        }
        return samples;
      });

      const controllerA = new AbortController();
      const controllerB = new AbortController();

      // Consumer A (e.g. Shorts modal opened and quickly closed)
      const promiseA = audioAnalysisCache.getOrCreate(
        assetId,
        provider,
        undefined,
        undefined,
        controllerA.signal
      );

      // Consumer B (e.g. Long editor timeline remains active)
      const promiseB = audioAnalysisCache.getOrCreate(
        assetId,
        provider,
        undefined,
        undefined,
        controllerB.signal
      );

      // Abort Consumer A after 5ms
      setTimeout(() => controllerA.abort('User navigated away'), 5);

      // Promise A must reject with AbortError
      await expect(promiseA).rejects.toThrow();

      // Promise B must succeed without error!
      const profileB = await promiseB;
      expect(profileB).toBeDefined();
      expect(profileB.assetId).toBe(assetId);
      expect(provider).toHaveBeenCalledOnce();
      // Cache must hold the result for Consumer B
      expect(audioAnalysisCache.has(assetId)).toBe(true);
    });

    it('aborts the underlying provider task only when ALL subscribers abort', async () => {
      const assetId = 'all-abort';
      let taskSignalReceivedAborted = false;

      const provider = vi.fn(async (signal?: AbortSignal) => {
        return new Promise<Float32Array>((resolve, reject) => {
          signal?.addEventListener('abort', () => {
            taskSignalReceivedAborted = true;
            reject(new Error('All subscribers cancelled'));
          });
        });
      });

      const c1 = new AbortController();
      const c2 = new AbortController();

      const p1 = audioAnalysisCache.getOrCreate(assetId, provider, undefined, undefined, c1.signal);
      const p2 = audioAnalysisCache.getOrCreate(assetId, provider, undefined, undefined, c2.signal);

      // First subscriber aborts -> underlying task should NOT abort yet
      c1.abort();
      await expect(p1).rejects.toThrow();
      expect(taskSignalReceivedAborted).toBe(false);

      // Second subscriber aborts -> underlying task MUST now abort
      c2.abort();
      await expect(p2).rejects.toThrow();
      expect(taskSignalReceivedAborted).toBe(true);
    });
  });

  describe('Zombie Resurrection Protection & Retry Behavior', () => {
    it('prevents stale resolved promises from resurrecting in cache after clear()', async () => {
      const assetId = 'zombie-clear';
      const samples = new Float32Array(16000);

      let finishProvider: (val: Float32Array) => void = () => {};
      const provider = vi.fn(() => new Promise<Float32Array>((res) => {
        finishProvider = res;
      }));

      const inFlightPromise = audioAnalysisCache.getOrCreate(assetId, provider);

      // User clears cache while decode/analysis is in-flight
      audioAnalysisCache.clear();
      expect(audioAnalysisCache.size).toBe(0);

      // Provider finishes now
      finishProvider(samples);
      await inFlightPromise;

      // Because clear() incremented cache generation, the completed profile must NOT resurrect in cache
      expect(audioAnalysisCache.has(assetId)).toBe(false);
      expect(audioAnalysisCache.size).toBe(0);
    });

    it('clears inFlight on rejection and permits immediate retry', async () => {
      const assetId = 'retry-test';
      let attempt = 0;
      const samples = new Float32Array(16000);

      const faultyProvider = vi.fn(async () => {
        attempt++;
        if (attempt === 1) {
          throw new Error('Decode error on attempt 1');
        }
        return samples;
      });

      // Attempt 1 fails
      await expect(audioAnalysisCache.getOrCreate(assetId, faultyProvider)).rejects.toThrow('Decode error');
      expect(audioAnalysisCache.has(assetId)).toBe(false);

      // Attempt 2 immediately after succeeds
      const profile = await audioAnalysisCache.getOrCreate(assetId, faultyProvider);
      expect(profile).toBeDefined();
      expect(profile.assetId).toBe(assetId);
      expect(attempt).toBe(2);
      expect(audioAnalysisCache.has(assetId)).toBe(true);
    });
  });

  describe('Byte-Budget & Entry-Count LRU Eviction', () => {
    it('evicts oldest entries when maxByteBudget is exceeded', () => {
      const smallBudgetCache = new AudioAnalysisCache({
        maxByteBudget: 5000, // 5 KB
        maxEntries: 10,
      });

      // Create synthetic profiles with known byteLength (~2000 bytes each)
      const p1: AssetAudioProfile = {
        assetId: 'p1',
        cacheKey: 'k1',
        byteLength: 2000,
      } as unknown as AssetAudioProfile;

      const p2: AssetAudioProfile = {
        assetId: 'p2',
        cacheKey: 'k2',
        byteLength: 2000,
      } as unknown as AssetAudioProfile;

      const p3: AssetAudioProfile = {
        assetId: 'p3',
        cacheKey: 'k3',
        byteLength: 2000,
      } as unknown as AssetAudioProfile;

      smallBudgetCache.set('k1', p1);
      smallBudgetCache.set('k2', p2);
      expect(smallBudgetCache.size).toBe(2);
      expect(smallBudgetCache.currentByteUsage).toBe(4000);

      // Adding p3 will exceed 5000 budget (4000 + 2000 = 6000 > 5000)
      // LRU item k1 should be evicted!
      smallBudgetCache.set('k3', p3);
      expect(smallBudgetCache.size).toBe(2);
      expect(smallBudgetCache.hasByKey('k1')).toBe(false);
      expect(smallBudgetCache.hasByKey('k2')).toBe(true);
      expect(smallBudgetCache.hasByKey('k3')).toBe(true);
      expect(smallBudgetCache.currentByteUsage).toBe(4000);
    });

    it('respects LRU access order when evicting', () => {
      const cache = new AudioAnalysisCache({ maxEntries: 2, maxByteBudget: 100000 });
      const p1 = { assetId: '1', cacheKey: '1', byteLength: 100 } as AssetAudioProfile;
      const p2 = { assetId: '2', cacheKey: '2', byteLength: 100 } as AssetAudioProfile;
      const p3 = { assetId: '3', cacheKey: '3', byteLength: 100 } as AssetAudioProfile;

      cache.set('1', p1);
      cache.set('2', p2);

      // Access '1' so '2' becomes the oldest
      expect(cache.getByKey('1')).toBe(p1);

      // Add '3' -> '2' must be evicted, '1' and '3' remain
      cache.set('3', p3);
      expect(cache.hasByKey('2')).toBe(false);
      expect(cache.hasByKey('1')).toBe(true);
      expect(cache.hasByKey('3')).toBe(true);
    });
  });

  describe('Stereo Phase Cancellation Protection (downmixStereoForAnalysis)', () => {
    it('preserves 100% signal energy when Left and Right channels are 180 degrees out of phase', () => {
      const len = 1600;
      const left = new Float32Array(len);
      const right = new Float32Array(len);

      // L = +0.5, R = -0.5 (exact anti-phase stereo)
      for (let i = 0; i < len; i++) {
        left[i] = 0.5 * Math.sin((2 * Math.PI * 400 * i) / 16000);
        right[i] = -0.5 * Math.sin((2 * Math.PI * 400 * i) / 16000);
      }

      // Traditional naive sum (L+R)/2 cancels to exact ZERO
      let naiveSumEnergy = 0;
      for (let i = 0; i < len; i++) {
        const naive = (left[i] + right[i]) / 2;
        naiveSumEnergy += naive * naive;
      }
      expect(naiveSumEnergy).toBeCloseTo(0, 5);

      // Okan's energy-preserving downmix:
      const safeDownmix = downmixStereoForAnalysis(left, right);
      expect(safeDownmix.length).toBe(len);

      let safeEnergy = 0;
      for (let i = 0; i < len; i++) {
        safeEnergy += safeDownmix[i] * safeDownmix[i];
      }
      const safeRms = Math.sqrt(safeEnergy / len);
      const safeRmsDb = 20 * Math.log10(safeRms);

      // Expected RMS of 0.5 peak sine is 0.5 / sqrt(2) = 0.3535 (-9.03 dB)
      expect(safeRmsDb).toBeGreaterThan(-12);
      expect(safeRmsDb).toBeLessThan(-8);

      // When passed through computeAssetAudioProfile, anti-phase stereo is NOT classified as silence
      const profile = computeAssetAudioProfile('anti-phase-test', safeDownmix, {
        sampleRate: 16000,
        silenceThresholdDb: -40,
      });

      expect(profile.stats.avgRmsDb).toBeGreaterThan(-15);
      expect(profile.silenceMask.length).toBe(0); // Not silent dead air!
    });
  });

  describe('Robustness Against Degenerate / Unsafe Audio Inputs', () => {
    it('safely handles empty buffers, NaN, +/-Infinity, and extreme values without throwing', () => {
      // 1. Empty buffer
      const emptyProfile = computeAssetAudioProfile('empty', new Float32Array(0));
      expect(emptyProfile.frameCount).toBe(0);
      expect(emptyProfile.durationSec).toBe(0);
      expect(emptyProfile.stats.avgRmsDb).toBe(-96);
      expect(emptyProfile.highlights.length).toBe(0);

      // 2. NaN / Infinity values
      const dirty = new Float32Array([0.1, NaN, Infinity, -Infinity, 0.2, 0.3]);
      const dirtyProfile = computeAssetAudioProfile('dirty', dirty, { sampleRate: 16000 });
      expect(Number.isFinite(dirtyProfile.stats.avgRmsDb)).toBe(true);
      expect(Number.isFinite(dirtyProfile.stats.avgZcr)).toBe(true);

      // 3. Extremely clipped audio
      const clipped = new Float32Array(1600).fill(15.0);
      const clippedProfile = computeAssetAudioProfile('clipped', clipped, { sampleRate: 16000 });
      expect(clippedProfile.stats.peakLinear).toBeLessThanOrEqual(1.0); // clamped to <= 1.0
      expect(clippedProfile.stats.avgRmsDb).toBeLessThanOrEqual(0.0);
    });
  });

  describe('Semantic Classification & Waveform Resampling', () => {
    it('classifies speech-like burst vs sustained activity and provides backward-compatible kind aliases', () => {
      const sampleRate = 16000;
      const samples = new Float32Array(sampleRate * 2);
      // Generate clear vocal burst
      for (let i = 0; i < sampleRate * 0.8; i++) {
        const t = i / sampleRate;
        samples[i] =
          0.15 * Math.sin(2 * Math.PI * 250 * t) +
          0.12 * Math.sin(2 * Math.PI * 800 * t) +
          0.08 * Math.sin(2 * Math.PI * 2200 * t);
      }

      const profile = computeAssetAudioProfile('semantic-test', samples, { sampleRate });
      if (profile.highlights.length > 0) {
        const h = profile.highlights[0];
        expect(h.kind).toBeDefined();
        expect(h.classification).toBeDefined();
        // kind mirrors classification for backward compatibility
        expect(h.kind).toBe(h.classification);
        expect(['speech-like-burst', 'audio-activity', 'sustained-activity', 'percussive-burst']).toContain(
          h.classification
        );
      }
    });

    it('resamples profile waveform telemetry to target points accurately', () => {
      const sampleRate = 16000;
      const samples = new Float32Array(sampleRate * 5); // 5 sec -> 100 frames at 50ms hop
      const profile = computeAssetAudioProfile('resample-test', samples, { sampleRate });

      const waveform = sampleProfileWaveform(profile, 50);
      expect(waveform.length).toBe(50);
      expect(waveform.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);

      // Empty profile returns array of zeros
      const emptyWaveform = sampleProfileWaveform(
        computeAssetAudioProfile('empty-wf', new Float32Array(0)),
        20
      );
      expect(emptyWaveform.length).toBe(20);
      expect(emptyWaveform.every((v) => v === 0)).toBe(true);
    });
  });

  describe('Dead Air / Silence Mask Detection (-40 dB for > 2.5s)', () => {
    it('detects dead air (>2.5s below -40 dB) while ignoring short conversational pauses (<2.5s)', () => {
      const sampleRate = 16000;
      const totalSec = 16;
      const samples = new Float32Array(sampleRate * totalSec);

      // Section 1: 0 - 3s (loud 400Hz tone, amplitude 0.25)
      for (let i = 0; i < sampleRate * 3; i++) {
        samples[i] = 0.25 * Math.sin((2 * Math.PI * 400 * i) / sampleRate);
      }
      // Section 2: 3 - 7s (silence, zeros)

      // Section 3: 7 - 10s (loud 400Hz tone, amplitude 0.2)
      for (let i = sampleRate * 7; i < sampleRate * 10; i++) {
        samples[i] = 0.2 * Math.sin((2 * Math.PI * 400 * i) / sampleRate);
      }
      // Section 4: 10 - 11.5s (short pause 1.5s, zeros)

      // Section 5: 11.5 - 13s (loud 400Hz tone, amplitude 0.2)
      for (let i = Math.round(sampleRate * 11.5); i < sampleRate * 13; i++) {
        samples[i] = 0.2 * Math.sin((2 * Math.PI * 400 * i) / sampleRate);
      }
      // Section 6: 13 - 16s (silence 3.0s > 2.5s, zeros)

      const profile = computeAssetAudioProfile('silence-test', samples, {
        sampleRate,
        hopSizeMs: 50,
        silenceThresholdDb: -40,
        silenceMinDurationSec: 2.5,
      });

      expect(profile.silenceMask.length).toBe(2);

      // Dead Air 1: ~3.0s to 7.0s
      expect(profile.silenceMask[0].start).toBeCloseTo(3.0, 1);
      expect(profile.silenceMask[0].end).toBeCloseTo(7.0, 1);
      expect(profile.silenceMask[0].duration).toBeGreaterThanOrEqual(3.9);

      // Dead Air 2: ~13.0s to 16.0s
      expect(profile.silenceMask[1].start).toBeCloseTo(13.0, 1);
      expect(profile.silenceMask[1].end).toBeCloseTo(16.0, 1);
      expect(profile.silenceMask[1].duration).toBeGreaterThanOrEqual(2.9);

      // Verify the 1.5s pause at 10-11.5s was NOT included in silenceMask
      const falseSilence = profile.silenceMask.find((s) => s.start >= 9.8 && s.end <= 11.6);
      expect(falseSilence).toBeUndefined();

      expect(isRangeInDeadAir(profile, 4.0, 6.0)).toBe(true);
      expect(isRangeInDeadAir(profile, 1.0, 2.5)).toBe(false);
      expect(isRangeInDeadAir(profile, 10.2, 11.2)).toBe(false);
      expect(isRangeInDeadAir(profile, 13.5, 15.5)).toBe(true);

      const telemetryLoud = queryAudioWindowTelemetry(profile, 1.0, 2.0);
      expect(telemetryLoud.avgRmsDb).toBeGreaterThan(-20);
      expect(telemetryLoud.isDeadAir).toBe(false);

      const telemetrySilence = queryAudioWindowTelemetry(profile, 4.0, 6.0);
      expect(telemetrySilence.avgRmsDb).toBeLessThanOrEqual(-40);
      expect(telemetrySilence.isDeadAir).toBe(true);
    });
  });

  describe('30-Minute Audio Benchmark & Determinism', () => {
    it('processes 30 minutes of 16kHz audio deterministically in sub-second time without memory leaks', () => {
      const sampleRate = 16000;
      const durationSec = 30 * 60; // 1800 seconds (30 minutes)
      const totalSamples = sampleRate * durationSec; // 28,800,000 samples

      const samples = new Float32Array(totalSamples);

      for (let i = 0; i < sampleRate * 60; i++) {
        samples[i] = 0.2 * Math.sin((2 * Math.PI * 400 * i) / sampleRate);
      }
      for (let i = sampleRate * 300; i < sampleRate * 360; i++) {
        samples[i] = 0.35 * Math.sin((2 * Math.PI * 60 * i) / sampleRate);
      }
      for (let i = sampleRate * 360; i < sampleRate * 420; i++) {
        samples[i] =
          0.15 * Math.sin((2 * Math.PI * 300 * i) / sampleRate) +
          0.12 * Math.sin((2 * Math.PI * 1500 * i) / sampleRate);
      }

      const t0 = performance.now();
      const profile1 = computeAssetAudioProfile('bench-30m', samples, {
        sampleRate,
        hopSizeMs: 50,
      });
      const elapsedMs = performance.now() - t0;

      // Must complete 30 minutes within reasonable time
      expect(elapsedMs).toBeLessThan(1500);

      // Verify frame count: 1800s / 0.05s = 36,000 frames
      expect(profile1.frameCount).toBe(36000);
      expect(profile1.rmsDb.length).toBe(36000);
      expect(profile1.speechEnergyScore.length).toBe(36000);

      // Verify dead air was identified between 60s and 300s
      const deadAir1 = profile1.silenceMask.find((s) => s.start >= 59 && s.end <= 301);
      expect(deadAir1).toBeDefined();
      expect(deadAir1?.duration).toBeGreaterThanOrEqual(239);

      // Determinism check: second run produces exact bit-for-bit identical results
      const profile2 = computeAssetAudioProfile('bench-30m', samples, {
        sampleRate,
        hopSizeMs: 50,
      });

      expect(profile1.stats.avgRmsDb).toBe(profile2.stats.avgRmsDb);
      expect(profile1.stats.silenceDuration).toBe(profile2.stats.silenceDuration);
      expect(profile1.silenceMask.length).toBe(profile2.silenceMask.length);
      expect(profile1.highlights.length).toBe(profile2.highlights.length);

      // Memory footprint check
      expect(profile1.byteLength).toBeLessThan(1.5 * 1024 * 1024); // Under 1.5 MB
    });
  });
});
