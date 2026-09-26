import { type Transcript, type Word, uid } from './model';
import { markKeywords } from './ai';
import { normalizeSpeechChunks } from './speech-result';
import { type TranscriptionQuality } from './transcription-config';
export function transcribe(
  audio: Float32Array,
  mediaId: string,
  language: string,
  onProgress: (message: string, progress?: number) => void,
  signal: AbortSignal,
  quality: TranscriptionQuality = 'balanced',
): Promise<Transcript> {
  // Transferring audio.buffer detaches it. Capture duration before posting to the worker.
  const audioDuration = audio.length / 16000;
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Cancelled', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('./transcription.worker.ts', import.meta.url), {
      type: 'module',
    });
    const abort = () => {
      worker.terminate();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    const finish = () => {
      worker.terminate();
      signal.removeEventListener('abort', abort);
    };
    worker.onerror = (e) => {
      finish();
      reject(new Error(e.message || 'The local speech model could not start.'));
    };
    worker.onmessage = (e) => {
      const { type, message, progress, result, model } = e.data;
      if (type === 'progress') onProgress(message, progress);
      if (type === 'error') {
        finish();
        reject(new Error(message));
      }
      if (type === 'result') {
        finish();
        const chunks = (Array.isArray(result) ? result[0] : result).chunks ?? [];
        const words = normalizeSpeechChunks(chunks, audioDuration);
        if (!words.length) {
          reject(
            new Error(
              'No speech was detected. Try selecting the spoken language or importing an SRT transcript.',
            ),
          );
          return;
        }
        resolve({ mediaId, language, source: 'local', words, model });
      }
    };
    worker.postMessage({ audio, language, quality }, [audio.buffer]);
  });
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
