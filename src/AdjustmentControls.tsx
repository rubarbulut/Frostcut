import { useEffect, useRef, useState } from 'react';
import { useEditor } from './store';
import { duration, type Project } from './model';
import { Field } from './components';
import { NumberField } from './CaptionTextControls';
import {
  MAX_ADJUSTMENTS,
  neutralAdjustment,
  newAdjustment,
  patchAdjustment,
  reorderAdjustment,
  type AdjustmentLayer,
} from './adjustments';
import './adjustments.css';

export function addAdjustment() {
  const s = useEditor.getState(),
    total = duration(s.project);
  if (total <= 0 || (s.project.adjustments?.length ?? 0) >= MAX_ADJUSTMENTS) return;
  const start = Math.min(s.playhead, Math.max(0, total - 1 / s.project.settings.fps));
  const layer = newAdjustment(start, Math.min(total, start + 5));
  s.commit(
    { ...s.project, adjustments: [...(s.project.adjustments ?? []), layer] },
    'Add adjustment layer',
  );
  s.selectAdjustment(layer.id);
}
export function removeAdjustment(id: string) {
  const s = useEditor.getState();
  if (!s.project.adjustments?.some((a) => a.id === id && !a.locked)) return;
  s.commit(
    { ...s.project, adjustments: s.project.adjustments.filter((a) => a.id !== id) },
    'Delete adjustment layer',
  );
  if (s.adjustmentSelection === id) s.selectAdjustment(undefined);
}
export function splitAdjustment(id: string, time: number) {
  const s = useEditor.getState(),
    layers = s.project.adjustments ?? [],
    a = layers.find((a) => a.id === id);
  if (!a || a.locked || layers.length >= MAX_ADJUSTMENTS || time <= a.start || time >= a.end)
    return;
  s.commit(
    {
      ...s.project,
      adjustments: layers.flatMap((x) =>
        x.id === id
          ? [
              { ...x, end: time },
              { ...x, id: crypto.randomUUID(), start: time },
            ]
          : [x],
      ),
    },
    'Split adjustment layer',
  );
}
function GradeSlider({
  original,
  property,
  label,
  min,
  max,
  step = 1,
}: {
  original: AdjustmentLayer;
  property: 'exposure' | 'contrast' | 'saturation' | 'hue';
  label: string;
  min: number;
  max: number;
  step?: number;
}) {
  const draft = useEditor((s) => s.previewAdjustment);
  const base = useRef<Project | undefined>(undefined);
  useEffect(
    () => () => {
      if (base.current) useEditor.getState().setPreviewAdjustment(undefined);
    },
    [],
  );
  const layer = draft?.id === original.id ? draft : original;
  const cancel = () => {
    base.current = undefined;
    useEditor.getState().setPreviewAdjustment(undefined);
  };
  const finish = () => {
    const s = useEditor.getState(),
      next = s.previewAdjustment;
    if (next?.id === original.id && s.project === base.current && !original.locked) {
      s.commit(
        {
          ...s.project,
          adjustments: patchAdjustment(s.project.adjustments ?? [], original.id, {
            [property]: next[property],
          }),
        },
        `Adjustment ${label.toLowerCase()}`,
      );
    }
    cancel();
  };
  return (
    <label className="range-field">
      <span>
        {label}
        <b>
          {+layer[property].toFixed(2)}
          {property === 'exposure' ? ' EV' : property === 'hue' ? '°' : '%'}
        </b>
      </span>
      <input
        aria-label={`Adjustment ${label.toLowerCase()}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={layer[property]}
        disabled={original.locked}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          base.current = useEditor.getState().project;
          useEditor.getState().setPlaying(false);
        }}
        onChange={(e) => {
          const s = useEditor.getState();
          base.current ??= s.project;
          if (s.project !== base.current) return cancel();
          s.setPreviewAdjustment({ ...layer, [property]: Number(e.target.value) });
        }}
        onPointerUp={finish}
        onPointerCancel={cancel}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancel();
          } else if (
            [
              'ArrowLeft',
              'ArrowRight',
              'ArrowUp',
              'ArrowDown',
              'Home',
              'End',
              'PageUp',
              'PageDown',
            ].includes(e.key)
          ) {
            e.stopPropagation();
            base.current ??= useEditor.getState().project;
          }
        }}
        onKeyUp={(e) => {
          if (e.key !== 'Escape') finish();
        }}
      />
    </label>
  );
}
export function AdjustmentControls() {
  const p = useEditor((s) => s.project),
    selected = useEditor((s) => s.adjustmentSelection);
  const [error, setError] = useState('');
  const layers = p.adjustments ?? [],
    layer = layers.find((a) => a.id === selected),
    index = layers.findIndex((a) => a.id === selected);
  const total = duration(p),
    canAdd = total > 0 && layers.length < MAX_ADJUSTMENTS;
  function change(patch: Partial<AdjustmentLayer>, label = 'Edit adjustment layer') {
    if (!layer) return;
    const s = useEditor.getState();
    try {
      s.commit(
        {
          ...s.project,
          adjustments: patchAdjustment(s.project.adjustments ?? [], layer.id, patch),
        },
        label,
      );
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="properties-content adjustment-controls">
      <button className="secondary" disabled={!canAdd} onClick={addAdjustment}>
        Add adjustment at playhead
      </button>
      <small>
        Grades all video tracks below captions. Later layers in the stack act on earlier results.
        Layers do not extend the video duration.
      </small>
      {!!layers.length && (
        <Field label="Adjustment layer">
          <select
            value={layer?.id ?? ''}
            onChange={(e) => useEditor.getState().selectAdjustment(e.target.value)}
          >
            <option value="" disabled>
              Select a layer
            </option>
            {[...layers].reverse().map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.locked ? ' · locked' : ''}
              </option>
            ))}
          </select>
        </Field>
      )}
      {layer ? (
        <>
          <div className="button-row">
            <label className="check-row">
              <input
                type="checkbox"
                checked={layer.enabled}
                disabled={layer.locked}
                onChange={(e) => change({ enabled: e.target.checked }, 'Toggle adjustment')}
              />
              Enabled
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={layer.locked}
                onChange={(e) => change({ locked: e.target.checked }, 'Lock adjustment')}
              />
              Locked
            </label>
          </div>
          <fieldset disabled={layer.locked}>
            <Field label="Layer name">
              <input
                key={`${layer.id}:${layer.name}`}
                defaultValue={layer.name}
                maxLength={80}
                onBlur={(e) =>
                  change({ name: e.target.value.trim() || 'Adjustment' }, 'Rename adjustment')
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') {
                    e.currentTarget.value = layer.name;
                    e.currentTarget.blur();
                  }
                }}
              />
            </Field>
            <NumberField
              label="Adjustment start (seconds)"
              value={layer.start}
              min={0}
              max={Math.max(0, layer.end - 1 / p.settings.fps)}
              step={1 / p.settings.fps}
              onChange={(start) => change({ start }, 'Trim adjustment start')}
            />
            <NumberField
              label="Adjustment end (seconds)"
              value={layer.end}
              min={layer.start + 1 / p.settings.fps}
              max={Math.max(total, layer.end, layer.start + 1 / p.settings.fps)}
              step={1 / p.settings.fps}
              onChange={(end) => change({ end }, 'Trim adjustment end')}
            />
            <GradeSlider
              original={layer}
              property="exposure"
              label="Exposure"
              min={-4}
              max={4}
              step={0.05}
            />
            <GradeSlider original={layer} property="contrast" label="Contrast" min={0} max={200} />
            <GradeSlider
              original={layer}
              property="saturation"
              label="Saturation"
              min={0}
              max={300}
            />
            <GradeSlider original={layer} property="hue" label="Hue" min={-180} max={180} />
            <button
              className="secondary"
              onClick={() => change(neutralAdjustment, 'Reset adjustment colors')}
            >
              Reset color settings
            </button>
          </fieldset>
          <small>
            Stack position {index + 1} of {layers.length} · bottom to top.
          </small>
          <div className="button-row">
            {([-1, 1] as const).map((delta) => (
              <button
                key={delta}
                className="secondary"
                disabled={layer.locked || !layers[index + delta] || layers[index + delta].locked}
                onClick={() => {
                  const s = useEditor.getState();
                  s.commit(
                    {
                      ...s.project,
                      adjustments: reorderAdjustment(s.project.adjustments ?? [], layer.id, delta),
                    },
                    'Reorder adjustment layers',
                  );
                }}
              >
                {delta > 0 ? 'Move above' : 'Move below'}
              </button>
            ))}
          </div>
          <div className="button-row">
            <button
              className="secondary"
              disabled={!canAdd}
              onClick={() => {
                const s = useEditor.getState(),
                  a = s.project.adjustments?.find((a) => a.id === layer.id);
                if (!a || (s.project.adjustments?.length ?? 0) >= MAX_ADJUSTMENTS) return;
                const copy = {
                  ...a,
                  id: crypto.randomUUID(),
                  name: `${a.name} copy`.slice(0, 80),
                  locked: false,
                };
                s.commit(
                  { ...s.project, adjustments: [...(s.project.adjustments ?? []), copy] },
                  'Duplicate adjustment',
                );
                s.selectAdjustment(copy.id);
              }}
            >
              Duplicate
            </button>
            <button
              className="text-button"
              disabled={layer.locked}
              onClick={() => removeAdjustment(layer.id)}
            >
              Delete layer
            </button>
          </div>
        </>
      ) : (
        <p className="subtle">Select an adjustment block on the timeline, or add one above.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
