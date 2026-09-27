import { describe, it, expect } from 'vitest';
import { createProject, addMedia, validateProject, captionGroups } from './model';
import { reframeClip } from './reframe';
import { subtitleFingerprint, sourceCues, currentVariant, cuesSrt } from './translations';
import { sequenceSnapshot, switchSequence } from './sequences';
import { zipFiles } from './zip';
import { insertBroll } from './stock';
import { metadataDrafts } from './publishing';
function setup() {
  const p = addMedia(createProject(), {
    id: 'v',
    name: 'test',
    duration: 10,
    width: 1920,
    height: 1080,
    type: 'video/mp4',
    size: 20,
  });
  p.transcripts = [
    {
      mediaId: 'v',
      source: 'imported',
      language: 'English',
      words: [{ id: 'w', text: 'Hello world.', start: 1, end: 2, speakerId: 's1' }],
    },
  ];
  return p;
}
describe('creator data integrity', () => {
  it('inserts licensed B-roll within the timeline and refuses overlap and locked tracks', () => {
    const p = setup(),
      asset = {
        ...p.media[0],
        id: 'stock',
        attribution: {
          title: 'Nature',
          creator: 'Author',
          license: 'CC BY 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
          url: 'https://commons.wikimedia.org/wiki/File:Nature.webm',
        },
      };
    const next = insertBroll(p, asset, 1, 4);
    expect(next.clips[1]).toMatchObject({
      trackId: 'V2',
      start: 1,
      sourceEnd: 3,
      properties: { volume: 0 },
    });
    expect(metadataDrafts(next).description).toContain('CC BY 4.0');
    expect(() => validateProject(next)).not.toThrow();
    expect(() => insertBroll(next, { ...asset, id: 'more' }, 2, 5)).toThrow('already');
    p.tracks.find((t) => t.id === 'V2')!.locked = true;
    expect(() => insertBroll(p, asset, 1, 4)).toThrow('Unlock');
  });
  it('reframes source-time movement within the filled canvas, preserving clip audio', () => {
    const p = setup(),
      c = p.clips[0];
    c.sourceStart = 2;
    c.sourceEnd = 6;
    c.properties.speed = 2;
    c.properties.volume = 0.4;
    const out = reframeClip(p, c, p.media[0], [
      { time: 2, x: 0, y: 0, found: true },
      { time: 4, x: 0.5, y: 0.5, found: true },
      { time: 6, x: 1, y: 1, found: true },
    ]);
    expect(out.properties.scale).toBeCloseTo(3.16049);
    expect(out.properties.speed).toBe(2);
    expect(out.properties.volume).toBe(0.4);
    expect(out.keyframes!.x!.map((f) => f.time)).toEqual([2, 4, 6]);
    expect(out.keyframes!.x![0].value).toBeGreaterThan(0);
    expect(out.keyframes!.x![2].value).toBeLessThan(0);
    expect(out.keyframes!.y!.every((f) => Math.abs(f.value) < 1e-6)).toBe(true);
    expect(() => validateProject({ ...p, clips: [out] })).not.toThrow();
  });
  it('keeps translations per sequence, rejects stale timing, retains editable source captions', () => {
    const p = setup();
    p.subtitleVariants = [
      {
        language: 'tr',
        sourceFingerprint: subtitleFingerprint(p),
        cues: [{ ...sourceCues(p)[0], text: 'Merhaba dünya.' }],
      },
    ];
    p.captions.language = 'tr';
    expect(
      captionGroups(p)[0]
        .map((w) => w.text)
        .join(' '),
    ).toBe('Merhaba dünya.');
    expect(cuesSrt(p.subtitleVariants[0].cues)).toContain('00:00:01,000 --> 00:00:02,000');
    p.sequences = [
      sequenceSnapshot(p, 'a', 'Original'),
      {
        ...sequenceSnapshot(p, 'b', 'Other'),
        subtitleVariants: undefined,
        captions: { ...p.captions, language: undefined },
      },
    ];
    p.activeSequenceId = 'a';
    const switched = switchSequence(p, 'b');
    expect(switched.subtitleVariants).toBeUndefined();
    expect(switchSequence(switched, 'a').subtitleVariants).toHaveLength(1);
    p.clips[0].start = 3;
    expect(currentVariant(p)).toBeUndefined();
    expect(captionGroups(p)[0][0].text).toBe('Hello world.');
    expect(() => validateProject(p)).not.toThrow();
    p.subtitleVariants[0].cues[0].end = -1;
    expect(() => validateProject(p)).toThrow();
  });
  it('writes correct stored ZIP header, CRC and central directory without changing payload', async () => {
    const zip = await zipFiles([{ name: 'tr.srt', blob: new Blob(['123456789']) }]);
    const bytes = new Uint8Array(await zip.arrayBuffer()),
      v = new DataView(bytes.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(14, true)).toBe(0xcbf43926);
    expect(new TextDecoder().decode(bytes.slice(36, 45))).toBe('123456789');
    expect(v.getUint32(45, true)).toBe(0x02014b50);
    expect(v.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  });
});
