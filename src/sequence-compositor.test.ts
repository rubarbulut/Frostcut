import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addMedia, createProject, defaultProps, type Project, type SequenceClip } from './model';
import { sequenceSnapshot } from './sequences';
import { requireMediaClip } from './clip-source';
import { newAdjustment } from './adjustments';
import { defaultChroma, defaultMask, type VisualEffects } from './visual-effects';
import { compileProjectSequencePlan, SequenceCompositor, type DecodedVisualFrame, type VisualFrameSource } from './sequence-compositor';

type Paint = { kind: string; uid?: string; frame?: number; children?: Paint[]; alpha?: number;
  color?: string; filter?: string; text?: string; rect?: number[] };
type Image = { uid: string; frame?: number; paint?: Paint[] };
const effectTrace = vi.hoisted(() => ({ draws: [] as { source: Image; effects: VisualEffects; width: number; height: number }[], disposed: 0 }));
vi.mock('./effects-renderer', () => ({ EffectsRenderer: class {
  draw(image: Image, width: number, height: number, effects: VisualEffects) {
    const source = { uid: image.uid, frame: image.frame, paint: image.paint ? structuredClone(image.paint) : undefined };
    effectTrace.draws.push({ source, effects, width, height });
    return { uid: 'effects', width, height, frame: source.frame, paint: source.paint };
  }
  dispose() { effectTrace.disposed++; }
} }));

const canvases: ReturnType<typeof canvas>[] = [];
let canvasSerial = 0;
function canvas(width = 1, height = 1) {
  const image = { uid: `canvas-${canvasSerial++}`, width, height, paint: [] as Paint[] };
  type State = { filter: string; globalAlpha: number; fillStyle: string; font: string };
  const stack: State[] = [];
  const ctx = {
    canvas: image, filter: 'none', globalAlpha: 1, fillStyle: '', font: '',
    save: vi.fn(() => stack.push({ filter: ctx.filter, globalAlpha: ctx.globalAlpha, fillStyle: ctx.fillStyle, font: ctx.font })),
    restore: vi.fn(() => Object.assign(ctx, stack.pop())),
    resetTransform: vi.fn(), translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(),
    beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), strokeText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 4 })),
    clearRect: vi.fn(() => { image.paint = []; }),
    fillRect: vi.fn((...rect: number[]) => image.paint.push({ kind: 'fill', color: ctx.fillStyle, alpha: ctx.globalAlpha, rect })),
    fillText: vi.fn((text: string) => image.paint.push({ kind: 'text', text, color: ctx.fillStyle, alpha: ctx.globalAlpha })),
    drawImage: vi.fn((source: Image, ...rect: number[]) => image.paint.push({ kind: 'image', uid: source.uid, frame: source.frame,
      children: source.paint ? structuredClone(source.paint) : undefined, alpha: ctx.globalAlpha, filter: ctx.filter, rect })),
  };
  const element = Object.assign(image, { getContext: () => ctx }) as unknown as HTMLCanvasElement;
  return { element, image, ctx, context: ctx as unknown as CanvasRenderingContext2D, stack };
}
beforeEach(() => {
  canvases.length = 0; canvasSerial = 0; effectTrace.draws.length = 0; effectTrace.disposed = 0;
  vi.stubGlobal('document', { createElement: (tag: string) => {
    if (tag !== 'canvas') throw new Error('Tests must not create real decoders.');
    const surface = canvas(); canvases.push(surface); return surface.element;
  } });
});
afterEach(() => vi.unstubAllGlobals());

