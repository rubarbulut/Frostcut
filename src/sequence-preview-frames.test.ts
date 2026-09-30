import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addMedia, createProject, defaultProps, type Project, type SequenceClip } from './model';
import { sequenceSnapshot } from './sequences';
import { SequencePreviewFrames, type SequencePreviewFrameRequest } from './sequence-preview-frames';
import type { SequenceFramePlan } from './nested-sequence-plan';
import type { VisualFrameSource } from './sequence-compositor';

const trace = vi.hoisted(() => ({ times: [] as number[], active: 0, maxActive: 0, disposed: 0 }));
// Keep the actual graph/time compiler; the compositor suite covers real drawing.
// These tests isolate decoder commands, lifecycle and publication without GPU/media.
vi.mock('./sequence-compositor', async (original) => ({
  ...await original<typeof import('./sequence-compositor')>(),
  SequenceCompositor: class {
    async draw(ctx: CanvasRenderingContext2D, frame: SequenceFramePlan, source: VisualFrameSource) {
      trace.times.push(frame.time); trace.active++; trace.maxActive = Math.max(trace.maxActive, trace.active);
      (ctx as unknown as FakeContext).paints.length = 0;
      const visit = async (current: SequenceFramePlan) => {
        if (current.time < 0 || current.time >= current.duration) return;
        for (const layer of current.layers) if (layer.visible) {
          if (layer.kind === 'sequence') await visit(layer.frame);
          else { const decoded = await source(layer); ctx.drawImage(decoded.image, 0, 0); }
        }
      };
      try { await visit(frame); } finally { trace.active--; }
    }
    dispose() { trace.disposed++; }
  },
}));

