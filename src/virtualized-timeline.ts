import { clipEnd, type Clip } from './model';

export interface TimelineViewport {
  scrollLeft: number;
  clientWidth: number;
  zoom: number;
  startTime: number;
  endTime: number;
  bufferStartPx: number;
  bufferEndPx: number;
}

/**
 * Computes the visible time window with overscan buffer.
 * Overscan buffer ensures fast scrolling without white flashing or layout thrashing.
 */
export function computeTimelineViewport(
  scrollLeft: number,
  clientWidth: number,
  zoom: number,
  bufferRatio = 0.75,
): TimelineViewport {
  const safeZoom = Math.max(0.01, zoom);
  const safeWidth = Math.max(100, clientWidth);
  const bufferPx = safeWidth * bufferRatio;
  const bufferStartPx = Math.max(0, scrollLeft - bufferPx);
  const bufferEndPx = scrollLeft + safeWidth + bufferPx;

  return {
    scrollLeft,
    clientWidth: safeWidth,
    zoom: safeZoom,
    startTime: Math.max(0, bufferStartPx / safeZoom),
    endTime: Math.max(0, bufferEndPx / safeZoom),
    bufferStartPx,
    bufferEndPx,
  };
}

/**
 * Determines if the viewport state should be refreshed.
 * Returns false if the scroll is safely inside the existing buffer, saving React re-renders!
 */
export function shouldUpdateViewport(
  current: TimelineViewport,
  scrollLeft: number,
  clientWidth: number,
  zoom: number,
  recenterThreshold = 0.25,
): boolean {
  if (current.zoom !== zoom) return true;
  if (Math.abs(current.clientWidth - clientWidth) > 50) return true;

  const visibleStartPx = scrollLeft;
  const visibleEndPx = scrollLeft + clientWidth;
  const thresholdPx = clientWidth * recenterThreshold;

  // Re-center when scroll approaches the buffer bounds
  if (visibleStartPx < current.bufferStartPx + thresholdPx && current.bufferStartPx > 0) {
    return true;
  }
  if (visibleEndPx > current.bufferEndPx - thresholdPx) {
    return true;
  }

  return false;
}

/**
 * Fast bounds check: does a clip overlap the given time interval?
 */
export function isClipVisibleInViewport(
  clip: Clip,
  viewportStartTime: number,
  viewportEndTime: number,
): boolean {
  const end = clipEnd(clip);
  return end >= viewportStartTime && clip.start <= viewportEndTime;
}

/**
 * Filter clips to only those visible in the viewport.
 * Selected and actively dragged clips are always retained to prevent unmounting mid-operation.
 */
export function filterVisibleClips(
  clips: readonly Clip[],
  viewportStartTime: number,
  viewportEndTime: number,
  alwaysIncludeIds?: Iterable<string>,
): Clip[] {
  const includeSet = alwaysIncludeIds ? new Set(alwaysIncludeIds) : null;
  return clips.filter((c) => {
    if (includeSet && includeSet.has(c.id)) return true;
    return isClipVisibleInViewport(c, viewportStartTime, viewportEndTime);
  });
}

/**
 * Filters beat markers to only those within the active viewport window.
 */
export function filterVisibleBeats(
  beats: readonly number[],
  viewportStartTime: number,
  viewportEndTime: number,
): number[] {
  return beats.filter((b) => b >= viewportStartTime && b <= viewportEndTime);
}

/**
 * Generates visible ruler tick indices for the viewport.
 */
export function getVisibleRulerTicks(
  viewportStartTime: number,
  viewportEndTime: number,
  step: number,
  totalSteps: number,
): number[] {
  const startIdx = Math.max(0, Math.floor(viewportStartTime / step));
  const endIdx = Math.min(totalSteps - 1, Math.ceil(viewportEndTime / step));
  const ticks: number[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    ticks.push(i);
  }
  return ticks;
}

export interface SnapTarget {
  time: number;
  type: 'clip-start' | 'clip-end' | 'playhead' | 'beat' | 'origin';
}

/**
 * Fast sub-pixel magnetic snapping calculation.
 */
export function findSubPixelSnapPoint(
  targetTime: number,
  candidates: readonly SnapTarget[],
  zoom: number,
  tolerancePx = 8,
): { snappedTime: number; guideTime: number | null; type?: SnapTarget['type'] } {
  const toleranceTime = Math.max(0.008, tolerancePx / zoom);
  let bestMatch: SnapTarget | null = null;
  let minDiff = Infinity;

  for (const candidate of candidates) {
    const diff = Math.abs(targetTime - candidate.time);
    if (diff <= toleranceTime && diff < minDiff) {
      minDiff = diff;
      bestMatch = candidate;
    }
  }

  if (bestMatch !== null) {
    return {
      snappedTime: bestMatch.time,
      guideTime: bestMatch.time,
      type: bestMatch.type,
    };
  }

  return {
    snappedTime: targetTime,
    guideTime: null,
  };
}

/**
 * Zero-re-render controller for the pistachio green magnetic snap guide line.
 * Directly mutates GPU-accelerated CSS transform without touching React state.
 */
export class SnapGuideOverlay {
  private element: HTMLElement | null = null;
  private isVisible = false;

  constructor(element?: HTMLElement | null) {
    if (element) this.element = element;
  }

  setElement(element: HTMLElement | null) {
    this.element = element;
  }

  show(time: number, zoom: number) {
    if (!this.element) return;
    const x = Math.round(time * zoom * 10) / 10;
    this.element.style.transform = `translate3d(${x}px, 0, 0)`;
    if (!this.isVisible) {
      this.element.style.display = 'block';
      this.isVisible = true;
    }
  }

  hide() {
    if (!this.element) return;
    if (this.isVisible) {
      this.element.style.display = 'none';
      this.isVisible = false;
    }
  }
}
