import { type Project, type TimelineWord, type Word, clipEnd, timelineWords, uid } from './model';
import { markKeywords } from './ai';
import { requireMediaClip } from './clip-source';
export type CaptionDraft = { text: string; start: number; end: number; speakerId: string };
export function transcriptGroups(p: Project): TimelineWord[][] {
  const groups: TimelineWord[][] = [];
  for (const word of timelineWords(p)) {
    const group = groups.at(-1),
      last = group?.at(-1);
    if (
      !group ||
      !last ||
      group[0].clipId !== word.clipId ||
      group[0].speakerId !== word.speakerId ||
      group[0].cueId !== word.cueId ||
      /[.!?]$/.test(last.text) ||
      last.timelineEnd + 0.65 < word.timelineStart ||
      group.length >= 16
    )
      groups.push([word]);
    else group.push(word);
  }
  return groups;
}
export function captionBounds(p: Project, clipId: string, ids: string[]) {
  const clip = p.clips.find((c) => c.id === clipId);
  if (!clip) throw new Error('This clip is no longer on the timeline.');
  const words = timelineWords(p).filter((w) => w.clipId === clipId && ids.includes(w.id));
  if (!words.length) throw new Error('This caption is no longer on the timeline.');
  return {
    clip,
    words,
    start: Math.min(...words.map((w) => w.timelineStart)),
    end: Math.max(...words.map((w) => w.timelineEnd)),
  };
}
export function editCaption(
  p: Project,
  clipId: string,
  ids: string[],
  draft: CaptionDraft,
): Project {
  const clip = p.clips.find((c) => c.id === clipId);
  if (!clip) throw new Error('Choose a video clip first.');
  requireMediaClip(clip);
  if (p.tracks.find((t) => t.id === clip.trackId)?.locked)
    throw new Error('Unlock this video track to edit its captions.');
  const { start, end, speakerId } = draft,
    tokens = draft.text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) throw new Error('Add some caption text.');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 0.04)
    throw new Error('The end time must be at least 0.04 seconds after the start.');
  if (start < clip.start - 0.0001 || end > clipEnd(clip) + 0.0001)
    throw new Error('Keep the caption inside its video clip.');
  if (!p.speakers.some((s) => s.id === speakerId)) throw new Error('Choose a speaker.');
  const visible = timelineWords(p).filter((w) => w.clipId === clipId),
    picked = visible.filter((w) => ids.includes(w.id));
  if (ids.length && new Set(picked.map((w) => w.id)).size !== new Set(ids).size)
    throw new Error('The selected caption changed. Reopen it and try again.');
  if (
    visible.some(
      (w) => !ids.includes(w.id) && w.timelineStart < end - 0.001 && w.timelineEnd > start + 0.001,
    )
  )
    throw new Error(
      'This time range overlaps another caption. Move its boundary or choose a free interval.',
    );
  const oldStart = picked.length ? Math.min(...picked.map((w) => w.timelineStart)) : start,
    oldEnd = picked.length ? Math.max(...picked.map((w) => w.timelineEnd)) : end;
  const toSource = (t: number) => clip.sourceStart + (t - clip.start) * clip.properties.speed;
  const cueId = picked.length === 1 ? picked[0].cueId : (picked[0]?.cueId ?? uid());
  const replacement: Word[] = tokens.map((text, i) => {
    const original = picked.length === tokens.length ? picked[i] : undefined;
    const from = original
      ? start + ((original.timelineStart - oldStart) / (oldEnd - oldStart)) * (end - start)
      : start + (i / tokens.length) * (end - start);
    const to = original
      ? start + ((original.timelineEnd - oldStart) / (oldEnd - oldStart)) * (end - start)
      : start + ((i + 1) / tokens.length) * (end - start);
    return {
      id: original?.id ?? uid(),
      text,
      start: toSource(from),
      end: toSource(to),
      speakerId,
      cueId,
      timingEstimated: !original || original.timingEstimated,
    };
  });
  const next = structuredClone(p),
    target = next.clips.find((c) => c.id === clipId)!;
  const original =
    clip.captionWords ?? p.transcripts.find((t) => t.mediaId === clip.mediaId)?.words ?? [];
  target.captionWords = [
    ...structuredClone(original.filter((w) => !ids.includes(w.id))),
    ...markKeywords(replacement),
  ].sort((a, b) => a.start - b.start);
  next.captions.enabled = true;
  return next;
}
export function removeCaption(p: Project, clipId: string, ids: string[]): Project {
  const next = structuredClone(p),
    clip = next.clips.find((c) => c.id === clipId);
  if (!clip) throw new Error('This clip is no longer on the timeline.');
  requireMediaClip(clip);
  if (p.tracks.find((t) => t.id === clip.trackId)?.locked)
    throw new Error('Unlock this video track to edit its captions.');
  clip.captionWords = (
    clip.captionWords ??
    p.transcripts.find((t) => t.mediaId === clip.mediaId)?.words ??
    []
  ).filter((w) => !ids.includes(w.id));
  return next;
}
export function suggestCaptionInterval(p: Project, clipId: string, time: number) {
  const clip = p.clips.find((c) => c.id === clipId)!;
  const words = timelineWords(p).filter((w) => w.clipId === clipId);
  let cursor = Math.max(clip.start, Math.min(clipEnd(clip) - 0.05, time));
  for (const word of words) {
    if (word.timelineEnd <= cursor) continue;
    if (word.timelineStart - cursor >= 0.15)
      return { start: cursor, end: Math.min(cursor + 2, word.timelineStart) };
    cursor = Math.max(cursor, word.timelineEnd);
  }
  if (clipEnd(clip) - cursor >= 0.05)
    return { start: cursor, end: Math.min(cursor + 2, clipEnd(clip)) };
  return { start: Math.max(clip.start, clipEnd(clip) - 1), end: clipEnd(clip) };
}
