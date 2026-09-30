import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { isLocked, timecode, type MediaClip as Clip, type Project } from './model';
import { mediaUrls, useEditor } from './store';
import { Field, Modal } from './components';
import { NumberField } from './CaptionTextControls';
import { editTrackingPoint, setClipTracking, trackingResultIsCurrent } from './clip-tracking';
import { MAX_TRACKING_POINTS, trackingPointAt, trackingPointIndex, type ClipTracking } from './tracking-data';
import type { TrackingRegion } from './region-tracker';
import { TrackingSource, trackingFrameCount } from './tracking-source';
import { runSourceTracking } from './tracking-job';
import './motion-tracking.css';

function TrackingNumber({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(+value.toFixed(6))), cancelled = useRef(false);
  useEffect(() => setDraft(String(+value.toFixed(6))), [value]);
  const save = () => {
    if (cancelled.current) { cancelled.current = false; return; }
    const n = Number(draft);
    if (draft.trim() && Number.isFinite(n) && n >= min && n <= max && n !== +value.toFixed(6)) onChange(n);
    else setDraft(String(+value.toFixed(6)));
  };
  return <Field label={label}><input type="number" value={draft} min={min} max={max} step="0.001"
    onChange={(e) => setDraft(e.target.value)} onBlur={save} onKeyDown={(e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelled.current = true; setDraft(String(+value.toFixed(6))); e.currentTarget.blur(); }
    }} /></Field>;
}

