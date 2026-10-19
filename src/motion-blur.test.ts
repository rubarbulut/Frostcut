import { describe, expect, it } from 'vitest';
import {
  computeNormalizedMotionBlurVector,
  computeVelocityAt,
  defaultMotionBlurConfig,
  generateGaussianSampleWeights,
  MOTION_BLUR_GLSL,
} from './motion-blur';
import type { Keyframe } from './motion';

describe('dynamic motion blur and shutter angle engine', () => {
  it('calculates velocity accurately from linear keyframes', () => {
    // Moves from x=0 to x=100 in 2 seconds -> velocity = 50 px/s
    const framesX: Keyframe[] = [
      { time: 0, value: 0 },
      { time: 2, value: 100 },
    ];
    const velocity = computeVelocityAt(framesX, undefined, 1.0, 0, 0);
    expect(velocity.vx).toBeCloseTo(50, 1);
    expect(velocity.vy).toBe(0);
  });

  it('computes normalized motion blur displacement from shutter angle', () => {
    const velocity = { vx: 1920, vy: 0 }; // Moving at 1 screen width per second
    // At 180 deg shutter (1/60s exposure) on a 1920px wide canvas at 30fps:
    // displacement = (1920 * (180/360) * (1/30)) / 1920 = 1 / 60 = 0.01666...
    const vector = computeNormalizedMotionBlurVector(velocity, 1920, 1080, 180, 30);
    expect(vector.du).toBeCloseTo(1 / 60, 4);
    expect(vector.dv).toBe(0);
  });

  it('generates normalized Gaussian kernel weights that sum to 1.0', () => {
    const weights8 = generateGaussianSampleWeights(8);
    expect(weights8).toHaveLength(8);
    const sum = weights8.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);

    // Center weights must be higher than peripheral weights
    expect(weights8[3]).toBeGreaterThan(weights8[0]);
    expect(weights8[4]).toBeGreaterThan(weights8[7]);
  });

  it('contains valid motion blur GLSL shader routine', () => {
    expect(MOTION_BLUR_GLSL).toContain('applyMotionBlurGlsl');
    expect(MOTION_BLUR_GLSL).toContain('motionVector');
  });

  it('provides sensible default cinema settings', () => {
    const config = defaultMotionBlurConfig();
    expect(config.shutterAngle).toBe(180);
    expect(config.samples).toBe(8);
    expect(config.fps).toBe(30);
  });
});
