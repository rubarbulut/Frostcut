import { describe, expect, it, vi } from 'vitest';
import { addMedia, createProject, defaultProps } from './model';
import { sequenceSnapshot, sequenceViews } from './sequences';
import { createEqualPartSequences } from './equal-parts';
import { clipTimelineIndex } from './timeline-index';
import { MAX_SEQUENCE_DEPTH, MAX_SEQUENCE_FRAME_LAYERS, NestedSequencePlan, validateSequenceGraph, validSequenceReference,
  type SequenceFrameLayer, type SequencePlanNode, type SequenceReferenceClip } from './nested-sequence-plan';

function footage() {
  return addMedia(createProject('Child', 'YouTube'), { id: 'm', name: 'video.mp4',
    duration: 30, width: 1920, height: 1080, size: 1, type: 'video/mp4' });
}
const node = (id: string): SequencePlanNode => sequenceSnapshot(createProject(id, 'YouTube'), id, id);
const reference = (id: string, sequenceId: string, patch: Partial<SequenceReferenceClip> = {}): SequenceReferenceClip => ({
  id, sequenceId, trackId: 'V1', start: 0, sourceStart: 0, sourceEnd: 10, properties: { ...defaultProps }, ...patch,
});
function child(): SequencePlanNode {
  const p = footage(); p.clips[0].id = 'leaf'; p.clips[0].sourceStart = 5; p.clips[0].sourceEnd = 25; p.clips[0].properties.speed = 2;
  p.captions.appearance = { size: 68, color: '#ff0000', accent: '#ffff00', speakerColors: false, outlineColor: '#000000', outline: 2, bold: true, margin: 8 };
  p.adjustments = [{ id: 'grade', name: 'Grade', enabled: true, locked: false, start: 0, end: 10, exposure: 1, contrast: 100, saturation: 100, hue: 0 }];
  return sequenceSnapshot(p, 'child', 'Child');
}
const nestedLayer = (layer: SequenceFrameLayer) => { if (layer.kind !== 'sequence') throw new Error('Expected a child frame'); return layer; };

