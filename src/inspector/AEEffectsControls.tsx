import { useState } from 'react';
import {
  Sparkles,
  Camera,
  Palette,
  Maximize2,
  Crosshair,
  Wand2,
  Film,
  Layers,
} from 'lucide-react';
import { type Clip, isLocked } from '../model';
import { useEditor } from '../store';
import { defaultTransition, type TransitionType } from '../transitions-engine';
import {
  defaultChroma,
  defaultCornerPin,
  defaultGrade,
  defaultLens,
  defaultMask,
  type VisualEffects,
  type ColorGradeEffect,
  type LensEffect,
  type CornerPinEffect,
} from '../visual-effects';
import { AEGroup } from './AEGroup';
import { AEPropertyRow } from './AEPropertyRow';
import { AEScrubber } from './AEScrubber';
import { MotionTrackingControls } from '../MotionTrackingControls';

export const LOOK_PRESETS: {
  id: string;
  name: string;
  badge?: string;
  grade?: Partial<ColorGradeEffect>;
  lens?: Partial<LensEffect>;
}[] = [
  {
    id: 'reset',
    name: 'Reset / None',
    grade: defaultGrade(),
    lens: defaultLens(),
  },
  {
    id: 'teal-orange',
    name: 'Blockbuster',
    badge: 'CINEMA',
    grade: {
      enabled: true,
      exposure: 0.1,
      contrast: 115,
      temperature: 5,
      tint: -2,
      lift: [-0.04, 0.0, 0.08],
      gamma: [1.0, 1.0, 1.0],
      gain: [1.12, 1.02, 0.9],
    },
    lens: {
      enabled: true,
      vignette: 28,
      chromaticAberration: 8,
      distortion: 0,
    },
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    badge: 'NEON',
    grade: {
      enabled: true,
      exposure: 0.2,
      contrast: 130,
      temperature: -15,
      tint: 25,
      lift: [0.06, -0.04, 0.1],
      gamma: [0.95, 1.0, 1.1],
      gain: [1.2, 0.9, 1.25],
    },
    lens: {
      enabled: true,
      vignette: 40,
      chromaticAberration: 28,
      distortion: -8,
    },
  },
  {
    id: 'vintage',
    name: 'Vintage 16mm',
    badge: 'RETRO',
    grade: {
      enabled: true,
      exposure: -0.1,
      contrast: 92,
      temperature: 30,
      tint: 8,
      lift: [0.08, 0.05, 0.02],
      gamma: [1.08, 1.04, 0.96],
      gain: [1.05, 1.02, 0.92],
    },
    lens: {
      enabled: true,
      vignette: 48,
      chromaticAberration: 12,
      distortion: -14,
    },
  },
  {
    id: 'noir',
    name: 'Moody Noir',
    badge: 'B&W / DARK',
    grade: {
      enabled: true,
      exposure: -0.25,
      contrast: 140,
      temperature: -5,
      tint: 0,
      lift: [-0.08, -0.08, -0.06],
      gamma: [0.92, 0.92, 0.92],
      gain: [0.85, 0.85, 0.88],
    },
    lens: {
      enabled: true,
      vignette: 55,
      chromaticAberration: 4,
      distortion: 0,
    },
  },
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    badge: 'WARMTH',
    grade: {
      enabled: true,
      exposure: 0.15,
      contrast: 105,
      temperature: 45,
      tint: 12,
      lift: [0.02, 0.0, -0.02],
      gamma: [1.05, 1.02, 0.98],
      gain: [1.2, 1.08, 0.92],
    },
    lens: {
      enabled: true,
      vignette: 22,
      chromaticAberration: 6,
      distortion: 0,
    },
  },
];

