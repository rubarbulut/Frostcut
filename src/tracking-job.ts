import { TrackingSource, trackingFrameCount, trackingSourceFrames } from './tracking-source';
import { trackRegionFrames } from './tracking-worker';
import type { TrackingOptions, TrackingPoint, TrackingRegion, TrackingStep } from './region-tracker';
import type { ClipTracking } from './tracking-data';

export async function runSourceTracking(
  url: string, start: number, end: number, fps: number, maxSide: number,
  region: TrackingRegion, options: TrackingOptions, signal: AbortSignal,
  progress: (completed: number, total: number, time: number) => void,
) {
  const total = trackingFrameCount(start, end, fps);
  const source = await TrackingSource.open(url, signal, maxSide);
  const points: TrackingPoint[] = [];
  let lost: Extract<TrackingStep, { status: 'lost' }> | undefined, updated = -Infinity;
  try {
    for await (const step of trackRegionFrames(trackingSourceFrames(source, start, end, fps, signal), region, signal, options)) {
      if (step.status === 'lost') { lost = step; break; }
      points.push(step.point);
      if (performance.now() - updated >= 100 || points.length === 1) {
        progress(points.length, total, step.point.time); updated = performance.now();
      }
    }
    signal.throwIfAborted();
    progress(points.length, total, lost?.time ?? points.at(-1)?.time ?? start);
    const tracking: ClipTracking | undefined = points.length >= 2 ? {
      version: 1, enabled: true, sourceWidth: source.width, sourceHeight: source.height,
      start: points[0].time, end: lost?.time ?? end, region: { ...region }, points,
    } : undefined;
    return { tracking, points, lost, total };
  } finally { source.dispose(); }
}
