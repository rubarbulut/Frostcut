import { clipEnd, duration, timelineWords, type Project } from './model';
import type { CutOptions } from './ai';

export const keywordPattern =
  /(?<![\p{L}\p{N}])(?:secret|best|never|always|stop|start|mistake|simple|powerful|perfect|hook|story|create|attention|seconds|better|free|fast|why|how|important|sırrı|hata|hikaye|hikâye|önemli|neden|nasıl|mejor|secreto|historia|importante|melhor|segredo|histoire|meilleur|erreur|wichtig|fehler|geschichte|besser|ważne|błąd|lepiej)(?![\p{L}\p{N}])/iu;
export function speechSafeSilences(p: Project, ranges: { start: number; end: number }[]) {
  const words = timelineWords(p);
  const result: { start: number; end: number }[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    let start = range.start;
    for (const word of words) {
      if (word.timelineEnd + 0.05 <= start) continue;
      if (word.timelineStart - 0.05 >= range.end) break;
      if (word.timelineStart - 0.05 > start) result.push({ start, end: word.timelineStart - 0.05 });
      start = Math.max(start, word.timelineEnd + 0.05);
      if (start >= range.end) break;
    }
    if (start < range.end) result.push({ start, end: range.end });
  }
  const merged: typeof result = [];
  for (const range of result.sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push(range);
  }
  return merged;
}
export function targetLengthBounds(length: number, total: number) {
  if (length === 14) return { min: 0, max: 14.99, target: 12 };
  if (length === 25) return { min: 15, max: 30, target: 25 };
  if (length === 45) return { min: 30, max: 60, target: 45 };
  if (length === 75) return { min: 60, max: 90, target: 75 };
  return { min: Math.min(10, total), max: Math.min(60, total), target: Math.min(30, total) };
}
export function highlightRanges(p: Project, opts: CutOptions) {
  const words = timelineWords(p),
    total = duration(p),
    bounds = targetLengthBounds(opts.length, total);
  const groups: (typeof words)[] = [];
  for (const word of words) {
    const group = groups.at(-1),
      last = group?.at(-1);
    const breakHere =
      !group ||
      !last ||
      last.clipId !== word.clipId ||
      last.speakerId !== word.speakerId ||
      /[.!?]$/.test(last.text) ||
      word.timelineStart - last.timelineEnd > 0.65 ||
      word.timelineEnd - group[0].timelineStart > bounds.max - 0.2 ||
      (group.length >= 8 && /[,;:]$/.test(last.text));
    if (breakHere) groups.push([word]);
    else group.push(word);
  }
  const candidates = groups
    .flatMap((group, index) => {
      const clip = p.clips.find((c) => c.id === group[0].clipId)!;
      const start = Math.max(clip.start, group[0].timelineStart - 0.06);
      let best = { end: Math.min(clipEnd(clip), group.at(-1)!.timelineEnd + 0.08), last: index };
      for (let j = index + 1; j < groups.length; j++) {
        const next = groups[j];
        if (
          next[0].clipId !== group[0].clipId ||
          next[0].timelineStart - groups[j - 1].at(-1)!.timelineEnd > 2.5
        )
          break;
        const end = Math.min(clipEnd(clip), next.at(-1)!.timelineEnd + 0.08);
        if (end - start > bounds.max) break;
        if (
          best.end - start < bounds.min ||
          Math.abs(end - start - bounds.target) < Math.abs(best.end - start - bounds.target)
        )
          best = { end, last: j };
      }
      if (best.end <= start || best.end - start > bounds.max + 0.001 || group.length < 2) return [];
      const text = group.map((w) => w.text).join(' ');
      const strong = keywordPattern.test(text),
        question = /[?!]/.test(text);
      const complete = /[.!?]$/.test(groups[best.last].at(-1)!.text);
      const score =
        (strong ? 22 : 0) +
        (question ? 8 : 0) +
        (complete ? 8 : 0) +
        Math.min(6, group.length) +
        (best.end - start >= bounds.min ? 20 : 0) -
        Math.abs(best.end - start - bounds.target) * 0.12;
      return [
        {
          start,
          end: best.end,
          text,
          score,
          reason: `${strong ? 'Strong hook' : 'Clear statement'}${best.end - start < bounds.min ? ' · shorter complete passage' : ''}`,
        },
      ];
    })
    .sort((a, b) => b.score - a.score || a.start - b.start);
  const count =
    opts.count || Math.min(10, Math.max(1, Math.floor(total / Math.max(45, bounds.target * 2))));
  const chosen: typeof candidates = [];
  for (const candidate of candidates) {
    if (chosen.length >= count) break;
    if (
      chosen.some((x) => Math.min(x.end, candidate.end) - Math.max(x.start, candidate.start) > 0.1)
    )
      continue;
    chosen.push(candidate);
  }
  return chosen;
}
