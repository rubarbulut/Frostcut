import { describe, expect, it } from 'vitest';
import { addMedia, createProject, duration, validateProject, type Suggestion } from './model';
import { createShortSequences, removeSequence, switchSequence, syncSequence } from './sequences';
function fixture() {
  return addMedia(createProject('Long video', 'YouTube'), {
    id: 'm',
    name: 'long.mp4',
    duration: 600,
    width: 1920,
    height: 1080,
    size: 10,
    type: 'video/mp4',
  });
}
function highlight(start: number, end: number): Suggestion {
  return {
    id: String(start),
    type: 'highlight',
    title: `Moment ${start}`,
    reason: 'Strong hook',
    start,
    end,
    score: 90,
    status: 'pending',
    operations: [{ type: 'assemble', ranges: [{ start, end }] }],
  };
}
describe('independent short sequences', () => {
  it('round-trips bounded applied edit metadata and rejects invalid records', () => {
    const p = fixture();
    p.appliedEdits = [{ label: 'AI: Strong hook', date: new Date().toISOString() }];
    expect(validateProject(JSON.parse(JSON.stringify(p))).appliedEdits).toEqual(p.appliedEdits);
    p.appliedEdits[0].date = 'not a date';
    expect(() => validateProject(p)).toThrow();
  });
  it('creates several portrait Shorts from the same original without cascading cuts', () => {
    const source = fixture();
    const p = createShortSequences(source, [highlight(90, 120), highlight(300, 345)]);
    expect(p.sequences).toHaveLength(3);
    expect(duration(p)).toBe(30);
    expect(p.clips[0].sourceStart).toBe(90);
    const second = switchSequence(p, p.sequences![2].id);
    expect(second.clips[0].sourceStart).toBe(300);
    expect(duration(second)).toBe(45);
    expect(second.settings).toMatchObject({ width: 1080, height: 1920 });
    const original = switchSequence(second, p.sequences![0].id);
    expect(duration(original)).toBe(600);
    expect(original.settings).toMatchObject({ width: 1920, height: 1080 });
    expect(source.sequences).toBeUndefined();
  });
  it('keeps changes local to a Short and round-trips every sequence', () => {
    let p = createShortSequences(fixture(), [highlight(90, 120), highlight(300, 345)]);
    p.clips[0].properties.volume = 0.3;
    p.captions.wordsPerCaption = 2;
    p = syncSequence(p);
    const restored = validateProject(JSON.parse(JSON.stringify(p)));
    const second = switchSequence(restored, restored.sequences![2].id);
    expect(second.clips[0].properties.volume).toBe(1);
    expect(second.captions.wordsPerCaption).toBe(4);
    const first = switchSequence(second, restored.activeSequenceId!);
    expect(first.clips[0].properties.volume).toBe(0.3);
    expect(first.captions.wordsPerCaption).toBe(2);
  });
  it('rejects corrupt inactive sequences, stale references, and locked linked audio', () => {
    const p = createShortSequences(fixture(), [highlight(90, 120)]);
    p.sequences![0].clips[0].mediaId = 'missing';
    expect(() => validateProject(p)).toThrow();
    expect(() => switchSequence(fixture(), 'absent')).toThrow();
    const q = fixture();
    q.tracks.find((t) => t.id === 'A1')!.locked = true;
    expect(() => createShortSequences(q, [highlight(0, 20)])).toThrow('Unlock');
  });
  it('can remove the active Short while retaining the original', () => {
    const p = createShortSequences(fixture(), [highlight(90, 120)]);
    const next = removeSequence(p, p.activeSequenceId!);
    expect(next.sequences).toHaveLength(1);
    expect(duration(next)).toBe(600);
  });
});
