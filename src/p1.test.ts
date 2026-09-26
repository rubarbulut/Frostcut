import { describe, expect, it } from 'vitest';
import {
  addMedia,
  createProject,
  duration,
  timelineWords,
  validateProject,
  type Word,
} from './model';
import {
  applySpeechCleanup,
  cleanupRanges,
  repeatedTakes,
  speechSuggestions,
} from './speech-cleanup';
import { captionAppearance } from './caption-style';
import { createSrt, srtTime } from './subtitles';
import { createAss } from './media';
import { parseSrt } from './transcription';
function fixture(lines: [number, string][]) {
  const p = addMedia(createProject('Speech'), {
    id: 'm',
    name: 'speech.mp4',
    duration: 60,
    width: 1080,
    height: 1920,
    size: 100,
    type: 'video/mp4',
  });
  const words: Word[] = lines.flatMap(([start, line], row) =>
    line.split(' ').map((text, i) => ({
      id: `${row}-${i}`,
      text,
      start: start + i * 0.2,
      end: start + i * 0.2 + 0.18,
      speakerId: 'speaker-1',
    })),
  );
  p.transcripts = [{ mediaId: 'm', language: 'English', source: 'local', words }];
  return p;
}
describe('speech cleanup', () => {
  it('preserves imported cue boundaries and labels estimated word timing', () => {
    const p = fixture([]);
    p.transcripts = [
      parseSrt(
        '1\n00:00:00,200 --> 00:00:00,600\nUm,\n\n2\n00:00:01,000 --> 00:00:03,000\nA better video needs a better story.\n\n3\n00:00:04,000 --> 00:00:06,000\nA better video needs a better story.',
        'm',
      ),
    ];
    const items = speechSuggestions(p);
    expect(items).toHaveLength(2);
    expect(items.every((s) => s.estimated)).toBe(true);
    expect(items.find((s) => s.kind === 'repeat')?.start).toBe(1);
  });
  it('finds English and Turkish hesitations, with ambiguous phrases opt-in', () => {
    const p = fixture([
      [0, 'Um, I like this.'],
      [2, 'ııı şey yani you know I mean great.'],
      [5, 'Hmm.'],
    ]);
    expect(speechSuggestions(p).map((s) => s.text)).toEqual(['Um,', 'ııı', 'Hmm.']);
    expect(speechSuggestions(p, true).map((s) => s.text)).toContain('you know');
    expect(speechSuggestions(p, true).map((s) => s.text)).toContain('I mean');
    expect(speechSuggestions(p).some((s) => s.text === 'like')).toBe(false);
  });
  it('finds nonadjacent repeated takes without mutating the project', () => {
    const p = fixture([
      [0, 'A better video needs a better story.'],
      [4, 'Let me try again.'],
      [7, 'A better video needs a better story.'],
    ]);
    const before = JSON.stringify(p),
      candidates = repeatedTakes(p);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].later?.start).toBe(7);
    expect(JSON.stringify(p)).toBe(before);
  });
  it.each([
    ['A good story needs a clear beginning.', 'Beginning clear a needs story good a.'],
    ['I really do need a perfect camera today.', 'I really do not need a perfect camera today.'],
    ['The total price is only 100 dollars today.', 'The total price is only 200 dollars today.'],
  ])('does not confuse order, negation or numbers: %s', (a, b) => {
    expect(
      repeatedTakes(
        fixture([
          [0, a],
          [5, b],
        ]),
      ),
    ).toHaveLength(0);
  });
  it('does not match distant takes or different speakers', () => {
    expect(
      repeatedTakes(
        fixture([
          [0, 'I need a better story.'],
          [40, 'I need a better story.'],
        ]),
      ),
    ).toHaveLength(0);
    const p = fixture([
      [0, 'I need a better story.'],
      [5, 'I need a better story.'],
    ]);
    p.transcripts[0].words.slice(5).forEach((w) => (w.speakerId = 'speaker-2'));
    expect(repeatedTakes(p)).toHaveLength(0);
  });
  it('cuts mapped source audio at speed and preserves other source instances', () => {
    const p = fixture([[4, 'Um, here is the story.']]);
    p.clips[0].sourceStart = 2;
    p.clips[0].start = 3;
    p.clips[0].properties.speed = 2;
    p.clips.push({ ...structuredClone(p.clips[0]), id: 'duplicate', start: 40 });
    const item = speechSuggestions(p)[0];
    expect(item.start).toBe(4);
    const next = applySpeechCleanup(p, [item]);
    expect(duration(next)).toBeCloseTo(duration(p) - 0.09);
    expect(next.clips.slice(0, 2).map((c) => [c.sourceStart, c.sourceEnd])).toEqual([
      [2, 4],
      [4.18, 60],
    ]);
    expect(timelineWords(next).filter((w) => w.text === 'Um,')).toHaveLength(1);
    expect(p.clips).toHaveLength(2);
  });
  it('unions overlapping filler and repeat cuts without deleting twice', () => {
    const p = fixture([
      [0, 'Um, I need a better story.'],
      [4, 'Um, I need a better story.'],
    ]);
    const selected = speechSuggestions(p).filter((s) => s.start < 4);
    expect(selected).toHaveLength(2);
    const ranges = cleanupRanges(selected);
    expect(ranges).toHaveLength(1);
    expect(duration(applySpeechCleanup(p, selected))).toBeCloseTo(60 - ranges[0].end);
  });
  it('rejects stale selections and locked tracks without partial edits', () => {
    const p = fixture([[0, 'Um, a story.']]),
      items = speechSuggestions(p);
    p.clips[0].start = 1;
    expect(() => applySpeechCleanup(p, items)).toThrow('transcript changed');
    p.clips[0].start = 0;
    p.tracks.find((t) => t.id === 'A1')!.locked = true;
    expect(() => applySpeechCleanup(p, items)).toThrow('Unlock');
    expect(duration(p)).toBe(60);
  });
  it('does not offer overlapping estimated filler boundaries', () => {
    const p = fixture([[0, 'Um, here.']]);
    p.transcripts[0].words[0].end = 0.3;
    expect(speechSuggestions(p)).toHaveLength(0);
  });
});
describe('subtitle output and custom presets', () => {
  it('exports Unicode captions using edited timeline time, even with overlay disabled', () => {
    const p = fixture([
      [4, 'Türkçe ışık.'],
      [7, 'Zażółć gęślą.'],
    ]);
    p.clips[0].start = 10;
    p.clips[0].sourceStart = 4;
    p.clips[0].properties.speed = 2;
    p.captions.enabled = false;
    const srt = createSrt(p);
    expect(srt).toContain('00:00:10,000 --> 00:00:10,190\r\nTürkçe ışık.');
    expect(srt).toContain('Zażółć gęślą.');
    expect(srtTime(59.9996)).toBe('00:01:00,000');
    expect(srtTime(3661.001)).toBe('01:01:01,001');
  });
  it('preserves custom saved styles and rejects invalid appearance on import', () => {
    const p = fixture([[0, 'My story.']]);
    p.captions.appearance = {
      ...captionAppearance(p.captions),
      color: '#ff9900',
      size: 8.2,
      speakerColors: false,
    };
    p.captions.savedStyles = [
      {
        id: 'custom',
        name: 'Warm',
        style: {
          preset: 'Bold',
          intensity: 50,
          wordsPerCaption: 4,
          position: 'top',
          appearance: p.captions.appearance,
        },
      },
    ];
    expect(validateProject(JSON.parse(JSON.stringify(p))).captions).toEqual(p.captions);
    p.captions.appearance.size = 100;
    expect(() => validateProject(p)).toThrow();
  });
  it('keeps legacy projects valid and uses custom appearance in ASS export', () => {
    const p = fixture([[0, 'My story.']]);
    expect(validateProject(p)).toBeTruthy();
    p.captions.appearance = {
      ...captionAppearance(p.captions),
      color: '#ff9900',
      accent: '#00ff00',
      outlineColor: '#112233',
      outline: 4,
      size: 8,
      margin: 20,
      bold: false,
      speakerColors: false,
    };
    p.transcripts[0].words[1].important = true;
    const ass = createAss(p, 1080, 1920);
    expect(ass).toContain('Default,Noto Sans,86,&H0099ff&,&H00ff00&,&H332211&');
    expect(ass).toContain('\\c&H0099ff&');
    expect(ass).toContain('\\c&H00ff00&');
    expect(ass).toContain(',4,0,2,76,76,384,1');
  });
});
