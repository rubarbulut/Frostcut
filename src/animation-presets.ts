import { type Clip, type Project, uid } from './model';
import {
  animatedProperties,
  clampMotion,
  presetKeyframes,
  interpolateKeyframes,
  type KeyframeTracks,
} from './motion';
export type SavedAnimation = { id: string; name: string; tracks: KeyframeTracks };
export function captureAnimation(p: Project, clip: Clip, name: string): SavedAnimation {
  const tracks =
    clip.keyframes ??
    presetKeyframes(clip, clip.properties.animation, p.settings.width, p.settings.height);
  const length = clip.sourceEnd - clip.sourceStart;
  return {
    id: uid(),
    name: name.trim().slice(0, 60),
    tracks: Object.fromEntries(
      animatedProperties.map((key) => {
        const dimension = key === 'x' ? p.settings.width : key === 'y' ? p.settings.height : 1;
        const frames = tracks[key] ?? [];
        const selected = [
          {
            time: clip.sourceStart,
            value: interpolateKeyframes(frames, clip.sourceStart, clip.properties[key]),
            easing:
              frames.filter((f) => f.time <= clip.sourceStart).at(-1)?.easing ??
              ('linear' as const),
          },
          ...frames.filter((f) => f.time > clip.sourceStart && f.time < clip.sourceEnd),
          {
            time: clip.sourceEnd,
            value: interpolateKeyframes(frames, clip.sourceEnd, clip.properties[key]),
            easing: 'linear' as const,
          },
        ];
        if (selected.length > 258)
          throw new Error(
            'This trimmed animation has too many keyframes to save. Remove a few unused keyframes first.',
          );
        return [
          key,
          selected.map((f) => ({
            ...f,
            time: (f.time - clip.sourceStart) / length,
            value: f.value / dimension,
          })),
        ];
      }),
    ),
  };
}
export function applyAnimation(p: Project, clip: Clip, preset: SavedAnimation): Clip {
  return {
    ...clip,
    properties: { ...clip.properties, animation: 'Custom' },
    keyframes: Object.fromEntries(
      animatedProperties.map((key) => [
        key,
        (preset.tracks[key] ?? []).map((f) => ({
          ...f,
          time: clip.sourceStart + f.time * (clip.sourceEnd - clip.sourceStart),
          value: clampMotion(
            key,
            f.value * (key === 'x' ? p.settings.width : key === 'y' ? p.settings.height : 1),
          ),
        })),
      ]),
    ),
  };
}
