import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrackingWorker, trackRegionFrames } from './tracking-worker';
import type { TrackingRgbaFrame, TrackingStep } from './region-tracker';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: ((event: { data: unknown }) => void) | null;
  onerror?: ((event: { message: string }) => void) | null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
}
afterEach(() => { vi.unstubAllGlobals(); FakeWorker.instances = []; });
const frame = (time = 0): TrackingRgbaFrame => ({ width: 8, height: 8, time, rgba: new Uint8ClampedArray(8 * 8 * 4) });
const region = { x: 0, y: 0, width: 1, height: 1 };
const seed: TrackingStep = { status: 'seed', point: { time: 0, x: 0.5, y: 0.5, correlation: 1 } };

describe('bounded tracking worker lifecycle', () => {
  it('transfers one owned frame and prevents concurrent frame queues', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const bridge = new TrackingWorker(new AbortController().signal), input = frame();
    const pending = bridge.send({ type: 'init', frame: input, region, options: {} });
    const worker = FakeWorker.instances[0];
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'init', frame: input, region, options: {}, id: 1 }, [input.rgba.buffer]);
    await expect(bridge.send({ type: 'frame', frame: frame(1) })).rejects.toThrow('Wait');
    worker.onmessage?.({ data: { id: 999, type: 'step', step: seed } });
    worker.onmessage?.({ data: { id: 1, type: 'step', step: seed } });
    await expect(pending).resolves.toEqual(seed);
    bridge.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('rejects cancellation immediately and never creates an already-cancelled worker', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const controller = new AbortController(), bridge = new TrackingWorker(controller.signal);
    const pending = bridge.send({ type: 'init', frame: frame(), region, options: {} });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    bridge.dispose();
    expect(() => new TrackingWorker(controller.signal)).toThrow();
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it('cleans up errors and refuses oversized backing buffers', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const bridge = new TrackingWorker(new AbortController().signal);
    const input = { ...frame(), rgba: new Uint8ClampedArray(new ArrayBuffer(1024), 0, 256) };
    await expect(bridge.send({ type: 'frame', frame: input })).rejects.toThrow('owned');
    expect(FakeWorker.instances[0].postMessage).not.toHaveBeenCalled();
    const pending = bridge.send({ type: 'init', frame: frame(), region, options: {} });
    FakeWorker.instances[0].onmessage?.({ data: { id: 1, type: 'error', message: 'Low texture' } });
    await expect(pending).rejects.toThrow('Low texture');
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it('pulls the next source frame only after a result is consumed and stops on target loss', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const provider = vi.fn();
    async function* frames() {
      for (const time of [0, 1, 2]) { provider(time); yield frame(time); }
    }
    const job = trackRegionFrames(frames(), region, new AbortController().signal);
    const initial = job.next();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const worker = FakeWorker.instances[0];
    expect(provider).toHaveBeenCalledExactlyOnceWith(0);
    worker.onmessage?.({ data: { id: 1, type: 'step', step: seed } });
    await expect(initial).resolves.toMatchObject({ done: false, value: seed });
    expect(provider).toHaveBeenCalledOnce();
    const next = job.next();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(provider).toHaveBeenCalledTimes(2);
    const lost: TrackingStep = { status: 'lost', time: 1, reason: 'low-correlation', correlation: 0, margin: 0 };
    worker.onmessage?.({ data: { id: 2, type: 'step', step: lost } });
    await expect(next).resolves.toMatchObject({ done: false, value: lost });
    expect(worker.terminate).toHaveBeenCalledOnce();
    await expect(job.next()).resolves.toMatchObject({ done: true });
    expect(provider).toHaveBeenCalledTimes(2);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('rejects transport, invalid-reply and worker-runtime failures without leaving a live worker', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const first = new TrackingWorker(new AbortController().signal);
    FakeWorker.instances[0].postMessage.mockImplementation(() => { throw new Error('Transfer failed'); });
    await expect(first.send({ type: 'init', frame: frame(), region, options: {} })).rejects.toThrow('Transfer failed');
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    const second = new TrackingWorker(new AbortController().signal);
    const badReply = second.send({ type: 'init', frame: frame(), region, options: {} });
    FakeWorker.instances[1].onmessage?.({ data: { id: 1, type: 'step', step: { status: 'invented' } } });
    await expect(badReply).rejects.toThrow('invalid response');
    expect(FakeWorker.instances[1].terminate).toHaveBeenCalledOnce();
    const third = new TrackingWorker(new AbortController().signal);
    const crash = third.send({ type: 'init', frame: frame(), region, options: {} });
    FakeWorker.instances[2].onerror?.({ message: 'Worker crashed' });
    await expect(crash).rejects.toThrow('Worker crashed');
    expect(FakeWorker.instances[2].terminate).toHaveBeenCalledOnce();
  });
});
