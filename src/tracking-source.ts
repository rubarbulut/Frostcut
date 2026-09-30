import { MAX_TRACKING_POINTS } from './tracking-data';
import type { TrackingRgbaFrame } from './region-tracker';

function mediaEvent(video: HTMLVideoElement, event: string, signal: AbortSignal, start: () => void) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, done);
      video.removeEventListener('error', failed);
      signal.removeEventListener('abort', cancelled);
    };
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(signal.aborted ? signal.reason : new Error('The original video could not be decoded. Relink a playable local source.')); };
    const cancelled = () => { cleanup(); reject(signal.reason ?? new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Source loading/seeking timed out. Try a shorter range or relink the source.')); }, 15000);
    video.addEventListener(event, done, { once: true });
    video.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', cancelled, { once: true });
    try { start(); if (signal.aborted) cancelled(); }
    catch (error) { cleanup(); reject(error); }
  });
}

/** Created on user action only. One paused original-source decoder and bounded canvas. */
export class TrackingSource {
  readonly video: HTMLVideoElement;
  readonly canvas: HTMLCanvasElement;
  private readonly lifetime = new AbortController();
  private readonly context: CanvasRenderingContext2D;
  private closed = false;
  private reading = false;
  private readonly cancel = () => this.dispose();
  private constructor(private readonly signal: AbortSignal) {
    signal.throwIfAborted();
    this.video = document.createElement('video');
    this.video.muted = true; this.video.playsInline = true; this.video.preload = 'auto';
    this.canvas = document.createElement('canvas');
    const context = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('A local canvas is required to read source frames.');
    this.context = context;
    signal.addEventListener('abort', this.cancel, { once: true });
  }
  static async open(url: string, signal: AbortSignal, maxSide = 480) {
    signal.throwIfAborted();
    if (!url.startsWith('blob:')) throw new Error('Relink the original local video before tracking.');
    if (!Number.isInteger(maxSide) || maxSide < 8 || maxSide > 640) throw new Error('Choose an analysis size from 8 to 640 px.');
    const source = new TrackingSource(signal);
    try {
      await mediaEvent(source.video, 'loadeddata', source.lifetime.signal, () => {
        source.video.src = url; source.video.load();
      });
      const { videoWidth: w, videoHeight: h, duration } = source.video;
      if (!Number.isFinite(duration) || duration <= 0 || duration > 86400 || w < 8 || h < 8 || w > 16384 || h > 16384)
        throw new Error('This source has unsupported dimensions or duration.');
      const scale = Math.min(1, maxSide / Math.max(w, h));
      source.canvas.width = Math.round(w * scale); source.canvas.height = Math.round(h * scale);
      if (source.canvas.width < 8 || source.canvas.height < 8) throw new Error('This source is too narrow at the analysis size.');
      return source;
    } catch (error) { source.dispose(); throw error; }
  }
  get width() { return this.video.videoWidth; }
  get height() { return this.video.videoHeight; }
  get duration() { return this.video.duration; }
  async read(time: number): Promise<TrackingRgbaFrame> {
    this.lifetime.signal.throwIfAborted();
    if (this.reading) throw new Error('Wait for the current source seek before reading another frame.');
    if (!Number.isFinite(time) || time < 0 || time >= this.duration)
      throw new Error('Choose a time inside the original source video.');
    this.reading = true;
    try {
      if (Math.abs(this.video.currentTime - time) > 1e-8 || this.video.seeking)
        await mediaEvent(this.video, 'seeked', this.lifetime.signal, () => { this.video.currentTime = time; });
      if (this.video.readyState < 2) await mediaEvent(this.video, 'loadeddata', this.lifetime.signal, () => {});
      this.lifetime.signal.throwIfAborted();
      this.context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      const rgba = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
      return { width: this.canvas.width, height: this.canvas.height, time: this.video.currentTime, rgba };
    } finally { this.reading = false; }
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.signal.removeEventListener('abort', this.cancel);
    // Reject waits before releasing the source, which can dispatch media events.
    this.lifetime.abort(new DOMException('Cancelled', 'AbortError'));
    this.video.pause(); this.video.removeAttribute('src'); this.video.load();
    this.canvas.width = 1; this.canvas.height = 1;
  }
}

export function trackingFrameCount(start: number, end: number, fps: number) {
  if (![start, end, fps].every(Number.isFinite) || start < 0 || end > 86400 || end <= start || fps < 1 || fps > 60)
    throw new Error('Choose an increasing source range and 1–60 samples per second.');
  const count = Math.ceil((end - start) * fps - 1e-9);
  if (count < 2) throw new Error('Choose a range with at least two samples.');
  if (count > MAX_TRACKING_POINTS) throw new Error(`This range exceeds ${MAX_TRACKING_POINTS.toLocaleString()} points. Shorten it or explicitly lower the sample rate.`);
  return count;
}
export async function* trackingSourceFrames(source: TrackingSource, start: number, end: number, fps: number, signal: AbortSignal) {
  const count = trackingFrameCount(start, end, fps);
  if (end > source.duration + 1e-8) throw new Error('The tracking range exceeds the decoded source duration.');
  for (let i = 0; i < count; i++) {
    signal.throwIfAborted();
    yield await source.read(start + i / fps);
  }
}
