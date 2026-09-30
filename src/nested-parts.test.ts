import { describe, expect, it } from 'vitest';
import { addMedia, applyOperations, createProject, duration, validateProject, type Operation, type Suggestion } from './model';
import { createSequence, createShortSequences, insertSequenceReference, switchSequence } from './sequences';
import { createEqualPartSequences } from './equal-parts';
import { sourceMediaIds, sourceSequence } from './clip-source';
import { compileProjectSequencePlan } from './sequence-compositor';
import { compileSequenceAudio } from './sequence-audio';
import { batchPlan } from './batch-plan';
import { transformAt } from './motion';

function footage() {
  return addMedia(createProject('Original', 'YouTube'), { id: 'video', name: 'Original.mp4',
    duration: 40, width: 1920, height: 1080, size: 1, type: 'video/mp4' });
}
function fixture() {
  const source = footage();
  source.clips[0].sourceStart = 10;
  source.clips[0].sourceEnd = 30;
  source.clips[0].properties.speed = 2;
  source.clips[0].properties.animation = 'Slide Left';
  const parent = createSequence(source, 'Parent'), childId = parent.sequences![0].id;
  const p = insertSequenceReference(parent, childId, { start: 0, sourceStart: 2, sourceEnd: 10 });
  p.clips[0].properties = { ...p.clips[0].properties, speed: 2, animation: 'Smooth Zoom',
    opacity: 0.7, crop: 3, volume: 0.6, fadeIn: 0.1, fadeOut: 0.2 };
  return { p, childId };
}
function suggestion(operations: Operation[]): Suggestion {
  return { id: 'highlight', type: 'highlight', title: 'Moment', reason: 'Strong hook',
    start: 0, end: 4, score: 90, status: 'pending', operations };
}
function childFrame(p: ReturnType<typeof fixture>['p'], time: number) {
  const compiled = compileProjectSequencePlan(p), frame = compiled.plan.frameAt(compiled.sequenceId, time);
  const layer = frame.layers[0];
  if (!layer || layer.kind !== 'sequence') throw new Error('Expected a real child frame');
  return layer;
}
const audioReports = new Map([['video', true]]);

