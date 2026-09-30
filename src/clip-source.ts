import { clipEnd, isMediaClip, isSequenceClip, type Clip, type MediaAsset, type Project, type ProjectSequence } from './model';

type SourceInfo = { sourceId: string; name: string; duration: number; width: number; height: number };
export type ClipSource = SourceInfo & (
  | { kind: 'media'; media: MediaAsset }
  | { kind: 'sequence'; sequence: ProjectSequence }
);
/** Active timeline is authoritative; stored sequence snapshots can predate its latest edit. */
export function sourceSequence(p: Project, id: string): ProjectSequence | undefined {
  const saved = p.sequences?.find((s) => s.id === id);
  if (!saved || p.activeSequenceId !== id) return saved;
  return { ...saved, clips: p.clips, tracks: p.tracks, settings: p.settings, captions: p.captions,
    subtitleVariants: p.subtitleVariants, publishing: p.publishing, chapters: p.chapters,
    adjustments: p.adjustments, exportSettings: p.exportSettings, suggestions: p.suggestions };
}

/** Local sequence clocks/settings, with the original project's real media/transcripts. */
export function sequenceProject(p: Project, sequence: ProjectSequence): Project {
  const { id, name: _, ...timeline } = sequence;
  return { ...p, ...timeline, activeSequenceId: id };
}

// Editor commits replace Project objects; cache only metadata/dependencies, never decoded media.
const sources = new WeakMap<Project, Map<string, ClipSource | undefined>>();
export function clipSource(p: Project, clip: Clip): ClipSource | undefined {
  const key = isMediaClip(clip) ? `media:${clip.mediaId}` : isSequenceClip(clip) ? `sequence:${clip.sequenceId}` : undefined;
  if (!key) return;
  let cache = sources.get(p);
  if (!cache) { cache = new Map(); sources.set(p, cache); }
  if (cache.has(key)) return cache.get(key);
  let info: ClipSource | undefined;
  if (isMediaClip(clip)) {
    const media = p.media.find((m) => m.id === clip.mediaId);
    if (media) info = { kind: 'media', media, sourceId: media.id, name: media.name,
      duration: media.duration, width: media.width, height: media.height };
  } else {
    const sequence = sourceSequence(p, clip.sequenceId!);
    if (sequence) info = { kind: 'sequence', sequence, sourceId: sequence.id, name: sequence.name,
      duration: Math.max(0, ...sequence.clips.map(clipEnd)), width: sequence.settings.width, height: sequence.settings.height };
  }
  cache.set(key, info); return info;
}
export function requireClipSource(p: Project, clip: Clip) {
  const source = clipSource(p, clip);
  if (!source) throw new Error(isSequenceClip(clip) ? 'The source sequence is missing.' : 'The source media is missing. Relink it before continuing.');
  return source;
}
export function clipTrimLimit(p: Project, clip: Clip) {
  const source = requireClipSource(p, clip);
  return source.kind === 'sequence' ? Math.max(source.duration, clip.sourceEnd) : source.duration;
}
/** Native decoders/analysis need a real file. Recursive composition consumes references. */
export function requireMediaClip(clip: Clip) {
  if (!isMediaClip(clip)) throw new Error('This action needs an original media clip. Open the source sequence and select its media clip.');
  return clip;
}

/** Real media dependencies of an edit, including every referenced descendant. No virtual IDs. */
export function sourceMediaIds(p: Project, clips: readonly Clip[] = p.clips) {
  const ids = new Set<string>(), visited = new Set<string>(), visiting = new Set<string>();
  const visit = (items: readonly Clip[]) => {
    for (const clip of items) {
      if (isMediaClip(clip)) { ids.add(clip.mediaId); continue; }
      if (!isSequenceClip(clip)) throw new Error('A clip must reference exactly one media file or sequence.');
      const id = clip.sequenceId;
      if (visiting.has(id)) throw new Error('Nested sequences cannot contain a reference cycle.');
      if (visited.has(id)) continue;
      const sequence = sourceSequence(p, id);
      if (!sequence) throw new Error('A referenced sequence is missing.');
      visiting.add(id); visit(sequence.clips); visiting.delete(id); visited.add(id);
    }
  };
  visit(clips); return [...ids];
}
