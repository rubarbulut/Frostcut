import { describe, expect, it } from 'vitest';
import { addMedia, createProject, validateProject } from './model';
import { createEqualPartSequences } from './equal-parts';
import { captionAppearance } from './caption-style';
import { sequenceViews, switchSequence } from './sequences';
import { copyCaptionStyle, partNamePreview, renameParts } from './sequence-tools';

function fixture() {
  return createEqualPartSequences(
    addMedia(createProject('Episodes', 'YouTube'), {
      id: 'm',
      name: 'source.mp4',
      duration: 90,
      width: 1920,
      height: 1080,
      size: 10,
      type: 'video/mp4',
    }),
    { mode: 'count', value: 3 },
  );
}
describe('part management', () => {
  it('numbers only selected parts in sequence order, round-trips and preserves original/source data', () => {
    const p = fixture(),
      before = structuredClone(p);
    const ids = [p.sequences![3].id, p.sequences![1].id];
    const naming = { prefix: 'My series – Episode', start: 7, digits: 2 };
    expect(partNamePreview(p, ids, naming).map((s) => s.name)).toEqual([
      'My series – Episode 07',
      'My series – Episode 08',
    ]);
    const next = renameParts(p, ids, naming);
    expect(next.sequences![0]).toEqual(before.sequences![0]);
    expect(next.sequences![2]).toEqual(before.sequences![2]);
    expect(next.clips).toEqual(before.clips);
    expect(next.activeSequenceId).toBe(p.activeSequenceId);
    expect(validateProject(JSON.parse(JSON.stringify(next))).sequences![3].name).toBe(
      'My series – Episode 08',
    );
    expect(p).toEqual(before);
  });
  it('copies the latest active styling, preserving destination text, language, visibility and presets', () => {
    const p = fixture();
    p.captions.appearance = {
      ...captionAppearance(p.captions),
      color: '#ff0000',
      wordSpacing: 0.2,
      italic: true,
    };
    p.captions.customPosition = { x: 25, y: 70 };
    p.captions.position = 'custom';
    const target = p.sequences![2];
    target.captions.language = 'tr';
    target.captions.enabled = false;
    target.captions.savedStyles = [{ id: 'keep', name: 'Keep me', style: { ...target.captions } }];
    const before = structuredClone(p);
    const next = copyCaptionStyle(p, p.activeSequenceId!, [target.id, p.activeSequenceId!]);
    const copied = switchSequence(next, target.id);
    expect(copied.captions.appearance).toEqual(p.captions.appearance);
    expect(copied.captions).toMatchObject({
      language: 'tr',
      enabled: false,
      savedStyles: target.captions.savedStyles,
    });
    expect(copied.clips).toEqual(target.clips);
    expect(copied.transcripts).toEqual(p.transcripts);
    expect(next.sequences![2].captions.customPosition).not.toBe(p.captions.customPosition);
    expect(p).toEqual(before);
  });
  it('updates an active target so the next sequence sync cannot discard its copied appearance', () => {
    const p = fixture(),
      source = p.sequences![2];
    source.captions.appearance = { ...captionAppearance(source.captions), color: '#00ff00' };
    const next = copyCaptionStyle(p, source.id, [p.activeSequenceId!]);
    expect(next.captions.appearance?.color).toBe('#00ff00');
    expect(switchSequence(next, p.activeSequenceId!).captions.appearance?.color).toBe('#00ff00');
    const views = sequenceViews(next);
    expect(views.find((s) => s.id === next.activeSequenceId)?.clips).toBe(next.clips);
    expect(views[0]).toBe(next.sequences![0]);
  });
  it('rejects invalid names, stale selections and empty style targets without changing the project', () => {
    const p = fixture(),
      before = structuredClone(p),
      id = p.activeSequenceId!;
    const naming = { prefix: 'Episode', start: 1, digits: 2 };
    expect(() => renameParts(p, [id], { ...naming, start: NaN })).toThrow();
    expect(() => renameParts(p, [id], { ...naming, prefix: 'x'.repeat(80) })).toThrow();
    expect(() => renameParts(p, ['missing'], naming)).toThrow();
    expect(() => copyCaptionStyle(p, id, [id])).toThrow();
    expect(() => copyCaptionStyle(p, id, ['missing'])).toThrow();
    expect(p).toEqual(before);
  });
});
