import { describe, expect, it } from 'vitest';
import { addMedia, createProject, validateProject } from './model';
import { sequenceSnapshot, switchSequence, syncSequence } from './sequences';
import { createEqualPartSequences } from './equal-parts';
import {
  CHAPTER_MODEL,
  chapterTimestamp,
  splitChapterText,
  validChapterSet,
  youtubeChapterIssues,
  type ChapterSet,
} from './chapter-data';
import {
  appendChapters,
  chapterBlocks,
  chapterFingerprint,
  chaptersAreStale,
  exportChapters,
  publishingChaptersStale,
  saveChapters,
  suggestChapters,
  type ChapterBlock,
} from './chapters';

function fixture() {
  return addMedia(createProject('Chapters', 'YouTube'), {
    id: 'm',
    name: 'source.mp4',
    duration: 180,
    width: 640,
    height: 360,
    size: 1,
    type: 'video/mp4',
  });
}
function manual(p = fixture()): ChapterSet {
  return {
    source: 'manual',
    sourceFingerprint: chapterFingerprint(p),
    items: [
      { id: 'a', start: 0, title: 'Solar panels' },
      { id: 'b', start: 60, title: 'Baking bread' },
      { id: 'c', start: 120, title: 'Football' },
    ],
  };
}
const phrases = [
  'Solar panels produce electricity.',
  'Flour and yeast make bread.',
  'Football players score goals.',
];
const blocks: ChapterBlock[] = Array.from({ length: 9 }, (_, i) => ({
  start: i * 20,
  end: i * 20 + 18,
  text: phrases[Math.floor(i / 3)],
}));

describe('chapter suggestions and timeline evidence', () => {
  it('selects real topic transitions using embeddings and titles from the transcript', () => {
    const vectors = blocks.map((_, i) => [+(i < 3), +(i >= 3 && i < 6), +(i >= 6)]);
    const result = suggestChapters(fixture(), blocks, { count: 3, minimumSeconds: 30 }, vectors);
    expect(result.items.map((c) => c.start)).toEqual([0, 60, 120]);
    expect(result.items.map((c) => c.title)).toEqual(phrases);
    expect(result.source).toBe('semantic');
    expect(result.model).toBe(CHAPTER_MODEL);
    expect(validChapterSet(result)).toBe(true);
    expect(() =>
      suggestChapters(fixture(), blocks, { count: 3, minimumSeconds: 30 }, [[NaN]]),
    ).toThrow('embeddings');
  });
  it('offers a truthful non-model mode, respects spacing and does not force empty chapters', () => {
    const result = suggestChapters(fixture(), blocks, { count: 3, minimumSeconds: 30 });
    expect(result.source).toBe('structure');
    expect(result.model).toBeUndefined();
    expect(result.items.map((c) => c.start)).toEqual([0, 60, 120]);
    const same = blocks.map((b) => ({ ...b, text: phrases[0] }));
    expect(suggestChapters(fixture(), same, { count: 10, minimumSeconds: 30 }).items).toHaveLength(
      1,
    );
    expect(() => suggestChapters(fixture(), [], { count: 3, minimumSeconds: 30 })).toThrow(
      'Transcribe',
    );
  });
  it('uses edited source timing, cuts and speed for chapter text; long text splits preserve every character', () => {
    const p = fixture();
    p.clips[0].sourceStart = 20;
    p.clips[0].sourceEnd = 100;
    p.clips[0].properties.speed = 2;
    p.transcripts = [
      {
        mediaId: 'm',
        language: 'English',
        source: 'imported',
        words: [
          { id: 'cut', text: 'Removed.', start: 0, end: 1, speakerId: 'speaker-1' },
          { id: 'keep', text: 'Kept.', start: 40, end: 44, speakerId: 'speaker-1' },
        ],
      },
    ];
    expect(chapterBlocks(p)).toEqual([{ start: 10, end: 12, text: 'Kept.' }]);
    for (const text of [
      'A long text with spaces '.repeat(30),
      '中文内容🧊'.repeat(100),
      'İstanbul Türkçe konuşma.'.repeat(50),
    ]) {
      const parts = splitChapterText(text);
      expect(parts.every((s) => !!s && s.length < text.length)).toBe(true);
      expect(parts.join('')).toBe(text);
      expect(parts.some((s) => /[\uD800-\uDBFF]$/.test(s))).toBe(false);
    }
  });
  it('invalidates timing/text edits, preserves harmless style edits and blocks stale saves/exports', () => {
    const p = fixture();
    p.chapters = manual(p);
    const style = structuredClone(p);
    style.captions.intensity = 99;
    expect(chaptersAreStale(style)).toBe(false);
    const moved = structuredClone(p);
    moved.clips[0].start = 1;
    expect(chaptersAreStale(moved)).toBe(true);
    expect(() => exportChapters(moved, 'vtt')).toThrow('Review');
    expect(() => saveChapters(moved, p.chapters!)).toThrow('Review');
    const hidden = structuredClone(p);
    hidden.tracks.find((t) => t.id === hidden.clips[0].trackId)!.hidden = true;
    expect(chaptersAreStale(hidden)).toBe(true);
    const rewritten = structuredClone(p);
    rewritten.clips[0].captionWords = [
      { id: 'word', text: 'Changed', start: 5, end: 6, speakerId: 'speaker-1' },
    ];
    expect(chaptersAreStale(rewritten)).toBe(true);
    const accepted = saveChapters(moved, {
      ...p.chapters!,
      sourceFingerprint: chapterFingerprint(moved),
    });
    expect(chaptersAreStale(accepted)).toBe(false);
  });
  it('saves per sequence, clears derived parts and rejects malformed active/inactive data', () => {
    let p = fixture();
    p.chapters = manual(p);
    p.sequences = [
      sequenceSnapshot(p, 'one', 'One'),
      sequenceSnapshot({ ...p, chapters: undefined }, 'two', 'Two'),
    ];
    p.activeSequenceId = 'one';
    p = syncSequence(p);
    const two = switchSequence(p, 'two');
    expect(two.chapters).toBeUndefined();
    const one = switchSequence(two, 'one');
    expect(one.chapters).toEqual(p.chapters);
    expect(validateProject(JSON.parse(JSON.stringify(one))).chapters).toEqual(p.chapters);
    const parts = createEqualPartSequences(fixtureWithChapters(), { mode: 'count', value: 2 });
    expect(parts.chapters).toBeUndefined();
    expect(parts.sequences?.find((s) => s.name === 'Original edit')?.chapters).toBeDefined();
    const bad = structuredClone(one);
    bad.sequences![0].chapters!.items[1].start = 0;
    expect(() => validateProject(bad)).toThrow();
    for (const change of [NaN, -1, Infinity])
      expect(
        validChapterSet({ ...manual(), items: [{ id: 'x', start: change, title: 'x' }] }),
      ).toBe(false);
    expect(
      validChapterSet({ ...manual(), items: [{ id: 'x', start: 0, title: 'bad\nline' }] }),
    ).toBe(false);
  });
});
function fixtureWithChapters() {
  const p = fixture();
  p.chapters = manual(p);
  return p;
}

