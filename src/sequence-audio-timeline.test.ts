import { describe, expect, it, vi } from 'vitest';
import { addMedia, createProject, defaultProps, type Project, type SequenceClip } from './model';
import { requireMediaClip } from './clip-source';
import { sequenceSnapshot } from './sequences';
import { SequenceAudioTimeline, type SequenceAudioPlacement } from './sequence-audio-timeline';

const reports = () => new Map([['voice', true]]);
function fixture() {
  const p = addMedia(createProject('Audio clocks', 'YouTube'), { id: 'voice', name: 'voice.mp4',
    duration: 30, width: 1920, height: 1080, size: 1, type: 'video/mp4' });
  const leaf = { ...requireMediaClip(p.clips[0]), id: 'leaf', start: 1, sourceStart: 2, sourceEnd: 10,
    properties: { ...defaultProps, speed: 2, volume: 0.8 } };
  const child = sequenceSnapshot(p, 'child', 'Child'); child.clips = [leaf];
  const first: SequenceClip = { id: 'first', sequenceId: 'child', trackId: 'V1', start: 10,
    sourceStart: 0, sourceEnd: 8, voiceEnhance: true,
    properties: { ...defaultProps, speed: 2, volume: 0.5 } };
  const second: SequenceClip = { ...first, id: 'second', sourceStart: 2, sourceEnd: 10, voiceEnhance: false,
    properties: { ...defaultProps, speed: 0.5, volume: 1.2 } };
  const root = sequenceSnapshot(p, 'root', 'Root'); root.clips = [first, second];
  const project: Project = { ...p, ...root, id: p.id, name: p.name, activeSequenceId: 'root', sequences: [root, child] };
  return { project, leaf, child, first, second };
}
function group(placement: SequenceAudioPlacement) {
  if (placement.kind !== 'sequence') throw new Error('Expected a child bus.');
  return placement;
}

