import { analyzeAudioBeats, type BeatDetectionOptions, type BeatMarker } from './beat-detection';

export type BeatWorkerMessage =
  | {
      type: 'analyze';
      samples: Float32Array;
      options?: BeatDetectionOptions;
    };

export type BeatWorkerResponse =
  | {
      type: 'progress';
      message: string;
      percentage?: number;
    }
  | {
      type: 'result';
      bpm: number;
      beats: BeatMarker[];
      beatTimes: number[];
      downbeats: number[];
      averageEnergy: number;
    }
  | {
      type: 'error';
      message: string;
    };

self.onmessage = (e: MessageEvent<BeatWorkerMessage>) => {
  const { data } = e;
  if (!data) return;

  try {
    if (data.type === 'analyze') {
      self.postMessage({
        type: 'progress',
        message: 'Running Spectral Flux onset envelope analysis…',
        percentage: 30,
      } as BeatWorkerResponse);

      const analysis = analyzeAudioBeats(data.samples, data.options);

      self.postMessage({
        type: 'progress',
        message: 'Calculating inter-onset intervals and BPM…',
        percentage: 80,
      } as BeatWorkerResponse);

      const beatTimes = analysis.beats.map((b) => Number(b.time.toFixed(4)));

      self.postMessage({
        type: 'result',
        bpm: analysis.bpm,
        beats: analysis.beats,
        beatTimes,
        downbeats: analysis.downbeats,
        averageEnergy: analysis.averageEnergy,
      } as BeatWorkerResponse);
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    } as BeatWorkerResponse);
  }
};
