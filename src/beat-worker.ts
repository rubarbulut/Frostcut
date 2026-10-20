import {
  analyzeAudioBeats,
  type BeatAnalysisResult,
  type BeatDetectionOptions,
} from './beat-detection';
import type { BeatWorkerResponse } from './beat.worker';

export type BeatWorkerResult = BeatAnalysisResult & {
  beatTimes: number[];
};

/**
 * Executes Spectral Flux beat detection asynchronously inside a dedicated Web Worker.
 * If Web Workers are unavailable in the host environment (e.g. Node/Vitest), automatically
 * falls back to inline analysis so playback and tests remain 100% deterministic.
 */
export async function detectAudioBeatsAsync(
  samples: Float32Array,
  options?: BeatDetectionOptions,
  signal?: AbortSignal,
  onProgress?: (message: string, percentage?: number) => void,
): Promise<BeatWorkerResult> {
  signal?.throwIfAborted();

  // Environments without Worker support (unit tests / SSR)
  if (typeof Worker === 'undefined') {
    onProgress?.('Spectral Flux analysis (inline)…', 50);
    const result = analyzeAudioBeats(samples, options);
    return {
      ...result,
      beatTimes: result.beats.map((b) => Number(b.time.toFixed(4))),
    };
  }

  return new Promise((resolve, reject) => {
    let disposed = false;
    let worker: Worker | null = null;

    try {
      worker = new Worker(new URL('./beat.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      // Fallback if worker initialization is disallowed (e.g. restricted sandbox)
      const result = analyzeAudioBeats(samples, options);
      resolve({
        ...result,
        beatTimes: result.beats.map((b) => Number(b.time.toFixed(4))),
      });
      return;
    }

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      if (worker) {
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
      }
      signal?.removeEventListener('abort', cancel);
    };

    const cancel = () => {
      cleanup();
      reject(new DOMException('Beat analysis cancelled', 'AbortError'));
    };

    worker.onerror = (e) => {
      cleanup();
      // Graceful fallback to inline computation if worker encounters runtime error
      try {
        const result = analyzeAudioBeats(samples, options);
        resolve({
          ...result,
          beatTimes: result.beats.map((b) => Number(b.time.toFixed(4))),
        });
      } catch (err) {
        reject(new Error(e.message || 'Beat detection worker failed.'));
      }
    };

    worker.onmessage = (event: MessageEvent<BeatWorkerResponse>) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'progress') {
        onProgress?.(data.message, data.percentage);
      } else if (data.type === 'result') {
        cleanup();
        resolve({
          bpm: data.bpm,
          beats: data.beats,
          beatTimes: data.beatTimes,
          downbeats: data.downbeats,
          averageEnergy: data.averageEnergy,
        });
      } else if (data.type === 'error') {
        cleanup();
        reject(new Error(data.message));
      }
    };

    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) {
      cancel();
    } else {
      try {
        worker.postMessage({ type: 'analyze', samples, options });
      } catch (err) {
        cleanup();
        reject(err);
      }
    }
  });
}
