import { describe, expect, it, vi } from 'vitest';
import { addMedia, createProject } from './model';
import {
  AspectFrameRenderer,
  blurBackdrop,
  drawAspectFrame,
  frameAspectRatio,
  frameFillMode,
  frameObjectFit,
  imagePlacement,
  needsAspectRenderer,
  needsBlurFill,
  visualBounds,
} from './aspect-fill';

const landscape = { width: 1920, height: 1080 };
const portrait = { width: 1080, height: 1920 };
const square = { width: 1000, height: 1000 };

function context() {
  const draws: { image: CanvasImageSource; filter: string; rect: number[] }[] = [];
  const stack: string[] = [];
  const ctx = {
    filter: 'none',
    save: vi.fn(() => { stack.push(ctx.filter); }),
    restore: vi.fn(() => { ctx.filter = stack.pop()!; }),
    clearRect: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
    drawImage: vi.fn((image: CanvasImageSource, ...rect: number[]) => {
      draws.push({ image, filter: ctx.filter, rect });
    }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, draws };
}

describe('frame fill geometry and composition', () => {
  it('keeps all pixels with Fit and covers the frame with centered Crop', () => {
    for (const source of [landscape, portrait, square]) {
      for (const frame of [landscape, portrait, square]) {
        const fit = imagePlacement(source, frame, 'fit');
        const crop = imagePlacement(source, frame, 'crop');
        expect(fit.width).toBeLessThanOrEqual(frame.width + 1e-9);
        expect(fit.height).toBeLessThanOrEqual(frame.height + 1e-9);
        expect(crop.width).toBeGreaterThanOrEqual(frame.width - 1e-9);
        expect(crop.height).toBeGreaterThanOrEqual(frame.height - 1e-9);
        for (const rect of [fit, crop]) {
          expect(rect.width / rect.height).toBeCloseTo(source.width / source.height);
          expect(rect.x + rect.width / 2).toBeCloseTo(frame.width / 2);
          expect(rect.y + rect.height / 2).toBeCloseTo(frame.height / 2);
        }
      }
    }
    expect(imagePlacement(landscape, portrait, 'fit')).toEqual({ x: 0, y: 656.25, width: 1080, height: 607.5 });
    expect(frameFillMode()).toBe('fit');
    expect(frameObjectFit()).toBe('contain');
    expect(frameObjectFit('crop')).toBe('cover');
  });

  it('uses actual dimensions for ratio selection and handle bounds', () => {
    expect(frameAspectRatio({ width: 640, height: 360 })).toBe('16:9');
    expect(frameAspectRatio(portrait)).toBe('9:16');
    expect(frameAspectRatio({ width: 800, height: 1000 })).toBe('4:5');
    expect(frameAspectRatio(square)).toBe('1:1');
    expect(frameAspectRatio({ width: 1024, height: 768 })).toBeUndefined();
    expect(visualBounds(landscape, portrait, 'fit')).toEqual(imagePlacement(landscape, portrait, 'fit'));
    expect(visualBounds(landscape, portrait, 'crop')).toEqual({ x: 0, y: 0, ...portrait });
    expect(visualBounds(landscape, portrait, 'blur-background')).toEqual({ x: 0, y: 0, ...portrait });
  });

  it('scales blur with output resolution and covers its edges', () => {
    const b = blurBackdrop(landscape, portrait);
    const half = blurBackdrop(landscape, { width: 540, height: 960 });
    expect(half.radius).toBeCloseTo(b.radius / 2);
    expect(half.width).toBeCloseTo(b.width / 2);
    expect(half.height).toBeCloseTo(b.height / 2);
    expect(b.x).toBeLessThanOrEqual(-3 * b.radius);
    expect(b.y).toBeLessThanOrEqual(-3 * b.radius);
    expect(needsBlurFill(portrait, portrait, 'blur-background')).toBe(false);
    expect(needsBlurFill(landscape, portrait, 'crop')).toBe(false);
  });

  it('routes only visible differing-aspect footage to the compositor', () => {
    const p = addMedia(createProject('Fill'), {
      id: 'video', name: 'video.mp4', duration: 10, ...landscape, size: 100, type: 'video/mp4',
    });
    expect(needsAspectRenderer(p)).toBe(true);
    p.settings.fillMode = 'crop';
    expect(needsAspectRenderer(p)).toBe(true);
    expect(needsAspectRenderer(p, landscape)).toBe(false);
    p.settings.fillMode = undefined;
    expect(needsAspectRenderer(p)).toBe(false);
    p.settings.fillMode = 'blur-background';
    p.tracks.find((t) => t.id === p.clips[0].trackId)!.hidden = true;
    expect(needsAspectRenderer(p)).toBe(false);
    p.clips[0].trackId = 'A1';
    expect(needsAspectRenderer(p)).toBe(false);
  });

  it('uses the same source frame for backdrop and foreground, resets the filter and clears gaps', () => {
    const { ctx, draws } = context();
    const first = {} as CanvasImageSource, next = {} as CanvasImageSource;
    drawAspectFrame(ctx, first, landscape, portrait, 'blur-background');
    expect(draws).toHaveLength(2);
    expect(draws[0].image).toBe(first);
    expect(draws[0].filter).toMatch(/^blur\(.+px\) brightness\(0.55\)$/);
    expect(draws[1]).toEqual({ image: first, filter: 'none', rect: [0, 656.25, 1080, 607.5] });
    drawAspectFrame(ctx, next, landscape, portrait, 'blur-background');
    expect(draws[2].image).toBe(next);
    expect(draws[3].image).toBe(next);
    expect(ctx.clearRect).toHaveBeenCalledTimes(2);
    expect(ctx.rect).toHaveBeenCalledWith(0, 0, 1080, 1920);
    expect(ctx.clip).toHaveBeenCalledTimes(2);
    expect(ctx.filter).toBe('none');
    expect(ctx.restore).toHaveBeenCalledTimes(2);
  });

  it('draws one unfiltered foreground for fit/crop/matching-aspect blur', () => {
    for (const mode of ['fit', 'crop', 'blur-background'] as const) {
      const { ctx, draws } = context();
      drawAspectFrame(ctx, {} as CanvasImageSource, portrait, portrait, mode);
      expect(draws).toHaveLength(1);
      expect(draws[0].filter).toBe('none');
    }
  });

  it('fails visibly on missing blur filters and always restores the context', () => {
    const { ctx } = context();
    Reflect.deleteProperty(ctx, 'filter');
    expect(() => drawAspectFrame(ctx, {} as CanvasImageSource, landscape, portrait, 'blur-background')).toThrow('Canvas filters');
    expect(ctx.restore).toHaveBeenCalledOnce();
    const unsupported = context().ctx;
    Object.defineProperty(unsupported, 'filter', { get: () => 'none', set: () => {} });
    expect(() => drawAspectFrame(unsupported, {} as CanvasImageSource, landscape, portrait, 'blur-background')).toThrow('could not apply');
    expect(unsupported.drawImage).not.toHaveBeenCalled();
    expect(unsupported.restore).toHaveBeenCalledOnce();
  });

  it('reuses its canvas across frames and releases the backing size', () => {
    const { ctx } = context();
    const canvas = { width: 1, height: 1, getContext: vi.fn(() => ctx) } as unknown as HTMLCanvasElement;
    const renderer = new AspectFrameRenderer(canvas);
    const image = {} as CanvasImageSource;
    expect(renderer.draw(image, landscape, portrait, 'blur-background')).toBe(canvas);
    expect(renderer.draw(image, landscape, portrait, 'blur-background')).toBe(canvas);
    expect(canvas.getContext).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1920);
    expect(ctx.imageSmoothingQuality).toBe('high');
    renderer.dispose();
    expect([canvas.width, canvas.height]).toEqual([1, 1]);
  });
});