export function AEEffectsControls({ clip: original }: { clip: Clip }) {
  const locked = useEditor((s) => isLocked(s.project, original));
  const draft = useEditor((s) => s.previewClip);
  const commit = useEditor((s) => s.commit);
  const clip = draft?.id === original.id ? draft : original;
  const effects = clip.effects ?? {};

  const chroma = effects.chroma ?? defaultChroma();
  const grade = effects.grade ?? defaultGrade();
  const lens = effects.lens ?? defaultLens();
  const cornerPin = effects.cornerPin ?? defaultCornerPin();

  function updateEffects(next: VisualEffects, label: string) {
    const current = useEditor.getState().project;
    if (isLocked(current, original)) return;
    commit(
      {
        ...current,
        clips: current.clips.map((c) => (c.id === clip.id ? { ...c, effects: next } : c)),
      },
      label,
    );
  }

  const applyLookPreset = (preset: (typeof LOOK_PRESETS)[number]) => {
    updateEffects(
      {
        ...effects,
        grade: { ...grade, ...(preset.grade ?? {}), enabled: preset.id !== 'reset' },
        lens: { ...lens, ...(preset.lens ?? {}), enabled: preset.id !== 'reset' },
      },
      `Apply ${preset.name} Look`,
    );
  };

  return (
    <>
      {/* Magic Bullet Looks Quick Preset Strip */}
      <div className="ae-looks-strip">
        <div className="ae-looks-strip-header">
          <Film size={12} className="ae-looks-icon" />
          <span>Cinematic Looks (One-Click Presets)</span>
        </div>
        <div className="ae-looks-grid">
          {LOOK_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="ae-look-chip"
              disabled={locked}
              onClick={() => applyLookPreset(p)}
              title={p.name}
            >
              <span className="ae-look-name">{p.name}</span>
              {p.badge && <span className="ae-look-badge">{p.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* 1. Color Grading & Tonality (Primary Wheels / CDL) */}
      <AEGroup
        title="Color Grade & Looks (Primary CDL)"
        icon={<Palette size={13} />}
        defaultOpen={!!grade.enabled}
        hasFx={true}
        fxEnabled={!!grade.enabled}
        onToggleFx={(enabled) =>
          updateEffects({ ...effects, grade: { ...grade, enabled } }, 'Toggle Color Grade')
        }
        onReset={() =>
          updateEffects({ ...effects, grade: defaultGrade() }, 'Reset Color Grade')
        }
        badge={grade.enabled ? 'ACTIVE' : undefined}
      >
        <div className="ae-effects-body">
          <AEPropertyRow label="Exposure">
            <AEScrubber
              value={grade.exposure}
              min={-4}
              max={4}
              step={0.1}
              decimals={2}
              unit=" EV"
              defaultValue={0}
              disabled={locked || !grade.enabled}
              onChange={(v) =>
                updateEffects(
                  { ...effects, grade: { ...grade, exposure: v } },
                  'Change Exposure',
                )
              }
            />
          </AEPropertyRow>

          <AEPropertyRow label="Contrast">
            <AEScrubber
              value={grade.contrast}
              min={0}
              max={200}
              step={1}
              decimals={0}
              unit="%"
              defaultValue={100}
              disabled={locked || !grade.enabled}
              onChange={(v) =>
                updateEffects(
                  { ...effects, grade: { ...grade, contrast: v } },
                  'Change Contrast',
                )
              }
            />
          </AEPropertyRow>

          <AEPropertyRow label="Temperature">
            <AEScrubber
              value={grade.temperature}
              min={-100}
              max={100}
              step={1}
              decimals={0}
              unit=" K"
              defaultValue={0}
              disabled={locked || !grade.enabled}
              onChange={(v) =>
                updateEffects(
                  { ...effects, grade: { ...grade, temperature: v } },
                  'Change Temperature',
                )
              }
            />
          </AEPropertyRow>

          <AEPropertyRow label="Tint (G/M)">
            <AEScrubber
              value={grade.tint}
              min={-100}
              max={100}
              step={1}
              decimals={0}
              defaultValue={0}
              disabled={locked || !grade.enabled}
              onChange={(v) =>
                updateEffects(
                  { ...effects, grade: { ...grade, tint: v } },
                  'Change Tint',
                )
              }
            />
          </AEPropertyRow>

          {/* 3-Way Wheels: Lift, Gamma, Gain */}
          <div className="ae-wheels-header">3-Way Color Wheels (RGB Offsets)</div>

          <AEPropertyRow label="Shadows (Lift R)">
            <AEScrubber
              value={grade.lift[0]}
              min={-1}
              max={1}
              step={0.01}
              decimals={2}
              defaultValue={0}
              disabled={locked || !grade.enabled}
              onChange={(v) =>
                updateEffects(
                  {
                    ...effects,
                    grade: {
                      ...grade,
                      lift: [v, grade.lift[1], grade.lift[2]],
                    },
                  },
                  'Change Lift R',
                )
              }
            />
          </AEPropertyRow>

          <AEPropertyRow label="Shadows (Lift B)">
            <AEScrubber
              value={grade.lift[2]}
              min={-1}
              max={1}
              step={0.01}
              decimals={2}
              defaultValue={0}
              disabled={locked || !grade.enabled}
              onChange={(v) =>
                updateEffects(
                  {
                    ...effects,
                    grade: {
                      ...grade,
                      lift: [grade.lift[0], grade.lift[1], v],
                    },
                  },
                  'Change Lift B',
                )
              }
            />
          </AEPropertyRow>

          <AEPropertyRow label="Highlights (Gain R)">
            <AEScrubber
              value={grade.gain[0]}
              min={0}
              max={3}
              step={0.01}
              decimals={2}
              defaultValue={1}
              disabled={locked || !grade.enabled}
              onChange={(v) =>
                updateEffects(
                  {
                    ...effects,
                    grade: {
                      ...grade,
                      gain: [v, grade.gain[1], grade.gain[2]],
                    },
                  },
                  'Change Gain R',
                )
              }
            />
          </AEPropertyRow>

          <AEPropertyRow label="Highlights (Gain B)">
            <AEScrubber
              value={grade.gain[2]}
              min={0}
              max={3}
              step={0.01}
              decimals={2}
              defaultValue={1}
              disabled={locked || !grade.enabled}
              onChange={(v) =>
                updateEffects(
                  {
                    ...effects,
                    grade: {
                      ...grade,
                      gain: [grade.gain[0], grade.gain[1], v],
                    },
                  },
                  'Change Gain B',
                )
              }
            />
          </AEPropertyRow>
        </div>
      </AEGroup>

      {/* 2. Lens & Optical Effects (Camera Simulation) */}
      <AEGroup
        title="Lens & Optics (Camera Simulation)"
        icon={<Camera size={13} />}
        defaultOpen={!!lens.enabled}
        hasFx={true}
        fxEnabled={!!lens.enabled}
        onToggleFx={(enabled) =>
          updateEffects({ ...effects, lens: { ...lens, enabled } }, 'Toggle Lens Optics')
        }
        onReset={() =>
          updateEffects({ ...effects, lens: defaultLens() }, 'Reset Lens Optics')
        }
        badge={lens.enabled ? 'ACTIVE' : undefined}
      >
        <div className="ae-effects-body">
          <AEPropertyRow label="Vignette Falloff">
            <div className="ae-scrubber-with-slider">
              <AEScrubber
                value={lens.vignette}
                min={0}
                max={100}
                step={1}
                unit="%"
                decimals={0}
                defaultValue={0}
                disabled={locked || !lens.enabled}
                onChange={(v) =>
                  updateEffects(
                    { ...effects, lens: { ...lens, vignette: v } },
                    'Change Vignette',
                  )
                }
              />
              <input
                type="range"
                className="ae-mini-slider"
                min="0"
                max="100"
                step="1"
                value={lens.vignette}
                disabled={locked || !lens.enabled}
                onChange={(e) =>
                  updateEffects(
                    { ...effects, lens: { ...lens, vignette: +e.target.value } },
                    'Change Vignette',
                  )
                }
              />
            </div>
          </AEPropertyRow>

          <AEPropertyRow label="Chromatic Aberration">
            <div className="ae-scrubber-with-slider">
              <AEScrubber
                value={lens.chromaticAberration}
                min={0}
                max={100}
                step={1}
                unit="%"
                decimals={0}
                defaultValue={0}
                disabled={locked || !lens.enabled}
                onChange={(v) =>
                  updateEffects(
                    { ...effects, lens: { ...lens, chromaticAberration: v } },
                    'Change Aberration',
                  )
                }
              />
              <input
                type="range"
                className="ae-mini-slider"
                min="0"
                max="100"
                step="1"
                value={lens.chromaticAberration}
                disabled={locked || !lens.enabled}
                onChange={(e) =>
                  updateEffects(
                    { ...effects, lens: { ...lens, chromaticAberration: +e.target.value } },
                    'Change Aberration',
                  )
                }
              />
            </div>
          </AEPropertyRow>

          <AEPropertyRow label="Lens Distortion">
            <div className="ae-scrubber-with-slider">
              <AEScrubber
                value={lens.distortion}
                min={-100}
                max={100}
                step={1}
                unit="%"
                decimals={0}
                defaultValue={0}
                disabled={locked || !lens.enabled}
                onChange={(v) =>
                  updateEffects(
                    { ...effects, lens: { ...lens, distortion: v } },
                    'Change Distortion',
                  )
                }
              />
              <input
                type="range"
                className="ae-mini-slider"
                min="-100"
                max="100"
                step="1"
                value={lens.distortion}
                disabled={locked || !lens.enabled}
                onChange={(e) =>
                  updateEffects(
                    { ...effects, lens: { ...lens, distortion: +e.target.value } },
                    'Change Distortion',
                  )
                }
              />
            </div>
          </AEPropertyRow>
        </div>
      </AEGroup>

      {/* 3. Geometry & Corner Pin (4-Point Perspective Warp) */}
      <AEGroup
        title="Corner Pin (4-Point Perspective)"
        icon={<Maximize2 size={13} />}
        defaultOpen={!!cornerPin.enabled}
        hasFx={true}
        fxEnabled={!!cornerPin.enabled}
        onToggleFx={(enabled) =>
          updateEffects(
            { ...effects, cornerPin: { ...cornerPin, enabled } },
            'Toggle Corner Pin',
          )
        }
        onReset={() =>
          updateEffects({ ...effects, cornerPin: defaultCornerPin() }, 'Reset Corner Pin')
        }
        badge={cornerPin.enabled ? 'ACTIVE' : undefined}
      >
        <div className="ae-effects-body">
          <AEPropertyRow label="Top-Left (X, Y)">
            <div className="ae-dual-scrubbers">
              <AEScrubber
                prefix="X: "
                value={cornerPin.topLeft.x}
                min={-50}
                max={150}
                step={1}
                unit="%"
                decimals={0}
                disabled={locked || !cornerPin.enabled}
                onChange={(v) =>
                  updateEffects(
                    {
                      ...effects,
                      cornerPin: {
                        ...cornerPin,
                        topLeft: { ...cornerPin.topLeft, x: v },
                      },
                    },
                    'Change Corner Pin TL.X',
                  )
                }
              />
              <AEScrubber
                prefix="Y: "
                value={cornerPin.topLeft.y}
                min={-50}
                max={150}
                step={1}
                unit="%"
                decimals={0}
                disabled={locked || !cornerPin.enabled}
                onChange={(v) =>
                  updateEffects(
                    {
                      ...effects,
                      cornerPin: {
                        ...cornerPin,
                        topLeft: { ...cornerPin.topLeft, y: v },
                      },
                    },
                    'Change Corner Pin TL.Y',
                  )
                }
              />
            </div>
          </AEPropertyRow>

          <AEPropertyRow label="Top-Right (X, Y)">
            <div className="ae-dual-scrubbers">
              <AEScrubber
                prefix="X: "
                value={cornerPin.topRight.x}
                min={-50}
                max={150}
                step={1}
                unit="%"
                decimals={0}
                disabled={locked || !cornerPin.enabled}
                onChange={(v) =>
                  updateEffects(
                    {
                      ...effects,
                      cornerPin: {
                        ...cornerPin,
                        topRight: { ...cornerPin.topRight, x: v },
                      },
                    },
                    'Change Corner Pin TR.X',
                  )
                }
              />
              <AEScrubber
                prefix="Y: "
                value={cornerPin.topRight.y}
                min={-50}
                max={150}
                step={1}
                unit="%"
                decimals={0}
                disabled={locked || !cornerPin.enabled}
                onChange={(v) =>
                  updateEffects(
                    {
                      ...effects,
                      cornerPin: {
                        ...cornerPin,
                        topRight: { ...cornerPin.topRight, y: v },
                      },
                    },
                    'Change Corner Pin TR.Y',
                  )
                }
              />
            </div>
          </AEPropertyRow>

          <AEPropertyRow label="Bottom-Right (X, Y)">
            <div className="ae-dual-scrubbers">
              <AEScrubber
                prefix="X: "
                value={cornerPin.bottomRight.x}
                min={-50}
                max={150}
                step={1}
                unit="%"
                decimals={0}
                disabled={locked || !cornerPin.enabled}
                onChange={(v) =>
                  updateEffects(
                    {
                      ...effects,
                      cornerPin: {
                        ...cornerPin,
                        bottomRight: { ...cornerPin.bottomRight, x: v },
                      },
                    },
                    'Change Corner Pin BR.X',
                  )
                }
              />
              <AEScrubber
                prefix="Y: "
                value={cornerPin.bottomRight.y}
                min={-50}
                max={150}
                step={1}
                unit="%"
                decimals={0}
                disabled={locked || !cornerPin.enabled}
                onChange={(v) =>
                  updateEffects(
                    {
                      ...effects,
                      cornerPin: {
                        ...cornerPin,
                        bottomRight: { ...cornerPin.bottomRight, y: v },
                      },
                    },
                    'Change Corner Pin BR.Y',
                  )
                }
              />
            </div>
          </AEPropertyRow>

          <AEPropertyRow label="Bottom-Left (X, Y)">
            <div className="ae-dual-scrubbers">
              <AEScrubber
                prefix="X: "
                value={cornerPin.bottomLeft.x}
                min={-50}
                max={150}
                step={1}
                unit="%"
                decimals={0}
                disabled={locked || !cornerPin.enabled}
                onChange={(v) =>
                  updateEffects(
                    {
                      ...effects,
                      cornerPin: {
                        ...cornerPin,
                        bottomLeft: { ...cornerPin.bottomLeft, x: v },
                      },
                    },
                    'Change Corner Pin BL.X',
                  )
                }
              />
              <AEScrubber
                prefix="Y: "
                value={cornerPin.bottomLeft.y}
                min={-50}
                max={150}
                step={1}
                unit="%"
                decimals={0}
                disabled={locked || !cornerPin.enabled}
                onChange={(v) =>
                  updateEffects(
                    {
                      ...effects,
                      cornerPin: {
                        ...cornerPin,
                        bottomLeft: { ...cornerPin.bottomLeft, y: v },
                      },
                    },
                    'Change Corner Pin BL.Y',
                  )
                }
              />
            </div>
          </AEPropertyRow>
        </div>
      </AEGroup>

      {/* 4. Visual Effects & Chroma Key Group */}
      <AEGroup
        title="Keying & Chroma (Green Screen)"
        icon={<Sparkles size={13} />}
        defaultOpen={!!chroma.enabled}
        hasFx={true}
        fxEnabled={!!chroma.enabled}
        onToggleFx={(enabled) =>
          updateEffects({ ...effects, chroma: { ...chroma, enabled } }, 'Toggle Chroma Key')
        }
        onReset={() =>
          updateEffects({ ...effects, chroma: defaultChroma() }, 'Reset Chroma Key')
        }
        badge={chroma.enabled ? 'ACTIVE' : undefined}
      >
        <div className="ae-effects-body">
          <AEPropertyRow label="Key Color">
            <div className="ae-color-picker-row">
              <input
                type="color"
                className="ae-color-swatch-input"
                value={chroma.color}
                disabled={locked || !chroma.enabled}
                onChange={(e) =>
                  updateEffects(
                    { ...effects, chroma: { ...chroma, color: e.target.value } },
                    'Change key color',
                  )
                }
              />
              <span className="ae-hex-tag">{chroma.color.toUpperCase()}</span>

              <div className="ae-quick-colors">
                <button
                  type="button"
                  className={`ae-color-pill green ${chroma.color === '#00ff00' ? 'active' : ''}`}
                  disabled={locked || !chroma.enabled}
                  onClick={() =>
                    updateEffects(
                      { ...effects, chroma: { ...chroma, color: '#00ff00' } },
                      'Select Green Screen',
                    )
                  }
                  title="Standard Green Screen"
                >
                  Green
                </button>
                <button
                  type="button"
                  className={`ae-color-pill blue ${chroma.color === '#0000ff' ? 'active' : ''}`}
                  disabled={locked || !chroma.enabled}
                  onClick={() =>
                    updateEffects(
                      { ...effects, chroma: { ...chroma, color: '#0000ff' } },
                      'Select Blue Screen',
                    )
                  }
                  title="Standard Blue Screen"
                >
                  Blue
                </button>
              </div>
            </div>
          </AEPropertyRow>

          <AEPropertyRow label="Key Tolerance">
            <div className="ae-scrubber-with-slider">
              <AEScrubber
                value={chroma.similarity}
                min={0}
                max={100}
                step={1}
                unit="%"
                decimals={0}
                defaultValue={40}
                disabled={locked || !chroma.enabled}
                onChange={(v) =>
                  updateEffects(
                    { ...effects, chroma: { ...chroma, similarity: v } },
                    'Change key tolerance',
                  )
                }
              />
              <input
                type="range"
                className="ae-mini-slider"
                min="0"
                max="100"
                step="1"
                value={chroma.similarity}
                disabled={locked || !chroma.enabled}
                onChange={(e) =>
                  updateEffects(
                    { ...effects, chroma: { ...chroma, similarity: +e.target.value } },
                    'Change key tolerance',
                  )
                }
              />
            </div>
          </AEPropertyRow>

          <AEPropertyRow label="Edge Softness">
            <div className="ae-scrubber-with-slider">
              <AEScrubber
                value={chroma.softness}
                min={0}
                max={100}
                step={1}
                unit="%"
                decimals={0}
                defaultValue={10}
                disabled={locked || !chroma.enabled}
                onChange={(v) =>
                  updateEffects(
                    { ...effects, chroma: { ...chroma, softness: v } },
                    'Change edge softness',
                  )
                }
              />
              <input
                type="range"
                className="ae-mini-slider"
                min="0"
                max="100"
                step="1"
                value={chroma.softness}
                disabled={locked || !chroma.enabled}
                onChange={(e) =>
                  updateEffects(
                    { ...effects, chroma: { ...chroma, softness: +e.target.value } },
                    'Change edge softness',
                  )
                }
              />
            </div>
          </AEPropertyRow>

          <AEPropertyRow label="Spill Removal">
            <div className="ae-scrubber-with-slider">
              <AEScrubber
                value={chroma.spill}
                min={0}
                max={100}
                step={1}
                unit="%"
                decimals={0}
                defaultValue={20}
                disabled={locked || !chroma.enabled}
                onChange={(v) =>
                  updateEffects(
                    { ...effects, chroma: { ...chroma, spill: v } },
                    'Change spill removal',
                  )
                }
              />
              <input
                type="range"
                className="ae-mini-slider"
                min="0"
                max="100"
                step="1"
                value={chroma.spill}
                disabled={locked || !chroma.enabled}
                onChange={(e) =>
                  updateEffects(
                    { ...effects, chroma: { ...chroma, spill: +e.target.value } },
                    'Change spill removal',
                  )
                }
              />
            </div>
          </AEPropertyRow>
        </div>
      </AEGroup>

      {/* 5. Transitions & Dissolve Group */}
      <AEGroup
        title="Transition & Dissolve"
        icon={<Layers size={13} />}
        defaultOpen={!!clip.transition}
        hasFx={true}
        fxEnabled={!!clip.transition}
        onToggleFx={(enabled) => {
          const next = structuredClone(useEditor.getState().project);
          const target = next.clips.find((c) => c.id === clip.id);
          if (!target) return;
          target.transition = enabled ? defaultTransition() : undefined;
          commit(next, enabled ? 'Enable transition' : 'Disable transition');
        }}
        onReset={() => {
          const next = structuredClone(useEditor.getState().project);
          const target = next.clips.find((c) => c.id === clip.id);
          if (!target) return;
          target.transition = undefined;
          commit(next, 'Reset transition');
        }}
        badge={clip.transition ? clip.transition.type.toUpperCase() : undefined}
      >
        <div className="ae-effects-body">
          <AEPropertyRow label="Transition Type">
            <select
              className="ae-select"
              value={clip.transition?.type ?? 'cross-dissolve'}
              disabled={locked || !clip.transition}
              onChange={(e) => {
                const next = structuredClone(useEditor.getState().project);
                const target = next.clips.find((c) => c.id === clip.id);
                if (!target) return;
                target.transition = {
                  ...(target.transition ?? defaultTransition()),
                  type: e.target.value as TransitionType,
                };
                commit(next, 'Change transition type');
              }}
            >
              <option value="cross-dissolve">Cross Dissolve (Smooth)</option>
              <option value="whip-pan">Whip Pan (Fast Blur Pan)</option>
              <option value="cross-zoom">Cross Zoom (Optic Zoom)</option>
              <option value="glitch-split">Glitch / RGB Split</option>
              <option value="luma-wipe">Luma Wipe (Gradient)</option>
              <option value="directional-wipe">Directional Wipe</option>
            </select>
          </AEPropertyRow>

          <AEPropertyRow label="Duration">
            <AEScrubber
              value={clip.transition?.duration ?? 0.5}
              min={0.1}
              max={3.0}
              step={0.05}
              unit="s"
              decimals={2}
              defaultValue={0.5}
              disabled={locked || !clip.transition}
              onChange={(v) => {
                const next = structuredClone(useEditor.getState().project);
                const target = next.clips.find((c) => c.id === clip.id);
                if (!target || !target.transition) return;
                target.transition.duration = v;
                commit(next, 'Change transition duration');
              }}
            />
          </AEPropertyRow>

          {['whip-pan', 'directional-wipe'].includes(clip.transition?.type ?? '') && (
            <AEPropertyRow label="Direction">
              <select
                className="ae-select"
                value={clip.transition?.direction ?? 'right'}
                disabled={locked || !clip.transition}
                onChange={(e) => {
                  const next = structuredClone(useEditor.getState().project);
                  const target = next.clips.find((c) => c.id === clip.id);
                  if (!target || !target.transition) return;
                  target.transition.direction = e.target.value as 'left' | 'right' | 'up' | 'down';
                  commit(next, 'Change transition direction');
                }}
              >
                <option value="right">Slide Right</option>
                <option value="left">Slide Left</option>
                <option value="up">Slide Up</option>
                <option value="down">Slide Down</option>
              </select>
            </AEPropertyRow>
          )}
        </div>
      </AEGroup>

      {/* 6. Motion Tracking Group */}
      <AEGroup
        title="Motion Tracking & AI Anchor"
        icon={<Crosshair size={13} />}
        defaultOpen={false}
        badge={clip.tracking ? `${clip.tracking.points.length} pts` : undefined}
      >
        <div className="ae-tracking-body">
          <MotionTrackingControls clip={clip} />
        </div>
      </AEGroup>
    </>
  );
}
