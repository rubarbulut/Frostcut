import { useState } from 'react';
import { Diamond, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useEditor } from './store';
import { clipEnd, isLocked, timecode, type Clip, type ClipProps } from './model';
import {
  animatedProperties,
  clampMotion,
  presetKeyframes,
  setAnimatedValue,
  toggleKeyframe,
  transformAt,
  type AnimatedProperty,
} from './motion';
import { dragClipProperties } from './clip-drag';
import { Field } from './components';
const labels = {
  x: 'Position X',
  y: 'Position Y',
  scale: 'Scale',
  rotation: 'Rotation °',
  opacity: 'Opacity',
  crop: 'Crop %',
  speed: 'Speed ×',
};
const limits = (key: keyof typeof labels) =>
  key === 'scale'
    ? [0.1, 5, 0.01]
    : key === 'speed'
      ? [0.25, 4, 0.01]
      : key === 'opacity'
        ? [0, 1, 0.01]
        : key === 'crop'
          ? [0, 45, 0.1]
          : [-10000, 10000, key === 'rotation' ? 0.5 : 1];
export function TransformControls({ clip: original }: { clip: Clip }) {
  const { project: p, commit, playhead, previewClip, seek, setPlaying } = useEditor();
  const clip = previewClip?.id === original.id ? previewClip : original;
  const values = transformAt(clip, playhead, p.settings.width, p.settings.height);
  const sourceTime = clip.sourceStart + (playhead - clip.start) * clip.properties.speed;
  const inside = playhead >= clip.start && playhead <= clipEnd(clip),
    locked = isLocked(p, clip);
  const [property, setProperty] = useState<AnimatedProperty>('scale');
  function save(next: Clip, label: string) {
    commit({ ...p, clips: p.clips.map((c) => (c.id === clip.id ? next : c)) }, label);
  }
  function changed(key: keyof typeof labels, value: number): Clip {
    const [min, max] = limits(key),
      clamped = Math.max(min, Math.min(max, value));
    return animatedProperties.includes(key as AnimatedProperty)
      ? setAnimatedValue(
          original,
          key as AnimatedProperty,
          clamped,
          playhead,
          p.settings.width,
          p.settings.height,
        )
      : { ...original, properties: { ...original.properties, [key]: clamped } };
  }
  const frames = clip.keyframes?.[property] ?? [];
  const visibleFrames = frames.filter(
    (f) => f.time >= clip.sourceStart && f.time <= clip.sourceEnd,
  );
  return (
    <fieldset disabled={locked} className="transform-controls">
      <div className="number-grid">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => {
          const animated = animatedProperties.includes(key as AnimatedProperty);
          const keys = animated ? (clip.keyframes?.[key as AnimatedProperty] ?? []) : [];
          const onFrame = keys.some((f) => Math.abs(f.time - sourceTime) < 0.001);
          const [min, max, step] = limits(key);
          return (
            <div className="transform-field" key={key}>
              <label className="field">
                <span
                  className="draggable-number-label"
                  title="Drag left or right to adjust"
                  onPointerDown={(e) => {
                    if (!locked)
                      dragClipProperties(e, original, `Adjust ${labels[key]}`, (dx) =>
                        changed(key, values[key] + dx * step),
                      );
                  }}
                >
                  {labels[key]}
                </span>
                <input
                  aria-label={labels[key]}
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={Number(values[key].toFixed(3))}
                  onChange={(e) => {
                    if (e.target.value !== '' && Number.isFinite(+e.target.value))
                      save(changed(key, +e.target.value), `Change ${labels[key]}`);
                  }}
                />
              </label>
              {animated && (
                <button
                  className={`icon keyframe-diamond ${onFrame ? 'active' : ''}`}
                  aria-label={`${onFrame ? 'Remove' : 'Add'} ${labels[key]} keyframe`}
                  disabled={!inside || locked}
                  onClick={() => {
                    save(
                      toggleKeyframe(
                        clip,
                        key as AnimatedProperty,
                        playhead,
                        p.settings.width,
                        p.settings.height,
                      ),
                      'Toggle keyframe',
                    );
                    setProperty(key as AnimatedProperty);
                  }}
                >
                  <Diamond size={12} fill={onFrame ? 'currentColor' : 'none'} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="property-divider" />
      <div className="section-heading">
        <Diamond size={16} />
        <b>Animation</b>
      </div>
      <Field label="Motion preset">
        <select
          value={clip.properties.animation}
          onChange={(e) => {
            const preset = e.target.value;
            save(
              {
                ...clip,
                properties: { ...clip.properties, animation: preset },
                keyframes: Object.fromEntries(
                  Object.entries(
                    presetKeyframes(clip, preset, p.settings.width, p.settings.height),
                  ).map(([key, frames]) => [
                    key,
                    frames.map((f) => ({
                      ...f,
                      value: clampMotion(key as AnimatedProperty, f.value),
                    })),
                  ]),
                ),
              },
              'Apply motion preset',
            );
          }}
        >
          {[
            'None',
            'Punch In',
            'Punch Out',
            'Smooth Zoom',
            'Bounce',
            'Slide Left',
            'Slide Right',
            'Shake',
            ...(clip.properties.animation === 'Custom' ? ['Custom'] : []),
          ].map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </Field>
      <Field label="Keyframe property">
        <select value={property} onChange={(e) => setProperty(e.target.value as AnimatedProperty)}>
          {animatedProperties.map((key) => (
            <option key={key} value={key}>
              {labels[key]}
            </option>
          ))}
        </select>
      </Field>
      <div className="keyframe-nav">
        <button
          className="icon"
          aria-label="Previous keyframe"
          disabled={!visibleFrames.some((f) => f.time < sourceTime - 0.001)}
          onClick={() => {
            const f = visibleFrames.filter((f) => f.time < sourceTime - 0.001).at(-1)!;
            setPlaying(false);
            seek(clip.start + (f.time - clip.sourceStart) / clip.properties.speed);
          }}
        >
          <ChevronLeft size={15} />
        </button>
        <span>
          {visibleFrames.length} keyframes · {timecode(playhead, true)}
        </span>
        <button
          className="icon"
          aria-label="Next keyframe"
          disabled={!visibleFrames.some((f) => f.time > sourceTime + 0.001)}
          onClick={() => {
            const f = visibleFrames.find((f) => f.time > sourceTime + 0.001)!;
            setPlaying(false);
            seek(clip.start + (f.time - clip.sourceStart) / clip.properties.speed);
          }}
        >
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="keyframe-list">
        {visibleFrames.map((frame) => (
          <div key={frame.time}>
            <button
              className="text-button"
              onClick={() => {
                setPlaying(false);
                seek(clip.start + (frame.time - clip.sourceStart) / clip.properties.speed);
              }}
            >
              {timecode(clip.start + (frame.time - clip.sourceStart) / clip.properties.speed, true)}
            </button>
            <select
              aria-label={`Easing at ${frame.time}`}
              value={frame.easing ?? 'linear'}
              onChange={(e) => {
                const next = structuredClone(clip);
                next.keyframes![property]!.find((f) => f.time === frame.time)!.easing = e.target
                  .value as 'linear' | 'smooth';
                save(next, 'Keyframe easing');
              }}
            >
              <option value="linear">Linear</option>
              <option value="smooth">Smooth</option>
            </select>
            <button
              className="icon"
              aria-label={`Delete keyframe at ${frame.time}`}
              onClick={() => {
                const next = structuredClone(clip);
                next.keyframes![property] = frames.filter((f) => f.time !== frame.time);
                save(next, 'Delete keyframe');
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
      <small className="subtle">
        {inside
          ? 'Diamonds set a keyframe at the playhead. Drag a value or resize the preview. Animation is included in export.'
          : 'Move the playhead inside this clip to add a keyframe.'}
      </small>
    </fieldset>
  );
}
