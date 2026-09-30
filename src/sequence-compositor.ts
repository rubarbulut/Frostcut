import { clipAudible, duration, isSequenceClip, type Project, type ProjectSequence } from './model';
import { requireMediaClip } from './clip-source';
import { sequenceViews } from './sequences';
import { NestedSequencePlan, MAX_SEQUENCE_DEPTH, type SequenceFrameLayer, type SequenceFramePlan, type SequencePlanNode } from './nested-sequence-plan';
import { captionTimelineIndex, clipTimelineIndex } from './timeline-index';
import { drawCanvasCaption } from './canvas-captions';
import { drawCanvasAdjustments } from './adjustment-renderer';
import { transformAt } from './motion';
import { hasVisualEffects } from './visual-effects';
import { EffectsRenderer } from './effects-renderer';
import { AspectFrameRenderer, imagePlacement, needsBlurFill, type FrameSize } from './aspect-fill';

export type MediaFrameLayer = Extract<SequenceFrameLayer, { kind: 'media' }>;
export type DecodedVisualFrame = FrameSize & { image: CanvasImageSource & TexImageSource };
/** Resolve each instance's owning source clock. Drawing is sequential, so a decoder may be reused for export. */
export type VisualFrameSource = (layer: MediaFrameLayer, signal?: AbortSignal) => Promise<DecodedVisualFrame>;
// A resource failure is explicit; export never drops layers or silently lowers their resolution.
export const MAX_SEQUENCE_COMPOSITE_PIXELS = 64 * 1024 * 1024;
export const MAX_SEQUENCE_COMPOSITE_SIDE = 16384;

/** A project without sequence workspaces still has its actual active timeline. */
export function compileProjectSequencePlan(p: Project) {
  const sequenceId = p.activeSequenceId ?? p.id;
  const root: ProjectSequence = { id: sequenceId, name: p.name, clips: p.clips, tracks: p.tracks,
    settings: p.settings, captions: p.captions, subtitleVariants: p.subtitleVariants,
    publishing: p.publishing, chapters: p.chapters, adjustments: p.adjustments,
    exportSettings: p.exportSettings, suggestions: p.suggestions };
  if (!p.clips.some(isSequenceClip)) {
    // Preserve the existing native export's immutable Project/index capture. Do not
    // clone unrelated saved timelines or impose nested graph limits on native edits.
    const index = clipTimelineIndex(p), seconds = duration(p);
    const plan: Pick<NestedSequencePlan, 'frameAt'> = { frameAt: (id, time) => {
      if (id !== sequenceId) throw new Error('This sequence is no longer available.');
      if (!Number.isFinite(time)) throw new Error('Use a finite sequence time.');
      return { sequence: root, time, duration: seconds, layers: index.at(time).map((item) => {
        const clip = requireMediaClip(item);
        return { kind: 'media', clip, time, sourceTime: clip.sourceStart + (time - clip.start) * clip.properties.speed,
          playbackRate: clip.properties.speed, visible: true, audible: clipAudible(p, clip), instancePath: [sequenceId, clip.id] };
      }) };
    } };
    return { sequenceId, plan };
  }
  return { sequenceId, plan: new NestedSequencePlan(p.sequences ? sequenceViews(p) : [root]) };
}

type Surface = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
/** Complete child frames first, then apply the parent's group effects/fill/motion/opacity. */
export class SequenceCompositor {
  private readonly surfaces: Surface[] = [];
  private readonly views = new WeakMap<SequencePlanNode, {
    project: Project; captions: ReturnType<typeof captionTimelineIndex>;
  }>();
  private effects?: EffectsRenderer;
  private aspect?: AspectFrameRenderer;
  private disposed = false;
  private drawing = false;
  constructor(private readonly project: Project, private readonly mode: 'preview' | 'export' = 'export') {}

