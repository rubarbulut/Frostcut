import {
  applyOperations,
  clipEnd,
  defaultProps,
  duration,
  isSequenceClip,
  isLocked,
  uid,
  type Project,
  type ProjectSequence,
  type Suggestion,
  type SequenceClip,
} from './model';
import { sourceSequence } from './clip-source';
import { NestedSequencePlan, validSequenceReference } from './nested-sequence-plan';

export function sequenceSnapshot(p: Project, id: string, name: string): ProjectSequence {
  return structuredClone({
    id,
    name,
    clips: p.clips,
    tracks: p.tracks,
    settings: p.settings,
    captions: p.captions,
    subtitleVariants: p.subtitleVariants,
    publishing: p.publishing,
    chapters: p.chapters,
    adjustments: p.adjustments,
    exportSettings: p.exportSettings,
    suggestions: p.suggestions,
  });
}
/** Read-only views for panels: keep the active edit current without cloning its media timeline. */
export function sequenceViews(p: Project): ProjectSequence[] {
  return (p.sequences ?? []).map((s) =>
    s.id === p.activeSequenceId
      ? {
          ...s,
          clips: p.clips,
          tracks: p.tracks,
          settings: p.settings,
          captions: p.captions,
          subtitleVariants: p.subtitleVariants,
          publishing: p.publishing,
          chapters: p.chapters,
          adjustments: p.adjustments,
          exportSettings: p.exportSettings,
          suggestions: p.suggestions,
        }
      : ('adjustments' in s ? s : { ...s, adjustments: undefined }),
  );
}
export function syncSequence(p: Project): Project {
  if (!p.activeSequenceId || !p.sequences) return p;
  return {
    ...p,
    sequences: p.sequences.map((s) =>
      s.id === p.activeSequenceId ? sequenceSnapshot(p, s.id, s.name) : s,
    ),
  };
}
export function switchSequence(project: Project, id: string): Project {
  const p = syncSequence(project),
    target = p.sequences?.find((s) => s.id === id);
  if (!target) throw new Error('This sequence is no longer in the project.');
  const { id: _, name: __, ...timeline } = structuredClone(target);
  return { ...p, ...timeline, chapters: target.chapters, adjustments: target.adjustments, activeSequenceId: id };
}
export function createShortSequences(project: Project, suggestions: Suggestion[]): Project {
  if (!suggestions.length) throw new Error('Select at least one highlight.');
  if (
    suggestions.some(
      (s) => s.type !== 'highlight' && !s.operations.some((o) => o.type === 'assemble'),
    )
  )
    throw new Error('Only highlights and composite clips can become separate Shorts.');
  if (project.clips.some((c) => isLocked(project, c)))
    throw new Error('Unlock video and linked audio tracks before creating Shorts.');
  if (project.adjustments?.some((a) => a.locked))
    throw new Error('Unlock adjustment layers before creating Shorts.');
  let p = syncSequence(project);
  const originalId = p.activeSequenceId ?? uid();
  const sequences = p.sequences ?? [sequenceSnapshot(p, originalId, 'Original edit')];
  if (sequences.length + suggestions.length > 30)
    throw new Error('This project supports up to 30 sequences. Remove an unused sequence first.');
  const created = suggestions.map((s, index) => {
    const next = applyOperations(
      { ...p, sequences: undefined, activeSequenceId: undefined },
      s.operations,
      s.reason,
    );
    next.suggestions = [];
    next.chapters = undefined;
    if (!next.clips.length)
      throw new Error(
        'This suggestion contains no footage after its cuts. Analyze again with lower silence sensitivity.',
      );
    next.settings = { ...next.settings, preset: 'YouTube Shorts', width: 1080, height: 1920 };
    next.exportSettings = { ...next.exportSettings, width: 1080, height: 1920 };
    next.captions = { ...next.captions, enabled: true, safeArea: true };
    return sequenceSnapshot(
      next,
      uid(),
      `Short ${sequences.length + index} · ${s.title}`.slice(0, 80),
    );
  });
  p = { ...p, activeSequenceId: originalId, sequences: [...sequences, ...created] };
  return switchSequence(p, created[0].id);
}
export function removeSequence(project: Project, id: string): Project {
  if (!project.sequences || project.sequences.length < 2) return project;
  const parents = sequenceReferences(project, id);
  if (parents.length) throw new Error(`This sequence is used by ${parents.map((s) => s.name).join(', ')}. Remove those placements first.`);
  const p =
    project.activeSequenceId === id
      ? switchSequence(project, project.sequences.find((s) => s.id !== id)!.id)
      : syncSequence(project);
  return { ...p, sequences: p.sequences!.filter((s) => s.id !== id) };
}

