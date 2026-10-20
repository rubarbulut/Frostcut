import { useState } from 'react';
import { Move, Diamond, Sparkles, Sliders } from 'lucide-react';
import { useEditor } from '../store';
import { clipEnd, isLocked, type Clip, defaultProps } from '../model';
import {
  animatedProperties,
  clampMotion,
  presetKeyframes,
  setAnimatedValue,
  toggleKeyframe,
  baseTransformAt,
  type AnimatedProperty,
} from '../motion';
import { AEGroup } from './AEGroup';
import { AEPropertyRow } from './AEPropertyRow';
import { AEScrubber } from './AEScrubber';
import { AEKeyframeStopwatch } from './AEKeyframeStopwatch';
import { SavedAnimations } from '../SavedAnimations';

/**
 * Resolves the fresh target clip from project state by ID, ensuring locked/deleted checks.
 */
export function resolveTargetClip(
  project: { clips: Clip[]; tracks?: any[]; id?: string },
  clipId: string,
): Clip | null {
  const target = project.clips.find((c) => c.id === clipId);
  if (!target || isLocked(project as any, target)) return null;
  return target;
}

/**
 * Computes next clip transform state from the latest project clip snapshot,
 * guaranteeing concurrent same-clip property modifications are preserved.
 */
export function computeNextTransformClip(
  currentProject: { clips: Clip[]; settings: { width: number; height: number }; id?: string },
  clipId: string,
  key: AnimatedProperty | 'crop',
  val: number,
  playhead: number,
): Clip | null {
  const target = resolveTargetClip(currentProject, clipId);
  if (!target) return null;
  if (animatedProperties.includes(key as AnimatedProperty)) {
    const animKey = key as AnimatedProperty;
    const clamped = clampMotion(animKey, val);
    return setAnimatedValue(
      target,
      animKey,
      clamped,
      playhead,
      currentProject.settings.width,
      currentProject.settings.height,
    );
  } else {
    return { ...target, properties: { ...target.properties, [key]: val } };
  }
}

