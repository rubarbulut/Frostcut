import { describe, it, expect } from 'vitest';
import {
  createProject,
  addMedia,
  timelineWords,
  validateProject,
  splitClip,
  applyOperations,
  captionAt,
  timecode,
} from './model';
import { editCaption, removeCaption, transcriptGroups } from './caption-editing';
import { normalizeSpeechChunks } from './speech-result';
const fixture = () => {
  const p = addMedia(createProject(), {
    id: 'm',
    name: 'test.mp4',
    duration: 20,
    width: 1080,
    height: 1920,
    size: 1,
    type: 'video/mp4',
  });
  p.transcripts = [
    {
      mediaId: 'm',
      language: 'English',
      source: 'local',
      words: [
        { id: 'a', text: 'Hello', start: 1, end: 2, speakerId: 'speaker-1' },
        { id: 'b', text: 'world.', start: 2, end: 3, speakerId: 'speaker-1' },
        { id: 'c', text: 'Later.', start: 7, end: 8, speakerId: 'speaker-1' },
      ],
    },
  ];
  return p;
};
describe('caption editing in timeline time', () => {
  it('retimes words proportionally without touching video or original transcription', () => {
    const p = fixture(),
      n = editCaption(p, p.clips[0].id, ['a', 'b'], {
        text: 'Hello world.',
        start: 2,
        end: 5,
        speakerId: 'speaker-1',
      });
    expect(n.clips[0].sourceStart).toBe(0);
    expect(n.clips[0].sourceEnd).toBe(20);
    expect(n.transcripts).toEqual(p.transcripts);
    expect(
      timelineWords(n)
        .slice(0, 2)
        .map((w) => [w.timelineStart, w.timelineEnd]),
    ).toEqual([
      [2, 3.5],
      [3.5, 5],
    ]);
    expect(captionAt(n, 1)).toBeUndefined();
    expect(captionAt(n, 3)?.map((w) => w.text)).toEqual(['Hello', 'world.']);
  });
  it('maps edits through clip speed, move, and trim', () => {
    const p = fixture();
    p.clips[0].start = 10;
    p.clips[0].sourceStart = 1;
    p.clips[0].properties.speed = 2;
    const n = editCaption(p, p.clips[0].id, ['a', 'b'], {
      text: 'Better timing.',
      start: 10.25,
      end: 11.25,
      speakerId: 'speaker-2',
    });
    expect(n.clips[0].captionWords?.slice(0, 2).map((w) => [w.start, w.end])).toEqual([
      [1.5, 2.5],
      [2.5, 3.5],
    ]);
    expect(timelineWords(n)[0].timelineStart).toBe(10.25);
  });
  it('keeps duplicated source clips independent', () => {
    const p = fixture();
    p.clips.push({ ...structuredClone(p.clips[0]), id: 'copy', start: 20 });
    const n = editCaption(p, p.clips[0].id, ['a', 'b'], {
      text: 'New words.',
      start: 1,
      end: 3,
      speakerId: 'speaker-1',
    });
    expect(
      timelineWords(n)
        .filter((w) => w.clipId === 'copy')
        .map((w) => w.text),
    ).toEqual(['Hello', 'world.', 'Later.']);
  });
  it('adds and removes manual captions without cutting video', () => {
    const p = fixture(),
      n = editCaption(p, p.clips[0].id, [], {
        text: 'New thought.',
        start: 4,
        end: 6,
        speakerId: 'speaker-1',
      });
    expect(transcriptGroups(n)).toHaveLength(3);
    const ids = timelineWords(n)
      .filter((w) => w.timelineStart >= 4 && w.timelineEnd <= 6)
      .map((w) => w.id);
    const removed = removeCaption(n, p.clips[0].id, ids);
    expect(timelineWords(removed).map((w) => w.text)).toEqual(['Hello', 'world.', 'Later.']);
    expect(removed.clips[0].sourceEnd).toBe(20);
  });
  it('rejects invalid times, overlaps and locked tracks', () => {
    const p = fixture(),
      id = p.clips[0].id,
      base = { text: 'Hi', start: 1, end: 3, speakerId: 'speaker-1' };
    expect(() => editCaption(p, id, ['a', 'b'], { ...base, end: 1 })).toThrow();
    expect(() => editCaption(p, id, ['a', 'b'], { ...base, end: 21 })).toThrow();
    expect(() => editCaption(p, id, [], { ...base, start: 2, end: 4 })).toThrow(/overlaps/);
    p.tracks.find((t) => t.id === 'V1')!.locked = true;
    expect(() => editCaption(p, id, ['a', 'b'], base)).toThrow(/Unlock/);
  });
  it('preserves edited captions through splitting, AI assembly, and save/open', () => {
    const p = fixture(),
      n = editCaption(p, p.clips[0].id, ['a', 'b'], {
        text: 'A new story.',
        start: 1,
        end: 4,
        speakerId: 'speaker-1',
      });
    const split = splitClip(n, n.clips[0].id, 5);
    const cut = applyOperations(split, [{ type: 'assemble', ranges: [{ start: 1, end: 4 }] }]);
    const loaded = validateProject(JSON.parse(JSON.stringify(cut)));
    expect(timelineWords(loaded).map((w) => w.text)).toEqual(['A', 'new', 'story.']);
    expect(timelineWords(loaded)[0].timelineStart).toBe(0);
  });
});
describe('speech timestamps', () => {
  it('formats floating-point boundaries and minute carries correctly', () => {
    expect(timecode(4.599999999, true)).toBe('00:04.60');
    expect(timecode(59.9999, true)).toBe('01:00.00');
  });
  it('keeps a final word with a missing end using captured audio duration', () => {
    const words = normalizeSpeechChunks(
      [
        { text: 'Hello', timestamp: [1, 2] },
        { text: 'world', timestamp: [2, null] },
      ],
      4,
    );
    expect(words[1].end).toBe(4);
    expect(words[1].timingEstimated).toBe(true);
  });
  it('clamps invalid bounds, retains zero-length model tokens, and splits phrases', () => {
    const words = normalizeSpeechChunks(
      [
        { text: 'First', timestamp: [null, 0.5] },
        { text: 'two words', timestamp: [0.5, 2] },
        { text: 'last', timestamp: [2, 2] },
      ],
      3,
    );
    expect(words).toHaveLength(4);
    expect(words.every((w) => w.end > w.start && w.start >= 0 && w.end <= 3)).toBe(true);
  });
  it('deduplicates repeated aligned chunk edges', () => {
    expect(
      normalizeSpeechChunks(
        [
          { text: 'Hi', timestamp: [0, 1] },
          { text: 'Hi', timestamp: [0, 1] },
        ],
        2,
      ),
    ).toHaveLength(1);
  });
});
