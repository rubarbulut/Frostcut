import { duration, type Project } from './model';
import { estimatedMegabytes } from './export-settings';
import { sequenceViews } from './sequences';
import { zipEntryNames } from './zip';

/** Metadata-only preflight: never decode source files or start the media engine. */
export function batchPlan(p: Project, ids: string[], available: { has: (id: string) => boolean }) {
  const chosen = new Set(ids);
  const sequences = sequenceViews(p).filter((s) => chosen.has(s.id));
  const errors: string[] = [];
  if (!sequences.length) errors.push('Select at least one part.');
  if (sequences.length !== chosen.size)
    errors.push('A selected part is no longer available. Select the parts again.');
  const names = zipEntryNames(
    sequences.map((s, index) => `${String(index + 1).padStart(2, '0')}-${s.name}.mp4`),
  );
  const entries = sequences.map((sequence, index) => {
    const project = { ...p, ...sequence };
    const seconds = duration(project);
    const issues: string[] = [];
    if (!sequence.clips.length || !Number.isFinite(seconds) || seconds <= 0)
      issues.push('This part has no playable timeline.');
    const missing = [...new Set(sequence.clips.map((c) => c.mediaId))].filter(
      (id) => !available.has(id),
    );
    if (missing.length)
      issues.push(
        `Relink: ${missing.map((id) => p.media.find((m) => m.id === id)?.name ?? id).join(', ')}`,
      );
    const settings = sequence.exportSettings;
    if (![settings.width, settings.height, settings.fps].every((n) => Number.isFinite(n) && n > 0))
      issues.push('Check this part’s export dimensions and frame rate.');
    for (const issue of issues) errors.push(`${sequence.name}: ${issue}`);
    return {
      id: sequence.id,
      name: sequence.name,
      filename: names[index],
      seconds: Number.isFinite(seconds) ? seconds : 0,
      megabytes: estimatedMegabytes(project),
      issues,
    };
  });
  return { entries, errors };
}
