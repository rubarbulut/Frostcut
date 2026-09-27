import { type Transcript, type Word, uid } from './model';
import { markKeywords } from './ai';
import { normalizeSpeechChunks } from './speech-result';
import { type TranscriptionQuality } from './transcription-config';
export function createTranscriber(
  mediaId: string,
  language: string,
  onProgress: (message: string, progress?: number) => void,
  signal: AbortSignal,
  quality: TranscriptionQuality = 'balanced',
  device: 'auto' | 'cpu' = 'auto',
) {
  const worker = new Worker(new URL('./transcription.worker.ts', import.meta.url), {
    type: 'module',
  });
  let pending:
    { resolve: (t: Transcript) => void; reject: (e: Error) => void; duration: number } | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    worker.terminate();
    signal.removeEventListener('abort', dispose);
    pending?.reject(new DOMException('Cancelled', 'AbortError'));
    pending = undefined;
  };
  signal.addEventListener('abort', dispose, { once: true });
  worker.onerror = (event) => {
    pending?.reject(new Error(event.message || 'The local speech model could not start.'));
    pending = undefined;
    dispose();
  };
  worker.onmessage = (event) => {
    const { type, message, progress, result, model } = event.data;
    if (type === 'progress') onProgress(message, progress);
    if (type === 'error') {
      pending?.reject(new Error(message));
      pending = undefined;
    }
    if (type === 'result' && pending) {
      const chunks = (Array.isArray(result) ? result[0] : result).chunks ?? [];
      pending.resolve({
        mediaId,
        language,
        source: 'local',
        model,
        words: normalizeSpeechChunks(chunks, pending.duration),
      });
      pending = undefined;
    }
  };
  return {
    run(audio: Float32Array): Promise<Transcript> {
      if (disposed || signal.aborted)
        return Promise.reject(new DOMException('Cancelled', 'AbortError'));
      if (pending) return Promise.reject(new Error('Wait for the current speech chunk.'));
      return new Promise((resolve, reject) => {
        pending = { resolve, reject, duration: audio.length / 16000 };
        worker.postMessage({ audio, language, quality, device }, [audio.buffer]);
      });
    },
    dispose,
  };
}
export async function transcribe(
  audio: Float32Array,
  mediaId: string,
  language: string,
  onProgress: (message: string, progress?: number) => void,
  signal: AbortSignal,
  quality: TranscriptionQuality = 'balanced',
): Promise<Transcript> {
  const session = createTranscriber(mediaId, language, onProgress, signal, quality);
  try {
    const result = await session.run(audio);
    if (!result.words.length)
      throw new Error(
        'No speech was detected. Try selecting the spoken language or importing an SRT transcript.',
      );
    return result;
  } finally {
    session.dispose();
  }
}
export function parseSrt(text: string, mediaId: string): Transcript {
  const words: Word[] = [];
  const seconds = (s: string) => {
    const [h, m, t] = s.replace(',', '.').split(':').map(Number);
    return h * 3600 + m * 60 + t;
  };
  for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    const match = block.match(
      /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})[^\n]*\n([\s\S]+)/,
    );
    if (!match) continue;
    const start = seconds(match[1]),
      end = seconds(match[2]);
    if (end <= start) continue;
    const cueId = uid();
    const tokens = match[3]
      .replace(/<[^>]*>/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    tokens.forEach((text, i) =>
      words.push({
        id: uid(),
        text,
        start: start + (i * (end - start)) / tokens.length,
        end: start + ((i + 1) * (end - start)) / tokens.length,
        speakerId: 'speaker-1',
        cueId,
        timingEstimated: true,
      }),
    );
  }
  if (!words.length) throw new Error('No valid captions found. Choose a standard .srt file.');
  return { mediaId, language: 'Imported', source: 'imported', words: markKeywords(words) };
}
