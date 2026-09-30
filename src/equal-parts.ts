import { clipEnd, duration, isLocked, uid, type Project } from './model';
import { sequenceSnapshot, syncSequence, switchSequence } from './sequences';
import { presetKeyframes } from './motion';
import { subtitleCueWords, subtitleFingerprint } from './translations';
import { remapAdjustments } from './adjustments';

export type PartOptions = { mode: 'count' | 'seconds'; value: number };
export type PartRange = { start: number; end: number };

export function equalPartRanges(p: Project, options: PartOptions): PartRange[] {
  const total = duration(p),
    fps = p.settings.fps;
  if (!p.clips.length || total <= 0) throw new Error('Add footage to the timeline first.');
  if (!Number.isFinite(options.value) || options.value <= 0)
    throw new Error('Enter a positive number.');
  if (options.mode === 'count' && (!Number.isInteger(options.value) || options.value < 2))
    throw new Error('Choose at least 2 whole parts.');
  if (options.mode === 'seconds' && options.value < 1)
    throw new Error('Each part must be at least 1 second.');
  const count = options.mode === 'count' ? options.value : Math.ceil(total / options.value);
  if (count < 2) throw new Error('Choose a shorter duration to create at least 2 parts.');
  const available = 30 - (p.sequences?.length ?? 1);
  if (count > available)
    throw new Error(
      `Room for ${available} more parts. Increase the duration or remove unused sequences.`,
    );
  if (total / count < 1 / fps) throw new Error('Each part needs at least one video frame.');
  const wholeFrames = Math.floor(total * fps + 1e-9);
  const framesPerPart = Math.floor(wholeFrames / count);
  const extraFrames = wholeFrames % count;
  // Share exact boundaries: no dropped or duplicated interval; last part retains the tail.
  const boundaries = [
    0,
    ...Array.from({ length: count - 1 }, (_, i) => options.mode === 'count'
      ? ((i + 1) * framesPerPart + Math.min(i + 1, extraFrames)) / fps
      : Math.round((i + 1) * options.value * fps) / fps),
    total,
  ];
  return boundaries.slice(0, -1).map((start, i) => {
    const end = boundaries[i + 1];
    if (end <= start) throw new Error('Parts are too short for this frame rate.');
    // The current timeline model ends at its last clip, so do not silently shorten an empty tail.
    if (!p.clips.some((c) => c.start < end && clipEnd(c) >= end - 0.000001))
      throw new Error(
        `Part ${i + 1} ends in an empty timeline gap. Close that gap or choose a different part size.`,
      );
    if (
      p.clips.some((c) => {
        const overlap = Math.min(end, clipEnd(c)) - Math.max(start, c.start);
        return overlap > 0 && overlap * c.properties.speed < 0.001;
      })
    )
      throw new Error('A part boundary is too close to a clip edge. Choose a different part size.');
    return { start, end };
  });
}

export function createEqualPartSequences(
  project: Project,
  options: PartOptions,
  format: 'current' | 'shorts' = 'current',
  prefix = 'Part',
): Project {
  const ranges = equalPartRanges(project, options);
  if (project.clips.some((c) => isLocked(project, c)))
    throw new Error('Unlock video and linked audio tracks before creating parts.');
  const p = syncSequence(project);
  const originalId = p.activeSequenceId ?? uid();
  const sequences = p.sequences ?? [sequenceSnapshot(p, originalId, 'Original edit')];
  const fingerprint = subtitleFingerprint(p);
  const created = ranges.map(({ start, end }, index) => {
    const next: Project = structuredClone({
      ...p,
      sequences: undefined,
      activeSequenceId: undefined,
    });
    next.clips = p.clips.flatMap((clip) => {
      const from = Math.max(start, clip.start),
        to = Math.min(end, clipEnd(clip));
      if (to <= from) return [];
      const c = structuredClone(clip);
      // Presets are relative to the original source window. Bake their keys before trimming.
      if (!c.keyframes && c.properties.animation !== 'None')
        c.keyframes = presetKeyframes(
          clip,
          clip.properties.animation,
          p.settings.width,
          p.settings.height,
        );
      return [
        {
          ...c,
          id: uid(),
          start: from - start,
          sourceStart: clip.sourceStart + (from - clip.start) * clip.properties.speed,
          sourceEnd: clip.sourceStart + (to - clip.start) * clip.properties.speed,
        },
      ];
    });
    next.suggestions = [];
    next.publishing = undefined;
    next.chapters = undefined;
    next.adjustments = remapAdjustments(p.adjustments, [{ start, end }]);
    next.subtitleVariants = p.subtitleVariants
      ?.filter((v) => v.sourceFingerprint === fingerprint)
      .map((v) => ({
        ...v,
        sourceFingerprint: subtitleFingerprint(next),
        cues: v.cues.flatMap((cue) => {
          const words = subtitleCueWords(cue)
            .filter((w) => w.start < end && w.end > start)
            .map((w) => ({
              ...w,
              start: Math.max(start, w.start) - start,
              end: Math.min(end, w.end) - start,
            }))
            .filter((w) => w.end - w.start >= 0.001);
          return words.length
            ? [
                {
                  ...cue,
                  start: words[0].start,
                  end: words.at(-1)!.end,
                  text: words.map((w) => w.text).join(' '),
                  words,
                },
              ]
            : [];
        }),
      }));
    if (format === 'shorts') {
      next.settings = { ...next.settings, preset: 'YouTube Shorts', aspectRatio: '9:16', width: 1080, height: 1920 };
      next.exportSettings = { ...next.exportSettings, width: 1080, height: 1920 };
    }
    return sequenceSnapshot(
      next,
      uid(),
      `${prefix.trim() || 'Part'} ${String(index + 1).padStart(2, '0')}`.slice(0, 80),
    );
  });
  return switchSequence(
    { ...p, activeSequenceId: originalId, sequences: [...sequences, ...created] },
    created[0].id,
  );
}