describe('nested audio window queries', () => {
  it('retains independent placement clocks and group processing instead of multiplying away the buses', () => {
    const { project } = fixture(), before = JSON.stringify(project);
    const [a, b] = new SequenceAudioTimeline(project, reports()).frameAt(11, 1.5).placements.map(group);
    expect([a.sourceTime, a.playbackRate, a.ownerRate, a.gain, a.voiceEnhance]).toEqual([2, 3, 1.5, 0.5, true]);
    expect([b.sourceTime, b.playbackRate, b.ownerRate, b.gain, b.voiceEnhance]).toEqual([2.5, 0.75, 1.5, 1.2, false]);
    const left = a.frame.placements[0], right = b.frame.placements[0];
    expect([left.sourceTime, left.playbackRate, left.ownerRate, left.gain, left.voiceEnhance])
      .toEqual([4, 6, 3, 0.8, false]);
    expect([right.sourceTime, right.playbackRate, right.ownerRate, right.gain]).toEqual([5, 1.5, 0.75, 0.8]);
    expect(left.instancePath).toEqual(['root', 'first', 'leaf']);
    expect(right.instancePath).toEqual(['root', 'second', 'leaf']);
    expect(JSON.stringify(project)).toBe(before);
  });

  it('includes both sides of a real crossfade even before the next visual clip begins', () => {
    const { project: p, child, leaf, first } = fixture();
    child.clips = [{ ...leaf, id: 'before', start: 0, sourceStart: 0, sourceEnd: 1, properties: { ...defaultProps } },
      { ...leaf, id: 'after', start: 1, sourceStart: 1, sourceEnd: 2, properties: { ...defaultProps } }];
    p.clips = [{ ...first, start: 0, sourceStart: 0, sourceEnd: 2, properties: { ...defaultProps } }];
    const plan = new SequenceAudioTimeline(p, reports());
    const at = (time: number) => group(plan.frameAt(time).placements[0]).frame.placements;
    const overlap = at(0.99);
    expect(overlap.map((c) => c.clipId)).toEqual(['before', 'after']);
    expect(overlap[1].sourceTime).toBeCloseTo(0.99);
    expect(overlap[1].window.timelineStart).toBeCloseTo(0.985);
    expect(overlap[0].gain + overlap[1].gain).toBeCloseTo(1);
    expect(overlap.every((c) => c.gain > 0)).toBe(true);
    expect(at(1.014).map((c) => c.clipId)).toEqual(['before', 'after']);
    expect(at(1.015).map((c) => c.clipId)).toEqual(['after']);
    expect(plan.frameAt(2).placements).toEqual([]);
  });

  it('keeps pre-zero fade handles on the original local clock', () => {
    const { project: p, child, leaf, first } = fixture();
    child.clips = [{ ...leaf, id: 'tiny', start: 0, sourceStart: 0, sourceEnd: 0.005, properties: { ...defaultProps } },
      { ...leaf, id: 'next', start: 0.005, sourceStart: 1, sourceEnd: 2, properties: { ...defaultProps } }];
    p.clips = [{ ...first, start: 0, sourceStart: 0, sourceEnd: 2, properties: { ...defaultProps } }];
    const frame = group(new SequenceAudioTimeline(p, reports()).frameAt(0).placements[0]).frame;
    const next = frame.placements.find((c) => c.clipId === 'next')!;
    expect(next.window.timelineStart).toBeCloseTo(-0.01);
    expect(next.sourceTime).toBeCloseTo(0.995);
    expect(next.gain).toBeCloseTo(0.01 / (0.015 + 0.00125));
  });

  it('preserves fixed parent out points and silence after a child is shortened', () => {
    const { project: p, first } = fixture();
    p.clips = [{ ...first, start: 0, sourceStart: 4, sourceEnd: 12, properties: { ...defaultProps } }];
    const plan = new SequenceAudioTimeline(p, reports());
    expect(group(plan.frameAt(0).placements[0]).frame.placements).toHaveLength(1);
    const gap = group(plan.frameAt(2).placements[0]);
    expect(gap.sourceTime).toBe(6);
    expect(gap.frame.placements).toEqual([]);
    expect(gap.window.end).toBe(12);
    expect(plan.frameAt(7).duration).toBe(8);
    expect(group(plan.frameAt(7).placements[0]).frame.placements).toEqual([]);
    expect(plan.frameAt(8).placements).toEqual([]);
  });

  it('uses checked audio absence, local mute and detached/audio-only routing while hidden video remains audible', () => {
    const { project: p, first, child } = fixture(); p.clips = [first];
    p.tracks = p.tracks.map((t) => ({ ...t, hidden: t.id === 'V1' }));
    expect(group(new SequenceAudioTimeline(p, reports()).frameAt(11).placements[0]).frame.placements).toHaveLength(1);
    expect(group(new SequenceAudioTimeline(p, new Map([['voice', false]])).frameAt(11).placements[0]).frame.placements).toEqual([]);
    expect(() => new SequenceAudioTimeline(p, new Map())).toThrow('report is incomplete');
    p.clips = [{ ...first, audioDetached: true }];
    expect(new SequenceAudioTimeline(p, new Map()).frameAt(11).placements).toEqual([]);
    p.clips[0].trackId = 'A2';
    expect(group(new SequenceAudioTimeline(p, reports()).frameAt(11).placements[0]).frame.placements).toHaveLength(1);
    child.tracks = child.tracks.map((t) => ({ ...t, muted: t.id === 'A1' }));
    expect(group(new SequenceAudioTimeline(p, new Map()).frameAt(11).placements[0]).frame.placements).toEqual([]);
    p.tracks = p.tracks.map((t) => ({ ...t, muted: t.id === 'A2' }));
    expect(new SequenceAudioTimeline(p, new Map()).frameAt(11).placements).toEqual([]);
  });

  it('compiles child speech ducking with real reports and keeps group voice processing separate', () => {
    const { project: p, child, leaf, first } = fixture();
    p.media.push({ id: 'music', name: 'music.mp3', duration: 30, width: 1, height: 1, size: 1, type: 'audio/mpeg' });
    p.transcripts = [{ mediaId: 'voice', source: 'imported', language: 'English',
      words: [{ id: 'word', text: 'Speech', start: 4, end: 6, speakerId: 'speaker-1' }] }];
    const music = { ...leaf, id: 'music', mediaId: 'music', trackId: 'A2', start: 0, sourceStart: 0, sourceEnd: 30,
      audioRole: 'music' as const, autoDuck: true, properties: { ...defaultProps, volume: 0.6 } };
    p.clips = [first, music]; child.clips = [leaf];
    const loud = new SequenceAudioTimeline(p, new Map([['voice', true], ['music', true]]));
    const frame = loud.frameAt(11.25);
    expect(frame.placements.find((c) => c.clipId === 'music')!.gain).toBeCloseTo(0.15);
    expect(group(frame.placements[0]).voiceEnhance).toBe(true);
    expect(group(frame.placements[0]).frame.placements[0].voiceEnhance).toBe(false);
    const silent = new SequenceAudioTimeline(p, new Map([['voice', false], ['music', true]]));
    expect(silent.frameAt(11.25).placements.find((c) => c.clipId === 'music')!.gain).toBeCloseTo(0.6);
    expect(frame.placements[1].gainAtOwnerTime(20)).toBeCloseTo(0.6);
  });

  it('snapshots once per edit, reads the active edit and never re-clones for seeks', () => {
    const { project: p, child } = fixture();
    p.clips = p.clips.map((clip, i) => i === 0
      ? { ...clip, properties: { ...clip.properties, volume: 0.75 } } : clip);
    expect(p.sequences![0].clips[0].properties.volume).toBe(0.5);
    const availability = reports(), clone = vi.spyOn(globalThis, 'structuredClone');
    try {
      const plan = new SequenceAudioTimeline(p, availability), copies = clone.mock.calls.length;
      expect(copies).toBe(1);
      child.clips[0].properties.volume = 0.1; availability.set('voice', false);
      for (let i = 0; i < 30; i++) {
        const placement = group(plan.frameAt(11).placements[0]);
        expect(placement.gain).toBe(0.75);
        expect(placement.frame.placements[0].gain).toBe(0.8);
        expect(Object.isFrozen(placement.window)).toBe(true);
      }
      expect(clone.mock.calls).toHaveLength(copies);
      expect(group(new SequenceAudioTimeline(p, reports()).frameAt(11).placements[0]).frame.placements[0].gain).toBe(0.1);
    } finally { clone.mockRestore(); }
  });

  it('rejects inactive graph errors, invalid clocks and excessive audible instance expansion', () => {
    const { project: p, first, child, leaf } = fixture();
    const inactive = sequenceSnapshot(p, 'unused', 'Unused');
    inactive.clips = [{ ...first, id: 'cycle', sequenceId: 'unused' }];
    expect(() => new SequenceAudioTimeline({ ...p, sequences: [...p.sequences!, inactive] }, reports())).toThrow('cycle');
    expect(() => new SequenceAudioTimeline({ ...p, activeSequenceId: 'missing' }, reports())).toThrow('active sequence');
    const plan = new SequenceAudioTimeline(p, reports());
    expect(() => plan.frameAt(NaN)).toThrow('finite');
    expect(() => plan.frameAt(1, 0)).toThrow('preview rate');
    expect(plan.frameAt(-1).placements).toEqual([]);
    child.clips = [{ ...leaf, start: 0, sourceStart: 0, sourceEnd: 1, properties: { ...defaultProps } }];
    p.clips = Array.from({ length: 1024 }, (_, i) => ({ ...first, id: `instance-${i}`, start: 0,
      sourceStart: 0, sourceEnd: 1, properties: { ...defaultProps } }));
    expect(new SequenceAudioTimeline(p, reports()).frameAt(0.5).placements).toHaveLength(1024);
    p.clips.push({ ...p.clips[0], id: 'one-too-many' });
    expect(() => new SequenceAudioTimeline(p, reports()).frameAt(0.5)).toThrow('2048');
  });
});
