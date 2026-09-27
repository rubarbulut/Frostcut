import { describe, expect, it } from 'vitest';
import { addMedia, createProject, splitClip, validateProject } from './model';
import { createEqualPartSequences } from './equal-parts';
import {
  defaultChroma,
  defaultMask,
  hasVisualEffects,
  rgbColor,
  validVisualEffects,
} from './visual-effects';

function fixture() {
  const p = addMedia(createProject('Effects', 'YouTube'), {
    id: 'm',
    name: 'green.mp4',
    duration: 10,
    width: 640,
    height: 360,
    size: 10,
    type: 'video/mp4',
  });
  p.clips[0].effects = { chroma: defaultChroma(), mask: defaultMask() };
  return p;
}
describe('visual effect project data', () => {
  it('round-trips editable key and mask settings without sharing defaults', () => {
    const p = fixture();
    expect(validateProject(JSON.parse(JSON.stringify(p))).clips[0].effects).toEqual(
      p.clips[0].effects,
    );
    expect(validVisualEffects({})).toBe(true);
    const a = defaultMask(),
      b = defaultMask();
    a.points[0].x = 99;
    expect(b.points[0].x).toBe(20);
    expect(hasVisualEffects({ chroma: { ...defaultChroma(), enabled: false } })).toBe(false);
    expect(rgbColor('#ff0080')).toEqual([1, 0, 128 / 255]);
  });
  it('preserves effects through timeline splits and equal-part creation', () => {
    const p = fixture(),
      before = structuredClone(p);
    const split = splitClip(p, p.clips[0].id, 4);
    expect(split.clips).toHaveLength(2);
    expect(split.clips.every((c) => validVisualEffects(c.effects))).toBe(true);
    const parts = createEqualPartSequences(p, { mode: 'count', value: 2 });
    expect(parts.sequences?.every((s) => s.clips[0].effects?.chroma?.color === '#00ff00')).toBe(
      true,
    );
    expect(p).toEqual(before);
  });
  it('rejects unsafe or corrupt effect settings in active and inactive sequences', () => {
    for (const effects of [
      { chroma: { ...defaultChroma(), color: 'url(x)' } },
      { chroma: { ...defaultChroma(), similarity: NaN } },
      { mask: { ...defaultMask(), points: [{ x: 1, y: 1 }] } },
      { mask: { ...defaultMask(), points: Array.from({ length: 25 }, () => ({ x: 0, y: 0 })) } },
      { mask: { ...defaultMask(), width: 0 } },
      { mask: { ...defaultMask(), feather: 31 } },
      {
        mask: {
          ...defaultMask(),
          points: [
            { x: 0, y: -1 },
            { x: 1, y: 1 },
            { x: 2, y: 2 },
          ],
        },
      },
    ])
      expect(validVisualEffects(effects)).toBe(false);
    const p = createEqualPartSequences(fixture(), { mode: 'count', value: 2 });
    p.sequences![0].clips[0].effects!.mask!.feather = 99;
    expect(() => validateProject(p)).toThrow();
  });
});