describe('real nested sources across Shorts, parts and batch export preparation', () => {
  it('trims a reference against its actual child bounds without copying the whole workspace', () => {
    const { p, childId } = fixture();
    p.clips[0].sourceEnd = 8;
    const before = structuredClone(p), reference = p.clips[0];
    const next = createShortSequences(p, [suggestion([
      { type: 'trim', clipId: reference.id, sourceStart: 4, sourceEnd: 9 },
    ])]);
    expect(next.clips[0]).toMatchObject({ sequenceId: childId, sourceStart: 4, sourceEnd: 9,
      properties: { speed: 2, opacity: 0.7, crop: 3, volume: 0.6, fadeIn: 0.1, fadeOut: 0.2 } });
    expect(next.clips[0].mediaId).toBeUndefined();
    expect(duration(next)).toBe(2.5);
    expect(next.settings).toMatchObject({ width: 1080, height: 1920, aspectRatio: '9:16' });
    expect(transformAt(next.clips[0], 0.5, 1080, 1920).scale).toBeCloseTo(transformAt(reference, 1.5, 1920, 1080).scale);
    expect(childFrame(next, 0.5).frame.layers[0]).toMatchObject({ sourceTime: 20, playbackRate: 4 });
    expect(sourceSequence(next, childId)).toBe(sourceSequence(p, childId));
    expect(sourceMediaIds(next)).toEqual(['video']);
    expect(validateProject(JSON.parse(JSON.stringify(next))).clips).toEqual(next.clips);
    expect(p).toEqual(before);
    // The ordinary operation path must still reject genuinely absent sources.
    expect(() => applyOperations({ ...p, sequences: undefined }, [
      { type: 'trim', clipId: reference.id, sourceStart: 4, sourceEnd: 9 },
    ])).toThrow('source sequence is missing');
  });

  it.each(['assemble', 'keep-range'] as const)('keeps source clocks and preset motion through %s highlights', (type) => {
    const { p, childId } = fixture(), before = structuredClone(p);
    const operations: Operation[] = type === 'assemble'
      ? [{ type, ranges: [{ start: 1, end: 1.5 }, { start: 2.5, end: 4 }] }]
      : [{ type, start: 1, end: 3 }];
    const next = createShortSequences(p, [suggestion(operations)]);
    expect(next.clips.every((clip) => clip.sequenceId === childId && clip.mediaId === undefined)).toBe(true);
    expect(transformAt(next.clips[0], 0.25, 1080, 1920).scale).toBeCloseTo(transformAt(p.clips[0], 1.25, 1920, 1080).scale);
    expect(childFrame(next, 0.25).frame.layers[0]).toMatchObject({ sourceTime: 19, playbackRate: 4 });
    if (type === 'assemble') {
      expect(next.clips.map((clip) => [clip.start, clip.sourceStart, clip.sourceEnd])).toEqual([[0, 4, 5], [0.5, 7, 10]]);
      expect(transformAt(next.clips[1], 1, 1080, 1920).scale).toBeCloseTo(transformAt(p.clips[0], 3, 1920, 1080).scale);
      expect(compileSequenceAudio(next, audioReports).filters.some((filter) => filter.includes('asplit=2'))).toBe(true);
    }
    expect(duration(next)).toBe(2);
    expect(compileSequenceAudio(next, audioReports).inputs.map((input) => input.mediaId)).toEqual(['video']);
    expect(validateProject(JSON.parse(JSON.stringify(next))).clips).toEqual(next.clips);
    expect(p).toEqual(before);
  });

  it('preserves editable child bindings in equal parts and the actual batch sequence switch', () => {
    const { p, childId } = fixture(), before = structuredClone(p);
    const parts = createEqualPartSequences(p, { mode: 'count', value: 2 }, 'shorts');
    const ids = parts.sequences!.slice(2).map((s) => s.id);
    const second = switchSequence(parts, ids[1]);
    expect(second.clips[0]).toMatchObject({ sequenceId: childId, sourceStart: 6, sourceEnd: 10 });
    expect(second.settings.aspectRatio).toBe('9:16');
    expect(transformAt(second.clips[0], 0.5, 1080, 1920).scale).toBeCloseTo(transformAt(p.clips[0], 2.5, 1920, 1080).scale);
    const oldFrame = childFrame(second, 0.5);
    expect(oldFrame.frame.layers[0]).toMatchObject({ sourceTime: 24, playbackRate: 4 });
    expect(batchPlan(second, ids, new Set()).errors).toEqual(['Part 01: Relink: Original.mp4', 'Part 02: Relink: Original.mp4']);
    expect(batchPlan(second, ids, new Set(['video'])).errors).toEqual([]);
    const restored = validateProject(JSON.parse(JSON.stringify(second)));
    // BatchExport uses this same switch; it must retain every real descendant.
    for (const id of ids) {
      const exportProject = switchSequence(restored, id);
      expect(sourceMediaIds(exportProject)).toEqual(['video']);
      expect(compileSequenceAudio(exportProject, audioReports).inputs.map((input) => input.mediaId)).toEqual(['video']);
      expect(childFrame(exportProject, 0.5).frame.layers).toHaveLength(1);
    }
    const childEdit = switchSequence(second, childId);
    childEdit.clips[0].properties.scale = 1.4;
    const propagated = switchSequence(childEdit, ids[1]);
    expect(childFrame(propagated, 0.5).frame.layers[0].clip.properties.scale).toBe(1.4);
    expect(oldFrame.frame.layers[0].clip.properties.scale).toBe(1);
    expect(p).toEqual(before);
  });

  it('retains a shortened child gap in parts and its real audio bus, rather than stretching the last frame', () => {
    const { p, childId } = fixture(), child = switchSequence(p, childId);
    child.clips[0].sourceEnd = 20; // Child now ends at t=5; the reference still ends at t=10.
    const parent = switchSequence(child, p.activeSequenceId!);
    const parts = createEqualPartSequences(parent, { mode: 'count', value: 2 });
    const second = switchSequence(parts, parts.sequences!.at(-1)!.id);
    expect(duration(second)).toBe(2);
    expect(second.clips[0].sourceEnd).toBe(10);
    expect(childFrame(second, 1).frame.layers).toEqual([]);
    const graph = compileSequenceAudio(second, audioReports);
    expect(graph.filters.some((filter) => filter.includes('anullsrc') && filter.includes('atrim=duration=10'))).toBe(true);
    expect(graph.filters.some((filter) => filter.includes('atrim=start=6:end=10'))).toBe(true);
    expect(() => validateProject(JSON.parse(JSON.stringify(second)))).not.toThrow();
  });

  it('also keeps native preset motion on the original source clock when creating a Short', () => {
    const p = footage();
    p.clips[0].properties.animation = 'Smooth Zoom';
    const next = createShortSequences(p, [suggestion([{ type: 'assemble', ranges: [{ start: 10, end: 20 }] }])]);
    expect(transformAt(next.clips[0], 2, 1080, 1920).scale).toBeCloseTo(transformAt(p.clips[0], 12, 1920, 1080).scale);
    expect(next.clips[0].mediaId).toBe('video');
    expect(p.clips[0].keyframes).toBeUndefined();
  });
});
