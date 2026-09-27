import { useState } from 'react';
import { useEditor } from './store';
import { type Clip, isLocked } from './model';
import { defaultChroma, defaultMask, type VisualEffects, type ClipMask } from './visual-effects';
import { Field, Range } from './components';
import { NumberField } from './CaptionTextControls';
import { dragClipProperties } from './clip-drag';

const clamp = (value: number) => Math.max(0, Math.min(100, value));
export function VisualEffectsControls({ clip: original }: { clip: Clip }) {
  const locked = useEditor((s) => isLocked(s.project, original));
  const draft = useEditor((s) => s.previewClip);
  const commit = useEditor((s) => s.commit);
  const clip = draft?.id === original.id ? draft : original;
  const effects = clip.effects ?? {};
  const key = effects.chroma ?? defaultChroma(),
    mask = effects.mask ?? defaultMask();
  const [selectedPoint, setSelectedPoint] = useState(0);
  const pointIndex = Math.min(selectedPoint, mask.points.length - 1);
  const point = mask.points[pointIndex];
  function update(next: VisualEffects, label: string) {
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
  const changeMask = (patch: Partial<ClipMask>) =>
    update({ ...effects, mask: { ...mask, ...patch } }, 'Edit clip mask');
  const movePoint = (x: number, y: number) =>
    changeMask({
      points: mask.points.map((v, i) => (i === pointIndex ? { x: clamp(x), y: clamp(y) } : v)),
    });
  return (
    <div className="visual-effects-controls">
      <div className="property-divider" />
      <div className="section-heading">
        <b>Visual effects</b>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={!!effects.chroma?.enabled}
          onChange={(e) =>
            update(
              { ...effects, chroma: { ...key, enabled: e.target.checked } },
              'Toggle chroma key',
            )
          }
        />
        Chroma key
      </label>
      {effects.chroma?.enabled && (
        <div className="effect-controls-group">
          <Field label="Key color">
            <input
              type="color"
              value={key.color}
              onChange={(e) =>
                update(
                  { ...effects, chroma: { ...key, color: e.target.value } },
                  'Change key color',
                )
              }
            />
          </Field>
          <div className="button-row">
            <button
              className="text-button"
              onClick={() =>
                update({ ...effects, chroma: { ...key, color: '#00ff00' } }, 'Green screen')
              }
            >
              Green screen
            </button>
            <button
              className="text-button"
              onClick={() =>
                update({ ...effects, chroma: { ...key, color: '#0000ff' } }, 'Blue screen')
              }
            >
              Blue screen
            </button>
          </div>
          {(['similarity', 'softness', 'spill'] as const).map((property) => (
            <Range
              key={property}
              label={
                {
                  similarity: 'Key tolerance',
                  softness: 'Key edge softness',
                  spill: 'Spill removal',
                }[property]
              }
              value={key[property]}
              onChange={(value) =>
                update({ ...effects, chroma: { ...key, [property]: value } }, 'Adjust chroma key')
              }
            />
          ))}
          <small>
            Place another video below this clip to fill the removed color. Export composites the
            same transparent edges.
          </small>
        </div>
      )}
      <label className="check-row">
        <input
          type="checkbox"
          checked={!!effects.mask?.enabled}
          onChange={(e) =>
            update({ ...effects, mask: { ...mask, enabled: e.target.checked } }, 'Toggle clip mask')
          }
        />
        Clip mask
      </label>
      {effects.mask?.enabled && (
        <div className="effect-controls-group">
          <Field label="Mask shape">
            <select
              value={mask.shape}
              onChange={(e) => changeMask({ shape: e.target.value as ClipMask['shape'] })}
            >
              <option value="rectangle">Rectangle</option>
              <option value="ellipse">Ellipse</option>
              <option value="polygon">Polygon</option>
            </select>
          </Field>
          {mask.shape !== 'polygon' ? (
            <div className="number-grid">
              {(['x', 'y', 'width', 'height', 'rotation'] as const).map((property) => (
                <NumberField
                  key={property}
                  label={
                    {
                      x: 'Mask center X (%)',
                      y: 'Mask center Y (%)',
                      width: 'Mask width (%)',
                      height: 'Mask height (%)',
                      rotation: 'Mask rotation (°)',
                    }[property]
                  }
                  value={mask[property]}
                  min={
                    property === 'rotation'
                      ? -180
                      : property === 'width' || property === 'height'
                        ? 1
                        : 0
                  }
                  max={property === 'rotation' ? 180 : 100}
                  step={1}
                  onChange={(value) => changeMask({ [property]: value })}
                />
              ))}
            </div>
          ) : (
            <>
              <svg
                className="mask-polygon-editor"
                viewBox="0 0 100 100"
                role="group"
                aria-label="Polygon mask vertices"
              >
                <rect x="0" y="0" width="100" height="100" fill="#101820" />
                <polygon
                  points={mask.points.map((v) => `${v.x},${v.y}`).join(' ')}
                  fill="#7dd3fc33"
                  stroke="#7dd3fc"
                  strokeWidth="0.7"
                />
                {mask.points.map((v, index) => (
                  <circle
                    key={index}
                    cx={v.x}
                    cy={v.y}
                    r={index === pointIndex ? 2.4 : 1.8}
                    fill={index === pointIndex ? '#fff' : '#7dd3fc'}
                    role="button"
                    tabIndex={locked ? -1 : 0}
                    aria-disabled={locked}
                    aria-label={`Mask vertex ${index + 1}`}
                    onFocus={() => setSelectedPoint(index)}
                    onPointerDown={(e) => {
                      if (isLocked(useEditor.getState().project, original)) return;
                      setSelectedPoint(index);
                      const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                      dragClipProperties(e, original, 'Move mask vertex', (dx, dy) => ({
                        ...original,
                        effects: {
                          ...effects,
                          mask: {
                            ...mask,
                            points: mask.points.map((value, i) =>
                              i === index
                                ? {
                                    x: clamp(v.x + (dx / box.width) * 100),
                                    y: clamp(v.y + (dy / box.height) * 100),
                                  }
                                : value,
                            ),
                          },
                        },
                      }));
                    }}
                    onKeyDown={(e) => {
                      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key))
                        return;
                      e.preventDefault();
                      e.stopPropagation();
                      const step = e.shiftKey ? 5 : 1;
                      changeMask({
                        points: mask.points.map((value, i) =>
                          i === index
                            ? {
                                x: clamp(
                                  v.x +
                                    (e.key === 'ArrowRight'
                                      ? step
                                      : e.key === 'ArrowLeft'
                                        ? -step
                                        : 0),
                                ),
                                y: clamp(
                                  v.y +
                                    (e.key === 'ArrowDown'
                                      ? step
                                      : e.key === 'ArrowUp'
                                        ? -step
                                        : 0),
                                ),
                              }
                            : value,
                        ),
                      });
                    }}
                  />
                ))}
              </svg>
              <small>
                Drag vertices, or use arrow keys (Shift moves 5%). Coordinates follow the source
                video.
              </small>
              <div className="number-grid">
                <NumberField
                  label="Vertex X (%)"
                  min={0}
                  max={100}
                  step={1}
                  value={point.x}
                  onChange={(x) => movePoint(x, point.y)}
                />
                <NumberField
                  label="Vertex Y (%)"
                  min={0}
                  max={100}
                  step={1}
                  value={point.y}
                  onChange={(y) => movePoint(point.x, y)}
                />
              </div>
              <div className="button-row">
                <button
                  className="text-button"
                  disabled={mask.points.length >= 24}
                  onClick={() => {
                    const next = mask.points[(pointIndex + 1) % mask.points.length];
                    changeMask({
                      points: [
                        ...mask.points.slice(0, pointIndex + 1),
                        { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 },
                        ...mask.points.slice(pointIndex + 1),
                      ],
                    });
                    setSelectedPoint(pointIndex + 1);
                  }}
                >
                  Add vertex
                </button>
                <button
                  className="text-button"
                  disabled={mask.points.length <= 3}
                  onClick={() => {
                    changeMask({ points: mask.points.filter((_, i) => i !== pointIndex) });
                    setSelectedPoint(0);
                  }}
                >
                  Remove vertex
                </button>
              </div>
            </>
          )}
          <Range
            label="Mask feather (%)"
            min={0}
            max={30}
            step={0.5}
            value={mask.feather}
            onChange={(feather) => changeMask({ feather })}
          />
          <label className="check-row">
            <input
              type="checkbox"
              checked={mask.invert}
              onChange={(e) => changeMask({ invert: e.target.checked })}
            />
            Invert mask
          </label>
          <button
            className="text-button"
            onClick={() => update({ ...effects, mask: defaultMask() }, 'Reset clip mask')}
          >
            Reset mask
          </button>
        </div>
      )}
      {(effects.chroma || effects.mask) && (
        <button className="text-button" onClick={() => update({}, 'Remove visual effects')}>
          Remove visual effects
        </button>
      )}
      <small className="subtle">
        Effects belong to this clip. Preview uses its selected quality; export uses original frames.
      </small>
    </div>
  );
}
