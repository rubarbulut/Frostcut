import type { MediaAsset, Project, Transcript } from './model';
import { extractAudio } from './media';
import { audioWaveforms, mediaFiles, useEditor } from './store';
import { createTranscriber } from './transcription';
import {
  analysisWindows,
  mergeWindowWords,
  rmsEnvelope,
  silencesFromEnvelope,
} from './audio-analysis';
import { resolveQuality } from './transcription-config';

const envelopes = new Map<string, { file: File; energy: Float32Array }>();
export function measuredSilences(mediaId: string, sensitivity: number) {
  const cached = envelopes.get(mediaId);
  return cached && cached.file === mediaFiles.get(mediaId)
    ? silencesFromEnvelope(cached.energy, sensitivity)
    : undefined;
}
export async function analyzeSource(
  asset: MediaAsset,
  settings: Project['settings'],
  needTranscript: boolean,
  sensitivity: number,
  signal: AbortSignal,
  onProgress: (message: string, progress?: number) => void,
  onDiscovery?: (transcript: Transcript | undefined, elapsed: number) => void,
) {
  const file = mediaFiles.get(asset.id);
  if (!file) throw new Error('Relink missing media before processing.');
  const cached = measuredSilences(asset.id, sensitivity);
  if (!needTranscript && cached) return { silences: cached, transcript: undefined };
  const windows = analysisWindows(asset.duration),
    energy = new Float32Array(Math.ceil(asset.duration / 0.02));
  let transcript: Transcript | undefined,
    index = 0;
  const session = needTranscript
    ? createTranscriber(
        asset.id,
        settings.language,
        (message) =>
          onProgress(
            `${asset.name} · part ${index + 1}/${windows.length} · ${message}`,
            (index / windows.length) * 100,
          ),
        signal,
        resolveQuality(settings.transcriptionQuality),
        settings.transcriptionDevice ?? 'auto',
      )
    : undefined;
  try {
    for (index = 0; index < windows.length; index++) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const window = windows[index];
      const audio = await extractAudio(
        file,
        signal,
        () =>
          onProgress(
            `${asset.name} · preparing audio ${index + 1}/${windows.length}`,
            (index / windows.length) * 100,
          ),
        { start: window.start, duration: window.duration },
      );
      const rms = rmsEnvelope(audio);
      const from = Math.round((window.coreStart - window.start) / 0.02),
        count = Math.ceil((window.coreEnd - window.coreStart) / 0.02);
      energy.set(rms.subarray(from, from + count), Math.round(window.coreStart / 0.02));
      // Quiet windows contain no useful ASR input and often provoke hallucinated subtitles.
      if (session && rms.some((value) => value > 0.003)) {
        const part = await session.run(audio);
        transcript = {
          ...part,
          words: mergeWindowWords(transcript?.words ?? [], part.words, window),
        };
      }
      onProgress(
        `${asset.name} · analyzed ${index + 1}/${windows.length} parts`,
        ((index + 1) / windows.length) * 100,
      );
      onDiscovery?.(transcript, window.coreEnd);
    }
    if (needTranscript && !transcript?.words.length)
      throw new Error(
        'No speech was detected. Try selecting the spoken language or importing an SRT transcript.',
      );
    for (const id of envelopes.keys()) if (!mediaFiles.has(id)) envelopes.delete(id);
    envelopes.set(asset.id, { file, energy });
    const peaks: number[] = [];
    for (let i = 0; i < energy.length; i += 5)
      peaks.push(Math.min(1, Math.max(...energy.subarray(i, i + 5)) * 5));
    audioWaveforms.set(asset.id, peaks);
    useEditor.getState().mediaChanged();
    return { transcript, silences: silencesFromEnvelope(energy, sensitivity) };
  } finally {
    session?.dispose();
  }
}