  private check(signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (this.disposed) throw new Error('The sequence compositor has been released.');
  }
  private view(sequence: SequencePlanNode) {
    let view = this.views.get(sequence);
    if (!view) {
      const { id: _, name: __, ...timeline } = sequence;
      const project = { ...this.project, ...timeline, activeSequenceId: sequence.id };
      view = { project, captions: captionTimelineIndex(project) };
      this.views.set(sequence, view);
    }
    return view;
  }
  private surface(index: number, size: FrameSize) {
    const width = Math.max(1, Math.ceil(size.width)), height = Math.max(1, Math.ceil(size.height));
    if (width > MAX_SEQUENCE_COMPOSITE_SIDE || height > MAX_SEQUENCE_COMPOSITE_SIDE)
      throw new Error(`Nested composition supports intermediate frames up to ${MAX_SEQUENCE_COMPOSITE_SIDE}px per side. Reduce the sequence resolution or group scale.`);
    const pixels = width * height;
    const previousPixels = this.surfaces[index] ? this.surfaces[index].canvas.width * this.surfaces[index].canvas.height : 0;
    const total = () => this.surfaces.reduce((sum, s) => sum + s.canvas.width * s.canvas.height, 0);
    if (total() - previousPixels + pixels > MAX_SEQUENCE_COMPOSITE_PIXELS) {
      // Deeper surfaces from an earlier branch/frame are not ancestors of this request.
      this.surfaces.slice(index + 1).forEach(({ canvas }) => { canvas.width = canvas.height = 1; });
      if (total() - previousPixels + pixels > MAX_SEQUENCE_COMPOSITE_PIXELS)
        throw new Error('Nested composition exceeds the intermediate canvas budget. Reduce the sequence resolution or group scale before retrying.');
    }
    let surface = this.surfaces[index];
    if (!surface) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('The browser could not create a sequence compositor.');
      surface = { canvas, ctx }; this.surfaces[index] = surface;
    }
    if (surface.canvas.width !== width) surface.canvas.width = width;
    if (surface.canvas.height !== height) surface.canvas.height = height;
    return surface;
  }

  async draw(ctx: CanvasRenderingContext2D, frame: SequenceFramePlan, source: VisualFrameSource, signal?: AbortSignal) {
    this.check(signal);
    if (this.drawing) throw new Error('Wait for the current sequence frame before drawing another.');
    this.drawing = true;
    let usedDepth = 0;
    const render = async (target: CanvasRenderingContext2D, current: SequenceFramePlan, depth: number) => {
      this.check(signal);
      if (depth >= MAX_SEQUENCE_DEPTH) throw new Error('The sequence composition is too deeply nested.');
      const frameSize = { width: target.canvas.width, height: target.canvas.height };
      const settings = current.sequence.settings;
      const view = this.view(current.sequence);
      target.save();
      try {
        target.resetTransform();
        target.globalAlpha = 1;
        target.globalCompositeOperation = 'source-over';
        if ('filter' in target) target.filter = 'none';
        target.imageSmoothingEnabled = true;
        target.imageSmoothingQuality = 'high';
        target.clearRect(0, 0, frameSize.width, frameSize.height);
        target.fillStyle = '#090d10';
        target.fillRect(0, 0, frameSize.width, frameSize.height);
        target.beginPath(); target.rect(0, 0, frameSize.width, frameSize.height); target.clip();
        if (current.time < 0 || current.time >= current.duration) return;
        for (const layer of current.layers) {
          if (!layer.visible) continue;
          this.check(signal);
          const props = transformAt(layer.clip, layer.time, settings.width, settings.height, settings.fillMode);
          let decoded: DecodedVisualFrame;
          let logicalSize: FrameSize | undefined;
          if (layer.kind === 'media') {
            decoded = await source(layer, signal);
            this.check(signal);
          } else {
            if (layer.frame.time < 0 || layer.frame.time >= layer.frame.duration) continue;
            const childSize = layer.frame.sequence.settings;
            // Retain native child detail in export, and enough pixels for parent zoom/output.
            // Preview density follows the displayed viewport instead of allocating full export frames.
            const placement = imagePlacement(childSize, frameSize,
              needsBlurFill(childSize, frameSize, settings.fillMode) ? 'crop' : settings.fillMode);
            const projected = placement.width / childSize.width * props.scale;
            const density = this.mode === 'export' ? Math.max(1, projected) : projected;
            if (!Number.isFinite(density) || density <= 0) throw new Error('A sequence frame has invalid dimensions.');
            const child = this.surface(depth, { width: childSize.width * density, height: childSize.height * density });
            usedDepth = Math.max(usedDepth, depth + 1);
            await render(child.ctx, layer.frame, depth + 1);
            this.check(signal);
            decoded = { image: child.canvas, width: child.canvas.width, height: child.canvas.height };
            logicalSize = childSize;
          }
          if (!Number.isFinite(decoded.width) || !Number.isFinite(decoded.height) || decoded.width < 1 || decoded.height < 1)
            throw new Error('A source frame is not ready for sequence composition.');
          let image: CanvasImageSource = hasVisualEffects(layer.clip.effects)
            ? (this.effects ??= new EffectsRenderer()).draw(decoded.image, decoded.width, decoded.height, layer.clip.effects!)
            : decoded.image;
          // Child raster rounding must not change its declared aspect/fill behavior.
          const sourceSize = logicalSize ?? decoded;
          let placement = imagePlacement(sourceSize, frameSize, settings.fillMode);
          if (needsBlurFill(sourceSize, frameSize, settings.fillMode)) {
            image = (this.aspect ??= new AspectFrameRenderer()).draw(image, sourceSize, frameSize, settings.fillMode);
            placement = { x: 0, y: 0, ...frameSize };
          }
          target.save();
          try {
            target.translate(frameSize.width / 2 + props.x * frameSize.width / settings.width,
              frameSize.height / 2 + props.y * frameSize.height / settings.height);
            target.rotate(props.rotation * Math.PI / 180);
            target.scale(props.scale, props.scale);
            target.globalAlpha = props.opacity;
            const crop = props.crop / 100;
            target.beginPath();
            target.rect(-frameSize.width / 2 + frameSize.width * crop, -frameSize.height / 2 + frameSize.height * crop,
              frameSize.width * (1 - crop * 2), frameSize.height * (1 - crop * 2));
            target.clip();
            target.drawImage(image, placement.x - frameSize.width / 2, placement.y - frameSize.height / 2, placement.width, placement.height);
          } finally { target.restore(); }
        }
        drawCanvasAdjustments(target, current.sequence.adjustments, current.time);
        const caption = view.captions.first(current.time);
        if (caption) drawCanvasCaption(target, view.project, caption, current.time, frameSize.width, frameSize.height);
      } finally { target.restore(); }
    };
    try { await render(ctx, frame, 0); }
    finally {
      this.surfaces.slice(usedDepth).forEach(({ canvas }) => { canvas.width = canvas.height = 1; });
      this.drawing = false;
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.effects?.dispose(); this.aspect?.dispose();
    this.surfaces.forEach(({ canvas }) => { canvas.width = canvas.height = 1; });
    this.surfaces.length = 0;
  }
}