function SavedTrackingPoints({ clip }: { clip: Clip }) {
  const tracking = clip.tracking!, [selected, select] = useState(0), [error, setError] = useState('');
  const index = Math.min(selected, tracking.points.length - 1), point = tracking.points[index];
  const update = (next: ClipTracking) => {
    try {
      const current = useEditor.getState();
      current.commit(setClipTracking(current.project, clip.id, next), 'Edit tracking point'); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not edit the point.'); }
  };
  const jump = () => { const state = useEditor.getState(); state.setPlaying(false);
    state.seek(clip.start + (point.time - clip.sourceStart) / clip.properties.speed); };
  const edit = (patch: Parameters<typeof editTrackingPoint>[2]) => {
    try { update(editTrackingPoint(tracking, index, patch)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not edit the point.'); }
  };
  const sourceTime = clip.sourceStart + (useEditor((s) => s.playhead) - clip.start) * clip.properties.speed;
  const insertion = trackingPointIndex(tracking.points, sourceTime);
  const canInsert = sourceTime >= tracking.start && sourceTime < tracking.end &&
    tracking.points.length < MAX_TRACKING_POINTS &&
    ![tracking.points[insertion], tracking.points[insertion - 1]].some((p) => p && Math.abs(p.time - sourceTime) < 1e-6);
  return <details className="tracking-point-editor"><summary>Edit saved points ({tracking.points.length.toLocaleString()})</summary>
    <small className="subtle">All points are retained. One point is displayed at a time. Editing makes it manual. The first point anchors compensation.</small>
    <div className="button-row">
      <button disabled={index === 0} onClick={() => select(index - 1)} aria-label="Previous tracking point">←</button>
      <NumberField label="Point" value={index + 1} min={1} max={tracking.points.length} step={1} onChange={(n) => select(Math.round(n) - 1)} />
      <button disabled={index === tracking.points.length - 1} onClick={() => select(index + 1)} aria-label="Next tracking point">→</button>
      <button onClick={jump} disabled={point.time < clip.sourceStart || point.time >= clip.sourceEnd}>Jump</button>
    </div>
    <div className="tracking-grid">
      <TrackingNumber label="Source seconds" value={point.time} min={index ? tracking.points[index - 1].time + 1e-6 : 0}
        max={index < tracking.points.length - 1 ? tracking.points[index + 1].time - 1e-6 : tracking.end - 1e-6}
        onChange={(time) => edit({ time })} />
      <TrackingNumber label="Source X %" value={point.x * 100} min={0} max={100} onChange={(x) => edit({ x: x / 100 })} />
      <TrackingNumber label="Source Y %" value={point.y * 100} min={0} max={100} onChange={(y) => edit({ y: y / 100 })} />
    </div>
    <small className="subtle">{point.manual ? 'Manual point' : `Measured correlation ${point.correlation!.toFixed(3)}${point.margin === undefined ? '' : ` · margin ${point.margin.toFixed(3)}`}`}</small>
    <div className="button-row">
      <button disabled={!canInsert} onClick={() => {
        const p = trackingPointAt(tracking.points, sourceTime);
        const points = [...tracking.points, { time: sourceTime, x: p.x, y: p.y, manual: true as const }].sort((a, b) => a.time - b.time);
        update({ ...tracking, points }); select(points.findIndex((v) => v.time === sourceTime));
      }}>Add at playhead</button>
      <button disabled={index === 0 || tracking.points.length <= 2} onClick={() => update({ ...tracking, points: tracking.points.filter((_, i) => i !== index) })}>Delete point</button>
    </div>
    {error && <p className="tracking-error" role="alert">{error}</p>}
  </details>;
}

type Reference = { time: number; requestedTime: number; width: number; height: number; project: Project; url: string };
type Result = Awaited<ReturnType<typeof runSourceTracking>> & { project: Project; url: string };
function TrackingDialog({ clip, onClose }: { clip: Clip; onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const selected = useEditor((s) => s.selected);
  useEditor((s) => s.mediaRevision);
  const url = mediaUrls.get(clip.mediaId), locked = isLocked(project, clip);
  const [start, setStart] = useState(clip.sourceStart), [end, setEnd] = useState(clip.sourceEnd);
  const [fps, setFps] = useState(Math.min(30, project.settings.fps)), [resolution, setResolution] = useState(480);
  const [radius, setRadius] = useState(24), [correlation, setCorrelation] = useState(0.72), [margin, setMargin] = useState(0.04);
  const [region, setRegion] = useState<TrackingRegion>({ x: 0.4, y: 0.4, width: 0.2, height: 0.2 });
  const [reference, setReference] = useState<Reference>(), [result, setResult] = useState<Result>();
  const [busy, setBusy] = useState<'reference' | 'tracking'>(), [error, setError] = useState('');
  const [progress, setProgress] = useState({ completed: 0, total: 1, time: start });
  const canvas = useRef<HTMLCanvasElement>(null), job = useRef<AbortController | undefined>(undefined);
  const alive = useRef(true), selection = useRef<{ id: number; x: number; y: number; original: TrackingRegion } | undefined>(undefined);
  const current = (snapshot: Project, sourceUrl: string) => {
    const state = useEditor.getState();
    return alive.current && state.selected.includes(clip.id) && trackingResultIsCurrent(snapshot, state.project, clip.id, sourceUrl, mediaUrls.get(clip.mediaId));
  };
  useEffect(() => { alive.current = true; return () => { alive.current = false; job.current?.abort(); }; }, []);
  useEffect(() => { job.current?.abort(); setReference(undefined); setResult(undefined); }, [project, url]);
  useEffect(() => { if (locked || !selected.includes(clip.id)) job.current?.abort(); }, [locked, selected, clip.id]);
  const close = () => { job.current?.abort(); onClose(); };
  let count = 0, rangeError = '';
  try { count = trackingFrameCount(start, end, fps); } catch (cause) { rangeError = (cause as Error).message; }
  const ready = reference && reference.requestedTime === start && current(reference.project, reference.url);
  async function loadReference() {
    if (!url || locked || busy) return;
    const snapshot = useEditor.getState().project, controller = new AbortController(); job.current = controller;
    useEditor.getState().setPlaying(false); setBusy('reference'); setError(''); setResult(undefined);
    let source: TrackingSource | undefined;
    try {
      source = await TrackingSource.open(url, controller.signal, resolution);
      const frame = await source.read(start);
      if (!current(snapshot, url)) return;
      const c = canvas.current, context = c?.getContext('2d');
      if (!c || !context) throw new Error('The source preview canvas is unavailable.');
      c.width = frame.width; c.height = frame.height;
      context.putImageData(new ImageData(frame.rgba, frame.width, frame.height), 0, 0);
      setReference({ time: frame.time, requestedTime: start, width: frame.width, height: frame.height, project: snapshot, url });
    } catch (cause) {
      if (alive.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load the source.');
    } finally { source?.dispose(); if (job.current === controller) job.current = undefined; if (alive.current) setBusy(undefined); }
  }
  async function track() {
    if (!url || !ready || locked || busy || rangeError) return;
    const snapshot = useEditor.getState().project, controller = new AbortController(); job.current = controller;
    useEditor.getState().setPlaying(false); setBusy('tracking'); setError(''); setResult(undefined);
    setProgress({ completed: 0, total: count, time: start });
    try {
      const output = await runSourceTracking(url, start, end, fps, resolution, region,
        { searchRadius: radius, minCorrelation: correlation, minMargin: margin }, controller.signal,
        (completed, total, time) => { if (alive.current) setProgress({ completed, total, time }); });
      if (current(snapshot, url)) setResult({ ...output, project: snapshot, url });
    } catch (cause) {
      if (alive.current) setError(controller.signal.aborted ? 'Tracking cancelled. No motion was applied.' : cause instanceof Error ? cause.message : 'Tracking failed.');
    } finally { if (job.current === controller) job.current = undefined; if (alive.current) setBusy(undefined); }
  }
  const position = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  const clearPreview = () => { setReference(undefined); setResult(undefined); };
  const points = result?.points ?? [];
  // Only the review drawing is decimated; all measured data is preserved.
  const stride = Math.max(1, Math.ceil(points.length / 1024));
  const path = points.filter((_, i) => i % stride === 0 || i === points.length - 1).map((p) => `${p.x * 1000},${p.y * 1000}`).join(' ');
  return <Modal title="Local motion tracking" onClose={close} wide>
    <div className="tracking-dialog">
      <p className="subtle">Select a textured detail in the original source. Tracking compensates its translation while preserving your existing animation. The selected range runs only when you press Track.</p>
      <fieldset disabled={!!busy || locked}>
        <div className="tracking-grid">
          <TrackingNumber label="Source start (seconds)" value={start} min={clip.sourceStart} max={Math.max(clip.sourceStart, end - 0.001)} onChange={(v) => { setStart(v); clearPreview(); }} />
          <TrackingNumber label="Source end (seconds)" value={end} min={start + 0.001} max={clip.sourceEnd} onChange={(v) => { setEnd(v); setResult(undefined); }} />
          <NumberField label="Samples / second" value={fps} min={1} max={60} step={1} onChange={(v) => { setFps(v); setResult(undefined); }} />
          <Field label="Analysis longest side"><select value={resolution} onChange={(e) => { setResolution(Number(e.target.value)); clearPreview(); }}>
            <option value={320}>320 px</option><option value={480}>480 px</option><option value={640}>640 px</option>
          </select></Field>
        </div>
        <p className="subtle">{rangeError || `${count.toLocaleString()} samples · output resolution and frame rate stay unchanged.`}</p>
        <button disabled={!url} onClick={() => void loadReference()}>Load original reference</button>
      </fieldset>
      <div className="tracking-source-view" tabIndex={0} aria-label="Drag a rectangle on the original source to select a tracking region"
        style={{ aspectRatio: reference ? `${reference.width}/${reference.height}` : '16/9',
          width: reference ? `min(100%, ${45 * reference.width / reference.height}vh)` : '100%' }}
        onKeyDown={(e) => { if (e.key === 'Escape' && selection.current) { e.preventDefault(); e.stopPropagation(); setRegion(selection.current.original); selection.current = undefined; } }}
        onPointerDown={(e) => { if (!ready || busy || locked || e.button !== 0) return;
          e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId);
          const p = position(e); selection.current = { id: e.pointerId, ...p, original: region }; setResult(undefined);
        }}
        onPointerMove={(e) => { const initial = selection.current; if (!initial || initial.id !== e.pointerId) return;
          const p = position(e); setRegion({ x: Math.min(initial.x, p.x), y: Math.min(initial.y, p.y), width: Math.abs(p.x - initial.x), height: Math.abs(p.y - initial.y) });
        }}
        onPointerUp={(e) => { const initial = selection.current; if (!initial || initial.id !== e.pointerId) return;
          const p = position(e), next = { x: Math.min(initial.x, p.x), y: Math.min(initial.y, p.y), width: Math.abs(p.x - initial.x), height: Math.abs(p.y - initial.y) };
          if (!reference || next.width * reference.width < 8 || next.height * reference.height < 8) { setRegion(initial.original); setError('Select a region at least 8 pixels wide and high at analysis size.'); }
          else { setRegion(next); setError(''); } selection.current = undefined;
        }}
        onPointerCancel={() => { if (selection.current) setRegion(selection.current.original); selection.current = undefined; }}
        onLostPointerCapture={() => { if (selection.current) setRegion(selection.current.original); selection.current = undefined; }}>
        <canvas ref={canvas} style={{ visibility: ready ? 'visible' : 'hidden' }} />
        {!ready && <span className="tracking-source-placeholder">Load a reference frame to select a region</span>}
        {ready && <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
          <rect x={region.x * 1000} y={region.y * 1000} width={region.width * 1000} height={region.height * 1000} className="tracking-region" />
          {path && <polyline points={path} className="tracking-path" />}
        </svg>}
      </div>
      <fieldset disabled={!!busy || locked}>
        <div className="tracking-grid">
          <NumberField label="Region left %" value={region.x * 100} min={0} max={(1 - region.width) * 100} onChange={(v) => { setRegion({ ...region, x: v / 100 }); setResult(undefined); }} />
          <NumberField label="Region top %" value={region.y * 100} min={0} max={(1 - region.height) * 100} onChange={(v) => { setRegion({ ...region, y: v / 100 }); setResult(undefined); }} />
          <NumberField label="Region width %" value={region.width * 100} min={reference ? 800 / reference.width : 1} max={(1 - region.x) * 100} onChange={(v) => { setRegion({ ...region, width: v / 100 }); setResult(undefined); }} />
          <NumberField label="Region height %" value={region.height * 100} min={reference ? 800 / reference.height : 1} max={(1 - region.y) * 100} onChange={(v) => { setRegion({ ...region, height: v / 100 }); setResult(undefined); }} />
        </div>
        <details><summary>Search and match thresholds</summary><div className="tracking-grid">
          <NumberField label="Search radius (analysis px)" value={radius} min={2} max={64} step={1} onChange={(v) => { setRadius(Math.round(v)); setResult(undefined); }} />
          <NumberField label="Minimum correlation" value={correlation} min={0.1} max={1} onChange={(v) => { setCorrelation(v); setResult(undefined); }} />
          <NumberField label="Minimum match margin" value={margin} min={0} max={1} onChange={(v) => { setMargin(v); setResult(undefined); }} />
        </div><small className="subtle">Match scores are thresholds for texture similarity. Rotation, scale changes, occlusion and repeated patterns can cause loss. Short ranges are easier to review.</small></details>
      </fieldset>
      <div className="button-row">
        <button className="primary" disabled={!ready || !!busy || locked || !!rangeError} onClick={() => void track()}>Track selected range</button>
        {busy && <button onClick={() => job.current?.abort()}>Cancel {busy === 'tracking' ? 'tracking' : 'source load'}</button>}
      </div>
      {busy === 'tracking' && <div role="status"><progress value={progress.completed} max={progress.total} /><span> {progress.completed.toLocaleString()} / {progress.total.toLocaleString()} · source {timecode(progress.time, true)}</span></div>}
      {error && <p role="alert" className="tracking-error">{error}</p>}
      {result && <section className="tracking-review" aria-label="Tracking result review">
        <b>{result.points.length.toLocaleString()} measured points</b>
        <p>{result.lost ? `Stopped at ${timecode(result.lost.time, true)}: ${result.lost.reason === 'ambiguous' ? 'ambiguous match' : 'low correlation'}. Correlation ${result.lost.correlation.toFixed(3)}, margin ${result.lost.margin.toFixed(3)}. No positions were invented after loss.` : 'The selected source range was tracked.'}</p>
        <p className="subtle">{result.tracking ? `Compensation covers source ${timecode(result.tracking.start, true)}–${timecode(result.tracking.end, true)}. Outside this range the original animation resumes; this can create a visible jump. Applying replaces this clip’s existing tracking layer. All points can be edited after applying.` : 'At least two measured points are required. Choose a more distinctive region or a shorter range.'}</p>
        <button className="primary" disabled={!result.tracking || locked || !current(result.project, result.url)} onClick={() => {
          if (!result.tracking || !current(result.project, result.url)) return;
          const state = useEditor.getState();
          try { state.commit(setClipTracking(state.project, clip.id, result.tracking), 'Apply source motion tracking'); close(); }
          catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not apply tracking.'); }
        }}>{result.lost ? 'Apply tracked portion' : 'Apply measured motion'}</button>
      </section>}
    </div>
  </Modal>;
}

export function MotionTrackingControls({ clip }: { clip: Clip }) {
  const project = useEditor((s) => s.project);
  const selected = useEditor((s) => s.selected);
  useEditor((s) => s.mediaRevision);
  const [open, setOpen] = useState(false), [error, setError] = useState('');
  const locked = isLocked(project, clip), tracking = clip.tracking, url = mediaUrls.get(clip.mediaId);
  useEffect(() => { if (!selected.includes(clip.id) || locked) setOpen(false); }, [selected, locked, clip.id]);
  const update = (next: ClipTracking | undefined) => {
    try { const state = useEditor.getState(); state.commit(setClipTracking(state.project, clip.id, next), 'Edit motion tracking'); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not change tracking.'); }
  };
  return <div className="motion-tracking-controls">
    <div className="property-divider" />
    <details><summary>Motion tracking</summary>
      <small className="subtle">Local source-region translation tracking. Existing transform fields continue to edit your base animation.</small>
      <fieldset disabled={locked}>
        <button disabled={!url} onClick={() => setOpen(true)}>{tracking ? 'Track a new source region…' : 'Select source region…'}</button>
        {!url && <small className="subtle">Relink the original local video first.</small>}
        {tracking && <>
          <label className="check-row"><input type="checkbox" checked={tracking.enabled} onChange={(e) => update({ ...tracking, enabled: e.target.checked })} />Enable tracked motion</label>
          <small className="subtle">{tracking.points.length.toLocaleString()} points · source {timecode(tracking.start, true)}–{timecode(tracking.end, true)}</small>
          <SavedTrackingPoints clip={clip} />
          <button onClick={() => update(undefined)}>Remove tracking layer</button>
        </>}
      </fieldset>
      {error && <p role="alert" className="tracking-error">{error}</p>}
    </details>
    {open && <TrackingDialog clip={clip} onClose={() => setOpen(false)} />}
  </div>;
}