export function sequenceReferences(p: Project, id: string) {
  return sequenceViews(p).filter((s) => s.id !== id && s.clips.some((c) => isSequenceClip(c) && c.sequenceId === id));
}

/** Create a real editable workspace; copied references keep their live child identity. */
export function createSequence(project: Project, name: string, duplicateId?: string): Project {
  const clean = name.trim();
  if (!clean || clean.length > 80) throw new Error('Use a sequence name from 1 to 80 characters.');
  let p = syncSequence(project);
  const originalId = p.activeSequenceId ?? uid();
  p = { ...p, activeSequenceId: originalId,
    sequences: p.sequences ?? [sequenceSnapshot(p, originalId, 'Original edit')] };
  if (p.sequences!.length >= 30) throw new Error('This project supports up to 30 sequences. Remove an unused sequence first.');
  const source = duplicateId ? sourceSequence(p, duplicateId) : undefined;
  if (duplicateId && !source) throw new Error('Choose an existing sequence to duplicate.');
  const id = uid();
  let created: ProjectSequence;
  if (source) {
    const groups = new Map<string, string>();
    const copy = structuredClone(source);
    created = { ...copy, id, name: clean, clips: copy.clips.map((clip) => {
      const group = clip.groupId;
      if (group && !groups.has(group)) groups.set(group, uid());
      return { ...clip, id: uid(), groupId: group ? groups.get(group) : undefined };
    }), suggestions: [], publishing: undefined };
  } else {
    created = sequenceSnapshot({ ...p, clips: [], tracks: p.tracks.map((t) => ({ ...t, locked: false, muted: false, hidden: false })),
      suggestions: [], publishing: undefined, subtitleVariants: undefined, chapters: undefined, adjustments: [] }, id, clean);
  }
  return switchSequence({ ...p, sequences: [...p.sequences!, created] }, id);
}

export function insertSequenceReference(project: Project, sequenceId: string, options: {
  start?: number; sourceStart?: number; sourceEnd?: number; trackId?: string;
} = {}): Project {
  const p = syncSequence(project), source = sourceSequence(p, sequenceId);
  if (!source) throw new Error('Choose an existing source sequence.');
  if (p.activeSequenceId === sequenceId) throw new Error('A sequence cannot be inserted into itself.');
  const seconds = Math.max(0, ...source.clips.map(clipEnd));
  if (seconds < 0.001) throw new Error('The source sequence has no playable timeline.');
  const trackId = options.trackId ?? p.tracks.find((t) => t.kind === 'video')?.id;
  if (!trackId || !p.tracks.some((t) => t.id === trackId)) throw new Error('Choose an existing target track.');
  const reference: SequenceClip = { id: uid(), sequenceId, trackId, start: options.start ?? duration(p),
    sourceStart: options.sourceStart ?? 0, sourceEnd: options.sourceEnd ?? seconds, properties: { ...defaultProps } };
  if (isLocked(p, reference)) throw new Error('Unlock the target track and linked audio before inserting a sequence.');
  if (!validSequenceReference(reference) || reference.sourceEnd > seconds)
    throw new Error('Choose a source range inside this sequence and a supported timeline position.');
  const next = { ...p, clips: [...p.clips, reference] };
  new NestedSequencePlan(sequenceViews(next)); // Also rejects indirect cycles through inactive edits.
  return syncSequence(next);
}
