import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runSourceTracking } from './tracking-job';
import { validClipTracking } from './tracking-data';
import type { TrackingStep } from './region-tracker';

const fake = vi.hoisted(() => ({ open: vi.fn(), dispose: vi.fn(), failure: undefined as Error | undefined, steps: [] as TrackingStep[] }));
vi.mock('./tracking-source', async () => {
  const actual = await vi.importActual<typeof import('./tracking-source')>('./tracking-source');
  return { ...actual, TrackingSource: { open: fake.open } };
});
vi.mock('./tracking-worker', () => ({ trackRegionFrames: async function* () {
  for (const step of fake.steps) yield step;
  if (fake.failure) throw fake.failure;
} }));
const region = { x: 0.4, y: 0.4, width: 0.2, height: 0.2 };
const point = (time: number): TrackingStep => ({ status: time === 0 ? 'seed' : 'tracked', point: { time, x: 0.5 + time / 10, y: 0.5, correlation: 0.9 } });
beforeEach(() => {
  vi.clearAllMocks(); fake.failure = undefined; fake.steps = [point(0), point(1)];
  fake.open.mockResolvedValue({ width: 1920, height: 1080, duration: 10, dispose: fake.dispose });
});
describe('source tracking result boundary', () => {
  it('retains measured times/positions and original geometry, with no point beyond a lost target', async () => {
    fake.steps.push({ status: 'lost', time: 2, reason: 'ambiguous', correlation: 0.8, margin: 0.01 });
    const progress = vi.fn(), output = await runSourceTracking('blob:source', 0, 4, 1, 480, region, {}, new AbortController().signal, progress);
    expect(output.points).toEqual(fake.steps.slice(0, 2).map((s) => 'point' in s ? s.point : undefined));
    expect(output.tracking).toMatchObject({ sourceWidth: 1920, sourceHeight: 1080, start: 0, end: 2, region });
    expect(validClipTracking(output.tracking, 10)).toBe(true);
    expect(progress).toHaveBeenLastCalledWith(2, 4, 2);
    expect(fake.dispose).toHaveBeenCalledOnce();
  });
  it('refuses to apply a single seed and keeps complete paths end-exclusive', async () => {
    fake.steps = [point(0), { status: 'lost', time: 1, reason: 'low-correlation', correlation: 0.1, margin: 0 }];
    const partial = await runSourceTracking('blob:source', 0, 4, 1, 480, region, {}, new AbortController().signal, vi.fn());
    expect(partial.tracking).toBeUndefined(); expect(partial.points).toHaveLength(1);
    fake.steps = [point(0), point(1), point(2), point(3)];
    const full = await runSourceTracking('blob:source', 0, 4, 1, 480, region, {}, new AbortController().signal, vi.fn());
    expect(full.tracking?.end).toBe(4); expect(full.points.at(-1)?.time).toBe(3);
    expect(fake.dispose).toHaveBeenCalledTimes(2);
  });
  it('releases the decoder on failure/abort and checks oversized requests before opening media', async () => {
    fake.failure = new Error('Worker failed');
    await expect(runSourceTracking('blob:source', 0, 4, 1, 480, region, {}, new AbortController().signal, vi.fn())).rejects.toThrow('Worker failed');
    expect(fake.dispose).toHaveBeenCalledOnce();
    fake.failure = undefined; const controller = new AbortController();
    await expect(runSourceTracking('blob:source', 0, 4, 1, 480, region, {}, controller.signal, () => controller.abort())).rejects.toMatchObject({ name: 'AbortError' });
    expect(fake.dispose).toHaveBeenCalledTimes(2);
    await expect(runSourceTracking('blob:source', 0, 2000, 60, 480, region, {}, new AbortController().signal, vi.fn())).rejects.toThrow('exceeds');
    expect(fake.open).toHaveBeenCalledTimes(2);
  });
});
