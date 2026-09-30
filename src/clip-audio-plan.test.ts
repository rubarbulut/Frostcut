import { describe, expect, it, vi } from 'vitest';
import { addMedia, createProject, defaultProps, deleteRange, type Clip } from './model';
import { audioGainAt, audioWindow, createClipAudioPlan } from './audio-crossfades';
import { createDuckGain, duckGain, speechRanges } from './audio-tools';

function fixture() {
  let p = addMedia(createProject('Audio plan'), {
    id: 'voice', name: 'voice.mp4', duration: 30, width: 1920, height: 1080,
    size: 1, type: 'video/mp4',
  });
  p = deleteRange(p, 7, 9);
  p = addMedia(p, {
    id: 'music', name: 'music.mp3', duration: 60, width: 1, height: 1,
    size: 1, type: 'audio/mpeg',
  });
  p.clips[2].autoDuck = true;
  p.clips[2].properties.volume = 0.8;
  p.transcripts = [{
    mediaId: 'voice', language: 'English', source: 'imported',
    words: [
      { id: 'w1', text: 'first', start: 1, end: 2, speakerId: 'speaker-1' },
      { id: 'w2', text: 'near', start: 2.4, end: 3, speakerId: 'speaker-1' },
      { id: 'w3', text: 'next', start: 6, end: 6.8, speakerId: 'speaker-1' },
      { id: 'w4', text: 'after cut', start: 9.2, end: 10.5, speakerId: 'speaker-1' },
      { id: 'w5', text: 'later', start: 12, end: 14, speakerId: 'speaker-1' },
    ],
  }];
  return p;
}

describe('cached clip audio plans', () => {
  it('preserves original gain at arbitrary seeks, fade/crossfade edges and speech ramps', () => {
    const p = fixture(), before = structuredClone(p);
    for (const clip of p.clips) {
      const plan = createClipAudioPlan(p, clip);
      expect(plan.window).toEqual(audioWindow(p, clip));
      const times = [
        18, 0, 7.001, 6.985, 7, 6.99, 7.014, 6, 1, 3.15, -1, 60,
        plan.window.timelineStart, plan.window.timelineStart + plan.window.duration,
        ...Array.from({ length: 360 }, (_, i) => i / 12),
      ];
      for (const time of times) expect(plan.gainAt(time)).toBe(audioGainAt(p, clip, time));
    }
    const left = createClipAudioPlan(p, p.clips[0]), right = createClipAudioPlan(p, p.clips[1]);
    expect(left.gainAt(7) + right.gainAt(7)).toBeCloseTo(1, 6);
    expect(p).toEqual(before);
  });

  it('matches the existing minimum envelope for merged, separated and exact-threshold speech', () => {
    const p = fixture(), music = p.clips[2];
    p.transcripts[0].words = [
      { id: 'a', text: 'a', start: 1, end: 2, speakerId: 'speaker-1' },
      { id: 'b', text: 'b', start: 2.45, end: 3, speakerId: 'speaker-1' },
      { id: 'c', text: 'c', start: 3.450001, end: 4, speakerId: 'speaker-1' },
    ];
    const duckAt = createDuckGain(p, music);
    for (const range of speechRanges(p, music.id)) {
      for (const time of [range.start - 0.150001, range.start - 0.15, range.start - 0.075,
        range.start, range.end, range.end + 0.15, range.end + 0.3, range.end + 0.300001]) {
        expect(duckAt(time)).toBe(duckGain(p, music, time));
      }
    }
    expect(duckAt(1.5)).toBe(0.25);
    expect(duckAt(0)).toBe(1);
  });

  it('rebuilds for mute, zero gain, detached audio, source timing and clip speech overrides', () => {
    const p = fixture(), music = p.clips[2];
    p.clips[0].captionWords = [{ id: 'override', text: 'voice', start: 4, end: 5, speakerId: 'speaker-1' }];
    p.clips[1].properties.speed = 2;
    p.clips[0].properties.fadeOut = 0.3;
    p.clips[1].properties.fadeIn = 0.2;
    p.clips[1].audioDetached = true;
    const detached: Clip = { ...p.clips[1], id: 'detached', trackId: 'A1', audioDetached: undefined, properties: { ...defaultProps, speed: 2 } };
    p.clips.push(detached);
    for (const mute of [false, true]) {
      p.tracks.find((t) => t.id === 'A1')!.muted = mute;
      for (const clip of p.clips) {
        const plan = createClipAudioPlan(p, clip);
        for (const time of [0, 1, 4.5, 7, 8, 10]) expect(plan.gainAt(time)).toBe(audioGainAt(p, clip, time));
      }
    }
    p.tracks.find((t) => t.id === 'A1')!.muted = false;
    p.clips.filter((c) => c.id !== music.id).forEach((c) => { c.properties.volume = 0; });
    const quiet = createClipAudioPlan(p, music);
    expect(quiet.gainAt(4.5)).toBeCloseTo(0.8);
  });

  it('does not rescan clips/transcripts or find neighbours while sampling a compiled plan', () => {
    const p = fixture(), music = p.clips[2];
    const filter = vi.spyOn(p.clips, 'filter'), find = vi.spyOn(p.clips, 'find');
    const transcript = vi.spyOn(p.transcripts, 'find');
    const plan = createClipAudioPlan(p, music);
    const counts = [filter.mock.calls.length, find.mock.calls.length, transcript.mock.calls.length];
    for (let i = 0; i < 120; i++) plan.gainAt(i / 10);
    expect([filter.mock.calls.length, find.mock.calls.length, transcript.mock.calls.length]).toEqual(counts);
    filter.mockRestore(); find.mockRestore(); transcript.mockRestore();
  });

  it('keeps independent edit snapshots and skips speech planning when ducking is disabled', () => {
    const p = fixture(), music = p.clips[2];
    const first = createClipAudioPlan(p, music);
    expect(first.gainAt(1.5)).toBeCloseTo(0.2);
    const edited = structuredClone(p);
    edited.clips[2].autoDuck = false;
    const filter = vi.spyOn(edited.clips, 'filter');
    const next = createClipAudioPlan(edited, edited.clips[2]);
    expect(next.gainAt(1.5)).toBeCloseTo(0.8);
    expect(first.gainAt(1.5)).toBeCloseTo(0.2);
    expect(filter).not.toHaveBeenCalled();
    filter.mockRestore();
  });
});
