import { describe, expect, it } from 'vitest';
import { defaultProps } from './model';
import {
  interpolateKeyframes,
  presetKeyframes,
  setAnimatedValue,
  toggleKeyframe,
  transformAt,
} from './motion';
describe('source-aware motion', () => {
  const clip = () => ({
    start: 10,
    sourceStart: 2,
    sourceEnd: 6,
    properties: { ...defaultProps, speed: 2 },
  });
  it('interpolates source timestamps and follows a moved, trimmed, sped-up clip', () => {
    const c = {
      ...clip(),
      keyframes: {
        x: [
          { time: 2, value: 0 },
          { time: 6, value: 100 },
        ],
      },
    };
    expect(transformAt(c, 11, 1080, 1920).x).toBe(50);
    expect(transformAt({ ...c, start: 20, sourceStart: 4 }, 20, 1080, 1920).x).toBe(50);
    expect(transformAt(c, 15, 1080, 1920).x).toBe(100);
  });
  it('has deterministic smooth easing and endpoints', () => {
    const frames = [
      { time: 0, value: 0, easing: 'smooth' as const },
      { time: 4, value: 100 },
    ];
    expect(interpolateKeyframes(frames, 1, 1)).toBe(15.625);
    expect(interpolateKeyframes(frames, -1, 1)).toBe(0);
  });
  it('creates editable preset tracks without mutating static properties', () => {
    const c = clip();
    const keys = presetKeyframes(c, 'Punch In', 1080, 1920);
    expect(transformAt({ ...c, keyframes: keys }, 12, 1080, 1920).scale).toBe(1.15);
    expect(c.properties.scale).toBe(1);
    expect(presetKeyframes(c, 'Shake', 1080, 1920).x).toHaveLength(65);
  });
  it('adds, edits and removes a playhead keyframe without changing another time', () => {
    const c = toggleKeyframe(clip(), 'x', 11, 1080, 1920);
    const changed = setAnimatedValue(c, 'x', 80, 11, 1080, 1920);
    expect(transformAt(changed, 10, 1080, 1920).x).toBe(0);
    expect(transformAt(changed, 11, 1080, 1920).x).toBe(80);
    const removed = toggleKeyframe(changed, 'x', 11, 1080, 1920);
    expect(transformAt(removed, 11, 1080, 1920).x).toBe(0);
  });
});