class FakeVideo extends EventTarget {
  src = ''; muted = false; playsInline = false; preload = ''; preservesPitch = false;
  videoWidth = 200; videoHeight = 100; duration = 40; readyState = 2; seeking = false; paused = true;
  autoLoad = true; autoSeek = true; holdPlay = false; maxRate = 16;
  seeks: number[] = [];
  private time = 0;
  private rate = 1;
  private rejectPlay?: (error: unknown) => void;
  get playbackRate() { return this.rate; }
  set playbackRate(rate: number) {
    if (rate > this.maxRate) throw new DOMException('Unsupported rate', 'NotSupportedError');
    this.rate = rate;
  }
  get currentTime() { return this.time; }
  set currentTime(time: number) {
    this.time = time; this.seeks.push(time); this.seeking = true;
    if (this.autoSeek) queueMicrotask(() => this.finishSeek());
  }
  advance(time: number) { this.time = time; }
  finishSeek() { this.seeking = false; this.dispatchEvent(new Event('seeked')); }
  load = vi.fn(() => { if (this.src && this.autoLoad) queueMicrotask(() => this.dispatchEvent(new Event('loadeddata'))); });
  pause = vi.fn(() => {
    this.paused = true;
    this.rejectPlay?.(new DOMException('Paused', 'AbortError')); this.rejectPlay = undefined;
  });
  play = vi.fn(() => {
    this.paused = false;
    return this.holdPlay ? new Promise<void>((_, reject) => { this.rejectPlay = reject; }) : Promise.resolve();
  });
  removeAttribute = vi.fn(() => { this.src = ''; });
}
type Paint = { src: string; time: number };
class FakeContext {
  paints: Paint[] = []; globalAlpha = 1; globalCompositeOperation = ''; filter = '';
  save = vi.fn(); restore = vi.fn(); resetTransform = vi.fn();
  drawImage = vi.fn((image: FakeVideo | FakeCanvas) => {
    if (image instanceof FakeVideo) this.paints.push({ src: image.src, time: image.currentTime });
    else this.paints = image.context.paints.map((paint) => ({ ...paint }));
  });
}
class FakeCanvas {
  width = 1; height = 1; context = new FakeContext();
  getContext() { return this.context as unknown as CanvasRenderingContext2D; }
}
function setup(configure: (video: FakeVideo, index: number) => void = () => {}) {
  const videos: FakeVideo[] = [], canvases: FakeCanvas[] = [], target = new FakeCanvas();
  vi.stubGlobal('document', { createElement: (tag: string) => {
    if (tag === 'video') {
      const video = new FakeVideo(); configure(video, videos.length); videos.push(video); return video;
    }
    if (tag === 'canvas') { const canvas = new FakeCanvas(); canvases.push(canvas); return canvas; }
    throw new Error('Unexpected resource');
  } });
  return { videos, canvases, target, element: target as unknown as HTMLCanvasElement };
}
function project(): Project {
  const p = addMedia(createProject('Preview', 'YouTube'), { id: 'media', name: 'Original.mp4',
    duration: 40, width: 200, height: 100, size: 1, type: 'video/mp4' });
  p.clips[0] = { ...p.clips[0], sourceStart: 5, sourceEnd: 25, properties: { ...defaultProps, speed: 2 } };
  const child = sequenceSnapshot(p, 'child', 'Child'), root = sequenceSnapshot(p, 'root', 'Parent');
  const placement = (id: string, sourceStart: number, sourceEnd: number, speed: number): SequenceClip => ({
    id, sequenceId: 'child', trackId: 'V1', start: 0, sourceStart, sourceEnd, properties: { ...defaultProps, speed },
  });
  root.clips = [placement('first', 0, 8, 2), placement('second', 3, 9, 1)];
  return { ...p, ...root, id: p.id, name: p.name, activeSequenceId: 'root', sequences: [root, child] };
}
const request = (patch: Partial<SequencePreviewFrameRequest> = {}): SequencePreviewFrameRequest => ({
  time: 1, width: 160, height: 80, playing: false, rate: 1, epoch: 0, resolveSource: () => 'blob:original', ...patch,
});
async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
const drivers: SequencePreviewFrames[] = [];
function driver(p: Project, canvas: HTMLCanvasElement) {
  const frames = new SequencePreviewFrames(p, canvas); drivers.push(frames); return frames;
}
beforeEach(() => { trace.times.length = 0; trace.active = trace.maxActive = trace.disposed = 0; });
afterEach(() => { drivers.splice(0).forEach((frames) => frames.dispose()); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('independent live sequence frame sources and atomic publication', () => {
  it('compiles once per edit and gives repeated file placements independent clocks/decoders', async () => {
    const f = setup(), p = project(), clone = vi.spyOn(globalThis, 'structuredClone');
    try {
      const frames = driver(p, f.element), copies = clone.mock.calls.length;
      expect(copies).toBe(2);
      expect(f.videos).toEqual([]);
      expect(await frames.request(request())).toBe('published');
      expect(f.videos).toHaveLength(2);
      expect(f.videos[0]).not.toBe(f.videos[1]);
      expect(f.target.context.paints).toEqual([{ src: 'blob:original', time: 9 }, { src: 'blob:original', time: 13 }]);
      expect(f.videos.every((video) => video.muted && video.playsInline)).toBe(true);
      expect(f.videos.every((video) => video.play.mock.calls.length === 0)).toBe(true);
      expect(await frames.request(request({ time: 2 }))).toBe('published');
      expect(f.videos).toHaveLength(2);
      expect(clone).toHaveBeenCalledTimes(copies);
      expect(f.target.context.paints.map((paint) => paint.time)).toEqual([13, 15]);
      expect(f.target.context.drawImage).toHaveBeenCalledTimes(2);
    } finally { clone.mockRestore(); }
  });

  it('plays at the actual ancestor product and avoids stopping/reseeking continuous frames', async () => {
    const f = setup(), frames = driver(project(), f.element);
    await frames.request(request({ playing: true, rate: 1.5 }));
    expect(f.videos.map((video) => video.playbackRate)).toEqual([6, 3]);
    expect(f.videos.every((video) => video.preservesPitch && !video.paused)).toBe(true);
    const seeks = f.videos.map((video) => video.seeks.length), pauses = f.videos.map((video) => video.pause.mock.calls.length);
    f.videos[0].advance(9.19); f.videos[1].advance(13.09);
    await frames.request(request({ time: 1.05, playing: true, rate: 1.5 }));
    expect(f.videos.map((video) => video.seeks.length)).toEqual(seeks);
    expect(f.videos.map((video) => video.pause.mock.calls.length)).toEqual(pauses);
    expect(f.videos.every((video) => video.play.mock.calls.length === 1)).toBe(true);
    await frames.request(request({ time: 1.05, epoch: 1 }));
    expect(f.target.context.paints.map((paint) => paint.time)).toEqual([9.2, 13.1]);
    expect(f.videos.every((video) => video.paused)).toBe(true);
  });

  it('coalesces scrub requests and never publishes partial/obsolete compositions', async () => {
    const f = setup((video, index) => { if (index === 0) video.autoSeek = false; }), frames = driver(project(), f.element);
    const first = frames.request(request({ time: 0.5 })); await flush();
    expect(f.videos[0].seeking).toBe(true);
    expect(f.target.context.drawImage).not.toHaveBeenCalled();
    const skipped = frames.request(request({ time: 1.5 })), last = frames.request(request({ time: 2.5 }));
    expect(await skipped).toBe('superseded');
    f.videos[0].autoSeek = true; f.videos[0].finishSeek();
    expect(await first).toBe('superseded');
    expect(await last).toBe('published');
    expect(trace.times).toEqual([0.5, 2.5]); expect(trace.maxActive).toBe(1);
    expect(f.target.context.drawImage).toHaveBeenCalledOnce();
    expect(f.target.context.paints.map((paint) => paint.time)).toEqual([15, 16]);
  });

  it('cancels an obsolete source load immediately so the newest seek does not wait for its timeout', async () => {
    const f = setup((video, index) => { if (index === 0) video.autoLoad = false; }), frames = driver(project(), f.element);
    const first = frames.request(request()); await flush();
    expect(f.videos[0].src).toBe('blob:original');
    const last = frames.request(request({ time: 2, epoch: 1, resolveSource: () => 'blob:replacement' }));
    expect(await first).toBe('superseded'); expect(await last).toBe('published');
    expect(f.videos[0].src).toBe('');
    expect(f.target.context.paints).toEqual([{ src: 'blob:replacement', time: 13 }, { src: 'blob:replacement', time: 15 }]);
  });

  it('allows completed continuous playback frames through while queuing only the latest next tick', async () => {
    const f = setup((video, index) => { if (index === 0) video.autoSeek = false; }), frames = driver(project(), f.element);
    const first = frames.request(request({ time: 0.5, playing: true })); await flush();
    const last = frames.request(request({ time: 0.6, playing: true }));
    f.videos[0].autoSeek = true; f.videos[0].finishSeek();
    expect(await first).toBe('published'); expect(await last).toBe('published');
    expect(trace.maxActive).toBe(1); expect(f.target.context.drawImage).toHaveBeenCalledTimes(2);
  });

  it('changes real proxy URLs per placement and promptly releases inactive decoders', async () => {
    const f = setup(), frames = driver(project(), f.element);
    await frames.request(request({ playing: true }));
    const originals = [...f.videos];
    await frames.request(request({ epoch: 1, resolveSource: () => 'blob:proxy' }));
    expect(originals.every((video) => video.src === '' && video.paused)).toBe(true);
    expect(f.videos.slice(2).map((video) => video.src)).toEqual(['blob:proxy', 'blob:proxy']);
    await frames.request(request({ time: 5, epoch: 1, resolveSource: () => 'blob:proxy' }));
    expect(f.videos[2].src).toBe(''); expect(f.videos[3].src).toBe('blob:proxy');
    await frames.request(request({ time: 6, epoch: 1 }));
    expect(f.videos.every((video) => video.src === '' && video.paused)).toBe(true);
    expect(f.target.context.paints).toEqual([]);
  });

  it('keeps shortened child gaps empty and never creates decoders for hidden frames', async () => {
    const f = setup(), p = project();
    p.sequences![1].clips[0].sourceEnd = 9; // Child duration now 2; both source clocks are >= 2.
    const frames = driver(p, f.element);
    await frames.request(request());
    expect(f.videos).toEqual([]); expect(f.target.context.paints).toEqual([]);
    const hidden = project(); hidden.tracks = hidden.tracks.map((track) => ({ ...track, hidden: true }));
    await driver(hidden, f.element).request(request());
    expect(f.videos).toEqual([]);
  });

  it('handles pause during a pending play promise as a superseded frame, then publishes the scrub', async () => {
    const f = setup((video, index) => { video.holdPlay = index === 0; }), frames = driver(project(), f.element);
    const first = frames.request(request({ playing: true })); await flush();
    expect(f.videos[0].play).toHaveBeenCalledOnce();
    const last = frames.request(request({ time: 2, epoch: 1 }));
    expect(await first).toBe('superseded'); expect(await last).toBe('published');
    expect(f.target.context.paints.map((paint) => paint.time)).toEqual([13, 15]);
  });

  it.each(['load', 'seek'] as const)('aborts a pending %s and queued frames on disposal without publishing or keeping resources', async (stage) => {
    const f = setup((video) => { if (stage === 'load') video.autoLoad = false; else video.autoSeek = false; }), frames = driver(project(), f.element);
    const loading = expect(frames.request(request())).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    const queued = expect(frames.request(request({ time: 2 }))).rejects.toMatchObject({ name: 'AbortError' });
    frames.dispose(); frames.dispose(); await loading; await queued;
    expect(f.target.context.drawImage).not.toHaveBeenCalled();
    expect(f.videos[0].src).toBe(''); expect(f.videos[0].paused).toBe(true);
    expect([f.canvases[0].width, f.canvases[0].height]).toEqual([1, 1]);
    expect(trace.disposed).toBe(1);
    await expect(frames.request(request())).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('stops retrying timed-out sources on ticks and retries only on an explicit new epoch', async () => {
    vi.useFakeTimers();
    const f = setup((video, index) => { if (index === 0) video.autoLoad = false; }), frames = driver(project(), f.element);
    const failed = expect(frames.request(request())).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(15001); await failed;
    await expect(frames.request(request({ time: 2 }))).rejects.toThrow('timed out');
    expect(f.videos).toHaveLength(1); expect(f.videos[0].src).toBe('');
    expect(f.target.context.drawImage).not.toHaveBeenCalled();
    vi.useRealTimers();
    expect(await frames.request(request({ epoch: 1 }))).toBe('published');
  });

  it('fails visibly on absent/remote/mismatched media and unsupported combined playback rates, preserving paused scrubbing', async () => {
    const f = setup(), frames = driver(project(), f.element);
    await expect(frames.request(request({ resolveSource: () => undefined }))).rejects.toThrow('Missing preview media');
    await expect(frames.request(request({ epoch: 1, resolveSource: () => 'https://remote/video' }))).rejects.toThrow('local source');
    expect(f.videos).toEqual([]); expect(f.target.context.drawImage).not.toHaveBeenCalled();
    await expect(frames.request(request({ epoch: 2, playing: true, rate: 100 }))).rejects.toThrow('combined sequence speed');
    expect(f.videos[0].src).toBe('');
    expect(await frames.request(request({ epoch: 3, rate: 100 }))).toBe('published');
    expect(f.videos.slice(1).every((video) => video.play.mock.calls.length === 0)).toBe(true);
    const mismatch = setup((video) => { video.duration = 5; }), bad = driver(project(), mismatch.element);
    await expect(bad.request(request())).rejects.toThrow('does not contain this video time');
    expect(mismatch.target.context.drawImage).not.toHaveBeenCalled();
    expect(mismatch.videos[0].src).toBe('');
  });
});
