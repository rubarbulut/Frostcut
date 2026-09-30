import { isAudioClip, type AspectFillMode, type AspectRatio, type Project } from './model';
import { clipSource } from './clip-source';

export type FrameSize = { width: number; height: number };
export const frameFillMode = (mode?: AspectFillMode): AspectFillMode => mode ?? 'fit';
export const frameObjectFit = (mode?: AspectFillMode): 'contain' | 'cover' =>
  frameFillMode(mode) === 'crop' ? 'cover' : 'contain';
export function differentAspect(source: FrameSize, frame: FrameSize) {
  return Math.abs(source.width * frame.height - source.height * frame.width) >
    Math.max(source.width * frame.height, source.height * frame.width) * 1e-6;
}
/** Dimensions are authoritative, including sequences made from an older preset. */
export function frameAspectRatio(frame: FrameSize): AspectRatio | undefined {
  return (['16:9', '9:16', '1:1', '4:5'] as const).find((ratio) => {
    const [width, height] = ratio.split(':').map(Number);
    return !differentAspect(frame, { width, height });
  });
}
export function needsBlurFill(source: FrameSize, frame: FrameSize, mode?: AspectFillMode) {
  return frameFillMode(mode) === 'blur-background' && differentAspect(source, frame);
}
export function imagePlacement(source: FrameSize, frame: FrameSize, mode?: AspectFillMode) {
  const ratios = [frame.width / source.width, frame.height / source.height];
  const scale = frameFillMode(mode) === 'crop' ? Math.max(...ratios) : Math.min(...ratios);
  const width = source.width * scale, height = source.height * scale;
  return { x: (frame.width - width) / 2, y: (frame.height - height) / 2, width, height };
}
export function blurBackdrop(source: FrameSize, frame: FrameSize) {
  const radius = Math.min(frame.width, frame.height) * 0.035;
  const cover = imagePlacement(source, frame, 'crop');
  // Extend at least three blur radii beyond each edge, avoiding a dark translucent border.
  const overscan = 1 + 6 * radius / Math.min(frame.width, frame.height);
  const width = cover.width * overscan, height = cover.height * overscan;
  return { x: (frame.width - width) / 2, y: (frame.height - height) / 2, width, height, radius, brightness: 0.55 };
}
export function needsAspectRenderer(p: Project, frame: FrameSize = p.exportSettings) {
  return frameFillMode(p.settings.fillMode) !== 'fit' && p.clips.some((c) => {
    const media = clipSource(p, c);
    return media && !isAudioClip(p, c) && !p.tracks.find((t) => t.id === c.trackId)?.hidden && differentAspect(media, frame);
  });
}
export function visualBounds(source: FrameSize, frame: FrameSize, mode?: AspectFillMode) {
  return frameFillMode(mode) === 'crop' || needsBlurFill(source, frame, mode)
    ? { x: 0, y: 0, ...frame }
    : imagePlacement(source, frame, mode);
}
/** A complete clip plane: combine background/foreground before applying clip opacity. */
export function drawAspectFrame(
  ctx: CanvasRenderingContext2D, image: CanvasImageSource, source: FrameSize,
  frame: FrameSize, mode?: AspectFillMode,
) {
  ctx.save();
  try {
    ctx.clearRect(0, 0, frame.width, frame.height);
    ctx.beginPath(); ctx.rect(0, 0, frame.width, frame.height); ctx.clip();
    if (needsBlurFill(source, frame, mode)) {
      if (!('filter' in ctx)) throw new Error('Blur background needs Canvas filters. Choose Fit or update your browser.');
      const b = blurBackdrop(source, frame);
      ctx.filter = `blur(${b.radius}px) brightness(${b.brightness})`;
      if (ctx.filter === 'none') throw new Error('This browser could not apply background blur. Choose Fit.');
      ctx.drawImage(image, b.x, b.y, b.width, b.height);
      ctx.filter = 'none';
    }
    const f = imagePlacement(source, frame, mode);
    ctx.drawImage(image, f.x, f.y, f.width, f.height);
  } finally { ctx.restore(); }
}
export class AspectFrameRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  constructor(canvas = document.createElement('canvas')) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('The browser could not create a background compositor.');
    this.ctx = ctx;
  }
  draw(image: CanvasImageSource, source: FrameSize, frame: FrameSize, mode?: AspectFillMode) {
    const width = Math.max(1, Math.round(frame.width)), height = Math.max(1, Math.round(frame.height));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    drawAspectFrame(this.ctx, image, source, { width, height }, mode);
    return this.canvas;
  }
  dispose() { this.canvas.width = this.canvas.height = 1; }
}
