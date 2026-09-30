import type { AspectFillMode, ClipProps } from './model';
import { trackingOffsetAt, type ClipTracking } from './tracking-data';
export const animatedProperties = ['x', 'y', 'scale', 'rotation', 'opacity'] as const;
export type AnimatedProperty = (typeof animatedProperties)[number];
export type Keyframe = { time: number; value: number; easing?: 'linear' | 'smooth' };
export type KeyframeTracks = Partial<Record<AnimatedProperty, Keyframe[]>>;
export const clampMotion = (property: AnimatedProperty, value: number) =>
  Math.max(
    property === 'scale' ? 0.1 : property === 'opacity' ? 0 : -10000,
    Math.min(property === 'scale' ? 5 : property === 'opacity' ? 1 : 10000, value),
  );
export type MotionClip = {
  start: number;
  sourceStart: number;
  sourceEnd: number;
  properties: ClipProps;
  keyframes?: KeyframeTracks;
  tracking?: ClipTracking;
};
export function interpolateKeyframes(
  frames: Keyframe[] | undefined,
  sourceTime: number,
  fallback: number,
) {
  if (!frames?.length) return fallback;
  if (sourceTime <= frames[0].time) return frames[0].value;
  for (let i = 1; i < frames.length; i++) {
    const next = frames[i],
      previous = frames[i - 1];
    if (sourceTime > next.time) continue;
    const t = Math.max(0, Math.min(1, (sourceTime - previous.time) / (next.time - previous.time)));
    const eased = previous.easing === 'smooth' ? t * t * (3 - 2 * t) : t;
    return previous.value + (next.value - previous.value) * eased;
  }
  return frames.at(-1)!.value;
}
export function presetKeyframes(
  c: MotionClip,
  preset: string,
  width: number,
  height: number,
): KeyframeTracks {
  const frame = (
    fraction: number,
    value: number,
    easing: 'smooth' | 'linear' = 'linear',
  ): Keyframe => ({
    time: c.sourceStart + (c.sourceEnd - c.sourceStart) * fraction,
    value,
    easing,
  });
  const props = c.properties;
  if (preset === 'Punch In')
    return {
      scale: [
        frame(0, props.scale, 'smooth'),
        frame(0.2, props.scale * 1.15),
        frame(1, props.scale * 1.15),
      ],
    };
  if (preset === 'Punch Out')
    return {
      scale: [
        frame(0, props.scale * 1.15, 'smooth'),
        frame(0.2, props.scale),
        frame(1, props.scale),
      ],
    };
  if (preset === 'Smooth Zoom')
    return { scale: [frame(0, props.scale, 'smooth'), frame(1, props.scale * 1.18)] };
  if (preset === 'Slide Left' || preset === 'Slide Right')
    return {
      x: [
        frame(0, props.x + (preset === 'Slide Left' ? 1 : -1) * width * 0.35, 'smooth'),
        frame(0.25, props.x),
        frame(1, props.x),
      ],
    };
  if (preset === 'Bounce')
    return {
      y: Array.from({ length: 33 }, (_, i) =>
        frame(i / 32, props.y - Math.sin((i / 32) * 12) * Math.exp((-i / 32) * 7) * height * 0.04),
      ),
    };
  if (preset === 'Shake')
    return {
      x: Array.from({ length: 65 }, (_, i) =>
        frame(i / 64, props.x + Math.sin((i / 64) * Math.PI * 16) * width * 0.008),
      ),
    };
  return {};
}
export function baseTransformAt(c: MotionClip, time: number, width: number, height: number) {
  const sourceTime = c.sourceStart + (time - c.start) * c.properties.speed;
  const tracks = c.keyframes ?? presetKeyframes(c, c.properties.animation, width, height);
  return {
    ...c.properties,
    ...Object.fromEntries(
      animatedProperties.map((key) => [
        key,
        clampMotion(key, interpolateKeyframes(tracks[key], sourceTime, c.properties[key])),
      ]),
    ),
  } as ClipProps;
}
export function transformAt(c: MotionClip, time: number, width: number, height: number, fillMode?: AspectFillMode) {
  const base = baseTransformAt(c, time, width, height);
  const sourceTime = c.sourceStart + (time - c.start) * c.properties.speed;
  const offset = trackingOffsetAt(c.tracking, sourceTime, width, height, base, fillMode);
  return { ...base, x: base.x + offset.x, y: base.y + offset.y };
}
export function setAnimatedValue<T extends MotionClip>(
  clip: T,
  property: AnimatedProperty,
  value: number,
  time: number,
  width: number,
  height: number,
): T {
  const c = structuredClone(clip);
  value = clampMotion(property, value);
  const tracks =
    c.keyframes ??
    (c.properties.animation === 'None'
      ? {}
      : presetKeyframes(c, c.properties.animation, width, height));
  if (!tracks[property]?.length) {
    c.properties[property] = value;
    return c;
  }
  c.keyframes = tracks;
  c.properties.animation = 'Custom';
  const sourceTime = Math.max(
    c.sourceStart,
    Math.min(c.sourceEnd, c.sourceStart + (time - c.start) * c.properties.speed),
  );
  const frames = tracks[property]!;
  const existing = frames.find((f) => Math.abs(f.time - sourceTime) < 0.001);
  if (existing) existing.value = value;
  else frames.push({ time: sourceTime, value });
  frames.sort((a, b) => a.time - b.time);
  return c;
}
export function toggleKeyframe<T extends MotionClip>(
  clip: T,
  property: AnimatedProperty,
  time: number,
  width: number,
  height: number,
): T {
  const c = structuredClone(clip),
    sourceTime = Math.max(
      c.sourceStart,
      Math.min(c.sourceEnd, c.sourceStart + (time - c.start) * c.properties.speed),
    );
  const value = baseTransformAt(c, time, width, height)[property];
  c.keyframes ??= presetKeyframes(c, c.properties.animation, width, height);
  const frames = c.keyframes[property] ?? [];
  const existing = frames.findIndex((f) => Math.abs(f.time - sourceTime) < 0.001);
  if (existing >= 0) frames.splice(existing, 1);
  else {
    if (!frames.length && sourceTime > c.sourceStart + 0.001)
      frames.push({ time: c.sourceStart, value: c.properties[property] });
    frames.push({ time: sourceTime, value });
  }
  c.keyframes[property] = frames.sort((a, b) => a.time - b.time);
  c.properties.animation = 'Custom';
  if (!frames.length) c.properties[property] = value;
  return c;
}
