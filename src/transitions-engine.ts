export type TransitionType =
  | 'cross-dissolve'
  | 'luma-wipe'
  | 'whip-pan'
  | 'cross-zoom'
  | 'glitch-split'
  | 'directional-wipe';

export type TransitionConfig = {
  type: TransitionType;
  duration: number; // Duration in seconds
  direction?: 'left' | 'right' | 'up' | 'down';
  softness?: number; // 0 to 1
  intensity?: number; // 0 to 1
};

export const defaultTransition = (type: TransitionType = 'cross-dissolve'): TransitionConfig => ({
  type,
  duration: 0.5,
  direction: 'right',
  softness: 0.2,
  intensity: 0.5,
});

export function computeTransitionProgress(
  time: number,
  transitionStart: number,
  duration: number,
): number {
  if (duration <= 0) return time >= transitionStart ? 1.0 : 0.0;
  const p = (time - transitionStart) / duration;
  return Math.max(0, Math.min(1, p));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(0.00001, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export const TRANSITION_SHADERS_GLSL = `
// Uniforms:
// uniform sampler2D texFrom;
// uniform sampler2D texTo;
// uniform float progress; // 0.0 to 1.0
// uniform vec2 resolution;

// 1. Cross Dissolve (Smooth power crossfade)
vec4 transitionCrossDissolve(vec2 uv, sampler2D from, sampler2D to, float p) {
  vec4 cFrom = texture2D(from, uv);
  vec4 cTo = texture2D(to, uv);
  float mixFactor = smoothstep(0.0, 1.0, p);
  return mix(cFrom, cTo, mixFactor);
}

// 2. Luma Wipe (Gradient luminance transition)
vec4 transitionLumaWipe(vec2 uv, sampler2D from, sampler2D to, float p, float softness) {
  vec4 cFrom = texture2D(from, uv);
  vec4 cTo = texture2D(to, uv);
  float luma = dot(cFrom.rgb, vec3(0.2126, 0.7152, 0.0722));
  float soft = max(0.001, softness);
  float threshold = mix(-soft, 1.0 + soft, p);
  float a = smoothstep(threshold - soft, threshold + soft, luma);
  return mix(cTo, cFrom, a);
}

// 3. Whip Pan (Directional pan with motion blur)
vec4 transitionWhipPan(vec2 uv, sampler2D from, sampler2D to, float p, vec2 dir) {
  float ease = smoothstep(0.0, 1.0, p);
  vec2 offset = dir * ease;
  vec2 uvFrom = uv + offset;
  vec2 uvTo = uv - dir * (1.0 - ease);

  // Accumulate samples along motion direction to simulate high-speed pan blur
  vec4 cFrom = vec4(0.0);
  vec4 cTo = vec4(0.0);
  float blurAmount = sin(p * 3.14159265) * 0.05;

  for (int i = 0; i < 5; i++) {
    float stepFrac = (float(i) / 4.0 - 0.5) * blurAmount;
    cFrom += texture2D(from, clamp(uvFrom + dir * stepFrac, 0.0, 1.0));
    cTo += texture2D(to, clamp(uvTo + dir * stepFrac, 0.0, 1.0));
  }
  cFrom *= 0.2;
  cTo *= 0.2;

  return mix(cFrom, cTo, step(0.5, p));
}

// 4. Cross Zoom (Center optic zoom with radial dispersion)
vec4 transitionCrossZoom(vec2 uv, sampler2D from, sampler2D to, float p, float strength) {
  vec2 center = vec2(0.5, 0.5);
  float s = strength * 0.4;
  float zoom = sin(p * 3.14159265);

  vec2 uvFrom = (uv - center) * (1.0 + zoom * s) + center;
  vec2 uvTo = (uv - center) * (1.0 + (1.0 - zoom) * s * 0.5) + center;

  vec4 cFrom = texture2D(from, clamp(uvFrom, 0.0, 1.0));
  vec4 cTo = texture2D(to, clamp(uvTo, 0.0, 1.0));
  return mix(cFrom, cTo, smoothstep(0.4, 0.6, p));
}

// 5. Glitch / RGB Split Transition
vec4 transitionGlitchSplit(vec2 uv, sampler2D from, sampler2D to, float p, float intensity) {
  float glitchTime = sin(p * 3.14159265);
  float jitter = sin(uv.y * 80.0 + p * 20.0) * glitchTime * 0.05 * intensity;
  vec2 splitUv = uv + vec2(jitter, 0.0);

  vec4 base = mix(texture2D(from, uv), texture2D(to, uv), p);
  float r = mix(texture2D(from, splitUv + vec2(0.02 * glitchTime, 0.0)).r, texture2D(to, splitUv + vec2(0.02 * glitchTime, 0.0)).r, p);
  float b = mix(texture2D(from, splitUv - vec2(0.02 * glitchTime, 0.0)).b, texture2D(to, splitUv - vec2(0.02 * glitchTime, 0.0)).b, p);

  return vec4(r, base.g, b, base.a);
}
`;
