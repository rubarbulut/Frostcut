import { describe, expect, it } from 'vitest';
import { addMedia, createProject, deleteRange, timelineWords } from './model';
import { audioGainAt, audioWindow } from './audio-crossfades';
import { speechSafeSilences, keywordPattern } from './highlights';
const source = () => addMedia(createProject(), { id: 'm', name: 'speech.mp4', duration: 10, width: 360, height: 640, size: 1000, type: 'video/mp4' });
describe('cut audio and speech protection', () => {
  it('overlaps original source handles across a cut without a gain dip', () => {
    const p = deleteRange(source(), 4, 6);
    const [left, right] = p.clips;
    expect(audioWindow(p, left).end).toBeCloseTo(4.015);
    expect(audioWindow(p, right).start).toBeCloseTo(5.985);
    expect(audioWindow(p, right).timelineStart).toBeCloseTo(3.985);
    for (const t of [3.985, 3.99, 4, 4.01, 4.014])
      expect(audioGainAt(p, left, t) + audioGainAt(p, right, t)).toBeCloseTo(1, 6);
    p.clips[1].properties.speed = 2;
    expect(audioWindow(p, right).start).toBeCloseTo(5.97);
  });
  it('does not crossfade across a gap or extend beyond a source', () => {
    const p = source();
    expect(audioWindow(p, p.clips[0])).toMatchObject({ start: 0, end: 10, pre: 0, post: 0 });
    p.clips.push({ ...structuredClone(p.clips[0]), id: 'second', start: 12 });
    expect(audioWindow(p, p.clips[0]).post).toBe(0);
    expect(audioWindow(p, p.clips[1]).pre).toBe(0);
  });
  it('preserves quiet speech even when the RMS detector calls the entire source silent', () => {
    const p = source();
    p.transcripts = [{ mediaId: 'm', language: 'English', source: 'imported', words: [
      { id: '1', text: 'Quiet', start: 1, end: 2, speakerId: 'speaker-1' },
      { id: '2', text: 'speech.', start: 3, end: 4, speakerId: 'speaker-1' },
    ] }];
    const cuts = speechSafeSilences(p, [{ start: 0, end: 10 }]);
    for (const word of timelineWords(p))
      expect(cuts.every(c => c.end <= word.timelineStart - 0.049 || c.start >= word.timelineEnd + 0.049)).toBe(true);
    expect(cuts).toEqual([{ start: 0, end: 0.95 }, { start: 2.05, end: 2.95 }, { start: 4.05, end: 10 }]);
  });
  it('recognizes Unicode word boundaries without highlighting substrings', () => {
    for (const text of ['önemli', 'sırrı', 'błąd', 'ważne']) expect(keywordPattern.test(text)).toBe(true);
    expect(keywordPattern.test('restart')).toBe(false);
  });
});