function footage() {
  const p = addMedia(createProject('Compose', 'YouTube'), { id: 'video', name: 'Original.mp4', duration: 20,
    width: 200, height: 100, type: 'video/mp4', size: 1 });
  p.settings = { ...p.settings, width: 200, height: 100, fillMode: 'fit' };
  p.captions = { ...p.captions, enabled: false };
  return p;
}
const reference = (id: string, patch: Partial<SequenceClip> = {}): SequenceClip => ({
  id, sequenceId: 'child', trackId: 'V1', start: 0, sourceStart: 0, sourceEnd: 4, properties: { ...defaultProps }, ...patch,
});
function nested() {
  const p = footage(), child = sequenceSnapshot(p, 'child', 'Child');
  child.settings = { ...child.settings, width: 100, height: 100, fillMode: 'crop' };
  child.clips[0] = { ...requireMediaClip(child.clips[0]), id: 'leaf', sourceStart: 2, sourceEnd: 12,
    properties: { ...defaultProps, speed: 2, opacity: 0.7 },
    keyframes: { x: [{ time: 2, value: 0 }, { time: 12, value: 100 }] },
    effects: { chroma: defaultChroma() },
    captionWords: [{ id: 'w-child', text: 'Child', start: 4, end: 6, speakerId: p.speakers[0].id }] };
  child.captions = { ...child.captions, enabled: true, appearance: {
    size: 8, color: '#ff0000', accent: '#ff0000', speakerColors: false, outlineColor: '#000000', outline: 0,
    bold: false, margin: 8, shadow: false, animation: 'none' } };
  child.adjustments = [{ ...newAdjustment(1, 2), saturation: 0 }];
  const root = sequenceSnapshot(p, 'root', 'Parent');
  root.clips = [{ ...requireMediaClip(p.clips[0]), id: 'background', trackId: 'V1', start: 10, sourceEnd: 10,
    captionWords: [{ id: 'w-root', text: 'Parent', start: 0, end: 2, speakerId: p.speakers[0].id }] },
    reference('placement', { trackId: 'V2', start: 10, sourceStart: 0.5, sourceEnd: 4.5,
      properties: { ...defaultProps, speed: 2, x: 20, scale: 1.2, rotation: 10, opacity: 0.4 }, effects: { mask: defaultMask() } })];
  root.captions = { ...child.captions, appearance: { ...child.captions.appearance!, color: '#0000ff', accent: '#0000ff' } };
  root.adjustments = [{ ...newAdjustment(10, 12), exposure: 1 }];
  const project: Project = { ...p, ...root, id: p.id, name: p.name, activeSequenceId: 'root', sequences: [root, child] };
  return { project, child };
}
const source = () => vi.fn<VisualFrameSource>(async (layer) => ({ image: { uid: 'source', frame: layer.sourceTime } as unknown as DecodedVisualFrame['image'], width: 200, height: 100 }));
const flatten = (paints: Paint[]): Paint[] => paints.flatMap((p) => [p, ...flatten(p.children ?? [])]);

