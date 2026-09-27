import { duration, isAudioClip, uid, type Project } from './model';
import { sourceCues, subtitleFingerprint } from './translations';
import { keywords } from './publishing';
import type { PublishingMetadata } from './publishing';
import {
  CHAPTER_MODEL,
  chapterRangeIssues,
  chapterTimestamp,
  youtubeChapterIssues,
  type ChapterSet,
} from './chapter-data';

export type ChapterBlock = { start: number; end: number; text: string };
export type ChapterOptions = { count: number; minimumSeconds: number };
export function chapterFingerprint(p: Project) {
  const layout = JSON.stringify(
    p.clips
      .filter((c) => !isAudioClip(p, c))
      .map((c) => [
        c.id,
        c.mediaId,
        c.trackId,
        c.start,
        c.sourceStart,
        c.sourceEnd,
        c.properties.speed,
        !!p.tracks.find((t) => t.id === c.trackId)?.hidden,
      ]),
  );
  let hash = 2166136261;
  for (let i = 0; i < layout.length; i++) hash = Math.imul(hash ^ layout.charCodeAt(i), 16777619);
  return `chapters-v1:${duration(p)}:${layout.length}:${hash >>> 0}:${subtitleFingerprint(p)}`;
}
export function chaptersAreStale(p: Project, set = p.chapters) {
  return !!set && set.sourceFingerprint !== chapterFingerprint(p);
}
/** Small sentence groups bound semantic inference work without decoding any media. */
export function chapterBlocks(p: Project): ChapterBlock[] {
  const blocks: ChapterBlock[] = [],
    seen = new Set<string>();
  for (const cue of sourceCues(p)) {
    const text = cue.text.trim();
    const key = JSON.stringify([cue.start, cue.end, text]);
    if (!text || seen.has(key)) continue;
    seen.add(key);
    const previous = blocks.at(-1);
    if (
      previous &&
      text.length + previous.text.length < 320 &&
      cue.start - previous.end < 1.2 &&
      cue.end - previous.start < 15
    ) {
      previous.text += ` ${text}`;
      previous.end = Math.max(previous.end, cue.end);
    } else blocks.push({ start: cue.start, end: cue.end, text });
  }
  if (blocks.length > 3000)
    throw new Error(
      'Use a shorter sequence for chapter suggestions (maximum 3,000 transcript groups).',
    );
  return blocks;
}
const cosine = (a: number[], b: number[]) => {
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] ** 2;
    bb += b[i] ** 2;
  }
  return aa && bb ? Math.max(-1, Math.min(1, dot / Math.sqrt(aa * bb))) : 0;
};
function mean(vectors: number[][]) {
  const total = Array<number>(vectors[0].length).fill(0);
  for (const v of vectors)
    v.forEach((n, i) => {
      total[i] += n / vectors.length;
    });
  return total;
}
function lexicalDistance(a: string[], b: string[]) {
  const left = new Set(keywords(a.join(' '), 60)),
    right = new Set(keywords(b.join(' '), 60));
  if (!left.size || !right.size) return 0;
  const common = [...left].filter((w) => right.has(w)).length;
  return 1 - common / (left.size + right.size - common);
}
export function suggestChapters(
  p: Project,
  blocks: ChapterBlock[],
  options: ChapterOptions,
  vectors?: number[][],
): ChapterSet {
  const total = duration(p);
  if (!blocks.length || total <= 0)
    throw new Error('Transcribe or import subtitles for footage on this timeline first.');
  if (
    !Number.isInteger(options.count) ||
    options.count < 1 ||
    options.count > 100 ||
    !Number.isFinite(options.minimumSeconds) ||
    options.minimumSeconds < 1 ||
    options.minimumSeconds > 600
  )
    throw new Error('Choose 1–100 chapters and a minimum length between 1 and 600 seconds.');
  if (
    vectors &&
    (vectors.length !== blocks.length ||
      vectors.some(
        (v) =>
          !Array.isArray(v) ||
          !v.length ||
          v.length !== vectors[0].length ||
          v.some((n) => !Number.isFinite(n)) ||
          !v.some((n) => n !== 0),
      ))
  )
    throw new Error('The local chapter model returned invalid embeddings. Retry the analysis.');
  const candidates = blocks
    .slice(1)
    .map((block, offset) => {
      const index = offset + 1,
        from = Math.max(0, index - 3),
        to = Math.min(blocks.length, index + 3);
      const change = vectors
        ? 1 - cosine(mean(vectors.slice(from, index)), mean(vectors.slice(index, to)))
        : lexicalDistance(
            blocks.slice(from, index).map((b) => b.text),
            blocks.slice(index, to).map((b) => b.text),
          );
      const pause = Math.max(0, block.start - blocks[index - 1].end);
      return {
        index,
        start: Math.floor(block.start),
        score: change + Math.min(0.25, pause * 0.05),
        pause,
        eligible: change >= 0.08 || pause >= 4,
      };
    })
    .sort((a, b) => b.score - a.score || a.start - b.start);
  const selected = [{ index: 0, start: 0, score: 0, pause: 0 }];
  const limit = Math.min(options.count, Math.max(1, Math.floor(total / options.minimumSeconds)));
  for (const candidate of candidates) {
    if (selected.length >= limit) break;
    if (
      !candidate.eligible ||
      total - candidate.start < options.minimumSeconds ||
      selected.some((c) => Math.abs(c.start - candidate.start) < options.minimumSeconds)
    )
      continue;
    selected.push(candidate);
  }
  selected.sort((a, b) => a.start - b.start);
  const items = selected.map((entry, i) => {
    const end = selected[i + 1]?.index ?? blocks.length;
    let representative = entry.index;
    if (vectors) {
      const centroid = mean(vectors.slice(entry.index, end));
      let best = -Infinity;
      for (let j = entry.index; j < end; j++) {
        const score = cosine(vectors[j], centroid);
        if (score > best) {
          representative = j;
          best = score;
        }
      }
    }
    const excerpt = blocks[representative].text;
    const sentence = excerpt.split(/(?<=[.!?。！？])\s+/u)[0];
    const title = sentence.length > 90 ? `${sentence.slice(0, 87).trimEnd()}…` : sentence;
    return {
      id: uid(),
      start: entry.start,
      title: title.replace(/[\r\n]+/g, ' '),
      excerpt: excerpt.slice(0, 600),
      reason:
        i === 0
          ? 'Beginning of the sequence'
          : `${vectors ? 'Semantic topic change' : 'Transcript wording change'}${entry.pause >= 1 ? ` · ${entry.pause.toFixed(1)}s pause` : ''}`,
    };
  });
  return {
    source: vectors ? 'semantic' : 'structure',
    sourceFingerprint: chapterFingerprint(p),
    ...(vectors ? { model: CHAPTER_MODEL } : {}),
    items,
  };
}
export function saveChapters(p: Project, draft: ChapterSet): Project {
  const issues = chapterRangeIssues(draft, duration(p));
  if (issues.length) throw new Error(issues[0]);
  if (chaptersAreStale(p, draft))
    throw new Error('The timeline or transcript changed. Review the chapter times before saving.');
  return { ...p, chapters: structuredClone(draft) };
}
export function exportChapters(p: Project, format: 'youtube' | 'vtt' | 'json') {
  if (!p.chapters) throw new Error('Save chapters first.');
  if (chaptersAreStale(p))
    throw new Error('Review and save chapters after the timeline change before exporting.');
  const issues =
    format === 'youtube'
      ? youtubeChapterIssues(p.chapters, duration(p))
      : chapterRangeIssues(p.chapters, duration(p));
  if (issues.length) throw new Error(issues.join(' '));
  if (format === 'json')
    return JSON.stringify({ version: 1, duration: duration(p), ...p.chapters }, null, 2);
  if (format === 'youtube')
    return p.chapters.items.map((c) => `${chapterTimestamp(c.start)} ${c.title}`).join('\n');
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `WEBVTT\n\n${p.chapters.items.map((c, i) => `${i + 1}\n${chapterTimestamp(c.start, true)} --> ${chapterTimestamp(p.chapters!.items[i + 1]?.start ?? duration(p), true)}\n${escape(c.title)}\n`).join('\n')}`;
}
export function publishingChaptersStale(p: Project, draft: PublishingMetadata) {
  if (!draft.chapterAttachment) return false;
  try {
    return (
      !draft.description.includes(draft.chapterAttachment.text) ||
      draft.chapterAttachment.sourceFingerprint !== chapterFingerprint(p) ||
      exportChapters(p, 'youtube') !== draft.chapterAttachment.text
    );
  } catch {
    return true;
  }
}
export function appendChapters(p: Project, draft: PublishingMetadata): PublishingMetadata {
  const text = exportChapters(p, 'youtube');
  let description = draft.description;
  if (draft.chapterAttachment) {
    if (!description.includes(draft.chapterAttachment.text))
      throw new Error(
        'The appended chapter text was edited. Keep the description as manual text before appending another list.',
      );
    description = description.replace(draft.chapterAttachment.text, '').trim();
  } else if (description.includes(text)) {
    return { ...draft, chapterAttachment: { text, sourceFingerprint: chapterFingerprint(p) } };
  }
  description = `${description.trim()}\n\n${text}`.trim();
  if (description.length > 5000)
    throw new Error('Shorten the description before appending chapters (5,000 character limit).');
  return {
    ...draft,
    description,
    chapterAttachment: { text, sourceFingerprint: chapterFingerprint(p) },
  };
}
