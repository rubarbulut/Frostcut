import type { MediaAsset, Project } from './model';
import { compileProjectSequencePlan, SequenceCompositor, type DecodedVisualFrame, type MediaFrameLayer } from './sequence-compositor';
import type { SequenceFramePlan } from './nested-sequence-plan';

export type SequencePreviewFrameRequest = {
  time: number;
  width: number;
  height: number;
  playing: boolean;
  rate: number;
  /** Increment on scrubbing/discontinuous seeks, source/quality changes and playback restarts. */
  epoch: number;
  /** Existing original or preview-proxy blob URL; never starts a proxy/render job. */
  resolveSource: (asset: MediaAsset) => string | undefined;
};
export type SequencePreviewFrameResult = 'published' | 'superseded';
type PendingFrame = {
  request: SequencePreviewFrameRequest;
  resolve: (result: SequencePreviewFrameResult) => void;
  reject: (error: unknown) => void;
};
type Decoder = { video: HTMLVideoElement; url: string; epoch: number };
const cancelled = () => new DOMException('Cancelled', 'AbortError');

function mediaWait(video: HTMLVideoElement, event: 'loadeddata' | 'seeked', signal: AbortSignal, start: () => void) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, done);
      video.removeEventListener('error', failed);
      signal.removeEventListener('abort', abort);
    };
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error('A preview frame could not be decoded. Relink a playable local source.')); };
    const abort = () => { cleanup(); reject(signal.reason ?? cancelled()); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Preview source loading/seeking timed out. Relink the source or retry.')); }, 15000);
    video.addEventListener(event, done, { once: true });
    video.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', abort, { once: true });
    try { start(); if (signal.aborted) abort(); }
    catch (error) { cleanup(); reject(error); }
  });
}

function abortablePlay(video: HTMLVideoElement, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(signal.reason ?? cancelled()); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Preview playback did not start. Retry from the play control.')); }, 15000);
    signal.addEventListener('abort', abort, { once: true });
    try {
      video.play().then(() => { cleanup(); resolve(); }, (error) => { cleanup(); reject(error); });
      if (signal.aborted) abort();
    } catch (error) { cleanup(); reject(error); }
  });
}

/** Actual nested visual preview driver. Audio must be routed separately before UI exposure.
 * One edit-time plan, one in-flight composition and one latest queued frame. Muted
 * decoders are keyed by full placement paths, never only by their shared file ID.
 */
export class SequencePreviewFrames {
  private readonly compiled: ReturnType<typeof compileProjectSequencePlan>;
  private readonly compositor: SequenceCompositor;
  private readonly scratch: HTMLCanvasElement;
  private readonly scratchContext: CanvasRenderingContext2D;
  private readonly targetContext: CanvasRenderingContext2D;
  private readonly media: Map<string, MediaAsset>;
  private readonly decoders = new Map<string, Decoder>();
  private readonly lifetime = new AbortController();
  private pending?: PendingFrame;
  private current?: PendingFrame;
  private frameLifetime?: AbortController;
  private latest?: SequencePreviewFrameRequest;
  private pumping = false;
  private closed = false;
  private failure?: unknown;

  constructor(p: Project, private readonly target: HTMLCanvasElement) {
    // Reject the graph before allocating canvas/decoder resources.
    this.compiled = compileProjectSequencePlan(p);
    const targetContext = target.getContext('2d', { alpha: false });
    if (!targetContext) throw new Error('A canvas is required for sequence preview.');
    this.scratch = document.createElement('canvas');
    this.scratch.width = this.scratch.height = 1;
    const scratchContext = this.scratch.getContext('2d', { alpha: false });
    if (!scratchContext) throw new Error('A canvas is required for sequence preview.');
    this.scratchContext = scratchContext; this.targetContext = targetContext;
    this.compositor = new SequenceCompositor(p, 'preview');
    this.media = new Map(p.media.map((asset) => [asset.id, asset]));
  }

