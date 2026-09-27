import { pipeline, env, mean_pooling } from '@huggingface/transformers';
import { CHAPTER_MODEL, CHAPTER_MODEL_REVISION, splitChapterText } from './chapter-data';

env.allowLocalModels = false;
env.backends.onnx.wasm!.numThreads = 1;
self.onmessage = async ({ data }: MessageEvent<{ texts: string[] }>) => {
  try {
    if (!Array.isArray(data.texts) || !data.texts.length || data.texts.length > 3000)
      throw new Error('Choose a sequence with 1–3,000 transcript groups.');
    const extractor = await pipeline('feature-extraction', CHAPTER_MODEL, {
      revision: CHAPTER_MODEL_REVISION,
      device: 'wasm',
      dtype: 'q8',
      progress_callback: (p) =>
        self.postMessage({
          type: 'progress',
          message:
            p.status === 'progress'
              ? `Downloading chapter model · ${Math.round(p.progress ?? 0)}% (${p.file})`
              : 'Loading the local chapter model…',
        }),
    });
    try {
      const embed = async (text: string): Promise<{ vector: number[]; tokens: number }> => {
        const input = extractor.tokenizer(text, { padding: true, truncation: false });
        const tokens = input.input_ids.dims[1];
        // The model was trained on 128 tokens. Split instead of dropping the tail.
        if (tokens > 128) {
          const [left, right] = splitChapterText(text);
          if (!left || !right)
            throw new Error('A transcript group could not be split for the chapter model.');
          const a = await embed(left),
            b = await embed(right);
          const vector = a.vector.map((n, i) => n * a.tokens + b.vector[i] * b.tokens);
          const norm = Math.hypot(...vector);
          return { vector: vector.map((n) => n / (norm || 1)), tokens: a.tokens + b.tokens };
        }
        const output = await extractor.model(input);
        const embedding = mean_pooling(output.last_hidden_state, input.attention_mask).normalize(
          2,
          -1,
        );
        return { vector: Array.from(embedding.data, Number), tokens };
      };
      const vectors: number[][] = [];
      for (let i = 0; i < data.texts.length; i++) {
        self.postMessage({
          type: 'progress',
          message: `Reading transcript topics · ${i + 1}/${data.texts.length}`,
        });
        vectors.push((await embed(data.texts[i])).vector);
      }
      self.postMessage({ type: 'result', vectors });
    } finally {
      await extractor.dispose();
    }
  } catch (e) {
    self.postMessage({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
