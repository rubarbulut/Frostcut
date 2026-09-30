import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrackingSource, trackingFrameCount, trackingSourceFrames } from './tracking-source';

class FakeVideo extends EventTarget {
  src = ''; muted = false; playsInline = false; preload = '';
  videoWidth = 1920; videoHeight = 1080; duration = 10; readyState = 2; seeking = false;
  autoLoad = true; autoSeek = true;
  pause = vi.fn();
  load = vi.fn(() => { if (this.src && this.autoLoad) queueMicrotask(() => this.dispatchEvent(new Event('loadeddata'))); });
  removeAttribute = vi.fn(() => { this.src = ''; });
  private time = 0;
  get currentTime() { return this.time; }
  set currentTime(time: number) { this.time = time; this.seeking = true;
    if (this.autoSeek) queueMicrotask(() => { this.seeking = false; this.dispatchEvent(new Event('seeked')); }); }
}
function setup(video = new FakeVideo()) {
  const context = { drawImage: vi.fn(), getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(canvas.width * canvas.height * 4) })) };
  const canvas = { width: 300, height: 150, getContext: vi.fn(() => context) };
  const createElement = vi.fn((tag: string) => tag === 'video' ? video : canvas);
  vi.stubGlobal('document', { createElement });
  return { video, canvas, context, createElement };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('on-demand original source reader', () => {
  it('bounds a single canvas, reads reported source time, and releases resources', async () => {
    const { video, canvas, context, createElement } = setup();
    const source = await TrackingSource.open('blob:original', new AbortController().signal);
    expect(createElement).toHaveBeenCalledTimes(2);
    expect([canvas.width, canvas.height]).toEqual([480, 270]);
    expect([source.width, source.height, source.duration]).toEqual([1920, 1080, 10]);
    const frame = await source.read(2.5);
    expect(frame.time).toBe(2.5); expect(frame.rgba.length).toBe(480 * 270 * 4);
    expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(video, 0, 0, 480, 270);
    source.dispose(); source.dispose();
    expect(video.pause).toHaveBeenCalledOnce(); expect(video.src).toBe('');
    expect([canvas.width, canvas.height]).toEqual([1, 1]);
    await expect(source.read(1)).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('aborts a pending load/seek, rejects a concurrent read and never creates cancelled/remote sources', async () => {
    const video = new FakeVideo(); video.autoLoad = false;
    const { createElement, canvas } = setup(video), controller = new AbortController();
    const loading = TrackingSource.open('blob:original', controller.signal); controller.abort();
    await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
    await expect(TrackingSource.open('blob:original', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(TrackingSource.open('https://remote', new AbortController().signal)).rejects.toThrow('local');
    expect(createElement).toHaveBeenCalledTimes(2); expect(canvas.width).toBe(1);
    video.autoLoad = true;
    const seekController = new AbortController(), source = await TrackingSource.open('blob:original', seekController.signal);
    video.autoSeek = false;
    const seeking = source.read(1); await expect(source.read(2)).rejects.toThrow('current source seek');
    seekController.abort(); await expect(seeking).rejects.toMatchObject({ name: 'AbortError' });
    expect(video.src).toBe('');
  });
  it('cleans up decoding errors/timeouts and rejects invalid geometry before sampling', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo(); video.autoLoad = false; const { canvas } = setup(video);
    const loading = TrackingSource.open('blob:original', new AbortController().signal);
    const failed = expect(loading).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(15001); await failed;
    expect(video.src).toBe(''); expect(canvas.width).toBe(1);
    const errorSource = TrackingSource.open('blob:original', new AbortController().signal);
    const errorCheck = expect(errorSource).rejects.toThrow('decoded');
    video.dispatchEvent(new Event('error')); await errorCheck;
    video.autoLoad = true; video.videoHeight = 1;
    await expect(TrackingSource.open('blob:original', new AbortController().signal)).rejects.toThrow('dimensions');
    expect(video.src).toBe('');
  });
  it('pulls each end-exclusive source sample on demand and refuses excess point budgets', async () => {
    setup(); const controller = new AbortController(), source = await TrackingSource.open('blob:original', controller.signal);
    const read = vi.spyOn(source, 'read'), frames = trackingSourceFrames(source, 1, 2, 2, controller.signal);
    expect(read).not.toHaveBeenCalled();
    expect((await frames.next()).value?.time).toBe(1); expect(read).toHaveBeenCalledOnce();
    expect((await frames.next()).value?.time).toBe(1.5);
    expect((await frames.next()).done).toBe(true); expect(read).toHaveBeenCalledTimes(2);
    expect(trackingFrameCount(0, 600, 30)).toBe(18000);
    expect(() => trackingFrameCount(0, 2000, 60)).toThrow('exceeds');
    expect(() => trackingFrameCount(0, 0.01, 1)).toThrow('two samples');
    await expect(trackingSourceFrames(source, 1, 11, 2, controller.signal).next()).rejects.toThrow('duration');
    source.dispose();
  });
});
