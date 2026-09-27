import { timelineWords, type Project, type TimelineWord } from './model';
import { transcriptGroups } from './caption-editing';
import { srtTime } from './subtitles';
export const subtitleLanguages = {
  en: 'English',
  tr: 'Turkish',
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
  de: 'German',
  pl: 'Polish',
} as const;
export type SubtitleLanguage = keyof typeof subtitleLanguages;
export type SubtitleCue = {
  start: number; end: number; text: string; speakerId: string;
  /** Explicit timing preserves translated words when a cue is cut between episodes. */
  words?: { text: string; start: number; end: number }[];
};
export function subtitleCueWords(cue: SubtitleCue) {
  if (cue.words) return cue.words;
  const tokens = cue.text.trim().split(/\s+/).filter(Boolean);
  return tokens.map((text, index) => ({ text,
    start: cue.start + ((cue.end - cue.start) * index) / tokens.length,
    end: cue.start + ((cue.end - cue.start) * (index + 1)) / tokens.length,
  }));
}
export type SubtitleVariant = {
  language: SubtitleLanguage;
  sourceFingerprint: string;
  cues: SubtitleCue[];
};
export function subtitleFingerprint(p: Project) {
  let hash = 2166136261;
  const data = JSON.stringify(
    timelineWords(p).map((w) => [
      w.clipId,
      w.id,
      w.text,
      w.timelineStart,
      w.timelineEnd,
      w.speakerId,
    ]),
  );
  for (let i = 0; i < data.length; i++) hash = Math.imul(hash ^ data.charCodeAt(i), 16777619);
  return `${data.length}:${hash >>> 0}`;
}
export function sourceCues(p: Project): SubtitleCue[] {
  return transcriptGroups(p).map((words) => ({
    start: words[0].timelineStart,
    end: Math.max(...words.map((w) => w.timelineEnd)),
    text: words.map((w) => w.text).join(' '),
    speakerId: words[0].speakerId,
  }));
}
export function currentVariant(p: Project) {
  const variant = p.subtitleVariants?.find((v) => v.language === p.captions.language);
  return variant?.sourceFingerprint === subtitleFingerprint(p) ? variant : undefined;
}
export function translatedWords(p: Project): TimelineWord[] | undefined {
  if (!p.captions.language) return;
  const variant = currentVariant(p);
  return variant?.cues.flatMap((cue, i) => {
    return subtitleCueWords(cue).map(({ text, start, end }, index) => {
      return {
        id: `translated-${i}-${index}`,
        text,
        start,
        end,
        timelineStart: start,
        timelineEnd: end,
        clipId: 'translated',
        mediaId: '',
        cueId: `translated-${i}`,
        speakerId: cue.speakerId,
        timingEstimated: true,
      };
    });
  });
}
export function cuesSrt(cues: SubtitleCue[]) {
  return cues
    .map(
      (c, i) =>
        `${i + 1}\r\n${srtTime(c.start)} --> ${srtTime(c.end)}\r\n${c.text.replace(/[\r\n]+/g, ' ')}\r\n`,
    )
    .join('\r\n');
}
export async function translateCues(
  cues: SubtitleCue[],
  source: SubtitleLanguage,
  target: SubtitleLanguage,
  signal: AbortSignal,
  progress: (s: string) => void,
): Promise<SubtitleCue[]> {
  const worker = new Worker(new URL('./translation.worker.ts', import.meta.url), {
    type: 'module',
  });
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.terminate();
      signal.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      cleanup();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', cancel, { once: true });
    worker.onerror = (e) => {
      cleanup();
      reject(new Error(e.message || 'The translation model could not start.'));
    };
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') progress(data.message);
      else if (data.type === 'result') {
        cleanup();
        resolve(cues.map((c, i) => ({ ...c, text: data.texts[i], words: undefined })));
      } else if (data.type === 'error') {
        cleanup();
        reject(new Error(data.message));
      }
    };
    if (signal.aborted) cancel();
    else worker.postMessage({ texts: cues.map((c) => c.text), source, target });
  });
}