describe('real hierarchical visual composition', () => {
  it('retains native source timing, placement and opacity without creating a sequence or file', async () => {
    const p = footage();
    p.clips[0] = { ...p.clips[0], start: 1, sourceStart: 2, sourceEnd: 12,
      properties: { ...defaultProps, speed: 2, opacity: 0.6, x: 10 } };
    const target = canvas(320, 180), decoded = source(), compiled = compileProjectSequencePlan(p), compositor = new SequenceCompositor(p);
    await compositor.draw(target.context, compiled.plan.frameAt(compiled.sequenceId, 3), decoded);
    expect(decoded.mock.calls[0][0]).toMatchObject({ sourceTime: 6, time: 3, playbackRate: 2 });
    expect(target.ctx.translate).toHaveBeenCalledWith(176, 90);
    expect(target.image.paint.at(-1)).toMatchObject({ kind: 'image', uid: 'source', frame: 6, alpha: 0.6, rect: [-160, -80, 320, 160] });
    expect(p.sequences).toBeUndefined(); expect(p.media).toHaveLength(1); expect(canvases).toHaveLength(0);
    expect(target.stack).toEqual([]); compositor.dispose();
  });

  it('keeps native compilation independent of inactive timelines and nested duration limits', () => {
    const p = footage(), root = sequenceSnapshot(p, 'root', 'Root'), inactive = sequenceSnapshot(p, 'inactive', 'Inactive');
    p.clips = p.clips.map((clip) => ({ ...clip, start: 86400, sourceStart: 1, sourceEnd: 10 }));
    p.activeSequenceId = 'root'; p.sequences = [root, inactive];
    Object.defineProperty(inactive, 'clips', { get: () => { throw new Error('Unrelated saved data must not be read for native frames.'); } });
    const clone = vi.spyOn(globalThis, 'structuredClone');
    try {
      const compiled = compileProjectSequencePlan(p);
      expect(compiled.plan.frameAt('root', 86401).layers[0].sourceTime).toBe(2);
      expect(clone).not.toHaveBeenCalled();
      const next = { ...p, clips: p.clips.map((clip) => ({ ...clip, properties: { ...clip.properties, speed: 2 } })) };
      expect(compileProjectSequencePlan(next).plan.frameAt('root', 86401).layers[0].sourceTime).toBe(3);
      expect(compiled.plan.frameAt('root', 86401).layers[0].sourceTime).toBe(2);
    } finally { clone.mockRestore(); }
  });

  it('finishes child fill/animation/grade/captions before parent masking and preserves parent caption styling', async () => {
    const { project: p } = nested(), target = canvas(320, 180), decoded = source(), compiled = compileProjectSequencePlan(p);
    const compositor = new SequenceCompositor(p);
    await compositor.draw(target.context, compiled.plan.frameAt('root', 10.5), decoded);
    expect(decoded.mock.calls.map(([layer]) => [layer.clip.id, layer.sourceTime])).toEqual([['background', 0.5], ['leaf', 5]]);
    const child = canvases[0];
    expect([child.element.width, child.element.height]).toEqual([216, 216]);
    expect(child.ctx.translate).toHaveBeenCalledWith(172.8, 108);
    expect(child.image.paint.find((paint) => paint.kind === 'image')).toMatchObject({ alpha: 0.7, rect: [-216, -108, 432, 216] });
    expect(effectTrace.draws).toHaveLength(2);
    const masked = effectTrace.draws[1];
    expect(masked.effects.mask?.enabled).toBe(true);
    expect(masked.source.paint?.map((paint) => paint.kind)).toEqual(['fill', 'image', 'image', 'text']);
    expect(masked.source.paint?.[2].filter).toContain('saturate(0)');
    expect(masked.source.paint?.at(-1)).toMatchObject({ text: 'Child', color: '#ff0000' });
    expect(target.image.paint[2]).toMatchObject({ uid: 'effects', alpha: 0.4 });
    expect(target.image.paint[3].filter).toContain('brightness(2)');
    expect(target.image.paint.at(-1)).toMatchObject({ text: 'Parent', color: '#0000ff' });
    compositor.dispose(); expect(effectTrace.disposed).toBe(1);
    expect(child.stack).toEqual([]); expect([child.element.width, child.element.height]).toEqual([1, 1]);
  });

  it('draws repeated placements at independent clocks using one reusable child canvas', async () => {
    const { project: p } = nested();
    p.clips = [reference('first'), reference('second', { sourceStart: 1, sourceEnd: 5 })];
    p.adjustments = []; p.captions.enabled = false;
    p.sequences![1].clips[0].effects = undefined;
    const target = canvas(320, 180), compiled = compileProjectSequencePlan(p), compositor = new SequenceCompositor(p);
    const sharedImage = { uid: 'one-decoder', frame: 0 };
    const decoded = vi.fn<VisualFrameSource>(async (layer) => {
      sharedImage.frame = layer.sourceTime;
      return { image: sharedImage as unknown as DecodedVisualFrame['image'], width: 200, height: 100 };
    });
    await compositor.draw(target.context, compiled.plan.frameAt('root', 1), decoded);
    expect(decoded.mock.calls.map(([layer]) => layer.instancePath)).toEqual([['root', 'first', 'leaf'], ['root', 'second', 'leaf']]);
    const placements = target.image.paint.filter((paint) => paint.kind === 'image');
    expect(placements.map((paint) => flatten(paint.children ?? []).find((item) => item.uid === 'one-decoder')?.frame)).toEqual([4, 6]);
    expect(placements.map((paint) => paint.uid)).toEqual([canvases[0].image.uid, canvases[0].image.uid]);
    await compositor.draw(target.context, compiled.plan.frameAt('root', 1.5), decoded);
    expect(canvases).toHaveLength(1);
    await compositor.draw(target.context, compiled.plan.frameAt('root', 6), decoded);
    expect(target.image.paint.map((paint) => paint.kind)).toEqual(['fill']);
    expect([canvases[0].element.width, canvases[0].element.height]).toEqual([1, 1]);
    compositor.dispose();
  });

  it('builds nested blur from the completed child frame using one shared aspect surface', async () => {
    const { project: p } = nested();
    p.clips = [reference('placement', { sourceStart: 0.5, sourceEnd: 4.5, properties: { ...defaultProps, opacity: 0.5 } })];
    p.settings = { ...p.settings, fillMode: 'blur-background' };
    p.adjustments = []; p.captions = { ...p.captions, enabled: false };
    p.sequences![1].settings.fillMode = 'blur-background';
    p.sequences![1].clips[0].effects = undefined;
    const target = canvas(320, 180), compiled = compileProjectSequencePlan(p), decoded = source(), compositor = new SequenceCompositor(p);
    await compositor.draw(target.context, compiled.plan.frameAt('root', 1), decoded);
    expect(decoded).toHaveBeenCalledTimes(1); expect(canvases).toHaveLength(2);
    const group = target.image.paint.at(-1)!;
    expect(group).toMatchObject({ uid: canvases[1].image.uid, alpha: 0.5 });
    expect(group.children?.map((paint) => paint.uid)).toEqual([canvases[0].image.uid, canvases[0].image.uid]);
    expect(group.children?.[0].filter).toMatch(/^blur\(.+px\) brightness\(0.55\)$/);
    expect(group.children?.[1].filter).toBe('none');
    for (const placement of group.children ?? [])
      expect(flatten(placement.children ?? []).some((paint) => paint.text === 'Child' && paint.color === '#ff0000')).toBe(true);
    await compositor.draw(target.context, compiled.plan.frameAt('root', 1.1), decoded);
    expect(canvases).toHaveLength(2);
    compositor.dispose(); expect(canvases.every((surface) => surface.element.width === 1 && surface.element.height === 1)).toBe(true);
  });

  it('keeps the declared child aspect when raster rounding would otherwise introduce a false blur', async () => {
    const { project: p } = nested();
    p.clips = [reference('placement', { properties: { ...defaultProps, scale: 1.03 } })];
    p.settings = { ...p.settings, width: 1920, height: 1080, fillMode: 'blur-background' };
    p.adjustments = []; p.captions.enabled = false;
    p.sequences![1].settings = { ...p.sequences![1].settings, width: 1920, height: 1080, fillMode: 'fit' };
    p.sequences![1].clips[0].effects = undefined;
    const target = canvas(160, 90), compiled = compileProjectSequencePlan(p), compositor = new SequenceCompositor(p, 'preview');
    await compositor.draw(target.context, compiled.plan.frameAt('root', 1), source());
    expect([canvases[0].element.width, canvases[0].element.height]).toEqual([165, 93]);
    expect(canvases).toHaveLength(1);
    expect(target.image.paint.at(-1)).toMatchObject({ uid: canvases[0].image.uid, rect: [-80, -45, 160, 90] });
    compositor.dispose();
  });

  it('does not decode hidden/audio-only branches or repeat the last frame of a shortened child', async () => {
    for (const placement of [reference('audio', { trackId: 'A2' }), reference('hidden'), reference('gap', { sourceEnd: 9 })]) {
      const { project: p } = nested(); p.clips = [placement]; p.adjustments = []; p.captions.enabled = false;
      if (placement.id === 'hidden') p.tracks = p.tracks.map((t) => ({ ...t, hidden: t.id === 'V1' }));
      const target = canvas(320, 180), decoded = source(), compiled = compileProjectSequencePlan(p), compositor = new SequenceCompositor(p);
      await compositor.draw(target.context, compiled.plan.frameAt('root', placement.id === 'gap' ? 7 : 1), decoded);
      expect(decoded).not.toHaveBeenCalled(); expect(target.image.paint.map((paint) => paint.kind)).toEqual(['fill']);
      compositor.dispose();
    }
    expect(canvases).toHaveLength(0);
  });

  it('bounds preview to its viewport but keeps child detail in export and rejects excessive raster demand', async () => {
    const { project: p } = nested(); p.clips = [reference('placement')];
    p.sequences![1].settings = { ...p.sequences![1].settings, width: 1000, height: 1000 };
    const target = canvas(32, 18), compiled = compileProjectSequencePlan(p), decoded = source();
    const preview = new SequenceCompositor(p, 'preview');
    await preview.draw(target.context, compiled.plan.frameAt('root', 1), decoded);
    expect([canvases[0].element.width, canvases[0].element.height]).toEqual([18, 18]);
    preview.dispose();
    const full = new SequenceCompositor(p);
    await full.draw(target.context, compiled.plan.frameAt('root', 1), decoded);
    expect([canvases[1].element.width, canvases[1].element.height]).toEqual([1000, 1000]);
    full.dispose();
    const excessive = canvas(10000, 10000), refused = new SequenceCompositor(p), neverDecoded = source();
    await expect(refused.draw(excessive.context, compiled.plan.frameAt('root', 1), neverDecoded)).rejects.toThrow('canvas budget');
    expect(neverDecoded).not.toHaveBeenCalled(); expect(canvases).toHaveLength(2);
    expect(excessive.stack).toEqual([]); refused.dispose();
  });

  it('prevents overlapping draws, rejects a cancelled decode and restores caller state before retry/disposal', async () => {
    const p = footage(), target = canvas(320, 180), compiled = compileProjectSequencePlan(p), frame = compiled.plan.frameAt(compiled.sequenceId, 1);
    target.ctx.globalAlpha = 0.25; target.ctx.filter = 'sepia(1)';
    const controller = new AbortController(), compositor = new SequenceCompositor(p);
    let decoded!: (frame: DecodedVisualFrame) => void;
    const pending: VisualFrameSource = () => new Promise((resolve) => { decoded = resolve; });
    const first = compositor.draw(target.context, frame, pending, controller.signal);
    await expect(compositor.draw(target.context, frame, source())).rejects.toThrow('current sequence frame');
    controller.abort(); decoded({ image: {} as DecodedVisualFrame['image'], width: 200, height: 100 });
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(target.ctx.globalAlpha).toBe(0.25); expect(target.ctx.filter).toBe('sepia(1)'); expect(target.stack).toEqual([]);
    await compositor.draw(target.context, frame, source());
    await expect(compositor.draw(target.context, frame, async () => ({ image: {} as DecodedVisualFrame['image'], width: 0, height: 100 }))).rejects.toThrow('not ready');
    expect(target.stack).toEqual([]);
    compositor.dispose();
    await expect(compositor.draw(target.context, frame, source())).rejects.toThrow('released');
    expect([target.element.width, target.element.height]).toEqual([320, 180]);
  });
});
