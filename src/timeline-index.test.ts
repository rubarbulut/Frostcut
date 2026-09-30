import { describe, expect, it, vi } from 'vitest';
import { addMedia, captionGroups, clipEnd, createProject, defaultProps, isAudioClip, type Project } from './model';
import { captionTimelineIndex, clipTimelineIndex, TimelineIndex } from './timeline-index';

function project() {
  const p = addMedia(createProject('Indexed timeline'), {
    id: 'video', name: 'video.mp4', duration: 600, width: 1920, height: 1080,
    size: 100, type: 'video/mp4',
  });
  // Scrambled input order, overlaps, multiple tracks, non-unit speeds and a gap.
  p.clips = Array.from({ length: 180 }, (_, i) => ({
    ...p.clips[0], id: `clip-${i}`, trackId: p.tracks[i % p.tracks.length].id,
    start: ((i * 71) % 240) / 3,
    sourceStart: i, sourceEnd: i + 1 + (i % 11),
    properties: { ...defaultProps, speed: [0.25, 0.5, 1, 2, 4][i % 5] },
  }));
  p.tracks[0].hidden = true;
  return p;
}
function originalClips(p: Project, time: number, preview = false) {
  return p.clips.filter((c) => preview
    ? time >= c.start - 1 && time <= clipEnd(c) + 1
    : !isAudioClip(p, c) && !p.tracks.find((t) => t.id === c.trackId)?.hidden &&
      time >= c.start && time < clipEnd(c))
    .sort((a, b) => p.tracks.findIndex((t) => t.id === b.trackId) - p.tracks.findIndex((t) => t.id === a.trackId));
}

describe('indexed preview and export timelines', () => {
  it('matches the original scan at frame times, boundaries and arbitrary backwards seeks', () => {
    const p = project(), before = structuredClone(p);
    for (const preview of [false, true]) {
      const index = clipTimelineIndex(p, preview);
      const times = [
        ...Array.from({ length: 200 }, (_, i) => i / 2),
        ...p.clips.flatMap((c) => [c.start - 1, c.start, clipEnd(c), clipEnd(c) + 1]),
        150, 0, 45, -2, 11.5, 4, 600,
      ];
      for (const time of times) {
        expect(index.at(time)).toEqual(originalClips(p, time, preview));
      }
    }
    expect(p).toEqual(before);
  });

  it('keeps the first original match for overlapping intervals and exact end boundaries', () => {
    const items = [
      { id: 'priority', start: 4, end: 6 },
      { id: 'long', start: 0, end: 12 },
      { id: 'next', start: 6, end: 8 },
    ];
    const index = new TimelineIndex(items, (item) => item);
    expect(index.first(4)).toBe(items[0]);
    expect(index.at(6)).toEqual([items[1], items[2]]);
    expect(index.first(6)).toBe(items[1]);
    expect(index.first(12)).toBeUndefined();
    expect(index.first(5)).toBe(items[0]);
    expect(index.first(1)).toBe(items[1]);
  });

  it('preserves caption grouping and first-match behavior instead of regrouping per frame', () => {
    const p = project();
    p.captions.wordsPerCaption = 1;
    p.transcripts = [{
      mediaId: 'video', language: 'English', source: 'imported',
      words: Array.from({ length: 190 }, (_, i) => ({
        id: `word-${i}`, text: 'word', start: i, end: i + 0.9, speakerId: 'speaker-1',
      })),
    }];
    const groups = captionGroups(p), index = captionTimelineIndex(p);
    for (const time of [0, 5, 75, 4, 1, ...groups.slice(0, 80).flatMap((g) => [g[0].timelineStart, g.at(-1)!.timelineEnd])]) {
      expect(index.first(time)).toEqual(groups.find((g) => time >= g[0].timelineStart && time < g.at(-1)!.timelineEnd));
    }
    p.captions.enabled = false;
    expect(captionTimelineIndex(p).first(5)).toBeUndefined();
  });

  it('reads each range only at construction, retains item identity and does not expose mutable index state', () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ start: i, end: i + 1 }));
    const range = vi.fn((item: typeof items[number]) => item);
    const index = new TimelineIndex(items, range);
    for (let i = 0; i < 100; i++) {
      expect(index.first(i + 0.5)).toBe(items[i]);
      expect(index.at(i + 0.5)).toEqual([items[i]]);
    }
    index.at(4).pop();
    expect(index.first(4)).toBe(items[4]);
    expect(range).toHaveBeenCalledTimes(items.length);
  });

  it('handles inclusive preview edges, empty timelines and invalid query times', () => {
    const inclusive = new TimelineIndex([{ start: 1, end: 2, endInclusive: true }], (x) => x);
    expect(inclusive.at(2)).toHaveLength(1);
    expect(inclusive.at(2.000001)).toEqual([]);
    const empty = new TimelineIndex([], () => ({ start: 0, end: 1 }));
    expect(empty.at(0)).toEqual([]);
    expect(empty.first(0)).toBeUndefined();
    expect(inclusive.at(NaN)).toEqual([]);
    expect(inclusive.first(Infinity)).toBeUndefined();
  });
});
