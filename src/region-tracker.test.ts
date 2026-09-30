import { describe, expect, it } from 'vitest';
import { RegionTracker, trackingGray, type TrackingFrame, type TrackingRegion } from './region-tracker';

const width = 48, height = 32, size = 8;
const target = (x: number, y: number): TrackingRegion => ({ x: x / width, y: y / height, width: size / width, height: size / height });
function frame(x: number, y: number, time: number, brightness = 0, duplicate?: { x: number; y: number }): TrackingFrame {
  const pixels = new Uint8Array(width * height).fill(10);
  const patch = (left: number, top: number) => {
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      pixels[(top + j) * width + left + i] = 30 + (i * 37 + j * 73 + i * j * 13) % 160 + brightness;
    }
  };
  patch(x, y);
  if (duplicate) patch(duplicate.x, duplicate.y);
  return { width, height, time, pixels };
}

describe('real pixel region tracking', () => {
  it('measures translated target coordinates at the original source timestamps', () => {
    const tracker = new RegionTracker(frame(12, 8, 4.5), target(12, 8), { searchRadius: 6 });
    expect(tracker.seed.status).toBe('seed');
    for (const [x, y, time] of [[15, 10, 4.6], [18, 9, 4.75], [16, 12, 5.1]]) {
      const step = tracker.next(frame(x, y, time));
      expect(step.status).toBe('tracked');
      if (step.status === 'lost') throw new Error('Unexpected lost target');
      expect(step.point.x).toBeCloseTo((x + size / 2) / width);
      expect(step.point.y).toBeCloseTo((y + size / 2) / height);
      expect(step.point.time).toBe(time);
      expect(step.point.correlation).toBeCloseTo(1);
    }
  });

  it('normalizes brightness changes without fabricating a motion trajectory', () => {
    const tracker = new RegionTracker(frame(12, 8, 0), target(12, 8), { searchRadius: 6 });
    const step = tracker.next(frame(14, 9, 0.1, 20));
    expect(step.status).toBe('tracked');
    if (step.status === 'lost') throw new Error('Unexpected lost target');
    expect(step.point.x).toBeCloseTo(18 / width);
    expect(step.point.y).toBeCloseTo(13 / height);
    expect(step.point.correlation).toBeCloseTo(1);
  });

  it('stops at an occluded target and returns no invented point or later continuation', () => {
    const tracker = new RegionTracker(frame(12, 8, 0), target(12, 8));
    const result = tracker.next({ width, height, time: 0.1, pixels: new Uint8Array(width * height).fill(10) });
    expect(result).toMatchObject({ status: 'lost', time: 0.1, reason: 'low-correlation' });
    expect('point' in result).toBe(false);
    expect(() => tracker.next(frame(14, 8, 0.2))).toThrow('lost target');
  });

  it('rejects equally matching separated targets instead of choosing a false winner', () => {
    const tracker = new RegionTracker(frame(12, 8, 0), target(12, 8), { searchRadius: 16 });
    const result = tracker.next(frame(12, 8, 0.1, 0, { x: 24, y: 8 }));
    expect(result).toMatchObject({ status: 'lost', reason: 'ambiguous' });
    if (result.status !== 'lost') throw new Error('Ambiguity was accepted');
    expect(result.margin).toBeCloseTo(0);
  });

  it('rejects low-texture seeds, malformed input, oversized frames and unsupported settings', () => {
    const original = frame(12, 8, 0);
    expect(() => new RegionTracker({ ...original, pixels: new Uint8Array(width * height).fill(40) }, target(12, 8))).toThrow('texture');
    expect(() => new RegionTracker(original, { x: 0.9, y: 0, width: 0.2, height: 0.5 })).toThrow('inside');
    expect(() => new RegionTracker(original, { x: 0, y: 0 } as TrackingRegion)).toThrow('inside');
    expect(() => new RegionTracker(original, { x: 0, y: 0, width: 0.01, height: 0.01 })).toThrow('larger');
    expect(() => new RegionTracker({ ...original, width: 641 }, target(12, 8))).toThrow('bounded');
    expect(() => new RegionTracker({ ...original, pixels: new Uint8Array(1) }, target(12, 8))).toThrow('complete');
    expect(() => new RegionTracker(original, target(12, 8), { searchRadius: 65 })).toThrow('settings');
  });

  it('preserves frame ownership, requires increasing times and stays within source borders', () => {
    const original = frame(0, 0, 2), before = original.pixels.slice();
    const tracker = new RegionTracker(original, target(0, 0), { searchRadius: 6 });
    const next = frame(1, 2, 2.1), nextBefore = next.pixels.slice();
    const result = tracker.next(next);
    expect(result.status).toBe('tracked');
    expect(original.pixels).toEqual(before);
    expect(next.pixels).toEqual(nextBefore);
    expect(() => tracker.next(frame(1, 2, 2))).toThrow('increase');
    expect(() => tracker.next({ ...frame(1, 2, 2.2), width: 47, pixels: new Uint8Array(47 * height) })).toThrow('dimensions');
  });

  it('converts complete RGBA source pixels to grayscale and validates timestamps', () => {
    const rgba = new Uint8ClampedArray(8 * 8 * 4);
    rgba.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
    const gray = trackingGray({ width: 8, height: 8, time: 3.75, rgba });
    expect(Array.from(gray.pixels.slice(0, 3))).toEqual([76, 149, 28]);
    expect(gray.time).toBe(3.75);
    expect(() => trackingGray({ width: 8, height: 8, time: -1, rgba })).toThrow('timestamp');
    expect(() => trackingGray({ width: 8, height: 8, time: 0, rgba: new Uint8ClampedArray(1) })).toThrow('complete');
  });
});
