import { pipeline, env } from '@huggingface/transformers';
env.allowLocalModels = false;
env.backends.onnx.wasm!.numThreads = 1;
self.onmessage = async ({
  data,
}: MessageEvent<{ texts: string[]; source: string; target: string }>) => {
  try {
    const translator = await pipeline('translation', 'Xenova/m2m100_418M', {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: (p) =>
        self.postMessage({
          type: 'progress',
          message:
            p.status === 'progress'
              ? `Downloading translation model · ${Math.round(p.progress ?? 0)}% (${p.file})`
              : 'Loading translation model on this device…',
        }),
    });
    const texts: string[] = [];
    try {
      for (let i = 0; i < data.texts.length; i++) {
        self.postMessage({
          type: 'progress',
          message: `Translating cue ${i + 1}/${data.texts.length}…`,
        });
        const result = await translator(data.texts[i], {
          src_lang: data.source,
          tgt_lang: data.target,
          max_new_tokens: 256,
        });
        const item = result[0];
        const text = (Array.isArray(item) ? item[0] : item).translation_text.trim();
        if (!text) throw new Error(`No translation returned for cue ${i + 1}.`);
        texts.push(text);
      }
      self.postMessage({ type: 'result', texts });
    } finally {
      await translator.dispose();
    }
  } catch (e) {
    self.postMessage({ type: 'error', message: (e as Error).message });
  }
};