describe('hierarchical sequence timing plan', () => {
  it('maps trimmed/sped-up parent clocks into child and media source clocks without flattening settings', () => {
    const root = node('root'), sub = child();
    root.settings.width = 1080; root.settings.height = 1920;
    root.clips = [reference('placement', 'child', { start: 10, sourceStart: 4, sourceEnd: 12,
      properties: { ...defaultProps, speed: 2, scale: 1.3, rotation: 12 },
      keyframes: { x: [{ time: 4, value: 10 }, { time: 12, value: 90 }] } })];
    const compiled = new NestedSequencePlan([root, sub]), frame = compiled.frameAt('root', 11);
    const group = nestedLayer(frame.layers[0]), leaf = group.frame.layers[0];
    expect([group.time, group.sourceTime, leaf.time, leaf.sourceTime, leaf.playbackRate]).toEqual([11, 6, 6, 17, 4]);
    expect(leaf.instancePath).toEqual(['root', 'placement', 'leaf']);
    expect(group.clip.keyframes).toEqual(root.clips[0].keyframes);
    expect(group.frame.sequence.settings).toEqual(sub.settings);
    expect(group.frame.sequence.captions).toEqual(sub.captions);
    expect(group.frame.sequence.adjustments).toEqual(sub.adjustments);
    expect(compiled.frameAt('root', 9.999).layers).toEqual([]);
    expect(compiled.frameAt('root', 14).layers).toEqual([]);
    // The fixed parent out point extends beyond the child's current ten-second edit.
    expect(nestedLayer(compiled.frameAt('root', 13.5).layers[0]).frame.layers).toEqual([]);
  });

  it('distinguishes repeated placements and composes source time/rate over three levels', () => {
    const sub = child(), middle = node('middle'), root = node('root');
    middle.clips = [reference('inner', 'child', { sourceStart: 2, sourceEnd: 8, properties: { ...defaultProps, speed: 0.5 } })];
    root.clips = [reference('a', 'middle', { sourceEnd: 12 }), reference('b', 'middle', { sourceStart: 1, sourceEnd: 12 })];
    const frame = new NestedSequencePlan([root, middle, sub]).frameAt('root', 2);
    const first = nestedLayer(nestedLayer(frame.layers[0]).frame.layers[0]).frame.layers[0];
    const second = nestedLayer(nestedLayer(frame.layers[1]).frame.layers[0]).frame.layers[0];
    expect(first.sourceTime).toBe(11); expect(second.sourceTime).toBe(12);
    expect(first.playbackRate).toBe(1); expect(second.playbackRate).toBe(1);
    expect(first.instancePath).toEqual(['root', 'a', 'inner', 'leaf']);
    expect(second.instancePath).toEqual(['root', 'b', 'inner', 'leaf']);
  });

  it('reads current active edits through sequenceViews and preserves an existing compiled snapshot', () => {
    const p = createEqualPartSequences(footage(), { mode: 'count', value: 2 });
    const activeId = p.activeSequenceId!;
    const previous = new NestedSequencePlan(sequenceViews(p));
    p.clips[0].properties.speed = 2; p.captions.wordsPerCaption = 2;
    const current = new NestedSequencePlan(sequenceViews(p));
    expect(current.frameAt(activeId, 2).layers[0].sourceTime).toBe(4);
    expect(previous.frameAt(activeId, 2).layers[0].sourceTime).toBe(2);
    expect(current.frameAt(activeId, 2).sequence.captions.wordsPerCaption).toBe(2);
    expect(previous.frameAt(activeId, 2).sequence.captions.wordsPerCaption).toBe(4);
    expect(p.sequences?.find((s) => s.id === activeId)?.clips[0].properties.speed).toBe(1);
  });

  it('preserves local and inherited hidden/mute/detached routing, including audio-only placements', () => {
    const root = node('root'), sub = child();
    sub.clips.push({ ...structuredClone(sub.clips[0]), id: 'music', trackId: 'A2' });
    root.clips = [reference('placement', 'child')];
    root.tracks.find((t) => t.id === 'V1')!.hidden = true;
    let group = nestedLayer(new NestedSequencePlan([root, sub]).frameAt('root', 1).layers[0]);
    expect([group.visible, group.audible]).toEqual([false, true]);
    expect(group.frame.layers.every((l) => !l.visible && l.audible)).toBe(true);
    root.tracks.find((t) => t.id === 'V1')!.hidden = false;
    root.tracks.find((t) => t.id === 'A1')!.muted = true;
    group = nestedLayer(new NestedSequencePlan([root, sub]).frameAt('root', 1).layers[0]);
    expect(group.frame.layers).toHaveLength(1);
    expect([group.frame.layers[0].visible, group.frame.layers[0].audible]).toEqual([true, false]);
    root.tracks.find((t) => t.id === 'A1')!.muted = false;
    root.clips[0].trackId = 'A2';
    group = nestedLayer(new NestedSequencePlan([root, sub]).frameAt('root', 1).layers[0]);
    expect([group.visible, group.audible]).toEqual([false, true]);
    expect(group.frame.layers.every((l) => !l.visible && l.audible)).toBe(true);
    root.tracks.find((t) => t.id === 'A2')!.muted = true;
    expect(new NestedSequencePlan([root, sub]).frameAt('root', 1).layers).toEqual([]);
  });

  it('uses the existing stable video order and half-open boundaries for arbitrary seeks', () => {
    const p = footage(); p.clips[0].id = 'first'; p.clips[0].sourceEnd = 5;
    p.clips.push({ ...structuredClone(p.clips[0]), id: 'second', trackId: 'V2', start: 2 },
      { ...structuredClone(p.clips[0]), id: 'third', start: 1 });
    const compiled = new NestedSequencePlan([sequenceSnapshot(p, 'root', 'Root')]), original = clipTimelineIndex(p);
    for (const time of [2, 0, 7, 4.99, 5, 1, 6.999])
      expect(compiled.frameAt('root', time).layers.filter((l) => l.visible).map((l) => l.clip.id)).toEqual(original.at(time).map((c) => c.id));
  });

  it('rejects missing sources, self/indirect/inactive cycles and excessive nesting depth', () => {
    const root = node('root'), sub = child();
    const rejects = (sequences: SequencePlanNode[], message: string) => {
      expect(() => validateSequenceGraph(sequences)).toThrow(message);
      expect(() => new NestedSequencePlan(sequences)).toThrow(message);
    };
    root.clips = [reference('placement', 'absent')];
    rejects([root, sub], 'missing');
    root.clips = [reference('placement', 'root')];
    rejects([root, sub], 'cycle');
    root.clips = [reference('placement', 'child')]; sub.clips.push(reference('loop', 'root'));
    rejects([root, sub], 'cycle');
    const inactive = node('inactive'); inactive.clips = [reference('loop', 'inactive')];
    rejects([node('active'), inactive], 'cycle');
    const chain = Array.from({ length: MAX_SEQUENCE_DEPTH + 1 }, (_, i) => node(`s${i}`));
    chain.forEach((s, i) => { if (i < chain.length - 1) s.clips = [reference(`r${i}`, chain[i + 1].id)]; });
    rejects(chain, 'levels');
    expect(() => validateSequenceGraph(chain.slice(1))).not.toThrow();
    expect(() => new NestedSequencePlan(chain.slice(1))).not.toThrow();
  });

  it('validates without snapshots and rejects an invalid inactive graph before copying any payload', () => {
    const root = node('root'), sub = child(), inactive = node('inactive');
    root.clips = [reference('a', 'child'), reference('b', 'child')];
    const before = JSON.stringify([root, sub]);
    const clone = vi.spyOn(globalThis, 'structuredClone');
    try {
      validateSequenceGraph([root, sub]);
      expect(clone).not.toHaveBeenCalled();
      expect(JSON.stringify([root, sub])).toBe(before);
      inactive.clips = [reference('loop', 'inactive')];
      expect(() => new NestedSequencePlan([root, sub, inactive])).toThrow('cycle');
      expect(clone).not.toHaveBeenCalled();
      const plan = new NestedSequencePlan([root, sub]);
      expect(clone).toHaveBeenCalledTimes(2);
      sub.clips[0].sourceStart = 7;
      expect(nestedLayer(plan.frameAt('root', 1).layers[0]).frame.layers[0].sourceTime).toBe(7);
    } finally { clone.mockRestore(); }
  });

  it('bounds frame expansion explicitly instead of dropping overlapping media', () => {
    const root = node('root'), sub = child();
    const leaf = sub.clips[0]; sub.clips = Array.from({ length: 700 }, (_, i) => ({ ...structuredClone(leaf), id: `leaf-${i}` }));
    root.clips = [reference('a', 'child'), reference('b', 'child'), reference('c', 'child')];
    const compiled = new NestedSequencePlan([root, sub]);
    expect(() => compiled.frameAt('root', 1)).toThrow(`${MAX_SEQUENCE_FRAME_LAYERS}`);
    expect(compiled.frameAt('root', 20).layers).toEqual([]);
    expect(() => compiled.frameAt('missing', 0)).toThrow('available');
    expect(() => compiled.frameAt('root', NaN)).toThrow('finite');
  });

  it('validates reference timing, independent animation/effects and unambiguous source identity', () => {
    const ref = reference('placement', 'child', { keyframes: { scale: [{ time: 0, value: 1 }, { time: 10, value: 2 }] } });
    expect(validSequenceReference(ref)).toBe(true);
    for (const patch of [{ sequenceId: '' }, { mediaId: 'fake-video' }, { sourceStart: -1 }, { sourceEnd: 0 },
      { properties: { ...defaultProps, speed: 0 } }, { properties: { ...defaultProps, opacity: 2 } },
      { keyframes: { x: [{ time: 1, value: 0 }, { time: 0, value: 1 }] } }, { tracking: {} }])
      expect(validSequenceReference({ ...ref, ...patch })).toBe(false);
    const root = node('root'); root.clips = [reference('a', 'child', { trackId: 'missing' })];
    expect(() => new NestedSequencePlan([root, child()])).toThrow('tracks');
    root.clips = [reference('a', 'child'), reference('a', 'child')];
    expect(() => new NestedSequencePlan([root, child()])).toThrow('unique');
    expect(() => new NestedSequencePlan([root, root])).toThrow('unique');
  });
});
