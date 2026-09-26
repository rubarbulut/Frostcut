import { type Word, uid } from './model';
import { markKeywords } from './ai';
export type SpeechChunk = { text: string; timestamp: [number | null, number | null] };
/** Keep the model's word alignment, repairing missing/broken bounds without losing words. */
export function normalizeSpeechChunks(chunks: SpeechChunk[], duration: number): Word[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const words: Word[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i],
      tokens = c.text.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const valid = (n: unknown): n is number =>
      typeof n === 'number' && Number.isFinite(n) && n >= 0;
    const rawStart = c.timestamp?.[0],
      rawEnd = c.timestamp?.[1];
    let start = Math.max(
      0,
      Math.min(duration, valid(rawStart) ? rawStart : (words.at(-1)?.end ?? 0)),
    );
    let end =
      valid(rawEnd) && rawEnd > start
        ? rawEnd
        : (chunks
            .slice(i + 1)
            .map((x) => x.timestamp?.[0])
            .find((t) => valid(t) && t > start) ?? duration);
    end = Math.min(duration, end);
    if (end <= start) {
      start = Math.max(0, duration - 0.02);
      end = duration;
    }
    const estimated = !valid(rawStart) || !valid(rawEnd) || rawEnd <= rawStart;
    tokens.forEach((text, index) => {
      const from = start + (index * (end - start)) / tokens.length,
        to = start + ((index + 1) * (end - start)) / tokens.length;
      const previous = words.at(-1);
      if (
        previous?.text === text &&
        Math.abs(previous.start - from) < 0.03 &&
        Math.abs(previous.end - to) < 0.03
      )
        return;
      words.push({
        id: uid(),
        text,
        start: from,
        end: to,
        speakerId: 'speaker-1',
        timingEstimated: estimated || tokens.length > 1,
      });
    });
  }
  return markKeywords(words.sort((a, b) => a.start - b.start));
}