  request(request: SequencePreviewFrameRequest): Promise<SequencePreviewFrameResult> {
    if (this.closed) return Promise.reject(cancelled());
    // Retry only on an explicit clock/source reset, never on every animation tick.
    if (this.failure !== undefined && request.epoch !== this.latest?.epoch) this.failure = undefined;
    if (this.failure !== undefined) return Promise.reject(this.failure);
    if (!Number.isFinite(request.time) || request.time < 0 || !Number.isFinite(request.rate) || request.rate <= 0 ||
      !Number.isSafeInteger(request.epoch) || !Number.isInteger(request.width) || !Number.isInteger(request.height) ||
      request.width < 1 || request.height < 1 || request.width > 16384 || request.height > 16384 ||
      request.width * request.height > 64 * 1024 * 1024)
      return Promise.reject(new Error('Choose a finite preview time/rate, epoch and supported viewport dimensions.'));
    // Capture the frame controls; caller updates must not mutate an in-flight request.
    const captured = { ...request };
    const previous = this.latest;
    this.latest = captured;
    const active = this.current?.request;
    if (active && (active.epoch !== captured.epoch || active.playing !== captured.playing || active.rate !== captured.rate ||
      active.width !== captured.width || active.height !== captured.height || (!captured.playing && active.time !== captured.time)))
      this.frameLifetime?.abort(cancelled());
    if (!captured.playing || captured.epoch !== previous?.epoch || captured.rate !== previous?.rate) this.pauseDecoders();
    this.pending?.resolve('superseded');
    return new Promise((resolve, reject) => {
      this.pending = { request: captured, resolve, reject };
      if (!this.pumping) void this.pump();
    });
  }

  private pauseDecoders() {
    for (const { video } of this.decoders.values()) video.pause();
  }
  private releaseDecoder(decoder: Decoder) {
    decoder.video.pause(); decoder.video.removeAttribute('src'); decoder.video.load();
  }
  private releaseDecoders() {
    for (const decoder of this.decoders.values()) this.releaseDecoder(decoder);
    this.decoders.clear();
  }
  private rejectPending(error: unknown) {
    const pending = this.pending; this.pending = undefined;
    pending?.reject(error);
  }
  private pruneDecoders(active: Set<string>) {
    for (const [key, decoder] of this.decoders) if (!active.has(key)) {
      this.releaseDecoder(decoder); this.decoders.delete(key);
    }
  }