describe('chapter exports and publishing', () => {
  it('exports actual boundaries, escaped VTT text and YouTube-compatible timestamps', () => {
    const p = fixtureWithChapters();
    expect(exportChapters(p, 'youtube')).toBe(
      '00:00 Solar panels\n01:00 Baking bread\n02:00 Football',
    );
    p.chapters!.items[1].title = 'Bread <rise> & bake';
    const vtt = exportChapters(p, 'vtt');
    expect(vtt).toContain('00:01:00.000 --> 00:02:00.000\nBread &lt;rise&gt; &amp; bake');
    expect(vtt).toContain('00:02:00.000 --> 00:03:00.000');
    expect(JSON.parse(exportChapters(p, 'json')).items).toEqual(p.chapters!.items);
    expect(chapterTimestamp(3661.125, true)).toBe('01:01:01.125');
    expect(chapterTimestamp(3661.125)).toBe('01:01:01');
  });
  it('enforces YouTube minimum count, start and final length after rounding', () => {
    expect(youtubeChapterIssues(manual(), 180)).toEqual([]);
    expect(
      youtubeChapterIssues({ ...manual(), items: manual().items.slice(0, 2) }, 180).join(' '),
    ).toContain('at least 3');
    const set = manual();
    set.items[0].start = 1;
    set.items[2].start = 171;
    expect(youtubeChapterIssues(set, 180)).toHaveLength(2);
    const p = fixtureWithChapters();
    p.chapters!.items[2].start = 180;
    expect(() => exportChapters(p, 'vtt')).toThrow('inside');
  });
  it('updates its appended block without duplicates and protects stale/edited metadata', () => {
    const p = fixtureWithChapters(),
      original = { title: 'Video', description: 'My description.', hashtags: '#example' };
    const appended = appendChapters(p, original);
    expect(publishingChaptersStale(p, appended)).toBe(false);
    expect(appendChapters(p, appended)).toEqual(appended);
    p.chapters!.items[1].title = 'Different title';
    expect(publishingChaptersStale(p, appended)).toBe(true);
    const updated = appendChapters(p, appended);
    expect(updated.description.match(/00:00/g)).toHaveLength(1);
    expect(updated.description).not.toContain('Baking bread');
    expect(updated.title).toBe(original.title);
    expect(updated.hashtags).toBe(original.hashtags);
    expect(() => appendChapters(p, { ...updated, description: 'Hand edited timestamps' })).toThrow(
      'edited',
    );
    expect(() => appendChapters(p, { ...original, description: 'x'.repeat(5000) })).toThrow(
      '5,000',
    );
    p.clips[0].properties.speed = 2;
    expect(publishingChaptersStale(p, updated)).toBe(true);
    expect(() => appendChapters(p, updated)).toThrow('Review');
    expect(publishingChaptersStale(p, { ...updated, chapterAttachment: undefined })).toBe(false);
  });
});