export function AETransformControls({ clip: original }: { clip: Clip }) {
  const { project: p, commit, playhead, previewClip, seek, setPlaying, setPreviewClip } = useEditor();
  const currentTarget = resolveTargetClip(p, original.id);
  const clip = previewClip?.id === original.id ? previewClip : (currentTarget ?? original);
  const values = baseTransformAt(clip, playhead, p.settings.width, p.settings.height);
  const sourceTime = clip.sourceStart + (playhead - clip.start) * clip.properties.speed;
  const inside = playhead >= clip.start && playhead <= clipEnd(clip);
  const locked = !currentTarget || isLocked(p, currentTarget);

  const [activeProperty, setActiveProperty] = useState<AnimatedProperty>('scale');
  const [showKeyframeDrawer, setShowKeyframeDrawer] = useState(false);

  function getLatestTargetClip(): Clip | null {
    const current = useEditor.getState().project;
    if (current.id !== p.id) return null;
    return resolveTargetClip(current, original.id);
  }

  function save(next: Clip, label: string) {
    const current = useEditor.getState().project;
    if (current.id !== p.id) {
      setPreviewClip(undefined);
      return;
    }
    const target = resolveTargetClip(current, original.id);
    if (!target) {
      setPreviewClip(undefined);
      return;
    }
    commit({ ...current, clips: current.clips.map((c) => (c.id === original.id ? next : c)) }, label);
  }

  function getNextClip(key: AnimatedProperty | 'crop', val: number): Clip | null {
    const current = useEditor.getState().project;
    if (current.id !== p.id) return null;
    return computeNextTransformClip(current, original.id, key, val, playhead);
  }

  function handleScrub(key: AnimatedProperty | 'crop', val: number) {
    const next = getNextClip(key, val);
    if (!next) {
      setPreviewClip(undefined);
      return;
    }
    setPreviewClip(next);
  }

  function handleScrubEnd(key: AnimatedProperty | 'crop', val: number) {
    setPreviewClip(undefined);
    const next = getNextClip(key, val);
    if (!next) return;
    save(next, `Adjust ${key}`);
  }

  function handleScrubCancel() {
    setPreviewClip(undefined);
  }

  function changeProp(key: AnimatedProperty | 'crop', val: number) {
    handleScrubEnd(key, val);
  }

  function handleToggleKf(prop: AnimatedProperty) {
    const target = getLatestTargetClip();
    if (!target || !inside || locked) return;
    save(
      toggleKeyframe(target, prop, playhead, p.settings.width, p.settings.height),
      `Toggle ${prop} keyframe`,
    );
    setActiveProperty(prop);
  }

  function handleJumpKf(prop: AnimatedProperty, direction: 'prev' | 'next') {
    const frames = (clip.keyframes?.[prop] ?? [])
      .filter((f) => f.time >= clip.sourceStart && f.time <= clip.sourceEnd)
      .sort((a, b) => a.time - b.time);

    if (!frames.length) return;

    let targetTime: number | undefined;
    if (direction === 'prev') {
      const prior = frames.filter((f) => f.time < sourceTime - 0.005);
      if (prior.length) targetTime = prior[prior.length - 1].time;
    } else {
      const next = frames.find((f) => f.time > sourceTime + 0.005);
      if (next) targetTime = next.time;
    }

    if (targetTime !== undefined) {
      setPlaying(false);
      const timelinePos = clip.start + (targetTime - clip.sourceStart) / clip.properties.speed;
      seek(timelinePos);
    }
  }

  function getKfMeta(prop: AnimatedProperty) {
    const frames = (clip.keyframes?.[prop] ?? [])
      .filter((f) => f.time >= clip.sourceStart && f.time <= clip.sourceEnd)
      .sort((a, b) => a.time - b.time);

    const onFrame = frames.some((f) => Math.abs(f.time - sourceTime) < 0.005);
    const hasPrev = frames.some((f) => f.time < sourceTime - 0.005);
    const hasNext = frames.some((f) => f.time > sourceTime + 0.005);

    return {
      hasKeyframes: frames.length > 0,
      isOnKeyframe: onFrame,
      hasPrev,
      hasNext,
      frames,
    };
  }

  const handleResetTransform = () => {
    const target = getLatestTargetClip();
    if (!target || locked) return;
    save(
      {
        ...target,
        properties: {
          ...target.properties,
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          opacity: 1,
          crop: 0,
          animation: 'None',
        },
        keyframes: undefined,
      },
      'Reset Transform',
    );
  };

  const xKf = getKfMeta('x');
  const yKf = getKfMeta('y');
  const scaleKf = getKfMeta('scale');
  const rotKf = getKfMeta('rotation');
  const opKf = getKfMeta('opacity');

  const totalFrames =
    (clip.keyframes?.x?.length || 0) +
    (clip.keyframes?.y?.length || 0) +
    (clip.keyframes?.scale?.length || 0) +
    (clip.keyframes?.rotation?.length || 0) +
    (clip.keyframes?.opacity?.length || 0);

  return (
    <AEGroup
      title="Transform"
      icon={<Move size={13} />}
      defaultOpen={true}
      onReset={handleResetTransform}
      badge={totalFrames > 0 ? `${totalFrames} kf` : undefined}
    >
      <div className="ae-transform-body">
        {/* Position X / Y */}
        <AEPropertyRow
          label="Position"
          keyframeControl={
            <AEKeyframeStopwatch
              label="Position"
              hasKeyframes={xKf.hasKeyframes || yKf.hasKeyframes}
              isOnKeyframe={xKf.isOnKeyframe && yKf.isOnKeyframe}
              canKeyframe={inside && !locked}
              onToggle={() => {
                handleToggleKf('x');
                handleToggleKf('y');
              }}
              onPrev={() => {
                handleJumpKf('x', 'prev');
              }}
              onNext={() => {
                handleJumpKf('x', 'next');
              }}
              hasPrev={xKf.hasPrev || yKf.hasPrev}
              hasNext={xKf.hasNext || yKf.hasNext}
            />
          }
        >
          <div className="ae-dual-scrubbers">
            <AEScrubber
              prefix="X:"
              value={values.x}
              min={-10000}
              max={10000}
              step={1}
              unit="px"
              decimals={1}
              defaultValue={0}
              disabled={locked}
              onDrag={(v) => handleScrub('x', v)}
              onDragEnd={(v) => handleScrubEnd('x', v)}
              onDragCancel={handleScrubCancel}
              onChange={(v) => handleScrubEnd('x', v)}
            />
            <AEScrubber
              prefix="Y:"
              value={values.y}
              min={-10000}
              max={10000}
              step={1}
              unit="px"
              decimals={1}
              defaultValue={0}
              disabled={locked}
              onDrag={(v) => handleScrub('y', v)}
              onDragEnd={(v) => handleScrubEnd('y', v)}
              onDragCancel={handleScrubCancel}
              onChange={(v) => handleScrubEnd('y', v)}
            />
          </div>
        </AEPropertyRow>

        {/* Scale */}
        <AEPropertyRow
          label="Scale"
          keyframeControl={
            <AEKeyframeStopwatch
              label="Scale"
              hasKeyframes={scaleKf.hasKeyframes}
              isOnKeyframe={scaleKf.isOnKeyframe}
              canKeyframe={inside && !locked}
              onToggle={() => handleToggleKf('scale')}
              onPrev={() => handleJumpKf('scale', 'prev')}
              onNext={() => handleJumpKf('scale', 'next')}
              hasPrev={scaleKf.hasPrev}
              hasNext={scaleKf.hasNext}
            />
          }
        >
          <div className="ae-scrubber-with-slider">
            <AEScrubber
              value={Number((values.scale * 100).toFixed(1))}
              min={10}
              max={500}
              step={1}
              unit="%"
              decimals={1}
              defaultValue={100}
              disabled={locked}
              onDrag={(v) => handleScrub('scale', v / 100)}
              onDragEnd={(v) => handleScrubEnd('scale', v / 100)}
              onDragCancel={handleScrubCancel}
              onChange={(v) => handleScrubEnd('scale', v / 100)}
            />
            <input
              type="range"
              className="ae-mini-slider"
              min="10"
              max="300"
              step="1"
              value={Math.round(values.scale * 100)}
              disabled={locked}
              onChange={(e) => changeProp('scale', +e.target.value / 100)}
            />
          </div>
        </AEPropertyRow>

        {/* Quick Scale Pills */}
        <div className="ae-quick-preset-bar">
          {[50, 100, 125, 150, 200].map((s) => (
            <button
              key={s}
              type="button"
              className={`ae-quick-pill ${Math.round(values.scale * 100) === s ? 'active' : ''}`}
              disabled={locked}
              onClick={() => changeProp('scale', s / 100)}
            >
              {s}%
            </button>
          ))}
        </div>

        {/* Rotation */}
        <AEPropertyRow
          label="Rotation"
          keyframeControl={
            <AEKeyframeStopwatch
              label="Rotation"
              hasKeyframes={rotKf.hasKeyframes}
              isOnKeyframe={rotKf.isOnKeyframe}
              canKeyframe={inside && !locked}
              onToggle={() => handleToggleKf('rotation')}
              onPrev={() => handleJumpKf('rotation', 'prev')}
              onNext={() => handleJumpKf('rotation', 'next')}
              hasPrev={rotKf.hasPrev}
              hasNext={rotKf.hasNext}
            />
          }
        >
          <div className="ae-scrubber-with-pills">
            <AEScrubber
              value={values.rotation}
              min={-360}
              max={360}
              step={0.5}
              unit="°"
              decimals={1}
              defaultValue={0}
              disabled={locked}
              onDrag={(v) => handleScrub('rotation', v)}
              onDragEnd={(v) => handleScrubEnd('rotation', v)}
              onDragCancel={handleScrubCancel}
              onChange={(v) => handleScrubEnd('rotation', v)}
            />
            <div className="ae-rot-pills">
              {[-90, 0, 90, 180].map((deg) => (
                <button
                  key={deg}
                  type="button"
                  className={`ae-rot-pill ${Math.round(values.rotation) === deg ? 'active' : ''}`}
                  disabled={locked}
                  onClick={() => changeProp('rotation', deg)}
                >
                  {deg}°
                </button>
              ))}
            </div>
          </div>
        </AEPropertyRow>

        {/* Opacity */}
        <AEPropertyRow
          label="Opacity"
          keyframeControl={
            <AEKeyframeStopwatch
              label="Opacity"
              hasKeyframes={opKf.hasKeyframes}
              isOnKeyframe={opKf.isOnKeyframe}
              canKeyframe={inside && !locked}
              onToggle={() => handleToggleKf('opacity')}
              onPrev={() => handleJumpKf('opacity', 'prev')}
              onNext={() => handleJumpKf('opacity', 'next')}
              hasPrev={opKf.hasPrev}
              hasNext={opKf.hasNext}
            />
          }
        >
          <div className="ae-scrubber-with-slider">
            <AEScrubber
              value={Number((values.opacity * 100).toFixed(0))}
              min={0}
              max={100}
              step={1}
              unit="%"
              decimals={0}
              defaultValue={100}
              disabled={locked}
              onDrag={(v) => handleScrub('opacity', v / 100)}
              onDragEnd={(v) => handleScrubEnd('opacity', v / 100)}
              onDragCancel={handleScrubCancel}
              onChange={(v) => handleScrubEnd('opacity', v / 100)}
            />
            <input
              type="range"
              className="ae-mini-slider"
              min="0"
              max="100"
              step="1"
              value={Math.round(values.opacity * 100)}
              disabled={locked}
              onChange={(e) => changeProp('opacity', +e.target.value / 100)}
            />
          </div>
        </AEPropertyRow>

        {/* Crop */}
        <AEPropertyRow label="Crop Edge">
          <div className="ae-scrubber-with-slider">
            <AEScrubber
              value={values.crop}
              min={0}
              max={45}
              step={0.5}
              unit="%"
              decimals={1}
              defaultValue={0}
              disabled={locked}
              onDrag={(v) => handleScrub('crop', v)}
              onDragEnd={(v) => handleScrubEnd('crop', v)}
              onDragCancel={handleScrubCancel}
              onChange={(v) => handleScrubEnd('crop', v)}
            />
            <input
              type="range"
              className="ae-mini-slider"
              min="0"
              max="45"
              step="0.5"
              value={values.crop}
              disabled={locked}
              onChange={(e) => changeProp('crop', +e.target.value)}
            />
          </div>
        </AEPropertyRow>

        <div className="ae-divider" />

        {/* Motion Presets & Curves */}
        <div className="ae-motion-presets-row">
          <div className="ae-preset-label-row">
            <span className="ae-subhead">Motion Preset</span>
            {totalFrames > 0 && (
              <button
                type="button"
                className="ae-drawer-toggle-btn"
                onClick={() => setShowKeyframeDrawer(!showKeyframeDrawer)}
              >
                {showKeyframeDrawer ? 'Hide Keyframes' : `View Keyframes (${totalFrames})`}
              </button>
            )}
          </div>

          <div className="ae-preset-select-wrap">
            <select
              className="ae-select"
              value={clip.properties.animation}
              disabled={locked}
              onChange={(e) => {
                const target = getLatestTargetClip();
                if (!target || locked) return;
                const preset = e.target.value;
                save(
                  {
                    ...target,
                    properties: { ...target.properties, animation: preset },
                    keyframes: Object.fromEntries(
                      Object.entries(
                        presetKeyframes(target, preset, p.settings.width, p.settings.height),
                      ).map(([key, frames]) => [
                        key,
                        frames.map((f) => ({
                          ...f,
                          value: clampMotion(key as AnimatedProperty, f.value),
                        })),
                      ]),
                    ),
                  },
                  `Apply ${preset} animation`,
                );
              }}
            >
              {[
                'None',
                'Custom',
                'Punch In',
                'Slow Zoom',
                'Pan Left',
                'Pan Right',
                'Slide Up',
                'Fade',
                'Shake',
              ].map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Keyframe Inspector Drawer */}
        {showKeyframeDrawer && totalFrames > 0 && (
          <div className="ae-keyframe-drawer">
            <div className="ae-drawer-header">
              <span className="ae-drawer-title">Keyframe Timeline</span>
              <div className="ae-kf-prop-pills">
                {animatedProperties.map((prop) => {
                  const count = clip.keyframes?.[prop]?.length || 0;
                  if (count === 0) return null;
                  return (
                    <button
                      key={prop}
                      type="button"
                      className={`ae-kf-pill ${activeProperty === prop ? 'active' : ''}`}
                      onClick={() => setActiveProperty(prop)}
                    >
                      {prop} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="ae-keyframe-list">
              {(clip.keyframes?.[activeProperty] ?? [])
                .filter((f) => f.time >= clip.sourceStart && f.time <= clip.sourceEnd)
                .map((f, idx) => {
                  const isCur = Math.abs(f.time - sourceTime) < 0.005;
                  const timelinePos =
                    clip.start + (f.time - clip.sourceStart) / clip.properties.speed;
                  return (
                    <div
                      key={idx}
                      className={`ae-keyframe-item ${isCur ? 'current' : ''}`}
                      onClick={() => {
                        setPlaying(false);
                        seek(timelinePos);
                      }}
                    >
                      <Diamond size={9} fill={isCur ? '#f59e0b' : 'none'} />
                      <span className="ae-kf-time">{f.time.toFixed(2)}s</span>
                      <span className="ae-kf-val">
                        val: {f.value.toFixed(2)}
                        {f.easing ? ` (${f.easing})` : ''}
                      </span>
                      {isCur && <span className="ae-kf-cur-badge">PLAYHEAD</span>}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        <SavedAnimations clip={clip} />
      </div>
    </AEGroup>
  );
}
