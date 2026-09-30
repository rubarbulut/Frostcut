import { describe, expect, it } from 'vitest';
import { addMedia, createProject } from './model';
import { createEqualPartSequences } from './equal-parts';
import { batchPlan } from './batch-plan';
import { zipEntryNames } from './zip';

function project() {
  return createEqualPartSequences(
    addMedia(createProject('Batch', 'YouTube'), {
      id: 'media',
      name: 'Original source.mp4',
      duration: 30,
      width: 1920,
      height: 1080,
      size: 10,
      type: 'video/mp4',
    }),
    { mode: 'count', value: 3 },
  );
}
describe('batch preflight without reading or rendering media', () => {
  it('checks all chosen parts before rendering, including inactive sequences and audio', () => {
    const p = project(),
      original = structuredClone(p);
    const ids = p.sequences!.slice(1).map((s) => s.id);
    const missing = batchPlan(p, ids, new Set());
    expect(missing.errors).toHaveLength(3);
    expect(missing.errors.every((message) => message.includes('Original source.mp4'))).toBe(true);
    expect(batchPlan(p, ids, new Set(['media'])).errors).toEqual([]);
    p.sequences![3].clips.push({
      ...p.sequences![3].clips[0],
      id: 'audio',
      trackId: 'A1',
      mediaId: 'music',
      sequenceId: undefined,
    });
    expect(batchPlan(p, ids, new Set(['media'])).errors).toEqual([
      `${p.sequences![3].name}: Relink: music`,
    ]);
    expect(original.sequences![3].clips).toHaveLength(1);
  });
  it('previews actual archive names in sequence order with long Unicode names and intact extensions', () => {
    const p = project(),
      parts = p.sequences!;
    parts[1].name = 'Bölüm🎬'.repeat(18);
    parts[3].name = 'Third: episode?';
    const plan = batchPlan(p, [parts[3].id, parts[1].id], new Set(['media']));
    expect(plan.entries.map((s) => s.id)).toEqual([parts[1].id, parts[3].id]);
    expect(plan.entries.every((s) => s.filename.endsWith('.mp4'))).toBe(true);
    expect(plan.entries[1].filename).toBe('02-Third_ episode_.mp4');
    expect(zipEntryNames(plan.entries.map((s) => s.filename))).toEqual(
      plan.entries.map((s) => s.filename),
    );
    expect(plan.entries[0].seconds).toBe(10);
    expect(plan.entries[0].megabytes).toBeGreaterThan(0);
  });
  it('uses current active edits and rejects empty, stale or invalid selections without mutation', () => {
    const p = project();
    p.clips = [];
    const before = structuredClone(p);
    expect(batchPlan(p, [p.activeSequenceId!], new Set(['media'])).errors[0]).toContain(
      'no playable timeline',
    );
    expect(batchPlan(p, ['gone'], new Set(['media'])).errors.join(' ')).toContain(
      'no longer available',
    );
    expect(batchPlan(p, [], new Set(['media'])).errors).toContain('Select at least one part.');
    expect(p).toEqual(before);
    p.sequences![2].exportSettings.fps = 0;
    expect(batchPlan(p, [p.sequences![2].id], new Set(['media'])).errors[0]).toContain(
      'frame rate',
    );
  });
});
