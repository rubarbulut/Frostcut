import { describe, it, expect } from 'vitest';
import { addMedia, createProject, duration, validateProject } from './model';
import { createEqualPartSequences, equalPartRanges } from './equal-parts';
import { switchSequence } from './sequences';
import { subtitleFingerprint, translatedWords } from './translations';
import { captionAppearance } from './caption-style';
import { transformAt } from './motion';

function source(seconds = 600) {
  return addMedia(createProject('Episodes', 'YouTube'), {
    id: 'source',
    name: 'episode.mp4',
    duration: seconds,
    width: 1920,
    height: 1080,
    size: 100,
    type: 'video/mp4',
  });
}
describe('consecutive episode splitting', () => {
  it('keeps the original, preserves every interval and round-trips independent parts', () => {
    const p = source(),
      before = structuredClone(p);
    p.captions.appearance = {
      ...captionAppearance(p.captions),
      italic: true,
      underline: true,
      align: 'right',
      lineHeight: 1.6,
      letterSpacing: 0.08,
      wordSpacing: 0.2,
    };
    const next = createEqualPartSequences(p, { mode: 'count', value: 3 });
    expect(next.sequences).toHaveLength(4);
    expect(duration(next)).toBe(200);
    expect(next.clips[0].sourceStart).toBe(0);
    const last = switchSequence(next, next.sequences![3].id);
    expect(last.clips[0].sourceStart).toBe(400);
    expect(last.clips[0].sourceEnd).toBe(600);
    expect(last.settings).toEqual(p.settings);
    expect(switchSequence(last, next.sequences![0].id).clips).toEqual(before.clips);
    expect(validateProject(JSON.parse(JSON.stringify(next))).captions.appearance).toEqual(
      p.captions.appearance,
    );
    next.clips[0].properties.volume = 0.2;
    expect(last.clips[0].properties.volume).toBe(1);
    expect(p.clips).toEqual(before.clips);
  });
  it('retains the remainder and aligns shared boundaries to frames', () => {
    const ranges = equalPartRanges(source(125), { mode: 'seconds', value: 60 });
    expect(ranges).toEqual([
      { start: 0, end: 60 },
      { start: 60, end: 120 },
      { start: 120, end: 125 },
    ]);
    const equal = equalPartRanges(source(10), { mode: 'count', value: 3 });
    expect(equal[0].end).toBe(equal[1].start);
    expect(equal[1].end).toBe(equal[2].start);
    expect(equal[2].end).toBe(10);
    expect(
      Math.max(...equal.map((r) => r.end - r.start)) -
        Math.min(...equal.map((r) => r.end - r.start)),
    ).toBeLessThanOrEqual(1 / 30 + 1e-9);
  });
  it('preserves source-time motion, speed and translated word timing across a cut', () => {
    const p = source(12);
    p.clips[0].properties.speed = 2;
    p.clips[0].properties.animation = 'Smooth Zoom';
    p.captions.language = 'tr';
    p.subtitleVariants = [
      {
        language: 'tr',
        sourceFingerprint: subtitleFingerprint(p),
        cues: [{ start: 0, end: 6, text: 'bir iki üç dört', speakerId: 'speaker-1' }],
      },
    ];
    const next = createEqualPartSequences(p, { mode: 'count', value: 2 });
    const second = switchSequence(next, next.sequences![2].id);
    expect(second.clips[0].sourceStart).toBe(6);
    expect(transformAt(second.clips[0], 1, 1920, 1080).scale).toBeCloseTo(
      transformAt(p.clips[0], 4, 1920, 1080).scale,
    );
    expect(translatedWords(second)?.map((w) => [w.text, w.timelineStart, w.timelineEnd])).toEqual([
      ['üç', 0, 1.5],
      ['dört', 1.5, 3],
    ]);
    expect(() => validateProject(JSON.parse(JSON.stringify(second)))).not.toThrow();
  });
  it('rejects unusable plans and locked tracks without changing the project', () => {
    const p = source(),
      before = structuredClone(p);
    expect(() => equalPartRanges(p, { mode: 'count', value: 2.5 })).toThrow();
    expect(() => equalPartRanges(p, { mode: 'count', value: 30 })).toThrow('Room');
    expect(() => equalPartRanges(p, { mode: 'seconds', value: NaN })).toThrow();
    p.tracks.find((t) => t.id === 'A1')!.locked = true;
    expect(() => createEqualPartSequences(p, { mode: 'count', value: 3 })).toThrow('Unlock');
    expect(p.clips).toEqual(before.clips);
    p.clips[0].start = 400;
    p.clips[0].sourceEnd = 100;
    expect(() => equalPartRanges(p, { mode: 'count', value: 2 })).toThrow('gap');
  });
});
