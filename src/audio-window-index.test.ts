import { describe, expect, it, vi } from 'vitest';
import { addMedia, createProject, defaultProps, type Clip } from './model';
import { audioWindow, createAudioWindowResolver, createClipAudioPlan } from './audio-crossfades';
import { sequenceSnapshot } from './sequences';

function fixture() {
  const p = addMedia(createProject(), { id: 'media', name: 'video.mp4', duration: 100,
    width: 1920, height: 1080, size: 1, type: 'video/mp4' });
  const base = p.clips[0];
  p.clips = Array.from({ length: 120 }, (_, i): Clip => ({ ...base, id: `clip-${i}`,
    start: i / 2 + [0, 0.001, -0.001, 0.000999999, -0.000999999, 0.002][i % 6],
    sourceStart: i % 4, sourceEnd: i % 4 + (i % 3 + 1) / 4,
    trackId: ['V1', 'V2', 'V3', 'A1', 'A2'][i % 5], audioDetached: i % 11 === 0,
    properties: { ...defaultProps, speed: [0.25, 0.5, 1, 2, 4][i % 5],
      fadeIn: i % 7 / 10, fadeOut: i % 4 / 10 } }));
  return p;
}

describe('indexed crossfade neighbour windows', () => {
  it('matches direct scans across tracks, gaps, overlap, detachment, speeds, fades and mutes', () => {
    for (const mute of [undefined, 'A1', 'A2', 'V2']) {
      const p = fixture();
      p.tracks = p.tracks.map((track) => ({ ...track, muted: track.id === mute, hidden: track.id === 'V3' }));
      const resolve = createAudioWindowResolver(p);
      for (const clip of [...p.clips].reverse()) expect(resolve(clip)).toEqual(audioWindow(p, clip));
    }
  });

  it('preserves original first-match ordering and floating-point strict tolerance at both boundaries', () => {
    for (const boundary of [0.01, 1, 10000]) for (const offset of [0, 0.001, -0.001, 0.0010000001, 0.0009999999]) {
      const p = fixture(), base = p.clips[0];
      const clip: Clip = { ...base, id: 'main', start: boundary, sourceStart: 2, sourceEnd: 3,
        audioDetached: false, properties: { ...defaultProps } };
      p.clips = [{ ...clip, id: 'first-previous', start: boundary - 1 + offset, sourceStart: 99, sourceEnd: 100 },
        { ...clip, id: 'second-previous', start: boundary - 1 }, clip,
        { ...clip, id: 'first-next', start: boundary + 1 + offset, sourceStart: 0, sourceEnd: 1 },
        { ...clip, id: 'second-next', start: boundary + 1 }];
      const resolve = createAudioWindowResolver(p);
      for (const value of p.clips) expect(resolve(value)).toEqual(audioWindow(p, value));
    }
  });

  it('supports fixed reference out points beyond a shortened child and native source limits', () => {
    const p = fixture(), child = sequenceSnapshot(p, 'child', 'Child'); child.clips = [];
    p.sequences = [child];
    p.clips = [{ id: 'reference', sequenceId: 'child', trackId: 'V1', start: 0, sourceStart: 4, sourceEnd: 8,
      properties: { ...defaultProps } }, { ...p.clips[0], id: 'native', start: 4, sourceStart: 99, sourceEnd: 100,
      audioDetached: false, properties: { ...defaultProps } }];
    const resolve = createAudioWindowResolver(p);
    for (const clip of p.clips) expect(resolve(clip)).toEqual(audioWindow(p, clip));
    expect(resolve(p.clips[0]).end).toBe(8);
    expect(resolve(p.clips[1]).end).toBe(100);
  });

  it('compiles every window without full clip-array neighbour scans and reuses it in real gain plans', () => {
    const p = fixture(), expected = p.clips.map((clip) => audioWindow(p, clip));
    const find = vi.spyOn(p.clips, 'find');
    const resolve = createAudioWindowResolver(p);
    for (const [i, clip] of p.clips.entries()) {
      const window = resolve(clip);
      expect(window).toEqual(expected[i]);
      expect(resolve(clip)).toBe(window);
      expect(createClipAudioPlan(p, clip, undefined, window).window).toBe(window);
    }
    expect(find).not.toHaveBeenCalled(); find.mockRestore();
    const edited = structuredClone(p); edited.clips[0].properties.fadeIn = 10;
    expect(createAudioWindowResolver(edited)(edited.clips[0]).fadeIn).not.toBe(resolve(p.clips[0]).fadeIn);
  });
});
