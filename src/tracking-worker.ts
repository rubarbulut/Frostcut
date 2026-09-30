import { validateTrackingRgbaFrame, type TrackingOptions, type TrackingRegion, type TrackingRgbaFrame, type TrackingStep } from './region-tracker';
import type { TrackingReply, TrackingRequest } from './tracking-protocol';

/** Backpressure: one transferred frame in flight; dispose interrupts active matching. */
export class TrackingWorker {
  private readonly worker: Worker;
  private pending?: { id: number; resolve: (step: TrackingStep) => void; reject: (error: unknown) => void };
  private nextId = 1;
  private disposed = false;
  private readonly cancel = () => this.dispose(new DOMException('Cancelled', 'AbortError'));
  constructor(private readonly signal: AbortSignal) {
    signal.throwIfAborted();
    this.worker = new Worker(new URL('./tracking.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onerror = (e) => this.dispose(new Error(e.message || 'The local tracking worker could not start.'));
    this.worker.onmessage = ({ data }: MessageEvent<TrackingReply>) => {
      if (this.disposed || data.id !== this.pending?.id) return;
      if (data.type === 'error') { this.dispose(new Error(data.message)); return; }
      const pending = this.pending!;
      if (data.type !== 'step' || !data.step || !['seed', 'tracked', 'lost'].includes(data.step.status)) {
        this.dispose(new Error('The tracking worker returned an invalid response.'));
        return;
      }
      this.pending = undefined;
      pending.resolve(data.step);
    };
    signal.addEventListener('abort', this.cancel, { once: true });
    if (signal.aborted) this.cancel();
  }
  send(request: Omit<Extract<TrackingRequest, { type: 'init' }>, 'id'> |
    Omit<Extract<TrackingRequest, { type: 'frame' }>, 'id'>): Promise<TrackingStep> {
    this.signal.throwIfAborted();
    if (this.disposed) return Promise.reject(new Error('The tracking worker is already closed.'));
    if (this.pending) return Promise.reject(new Error('Wait for the current tracking frame before sending another.'));
    try { validateTrackingRgbaFrame(request.frame); }
    catch (error) { return Promise.reject(error); }
    if (!(request.frame.rgba.buffer instanceof ArrayBuffer) || request.frame.rgba.byteOffset !== 0 ||
      request.frame.rgba.buffer.byteLength !== request.frame.rgba.byteLength)
      return Promise.reject(new Error('Tracking requires an owned transferable frame buffer.'));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending = { id, resolve, reject };
      try { this.worker.postMessage({ ...request, id }, [request.frame.rgba.buffer]); }
      catch (error) { this.dispose(error); }
    });
  }
  dispose(error: unknown = new Error('Tracking closed.')) {
    if (this.disposed) return;
    this.disposed = true;
    this.signal.removeEventListener('abort', this.cancel);
    this.worker.onmessage = null; this.worker.onerror = null;
    this.worker.terminate();
    this.pending?.reject(error);
    this.pending = undefined;
  }
}

/** The frame provider must observe signal too, especially while awaiting video seeks. */
export async function* trackRegionFrames(
  frames: AsyncIterable<TrackingRgbaFrame>, region: TrackingRegion,
  signal: AbortSignal, options: TrackingOptions = {},
): AsyncGenerator<TrackingStep> {
  const worker = new TrackingWorker(signal);
  let first = true;
  try {
    for await (const frame of frames) {
      signal.throwIfAborted();
      const step = await worker.send(first ? { type: 'init', frame, region, options } : { type: 'frame', frame });
      first = false;
      if (step.status === 'lost') {
        worker.dispose();
        yield step;
        return;
      }
      yield step;
    }
  } finally { worker.dispose(); }
}
