import type { AspectFillMode, ClipProps } from './model';
import type { TrackingRegion } from './region-tracker';

export const MAX_TRACKING_POINTS = 50000;
export type MotionTrackingPoint = {
  time: number; x: number; y: number;
  correlation?: number; margin?: number; manual?: true;
};
export type ClipTracking = {
  version: 1;
  enabled: boolean;
  sourceWidth: number;
  sourceHeight: number;
  start: number;
  end: number;
  region: TrackingRegion;
  points: MotionTrackingPoint[];
};
const finite = (n: unknown, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
export function validClipTracking(value: unknown, duration: number): value is ClipTracking {
  const t = value as ClipTracking;
  if (!t || t.version !== 1 || typeof t.enabled !== 'boolean' ||
    !Number.isInteger(t.sourceWidth) || !finite(t.sourceWidth, 8, 16384) ||
    !Number.isInteger(t.sourceHeight) || !finite(t.sourceHeight, 8, 16384) ||
    !finite(t.start, 0, duration) || !finite(t.end, t.start, duration + 0.1) || t.end <= t.start ||
    !t.region || !finite(t.region.x, 0, 1) || !finite(t.region.y, 0, 1) ||
    !finite(t.region.width, Number.EPSILON, 1 - t.region.x) ||
    !finite(t.region.height, Number.EPSILON, 1 - t.region.y) ||
    !Array.isArray(t.points) || t.points.length < 2 || t.points.length > MAX_TRACKING_POINTS)
    return false;
  return t.points.every((p, i) => !!p && finite(p.time, t.start, t.end) && p.time < t.end &&
    (i === 0 ? p.time === t.start : p.time > t.points[i - 1].time) &&
    finite(p.x, 0, 1) && finite(p.y, 0, 1) &&
    (p.manual === undefined || p.manual === true) &&
    (p.manual === true
      ? p.correlation === undefined && p.margin === undefined
      : finite(p.correlation, -1, 1) && (p.margin === undefined || finite(p.margin, 0, 2))));
}

/** Source points stay intact; interpolation performs a logarithmic lookup. */
export function trackingPointAt(points: MotionTrackingPoint[], time: number) {
  if (time <= points[0].time) return points[0];
  if (time >= points.at(-1)!.time) return points.at(-1)!;
  let low = 1, high = points.length - 1;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (points[mid].time < time) low = mid + 1;
    else high = mid;
  }
  const next = points[low], previous = points[low - 1];
  const fraction = (time - previous.time) / (next.time - previous.time);
  return { time, x: previous.x + (next.x - previous.x) * fraction,
    y: previous.y + (next.y - previous.y) * fraction };
}

/** Compensates measured region translation, retaining the user's baseline motion. */
export function trackingOffsetAt(
  tracking: ClipTracking | undefined, sourceTime: number,
  width: number, height: number, props: ClipProps, fillMode?: AspectFillMode,
) {
  if (!tracking?.enabled || sourceTime < tracking.start || sourceTime >= tracking.end)
    return { x: 0, y: 0 };
  const point = trackingPointAt(tracking.points, sourceTime), anchor = tracking.points[0];
  const ratios = [width / tracking.sourceWidth, height / tracking.sourceHeight];
  const fit = fillMode === 'crop' ? Math.max(...ratios) : Math.min(...ratios);
  const dx = (anchor.x - point.x) * tracking.sourceWidth * fit * props.scale;
  const dy = (anchor.y - point.y) * tracking.sourceHeight * fit * props.scale;
  const angle = props.rotation * Math.PI / 180;
  return { x: dx * Math.cos(angle) - dy * Math.sin(angle),
    y: dx * Math.sin(angle) + dy * Math.cos(angle) };
}
