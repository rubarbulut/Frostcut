import { pipeline, env } from '@huggingface/transformers';
import {
  transcriptionModels,
  resolveQuality,
  type TranscriptionQuality,
} from './transcription-config';
env.allowLocalModels = false;
env.backends.onnx.wasm!.numThreads = 1;
let transcriber: Awaited<ReturnType<typeof pipeline<'automatic-speech-recognition'>>> | undefined;
self.onmessage = async (
  event: MessageEvent<{ audio: Float32Array; language: string; quality: TranscriptionQuality }>,
) => {
  try {
    const model = transcriptionModels[resolveQuality(event.data.quality)];
    transcriber ??= await pipeline('automatic-speech-recognition', model.id, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p: { status: string; progress?: number; file?: string }) =>
        self.postMessage({
          type: 'progress',
          progress: p.progress,
          message:
            p.status === 'progress'
              ? `Downloading ${model.name} · ${Math.round(p.progress ?? 0)}%`
              : `Loading ${model.name} on this device…`,
        }),
    });
    self.postMessage({
      type: 'progress',
      message: `Transcribing with ${model.name} on your device…`,
    });
    const language = event.data.language;
    const result = await transcriber(event.data.audio, {
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(language === 'Auto Detect'
        ? {}
        : { language: language.toLowerCase(), task: 'transcribe' }),
    });
    self.postMessage({ type: 'result', result, model: model.name });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
