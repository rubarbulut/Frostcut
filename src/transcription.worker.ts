import { pipeline, env } from '@huggingface/transformers';
import {
  transcriptionModels,
  resolveQuality,
  type TranscriptionQuality,
} from './transcription-config';
env.allowLocalModels = false;
env.backends.onnx.wasm!.numThreads = 1;
let transcriber: Awaited<ReturnType<typeof pipeline<'automatic-speech-recognition'>>> | undefined;
let backend: 'webgpu' | 'wasm' = 'wasm';
self.onmessage = async (
  event: MessageEvent<{
    audio: Float32Array;
    language: string;
    quality: TranscriptionQuality;
    device?: 'auto' | 'cpu';
  }>,
) => {
  try {
    const model = transcriptionModels[resolveQuality(event.data.quality)];
    const progress_callback = (p: { status: string; progress?: number; file?: string }) =>
      self.postMessage({
        type: 'progress',
        progress: p.progress,
        message:
          p.status === 'progress'
            ? `Downloading ${model.name} · ${Math.round(p.progress ?? 0)}%`
            : `Loading ${model.name} on this device…`,
      });
    if (!transcriber) {
      if (event.data.device !== 'cpu') {
        try {
          const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } })
            .gpu;
          if (await gpu?.requestAdapter()) {
            backend = 'webgpu';
            transcriber = await pipeline('automatic-speech-recognition', model.id, {
              device: 'webgpu',
              dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
              progress_callback,
            });
          }
        } catch {
          backend = 'wasm';
        }
      }
      if (!transcriber) {
        backend = 'wasm';
        self.postMessage({
          type: 'progress',
          message: 'Using CPU speech processing. This device may take longer.',
        });
        transcriber = await pipeline('automatic-speech-recognition', model.id, {
          dtype: 'q8',
          device: 'wasm',
          progress_callback,
        });
      }
    }
    self.postMessage({
      type: 'progress',
      message: `Transcribing with ${model.name} · ${backend === 'webgpu' ? 'GPU accelerated' : 'CPU'}…`,
    });
    const language = event.data.language;
    const options = {
      return_timestamps: 'word' as const,
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(language === 'Auto Detect'
        ? {}
        : { language: language.toLowerCase(), task: 'transcribe' as const }),
    };
    let result;
    try {
      result = await transcriber(event.data.audio, options);
    } catch (error) {
      if (backend !== 'webgpu') throw error;
      self.postMessage({
        type: 'progress',
        message: 'Acceleration is unavailable for this model. Retrying safely on the CPU…',
      });
      await transcriber.dispose().catch(() => {});
      backend = 'wasm';
      transcriber = await pipeline('automatic-speech-recognition', model.id, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback,
      });
      result = await transcriber(event.data.audio, options);
    }
    self.postMessage({
      type: 'result',
      result,
      model: `${model.name} · ${backend === 'webgpu' ? 'GPU' : 'CPU'}`,
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