  private async frame(layer: MediaFrameLayer, request: SequencePreviewFrameRequest, seen: Set<string>, signal: AbortSignal): Promise<DecodedVisualFrame> {
    signal.throwIfAborted();
    const asset = this.media.get(layer.clip.mediaId), url = asset && request.resolveSource(asset);
    if (!asset || !url) throw new Error('Missing preview media. Relink this file in the Media panel.');
    if (!url.startsWith('blob:')) throw new Error('Sequence preview requires the original local source or its local preview proxy.');
    const key = JSON.stringify(layer.instancePath);
    seen.add(key);
    let decoder = this.decoders.get(key);
    if (decoder && decoder.url !== url) {
      this.releaseDecoder(decoder); this.decoders.delete(key); decoder = undefined;
    }
    if (!decoder) {
      const video = document.createElement('video');
      video.muted = true; video.playsInline = true; video.preload = 'auto';
      decoder = { video, url, epoch: request.epoch };
      this.decoders.set(key, decoder);
      await mediaWait(video, 'loadeddata', signal, () => { video.src = url; video.load(); });
    }
    signal.throwIfAborted();
    const { video } = decoder;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.videoWidth <= 0 || video.videoHeight <= 0 ||
      layer.sourceTime < 0 || layer.sourceTime >= video.duration)
      throw new Error('The decoded preview source does not contain this video time. Relink the matching source.');
    const restart = decoder.epoch !== request.epoch || video.paused;
    if (!request.playing || restart) video.pause();
    if (video.seeking || Math.abs(video.currentTime - layer.sourceTime) > (!request.playing || restart ? 1e-8 : 0.15))
      await mediaWait(video, 'seeked', signal, () => { video.currentTime = layer.sourceTime; });
    if (video.readyState < 2) await mediaWait(video, 'loadeddata', signal, () => {});
    signal.throwIfAborted();
    if (Math.abs(video.currentTime - layer.sourceTime) > (!request.playing || restart ? 0.0001 : 0.15))
      throw new Error('The preview source could not seek to this time. Relink a matching local source.');
    decoder.epoch = request.epoch;
    const latest = this.latest;
    if (request.playing && latest?.playing && latest.epoch === request.epoch && latest.rate === request.rate) {
      const rate = layer.playbackRate * request.rate;
      try {
        video.playbackRate = rate;
        if (Math.abs(video.playbackRate - rate) > 1e-8) throw new Error('Rate was changed');
      } catch {
        throw new Error('This browser cannot play the combined sequence speed. Pause to scrub, or reduce the playback/clip speed.');
      }
      video.preservesPitch = true;
      if (video.paused) await abortablePlay(video, signal);
    } else video.pause();
    signal.throwIfAborted();
    return { image: video, width: video.videoWidth, height: video.videoHeight };
  }

  private async pump() {
    this.pumping = true;
    try {
      while (this.pending && !this.closed && this.failure === undefined) {
        const item = this.pending; this.pending = undefined;
        const { request } = item, seen = new Set<string>();
        this.current = item; this.frameLifetime = new AbortController();
        const signal = this.frameLifetime.signal;
        try {
          if (this.scratch.width !== request.width) this.scratch.width = request.width;
          if (this.scratch.height !== request.height) this.scratch.height = request.height;
          const frame = this.compiled.plan.frameAt(this.compiled.sequenceId, request.time);
          const active = new Set<string>();
          const visit = (current: SequenceFramePlan) => {
            if (current.time < 0 || current.time >= current.duration) return;
            for (const layer of current.layers) if (layer.visible) {
              if (layer.kind === 'media') active.add(JSON.stringify(layer.instancePath));
              else visit(layer.frame);
            }
          };
          visit(frame); this.pruneDecoders(active);
          await this.compositor.draw(this.scratchContext, frame,
            (layer) => this.frame(layer, request, seen, signal), signal);
          signal.throwIfAborted();
          this.lifetime.signal.throwIfAborted();
          const latest = this.latest!;
          const publish = latest.epoch === request.epoch && latest.playing === request.playing && latest.rate === request.rate &&
            latest.width === request.width && latest.height === request.height &&
            (request.playing || latest.time === request.time);
          if (publish) {
            if (this.target.width !== request.width) this.target.width = request.width;
            if (this.target.height !== request.height) this.target.height = request.height;
            this.targetContext.save();
            try {
              this.targetContext.resetTransform(); this.targetContext.globalAlpha = 1;
              this.targetContext.globalCompositeOperation = 'copy'; this.targetContext.filter = 'none';
              this.targetContext.drawImage(this.scratch, 0, 0);
            } finally { this.targetContext.restore(); }
          }
          // No accumulated decoders for invisible/inactive placements or old timelines.
          this.pruneDecoders(seen);
          if (!this.latest?.playing) this.pauseDecoders();
          item.resolve(publish ? 'published' : 'superseded');
        } catch (error) {
          const latest = this.latest;
          const obsolete = !this.closed && latest && (latest.epoch !== request.epoch || latest.playing !== request.playing ||
            latest.rate !== request.rate || latest.width !== request.width || latest.height !== request.height ||
            (!request.playing && latest.time !== request.time));
          if (obsolete) {
            this.releaseDecoders(); item.resolve('superseded'); continue;
          }
          if (!this.closed) this.failure = error;
          this.releaseDecoders();
          item.reject(error);
          this.rejectPending(error);
        } finally { this.current = undefined; this.frameLifetime = undefined; }
      }
    } finally { this.pumping = false; }
  }

  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.lifetime.abort(cancelled());
    this.frameLifetime?.abort(cancelled());
    this.rejectPending(cancelled());
    this.releaseDecoders(); this.compositor.dispose();
    this.scratch.width = this.scratch.height = 1;
  }
}
