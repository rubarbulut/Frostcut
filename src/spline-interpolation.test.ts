import { describe, expect, it } from 'vitest';
import {
  BEZIER_PRESETS,
  catmullRom,
  CubicBezier,
  hermiteSpline,
  interpolateSplineKeyframes,
  type SplineKeyframe,
} from './spline-interpolation';

describe('spline and keyframe animation engine', () => {
  it('evaluates linear cubic Bezier identically to linear progression', () => {
    const linear = new CubicBezier(...BEZIER_PRESETS.linear);
    expect(linear.evaluate(0)).toBeCloseTo(0, 4);
    expect(linear.evaluate(0.25)).toBeCloseTo(0.25, 4);
    expect(linear.evaluate(0.5)).toBeCloseTo(0.5, 4);
    expect(linear.evaluate(0.75)).toBeCloseTo(0.75, 4);
    expect(linear.evaluate(1)).toBeCloseTo(1, 4);
  });

  it('evaluates ease-in and ease-out curves correctly', () => {
    const easeIn = new CubicBezier(...BEZIER_PRESETS.easeIn);
    // Ease-in starts slowly: at t=0.5, value is less than 0.5
    expect(easeIn.evaluate(0.5)).toBeLessThan(0.5);

    const easeOut = new CubicBezier(...BEZIER_PRESETS.easeOut);
    // Ease-out starts fast: at t=0.5, value is greater than 0.5
    expect(easeOut.evaluate(0.5)).toBeGreaterThan(0.5);
  });

  it('interpolates Catmull-Rom spline through control points', () => {
    // When t=0, it should equal p1; when t=1, it should equal p2
    const p0 = 0, p1 = 10, p2 = 20, p3 = 15;
    expect(catmullRom(p0, p1, p2, p3, 0)).toBeCloseTo(10, 4);
    expect(catmullRom(p0, p1, p2, p3, 1)).toBeCloseTo(20, 4);
    // Midpoint should be smoothly between 10 and 20
    const mid = catmullRom(p0, p1, p2, p3, 0.5);
    expect(mid).toBeGreaterThan(10);
    expect(mid).toBeLessThan(20);
  });

  it('interpolates Hermite spline with specified tangents', () => {
    const p0 = 0, m0 = 1, p1 = 1, m1 = 1;
    expect(hermiteSpline(p0, m0, p1, m1, 0)).toBeCloseTo(0, 4);
    expect(hermiteSpline(p0, m0, p1, m1, 1)).toBeCloseTo(1, 4);
    expect(hermiteSpline(p0, m0, p1, m1, 0.5)).toBeCloseTo(0.5, 4);
  });

  it('interpolates spline keyframes with custom Bezier curve', () => {
    const frames: SplineKeyframe[] = [
      { time: 0, value: 100, easing: 'bezier', bezier: BEZIER_PRESETS.easeInOut },
      { time: 2, value: 200 },
    ];

    expect(interpolateSplineKeyframes(frames, 0, 0)).toBe(100);
    expect(interpolateSplineKeyframes(frames, 2, 0)).toBe(200);

    // At halfway time (time = 1.0), easeInOut should evaluate near midpoint
    const midVal = interpolateSplineKeyframes(frames, 1, 0);
    expect(midVal).toBeCloseTo(150, 1);
  });
});
