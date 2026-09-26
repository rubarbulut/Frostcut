import { describe, expect, it } from 'vitest';
import {
  addMedia,
  applyOperations,
  clipEnd,
  createProject,
  deleteRange,
  duration,
  splitClip,
  timelineWords,
  validateProject,
  captionGroups,
} from './model';
import {
  makeDemoWords,
  mapSilences,
  promptOperations,
  silenceFromSamples,
  suggestCuts,
} from './ai';
import { parseSrt } from './transcription';
const fixture = () =>
  addMedia(createProject('Test'), {
    id: 'm',
    name: 'source.mp4',
    duration: 24,
    width: 1080,
    height: 1920,
    size: 1000,
    type: 'video/mp4',
  });
describe('timeline operations preserve source mappings', () => {
  it('splits at source time, including speed changes', () => {
    const p = fixture();
    p.clips[0].properties.speed = 2;
    const n = splitClip(p, p.clips[0].id, 3);
    expect(n.clips.map((c) => [c.start, c.sourceStart, c.sourceEnd])).toEqual([
      [0, 0, 6],
      [3, 6, 24],
    ]);
    expect(duration(n)).toBe(12);
    expect(p.clips).toHaveLength(1);
  });
  it('ripple-deletes an internal range and retains both halves', () => {
    const n = deleteRange(fixture(), 3, 7);
    expect(n.clips.map((c) => [c.start, c.sourceStart, c.sourceEnd])).toEqual([
      [0, 0, 3],
      [3, 7, 24],
    ]);
    expect(duration(n)).toBe(20);
  });
  it('leaves a gap for non-ripple deletion', () => {
    const n = deleteRange(fixture(), 3, 7, false);
    expect(n.clips[1].start).toBe(7);
    expect(duration(n)).toBe(24);
  });
  it('does not desynchronise locked tracks during ripple deletion', () => {
    const p = fixture();
    p.tracks.find((t) => t.id === 'V1')!.locked = true;
    expect(deleteRange(p, 3, 7)).toEqual(p);
    expect(splitClip(p, p.clips[0].id, 3)).toEqual(p);
  });
  it('keeps a source range and moves it to the beginning', () => {
    const n = applyOperations(fixture(), [{ type: 'keep-range', start: 3, end: 7 }]);
    expect(n.clips).toHaveLength(1);
    expect(n.clips[0]).toMatchObject({ start: 0, sourceStart: 3, sourceEnd: 7 });
    expect(clipEnd(n.clips[0])).toBe(4);
  });
  it('keeps transcript and caption timing aligned after cuts', () => {
    const p = fixture();
    p.transcripts = [{ mediaId: 'm', language: 'English', source: 'demo', words: makeDemoWords() }];
    const n = deleteRange(p, 4.3, 5.3);
    const word = timelineWords(n).find((w) => w.text === 'Start')!;
    expect(word.timelineStart).toBeCloseTo(4.4);
    expect(captionGroups(n).every((g) => g.length <= 4)).toBe(true);
  });
  it('assembles disjoint moments in the requested order', () => {
    const n = applyOperations(fixture(), [
      {
        type: 'assemble',
        ranges: [
          { start: 12, end: 15 },
          { start: 2, end: 4 },
        ],
      },
    ]);
    expect(n.clips.map((c) => [c.start, c.sourceStart, c.sourceEnd])).toEqual([
      [0, 12, 15],
      [3, 2, 4],
    ]);
    expect(duration(n)).toBe(5);
  });
  it('keeps the opening five seconds when speeding up the rest', () => {
    const p = fixture(),
      proposal = promptOperations(p, 'Keep the first 5 seconds, but make the rest faster.'),
      n = applyOperations(p, proposal.operations);
    expect(n.clips[0]).toMatchObject({ sourceStart: 0, sourceEnd: 5, properties: { speed: 1 } });
    expect(n.clips[1]).toMatchObject({ start: 5, sourceStart: 5, properties: { speed: 1.25 } });
    expect(duration(n)).toBeCloseTo(20.2);
  });
});
describe('project files', () => {
  it('round-trips metadata without media bytes or object URLs', () => {
    const p = fixture(),
      json = JSON.stringify(p);
    expect(validateProject(JSON.parse(json))).toEqual(p);
    expect(json).not.toContain('blob:');
  });
  it('rejects invalid references and zero speed', () => {
    const p = fixture();
    p.clips[0].mediaId = 'missing';
    expect(() => validateProject(p)).toThrow();
    const q = fixture();
    q.clips[0].properties.speed = 0;
    expect(() => validateProject(q)).toThrow();
  });
  it('drops externally supplied executable suggestions', () => {
    const p = fixture();
    p.suggestions = [{ operations: [{ type: 'bogus' }] }] as never;
    expect(validateProject(p).suggestions).toEqual([]);
  });
});
describe('analysis', () => {
  it('detects quiet audio with padded boundaries', () => {
    const samples = new Float32Array(16000 * 3);
    samples.fill(0.2, 0, 16000);
    samples.fill(0.2, 32000);
    const ranges = silenceFromSamples(samples);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBeCloseTo(1.08);
    expect(ranges[0].end).toBeCloseTo(1.92);
  });
  it('maps source silence into moved/speed-adjusted clips', () => {
    const p = fixture();
    p.clips[0].start = 5;
    p.clips[0].sourceStart = 2;
    p.clips[0].properties.speed = 2;
    expect(mapSilences(p, 'm', [{ start: 4, end: 6 }])).toEqual([{ start: 6, end: 7 }]);
  });
  it('proposes repeat removal without changing the timeline', () => {
    const p = fixture();
    p.transcripts = [{ mediaId: 'm', language: 'English', source: 'demo', words: makeDemoWords() }];
    const before = JSON.stringify(p),
      suggestions = suggestCuts(
        p,
        {
          goal: 'Short-form clips',
          count: 3,
          length: 14,
          pacing: 'Fast',
          reorder: false,
          composite: false,
          sensitivity: 50,
        },
        [{ start: 4.3, end: 5.3 }],
      );
    expect(suggestions.some((s) => s.type === 'repeat')).toBe(true);
    expect(suggestions.some((s) => s.type === 'silence')).toBe(true);
    expect(JSON.stringify(p)).toBe(before);
  });
  it('does not invent a music sync operation', () => {
    expect(promptOperations(fixture(), 'Sync cuts to music').operations).toEqual([]);
  });
  it('imports SRT and estimates individual word times', () => {
    const t = parseSrt('1\n00:00:01,000 --> 00:00:03,000\nA better story.', 'm');
    expect(t.words).toHaveLength(3);
    expect(t.words[0].start).toBe(1);
    expect(t.words[2].end).toBe(3);
    expect(t.source).toBe('imported');
  });
});
