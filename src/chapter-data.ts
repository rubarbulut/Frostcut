export type Chapter = {
  id: string;
  start: number;
  title: string;
  reason?: string;
  excerpt?: string;
};
export type ChapterSet = {
  source: 'manual' | 'structure' | 'semantic';
  sourceFingerprint: string;
  model?: string;
  items: Chapter[];
};
export const CHAPTER_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
export const CHAPTER_MODEL_REVISION = '2c4055b12046f11709e9df2c122e59ffbdc2f900';
/** Retain every character, including unspaced languages and surrogate pairs. */
export function splitChapterText(text: string): [string, string] {
  const points = Array.from(text);
  const middle = Math.floor(points.length / 2);
  let boundary = middle;
  while (boundary > middle / 2 && !/\s/u.test(points[boundary])) boundary--;
  const cut = boundary > middle / 2 ? boundary : middle;
  return [points.slice(0, cut).join(''), points.slice(cut).join('')];
}

export function validChapterSet(value: unknown): value is ChapterSet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const set = value as ChapterSet;
  const text = (v: unknown, max: number) => typeof v === 'string' && !!v.trim() && v.length <= max;
  if (
    !['manual', 'structure', 'semantic'].includes(set.source) ||
    !text(set.sourceFingerprint, 500) ||
    (set.model !== undefined && !text(set.model, 200)) ||
    (set.source === 'semantic' && !set.model) ||
    !Array.isArray(set.items) ||
    !set.items.length ||
    set.items.length > 100
  )
    return false;
  return (
    set.items.every(
      (c, i) =>
        c &&
        text(c.id, 100) &&
        text(c.title, 120) &&
        !/[\r\n]/.test(c.title) &&
        typeof c.start === 'number' &&
        Number.isFinite(c.start) &&
        c.start >= 0 &&
        c.start <= 86400 &&
        (i === 0 || c.start > set.items[i - 1].start) &&
        (c.reason === undefined || text(c.reason, 300)) &&
        (c.excerpt === undefined || text(c.excerpt, 600)),
    ) && new Set(set.items.map((c) => c.id)).size === set.items.length
  );
}
export function chapterTimestamp(time: number, milliseconds = false) {
  const total = Math.max(0, Math.floor(time * (milliseconds ? 1000 : 1)));
  const seconds = milliseconds ? Math.floor(total / 1000) : total;
  const h = Math.floor(seconds / 3600),
    m = Math.floor(seconds / 60) % 60,
    s = seconds % 60;
  return `${h || milliseconds ? `${String(h).padStart(2, '0')}:` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${milliseconds ? `.${String(total % 1000).padStart(3, '0')}` : ''}`;
}
export function chapterRangeIssues(set: ChapterSet, total: number) {
  if (!validChapterSet(set))
    return ['Use 1–100 chapters with unique, increasing times and non-empty titles.'];
  if (total <= 0 || set.items.some((c) => c.start >= total))
    return ['Keep every chapter start inside the current timeline.'];
  if (
    set.items.some(
      (c, i) => Math.floor(c.start * 1000) >= Math.floor((set.items[i + 1]?.start ?? total) * 1000),
    )
  )
    return ['Leave at least one millisecond between chapter boundaries.'];
  return [];
}
export function youtubeChapterIssues(set: ChapterSet, total: number) {
  const issues = chapterRangeIssues(set, total);
  if (issues.length) return issues;
  if (Math.floor(set.items[0].start) !== 0) issues.push('YouTube chapters must start at 00:00.');
  if (set.items.length < 3) issues.push('YouTube needs at least 3 chapters.');
  if (
    set.items.some(
      (c, i) => Math.floor(set.items[i + 1]?.start ?? total) - Math.floor(c.start) < 10,
    )
  )
    issues.push('Each YouTube chapter must last at least 10 seconds, including the final chapter.');
  return issues;
}
