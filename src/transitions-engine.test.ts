import { describe, expect, it } from 'vitest';
import {
  computeTransitionProgress,
  defaultTransition,
  smoothstep,
  TRANSITION_SHADERS_GLSL,
} from './transitions-engine';

describe('video transition engine', () => {
  it('computes clamped transition progress correctly', () => {
    // Before transition start: progress is 0
    expect(computeTransitionProgress(1.0, 2.0, 1.0)).toBe(0);
    // At midpoint: progress is 0.5
    expect(computeTransitionProgress(2.5, 2.0, 1.0)).toBeCloseTo(0.5, 4);
    // At end: progress is 1.0
    expect(computeTransitionProgress(3.0, 2.0, 1.0)).toBe(1.0);
    // After transition: progress clamped to 1.0
    expect(computeTransitionProgress(4.0, 2.0, 1.0)).toBe(1.0);
  });

  it('evaluates smoothstep Hermite polynomial correctly', () => {
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 4);
    // Easing behavior: slow start
    expect(smoothstep(0, 1, 0.2)).toBeLessThan(0.2);
    // Fast end
    expect(smoothstep(0, 1, 0.8)).toBeGreaterThan(0.8);
  });

  it('creates valid default transition configs', () => {
    const dissolve = defaultTransition('cross-dissolve');
    expect(dissolve.type).toBe('cross-dissolve');
    expect(dissolve.duration).toBe(0.5);

    const whip = defaultTransition('whip-pan');
    expect(whip.direction).toBe('right');
  });

  it('contains valid GLSL transition function signatures', () => {
    expect(TRANSITION_SHADERS_GLSL).toContain('transitionCrossDissolve');
    expect(TRANSITION_SHADERS_GLSL).toContain('transitionLumaWipe');
    expect(TRANSITION_SHADERS_GLSL).toContain('transitionWhipPan');
    expect(TRANSITION_SHADERS_GLSL).toContain('transitionCrossZoom');
    expect(TRANSITION_SHADERS_GLSL).toContain('transitionGlitchSplit');
  });
});
