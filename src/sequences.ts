import {
  applyOperations,
  isLocked,
  uid,
  type Project,
  type ProjectSequence,
  type Suggestion,
} from './model';

export function sequenceSnapshot(p: Project, id: string, name: string): ProjectSequence {
  return structuredClone({
    id,
    name,
    clips: p.clips,
    tracks: p.tracks,
    settings: p.settings,
    captions: p.captions,
    exportSettings: p.exportSettings,
    suggestions: p.suggestions,
  });
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
  return { ...p, ...timeline, activeSequenceId: id };
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
  const p =
    project.activeSequenceId === id
      ? switchSequence(project, project.sequences.find((s) => s.id !== id)!.id)
      : syncSequence(project);
  return { ...p, sequences: p.sequences!.filter((s) => s.id !== id) };
}
