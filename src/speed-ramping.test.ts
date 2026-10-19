import { describe, expect, it } from 'vitest';
import {
  buildRampFromSpeedProfile,
  SpeedRampingEngine,
  type TimeRemapPoint,
} from './speed-ramping';

describe('variable speed ramping and time remapping engine', () => {
  it('evaluates linear speed ramp correctly', () => {
    // 0s -> 0s source, 2s -> 4s source (2x speed)
    const points: TimeRemapPoint[] = [
      { timelineTime: 0, sourceTime: 0 },
      { timelineTime: 2, sourceTime: 4 },
    ];
    const engine = new SpeedRampingEngine(points);

    expect(engine.evaluateSourceTime(0)).toBe(0);
    expect(engine.evaluateSourceTime(1)).toBe(2);
    expect(engine.evaluateSourceTime(2)).toBe(4);

    // Instantaneous speed should be 2.0
    expect(engine.evaluateInstantaneousSpeed(1)).toBeCloseTo(2.0, 2);
  });

  it('evaluates smooth speed ramp with S-curve interpolation', () => {
    const points: TimeRemapPoint[] = [
      { timelineTime: 0, sourceTime: 0, easing: 'smooth' },
      { timelineTime: 4, sourceTime: 4 },
    ];
    const engine = new SpeedRampingEngine(points);

    // Halfway through smooth ramp
    expect(engine.evaluateSourceTime(2)).toBe(2);
    // At quarter way (t=1), smooth curve should have advanced less than linear t=1
    expect(engine.evaluateSourceTime(1)).toBeLessThan(1.0);
  });

  it('builds multi-zone speed profile ramp accurately', () => {
    // 2s at 1x speed (advances 2s in source), then 2s at 0.5x slow-mo (advances 1s in source)
    const points = buildRampFromSpeedProfile(10.0, [
      { duration: 2, speed: 1.0 },
      { duration: 2, speed: 0.5 },
    ]);

    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ timelineTime: 0, sourceTime: 10.0, easing: 'linear' });
    expect(points[1]).toEqual({ timelineTime: 2, sourceTime: 12.0, easing: 'linear' });
    expect(points[2]).toEqual({ timelineTime: 4, sourceTime: 13.0, easing: 'linear' });

    const engine = new SpeedRampingEngine(points);
    expect(engine.evaluateSourceTime(0)).toBe(10.0);
    expect(engine.evaluateSourceTime(2)).toBe(12.0);
    expect(engine.evaluateSourceTime(4)).toBe(13.0);
  });
});
