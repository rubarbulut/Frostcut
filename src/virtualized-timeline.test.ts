import { describe, it, expect } from 'vitest';
import {
  computeTimelineViewport,
  shouldUpdateViewport,
  isClipVisibleInViewport,
  filterVisibleClips,
  filterVisibleBeats,
  getVisibleRulerTicks,
  findSubPixelSnapPoint,
  SnapGuideOverlay,
} from './virtualized-timeline';
import { type Clip, defaultProps } from './model';

function makeMockClip(id: string, start: number, duration: number): Clip {
  return {
    id,
    trackId: 'V1',
    mediaId: 'm1',
    start,
    sourceStart: 0,
    sourceEnd: duration,
    properties: { ...defaultProps, speed: 1 },
  };
}

describe('Virtualized Timeline Engine', () => {
  it('computes viewport with correct overscan buffer', () => {
    // 1000px width, zoom 50px/sec => visible 20 seconds
    const viewport = computeTimelineViewport(1000, 1000, 50, 0.5);
    // buffer = 500px => startPx = 500, endPx = 2500
    expect(viewport.bufferStartPx).toBe(500);
    expect(viewport.bufferEndPx).toBe(2500);
    expect(viewport.startTime).toBe(10); // 500 / 50
    expect(viewport.endTime).toBe(50); // 2500 / 50
  });

  it('determines if viewport should update based on buffer threshold', () => {
    const initial = computeTimelineViewport(1000, 1000, 50, 0.5);
    // Scrolling slightly within the buffer should NOT trigger update
    expect(shouldUpdateViewport(initial, 1050, 1000, 50)).toBe(false);
    expect(shouldUpdateViewport(initial, 950, 1000, 50)).toBe(false);

    // Scrolling near or past buffer boundaries should trigger update
    expect(shouldUpdateViewport(initial, 1800, 1000, 50)).toBe(true);
    expect(shouldUpdateViewport(initial, 200, 1000, 50)).toBe(true);

    // Zoom change always triggers update
    expect(shouldUpdateViewport(initial, 1000, 1000, 60)).toBe(true);
  });

  it('detects clip visibility in viewport correctly', () => {
    const clip = makeMockClip('c1', 10, 5); // 10s to 15s

    // Inside
    expect(isClipVisibleInViewport(clip, 5, 20)).toBe(true);
    // Partially overlapping start
    expect(isClipVisibleInViewport(clip, 12, 20)).toBe(true);
    // Partially overlapping end
    expect(isClipVisibleInViewport(clip, 5, 12)).toBe(true);
    // Completely before viewport
    expect(isClipVisibleInViewport(clip, 16, 30)).toBe(false);
    // Completely after viewport
    expect(isClipVisibleInViewport(clip, 0, 8)).toBe(false);
  });

  it('filters 500+ clips down to only visible subset (DOM unmounting check)', () => {
    // Generate 500 sequential clips of 2 seconds each => 1000 seconds total
    const clips: Clip[] = [];
    for (let i = 0; i < 500; i++) {
      clips.push(makeMockClip(`clip-${i}`, i * 2, 2));
    }

    // Viewport covers time from 100s to 120s (10 clips visible out of 500)
    const visible = filterVisibleClips(clips, 100, 120);

    // Clips between 100s and 120s are indexes 49 to 60 (~12 clips)
    expect(visible.length).toBeLessThan(25);
    expect(visible.length).toBeGreaterThanOrEqual(10);

    // Verifying clips outside the window are unmounted / excluded
    expect(visible.some((c) => c.id === 'clip-0')).toBe(false);
    expect(visible.some((c) => c.id === 'clip-499')).toBe(false);
    expect(visible.some((c) => c.id === 'clip-55')).toBe(true);
  });

  it('preserves selected or actively dragged clips even if outside viewport', () => {
    const clips = [
      makeMockClip('c1', 0, 2),
      makeMockClip('c2', 100, 2),
      makeMockClip('c3', 500, 2),
    ];

    const visible = filterVisibleClips(clips, 90, 110, ['c3']);
    expect(visible.map((c) => c.id)).toContain('c2');
    expect(visible.map((c) => c.id)).toContain('c3'); // Kept because it's selected/dragged
    expect(visible.map((c) => c.id)).not.toContain('c1');
  });

  it('filters visible beats and ruler ticks correctly', () => {
    const beats = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30];
    const visibleBeats = filterVisibleBeats(beats, 8, 22);
    expect(visibleBeats).toEqual([10, 15, 20]);

    const ticks = getVisibleRulerTicks(10, 25, 5, 20);
    expect(ticks).toEqual([2, 3, 4, 5]); // 10/5=2 up to 25/5=5
  });

  it('computes sub-pixel magnetic snapping accurately', () => {
    const candidates = [
      { time: 10.0, type: 'clip-start' as const },
      { time: 25.5, type: 'clip-end' as const },
      { time: 40.0, type: 'playhead' as const },
    ];

    // Zoom = 100px/sec => tolerance 8px / 100 = 0.08 sec
    // Test near 10.0 with 0.04s difference -> should snap
    const snap1 = findSubPixelSnapPoint(10.04, candidates, 100, 8);
    expect(snap1.snappedTime).toBe(10.0);
    expect(snap1.guideTime).toBe(10.0);
    expect(snap1.type).toBe('clip-start');

    // Test far from any candidate -> should not snap
    const snap2 = findSubPixelSnapPoint(15.0, candidates, 100, 8);
    expect(snap2.snappedTime).toBe(15.0);
    expect(snap2.guideTime).toBeNull();
  });

  it('SnapGuideOverlay updates DOM transform directly without errors', () => {
    const style: Record<string, string> = {};
    const mockEl = { style } as unknown as HTMLElement;
    const overlay = new SnapGuideOverlay(mockEl);

    overlay.show(12.5, 20);
    expect(style.display).toBe('block');
    expect(style.transform).toBe('translate3d(250px, 0, 0)');

    overlay.hide();
    expect(style.display).toBe('none');
  });
});
