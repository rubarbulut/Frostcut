import { describe, expect, it } from 'vitest';
import { createProject } from './model';
import { captionAppearance } from './caption-style';
import {
  BRAND_KITS_KEY,
  addBrandExample,
  applyBrandKit,
  brandStyle,
  createBrandKit,
  importBrandKit,
  learnedBrandStyle,
  readBrandKits,
  saveBrandKits,
  validateBrandKit,
} from './brand-kits';

describe('approved local brand kits', () => {
  it('captures a detached, canonical style without private project content or settings', () => {
    const p = createProject('Channel');
    p.captions.appearance = {
      ...captionAppearance(p.captions),
      color: '#ABCDEF',
      letterSpacing: 0.12,
    };
    const kit = createBrandKit('Brand', p);
    expect(kit.style.appearance).toMatchObject({ color: '#abcdef', letterSpacing: 0.12 });
    expect(kit.style).not.toHaveProperty('enabled');
    expect(kit.style).not.toHaveProperty('savedStyles');
    expect(kit).not.toHaveProperty('transcripts');
    expect(kit).not.toHaveProperty('media');
    p.captions.appearance.color = '#000000';
    kit.style.appearance!.color = '#ff0000';
    expect(kit.examples[0].style.appearance!.color).toBe('#abcdef');
  });
  it('learns from actual approved examples, preferring frequency and then recency', () => {
    const a = createProject('First'),
      b = createProject('Second'),
      c = createProject('Third');
    b.captions.appearance = { ...captionAppearance(b.captions), color: '#ff0000' };
    // Explicit defaults and case differences must count as the same style.
    c.captions.appearance = { ...captionAppearance(a.captions), color: '#FFFFFF' };
    let kit = createBrandKit('Brand', a);
    kit = addBrandExample(kit, b);
    expect(learnedBrandStyle(kit)?.labels).toEqual(['Second']);
    kit = addBrandExample(kit, c);
    expect(learnedBrandStyle(kit)?.labels).toEqual(['First', 'Third']);
    expect(learnedBrandStyle(kit)?.style.appearance?.color).toBe('#ffffff');
    expect(learnedBrandStyle({ ...kit, examples: [] })).toBeUndefined();
  });
  it('updates an existing sequence vote and keeps manual kit edits until explicitly replaced', () => {
    const p = createProject('Channel');
    let kit = createBrandKit('Brand', p);
    kit.style.appearance!.color = '#112233';
    p.captions.appearance = { ...captionAppearance(p.captions), color: '#ff0000' };
    kit = addBrandExample(kit, p);
    expect(kit.examples).toHaveLength(1);
    expect(kit.style.appearance?.color).toBe('#112233');
    expect(learnedBrandStyle(kit)?.style.appearance?.color).toBe('#ff0000');
  });
  it('applies only style values and leaves other sequences, content and preferences intact', () => {
    const source = createProject('Source');
    source.captions.position = 'custom';
    source.captions.customPosition = { x: 30, y: 70 };
    source.captions.appearance = {
      ...captionAppearance(source.captions),
      fontFamily: 'mono',
      wordSpacing: 0.25,
    };
    const kit = createBrandKit('Brand', source);
    const target = createProject('Target');
    target.captions.language = 'tr';
    target.captions.enabled = false;
    target.captions.safeArea = false;
    target.captions.savedStyles = [
      { id: 'existing', name: 'Existing', style: brandStyle(target.captions) },
    ];
    const before = structuredClone(target);
    const applied = applyBrandKit(target, kit);
    expect(applied.captions).toMatchObject({
      language: 'tr',
      enabled: false,
      safeArea: false,
      customPosition: { x: 30, y: 70 },
    });
    expect(applied.captions.appearance).toMatchObject({ fontFamily: 'mono', wordSpacing: 0.25 });
    expect(applied.captions.savedStyles).toEqual(before.captions.savedStyles);
    expect({ ...applied, captions: before.captions }).toEqual(before);
    applied.captions.appearance!.color = '#112233';
    expect(kit.style.appearance!.color).not.toBe('#112233');
    expect(target).toEqual(before);
  });
  it('validates imports and creates independent profiles instead of replacing matching IDs', () => {
    const kit = createBrandKit('Brand', createProject());
    const imported = importBrandKit(JSON.stringify({ ...kit, media: ['not a style field'] }), [
      kit,
    ]);
    expect(imported.id).not.toBe(kit.id);
    expect(imported.name).toBe('Brand (imported 1)');
    expect(imported).not.toHaveProperty('media');
    for (const bad of [
      null,
      {},
      { ...kit, version: 2 },
      { ...kit, examples: [...kit.examples, ...kit.examples] },
      { ...kit, style: { ...kit.style, wordsPerCaption: 100 } },
      { ...kit, style: { ...kit.style, appearance: { ...kit.style.appearance, color: 'url(x)' } } },
    ])
      expect(() => validateBrandKit(bad)).toThrow();
    expect(() => importBrandKit('x'.repeat(100_001), [])).toThrow('too large');
  });
  it('round-trips local storage and surfaces corruption or failed writes instead of claiming success', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const kit = createBrandKit('Brand', createProject());
    expect(readBrandKits(storage)).toEqual([]);
    saveBrandKits([kit], storage);
    expect(readBrandKits(storage)).toEqual([kit]);
    expect(() => saveBrandKits([kit, { ...kit, id: 'other', name: 'BRAND' }], storage)).toThrow(
      'different',
    );
    expect(readBrandKits(storage)).toEqual([kit]);
    expect(() =>
      saveBrandKits([kit], {
        setItem: () => {
          throw new Error('Storage quota exceeded');
        },
      }),
    ).toThrow('quota');
    values.set(BRAND_KITS_KEY, 'invalid json');
    expect(() => readBrandKits(storage)).toThrow();
  });
  it('bounds examples while allowing updates at the limit', () => {
    const p = createProject();
    let kit = createBrandKit('Brand', p);
    for (let i = 1; i < 20; i++) kit = addBrandExample(kit, { ...p, id: `project-${i}` });
    expect(kit.examples).toHaveLength(20);
    expect(() => addBrandExample(kit, { ...p, id: 'overflow' })).toThrow('maximum 20');
    expect(addBrandExample(kit, p).examples).toHaveLength(20);
  });
});
