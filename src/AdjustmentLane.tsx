import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Plus, LockKeyhole, UnlockKeyhole, Eye, EyeOff } from 'lucide-react';
import { useEditor } from './store';
import { clipEnd, duration } from './model';
import { MAX_ADJUSTMENTS, patchAdjustment, type AdjustmentLayer } from './adjustments';
import { addAdjustment, removeAdjustment, splitAdjustment } from './AdjustmentControls';
import './adjustments.css';

export function AdjustmentLabels() {
  const p = useEditor((s) => s.project),
    layers = p.adjustments ?? [];
  const toggle = (a: AdjustmentLayer, patch: Partial<AdjustmentLayer>) => {
    const s = useEditor.getState();
    s.commit(
      { ...s.project, adjustments: patchAdjustment(s.project.adjustments ?? [], a.id, patch) },
      'Adjustment settings',
    );
  };
  return (
    <>
      <div className="track-label adjustment-label">
        <b>FX</b>
        <button
          className="icon tiny"
          aria-label="Add adjustment layer"
          title="Add adjustment at playhead"
          disabled={duration(p) <= 0 || layers.length >= MAX_ADJUSTMENTS}
          onClick={addAdjustment}
        >
          <Plus size={14} />
        </button>
      </div>
      {[...layers].reverse().map((a, i) => (
        <div key={a.id} className="track-label adjustment-label" title={a.name}>
          <button
            className="text-button"
            aria-label={`Select adjustment ${a.name}`}
            onClick={() => useEditor.getState().selectAdjustment(a.id)}
          >
            FX{layers.length - i}
          </button>
          <button
            className="icon tiny"
            aria-label={`${a.locked ? 'Unlock' : 'Lock'} adjustment ${a.name}`}
            onClick={() => toggle(a, { locked: !a.locked })}
          >
            {a.locked ? <LockKeyhole size={13} /> : <UnlockKeyhole size={13} />}
          </button>
          <button
            className="icon tiny"
            aria-label={`${a.enabled ? 'Disable' : 'Enable'} adjustment ${a.name}`}
            disabled={a.locked}
            onClick={() => toggle(a, { enabled: !a.enabled })}
          >
            {a.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        </div>
      ))}
    </>
  );
}
export function AdjustmentLanes({
  zoom,
  snap,
  razor,
}: {
  zoom: number;
  snap: boolean;
  razor: boolean;
}) {
  const p = useEditor((s) => s.project),
    draft = useEditor((s) => s.previewAdjustment),
    selected = useEditor((s) => s.adjustmentSelection);
  const cleanup = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => cleanup.current?.(), []);
  function drag(e: ReactPointerEvent, layer: AdjustmentLayer, kind: 'move' | 'start' | 'end') {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const state = useEditor.getState(),
      snapshot = state.project;
    state.selectAdjustment(layer.id);
    if (layer.locked) return;
    const block = e.currentTarget.closest('.adjustment-block')!.getBoundingClientRect();
    if (razor) {
      splitAdjustment(layer.id, layer.start + (e.clientX - block.left) / zoom);
      return;
    }
    cleanup.current?.();
    const startX = e.clientX,
      pointer = e.pointerId,
      total = duration(snapshot),
      frame = 1 / snapshot.settings.fps;
    let latest: AdjustmentLayer | undefined;
    const points = [
      0,
      total,
      state.playhead,
      ...snapshot.clips.flatMap((c) => [c.start, clipEnd(c)]),
      ...(snapshot.adjustments ?? [])
        .filter((a) => a.id !== layer.id)
        .flatMap((a) => [a.start, a.end]),
    ];
    const near = (value: number) => {
      if (!snap) return value;
      let nearest = value, distance = 8 / zoom;
      for (const point of points) {
        const gap = Math.abs(point - value);
        if (gap < distance) { nearest = point; distance = gap; }
      }
      return nearest;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      const delta = Math.round((event.clientX - startX) / zoom / frame) * frame;
      let start = layer.start,
        end = layer.end;
      if (kind === 'move') {
        const length = end - start;
        const raw = start + delta,
          snappedStart = near(raw),
          snappedEnd = near(end + delta);
        start = Math.max(
          0,
          Math.min(
            Math.max(0, total - length),
            snappedStart !== raw
              ? snappedStart
              : snappedEnd !== end + delta
                ? snappedEnd - length
                : raw,
          ),
        );
        end = start + length;
      } else if (kind === 'start')
        start = Math.max(
          0,
          Math.min(end - Math.min(frame, (end - start) / 2), near(start + delta)),
        );
      else
        end = Math.max(
          start + Math.min(frame, (end - start) / 2),
          Math.min(Math.max(total, layer.end), near(end + delta)),
        );
      latest = { ...layer, start, end };
      useEditor.getState().setPreviewAdjustment(latest);
    };
    const clear = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key, true);
      unsubscribe();
      cleanup.current = undefined;
    };
    const cancel = () => {
      clear();
      useEditor.getState().setPreviewAdjustment(undefined);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      const current = useEditor.getState();
      const valid = current.project === snapshot && current.adjustmentSelection === layer.id;
      cancel();
      if (!valid) return;
      if (latest && Math.abs(event.clientX - startX) >= 3)
        current.commit(
          {
            ...snapshot,
            adjustments: patchAdjustment(snapshot.adjustments ?? [], layer.id, {
              start: latest.start,
              end: latest.end,
            }),
          },
          kind === 'move' ? 'Move adjustment layer' : 'Trim adjustment layer',
        );
      else
        current.seek(
          Math.max(0, Math.min(total, layer.start + (event.clientX - block.left) / zoom)),
        );
    };
    const unsubscribe = useEditor.subscribe((s) => {
      if (s.project !== snapshot || s.adjustmentSelection !== layer.id) cancel();
    });
    cleanup.current = cancel;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel, { once: true });
    window.addEventListener('blur', cancel, { once: true });
    window.addEventListener('keydown', key, true);
  }
  return (
    <>
      <div className="adjustment-lane">
        <button
          className="text-button"
          onClick={addAdjustment}
          disabled={!p.clips.length || (p.adjustments?.length ?? 0) >= MAX_ADJUSTMENTS}
        >
          + Adjustment layer
        </button>
      </div>
      {[...(p.adjustments ?? [])].reverse().map((original) => {
        const a = draft?.id === original.id ? draft : original;
        return (
          <div
            className={`adjustment-lane ${a.locked ? 'locked' : ''}`}
            key={a.id}
            onPointerDown={(e) => {
              if (e.button === 0)
                useEditor
                  .getState()
                  .seek(
                    Math.max(
                      0,
                      Math.min(
                        duration(p),
                        (e.clientX - e.currentTarget.getBoundingClientRect().left) / zoom,
                      ),
                    ),
                  );
            }}
          >
            <div
              role="button"
              tabIndex={0}
              aria-label={`Adjustment ${a.name}`}
              aria-pressed={selected === a.id}
              className={`adjustment-block ${a.enabled ? '' : 'disabled'} ${selected === a.id ? 'selected' : ''}`}
              style={{ left: a.start * zoom, width: Math.max(6, (a.end - a.start) * zoom) }}
              title={`${a.name} · ${a.start.toFixed(2)}–${a.end.toFixed(2)}s · Drag to move, edges to trim; arrow keys nudge one frame`}
              onPointerDown={(e) => drag(e, original, 'move')}
              onKeyDown={(e) => {
                const s = useEditor.getState();
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  s.selectAdjustment(a.id);
                  s.seek(a.start);
                } else if (e.key === 'Delete' || e.key === 'Backspace') {
                  e.preventDefault();
                  e.stopPropagation();
                  removeAdjustment(a.id);
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault();
                  e.stopPropagation();
                  if (a.locked) return;
                  const delta =
                    ((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1)) / p.settings.fps;
                  const start = Math.max(
                    0,
                    Math.min(Math.max(0, duration(p) - (a.end - a.start)), a.start + delta),
                  );
                  s.selectAdjustment(a.id);
                  s.commit(
                    {
                      ...p,
                      adjustments: patchAdjustment(p.adjustments ?? [], a.id, {
                        start,
                        end: start + a.end - a.start,
                      }),
                    },
                    'Nudge adjustment layer',
                  );
                }
              }}
            >
              <span>{a.name}</span>
              <span
                className="adjustment-edge start"
                aria-label="Trim adjustment start"
                onPointerDown={(e) => drag(e, original, 'start')}
              />
              <span
                className="adjustment-edge end"
                aria-label="Trim adjustment end"
                onPointerDown={(e) => drag(e, original, 'end')}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}
