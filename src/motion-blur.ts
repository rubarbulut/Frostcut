import type { Keyframe } from './motion';
import { interpolateKeyframes } from './motion';

export type Velocity2D = {
  vx: number; // pixels per second
  vy: number; // pixels per second
  vScale: number; // scale change per second
  vRotation: number; // degrees per second
};

export type MotionBlurConfig = {
  enabled: boolean;
  shutterAngle: number; // degrees (default: 180, pro max: 360)
  samples: number; // subframe accumulation count (e.g., 5 to 16)
  fps: number; // sequence framerate
};

export const defaultMotionBlurConfig = (): MotionBlurConfig => ({
  enabled: true,
  shutterAngle: 180,
  samples: 8,
  fps: 30,
});

export function computeVelocityAt(
  framesX: Keyframe[] | undefined,
  framesY: Keyframe[] | undefined,
  time: number,
  fallbackX = 0,
  fallbackY = 0,
  dt = 0.005,
): { vx: number; vy: number } {
  const xPre = interpolateKeyframes(framesX, time - dt, fallbackX);
  const xPost = interpolateKeyframes(framesX, time + dt, fallbackX);

  const yPre = interpolateKeyframes(framesY, time - dt, fallbackY);
  const yPost = interpolateKeyframes(framesY, time + dt, fallbackY);

  const inv2Dt = 1 / (2 * dt);
  return {
    vx: (xPost - xPre) * inv2Dt,
    vy: (yPost - yPre) * inv2Dt,
  };
}

export function computeNormalizedMotionBlurVector(
  velocity: { vx: number; vy: number },
  width: number,
  height: number,
  shutterAngle = 180,
  fps = 30,
): { du: number; dv: number } {
  if (width <= 0 || height <= 0 || fps <= 0) return { du: 0, dv: 0 };
  const shutterFraction = Math.max(0, shutterAngle) / 360;
  const frameTime = 1 / fps;
  const blurDuration = shutterFraction * frameTime;

  return {
    du: (velocity.vx * blurDuration) / width,
    dv: (velocity.vy * blurDuration) / height,
  };
}

export function generateGaussianSampleWeights(sampleCount: number): number[] {
  const count = Math.max(1, sampleCount);
  if (count === 1) return [1.0];

  const weights: number[] = [];
  let sum = 0;
  const sigma = 0.5;

  for (let i = 0; i < count; i++) {
    const t = (i / (count - 1) - 0.5) * 2.0; // -1.0 to +1.0
    const w = Math.exp(-(t * t) / (2 * sigma * sigma));
    weights.push(w);
    sum += w;
  }

  return weights.map((w) => w / sum);
}

export const MOTION_BLUR_GLSL = `
// Directional 1D motion blur kernel driven by normalized keyframe velocity
vec4 applyMotionBlurGlsl(sampler2D image, vec2 uv, vec2 motionVector, int sampleCount) {
  if (length(motionVector) < 0.0001) {
    return texture2D(image, uv);
  }

  vec4 accum = vec4(0.0);
  float totalWeight = 0.0;
  float count = float(sampleCount);

  for (int i = 0; i < 16; i++) {
    if (i >= sampleCount) break;
    float frac = (float(i) / max(count - 1.0, 1.0)) - 0.5;
    vec2 offsetUv = clamp(uv + motionVector * frac, 0.0, 1.0);
    // Gaussian weight along velocity trajectory
    float w = exp(-4.0 * frac * frac);
    accum += texture2D(image, offsetUv) * w;
    totalWeight += w;
  }

  return accum / max(totalWeight, 0.00001);
}
`;
