import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, mediaFiles } from './store';
import { switchSequence, sequenceViews } from './sequences';
import { exportMp4 } from './media';
import { zipFiles, type ZipProgress } from './zip';
import { duration, timecode } from './model';
import { estimatedMegabytes } from './export-settings';
import { ExportDestination } from './ExportDestination';
import { batchPlan } from './batch-plan';
type PartStatus = 'Waiting' | 'Rendering' | 'Rendered' | 'Cancelled' | 'Failed' | 'Skipped';
export function BatchExport() {
  const p = useEditor((state) => state.project);
  const setPlaying = useEditor((state) => state.setPlaying);
  const mediaRevision = useEditor((state) => state.mediaRevision);
  const sequences = useMemo(() => sequenceViews(p), [p]);
  const summaries = useMemo(
    () =>
      new Map(
        sequences.map((s) => {
          const project = { ...p, ...s };
          return [s.id, { seconds: duration(project), megabytes: estimatedMegabytes(project) }];
        }),
      ),
    [p, sequences],
  );
  const [selected, setSelected] = useState(
      sequences.filter((s) => s.id !== sequences[0]?.id).map((s) => s.id),
    ),
    [busy, setBusy] = useState(false),
    [cancelling, setCancelling] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    [blob, setBlob] = useState<Blob>();
  const [saving, setSaving] = useState(false);
  const [packing, setPacking] = useState<ZipProgress>();
  const [queue, setQueue] = useState<Record<string, PartStatus>>({});
  const chosen = useMemo(
    () => sequences.filter((s) => selected.includes(s.id)),
    [sequences, selected],
  );
  const totals = useMemo(
    () =>
      chosen.reduce(
        (sum, s) => ({
          seconds: sum.seconds + summaries.get(s.id)!.seconds,
          megabytes: sum.megabytes + summaries.get(s.id)!.megabytes,
        }),
        { seconds: 0, megabytes: 0 },
      ),
    [chosen, summaries],
  );
  const controlsBusy = busy || saving;
  const plan = useMemo(() => batchPlan(p, selected, mediaFiles), [p, selected, mediaRevision]);
  function select(ids: string[]) {
    setSelected(ids);
    setBlob(undefined);
    setQueue({});
    setStatus('');
    setError('');
    setPacking(undefined);
  }
  const abort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      const controller = abort.current;
      abort.current = null;
      controller?.abort();
    },
    [],
  );
  function cancel() {
    if (!abort.current || abort.current.signal.aborted) return;
    setCancelling(true);
    setStatus('Stopping the current export and clearing this batch…');
    abort.current.abort();
  }
  async function run() {
    if (abort.current || saving || !chosen.length) return;
    const snapshot = useEditor.getState().project;
    const checked = batchPlan(snapshot, selected, mediaFiles);
    if (checked.errors.length) {
      setError(checked.errors.join(' '));
      return;
    }
    const parts = checked.entries;
    const c = new AbortController();
    abort.current = c;
    setBusy(true);
    setCancelling(false);
    setStatus('Preparing batch…');
    setError('');
    setBlob(undefined);
    setPacking(undefined);
    setPlaying(false);
    setQueue(Object.fromEntries(parts.map((s) => [s.id, 'Waiting' as PartStatus])));
    let currentId: string | undefined;
    try {
      const files: { name: string; blob: Blob }[] = [];
      for (let i = 0; i < parts.length; i++) {
        c.signal.throwIfAborted();
        const sequence = parts[i];
        currentId = sequence.id;
        setQueue((q) => ({ ...q, [sequence.id]: 'Rendering' }));
        const project = switchSequence(snapshot, sequence.id);
        const rendered = await exportMp4(project, c.signal, (message, percent) => {
          if (c.signal.aborted || abort.current !== c) return;
          setStatus(
            `${i + 1}/${parts.length} · ${sequence.name} · ${message}${percent === undefined ? '' : ` ${Math.round(percent)}%`}`,
          );
        });
        c.signal.throwIfAborted();
        files.push({
          name: sequence.filename,
          blob: rendered,
        });
        setQueue((q) => ({ ...q, [sequence.id]: 'Rendered' }));
        currentId = undefined;
      }
      c.signal.throwIfAborted();
      setStatus('Packing MP4 files…');
      const zip = await zipFiles(files, c.signal, (progress) => {
        if (c.signal.aborted || abort.current !== c) return;
        setPacking(progress);
      });
      c.signal.throwIfAborted();
      setBlob(zip);
      setStatus(`${parts.length} videos ready. Your active sequence is unchanged.`);
    } catch (e) {
      if (abort.current !== c) return;
      setQueue((q) =>
        Object.fromEntries(
          Object.entries(q).map(([id, state]) => [
            id,
            id === currentId
              ? c.signal.aborted
                ? 'Cancelled'
                : 'Failed'
              : state === 'Waiting'
                ? 'Skipped'
                : state,
          ]),
        ),
      );
      if (!c.signal.aborted) {
        setStatus('Batch stopped before completion.');
        setError(e instanceof Error ? e.message : String(e));
      } else setStatus('Batch cancelled. No partial ZIP was created.');
    } finally {
      if (abort.current === c) {
        abort.current = null;
        setBusy(false);
        setCancelling(false);
        setPacking(undefined);
      }
    }
  }
  return (
    <div className="creator-section">
      <p>
        Export saved Shorts together. Each sequence uses its own export dimensions and quality.
        Videos render one at a time to limit memory use.
      </p>
      <p>Closing Creator tools or switching to another tool cancels the batch.</p>
      {!sequences.length && <p>Create parts with Split or Shorts from Auto Cut first.</p>}
      <div className="button-row">
        <button
          className="secondary"
          disabled={controlsBusy || !sequences.length}
          onClick={() => select(sequences.map((s) => s.id))}
        >
          Select all
        </button>
        <button
          className="text-button"
          disabled={controlsBusy || !chosen.length}
          onClick={() => select([])}
        >
          Clear selection
        </button>
      </div>
      <p className="batch-summary">
        {chosen.length} selected · {timecode(totals.seconds)} total · estimated{' '}
        {totals.megabytes.toFixed(1)} MB
      </p>
      {totals.megabytes >= 3800 && (
        <p className="caption-error">
          This selection may exceed the ZIP size limit. Export fewer parts per batch.
        </p>
      )}
      <div className="batch-sequences">
        {sequences.map((s) => (
          <label key={s.id}>
            <input
              type="checkbox"
              checked={selected.includes(s.id)}
              disabled={controlsBusy}
              onChange={(e) => {
                select(
                  e.target.checked ? [...selected, s.id] : selected.filter((id) => id !== s.id),
                );
              }}
            />
            <span>
              {s.name}
              <small>
                {timecode(summaries.get(s.id)!.seconds)} · {s.exportSettings.width}×
                {s.exportSettings.height} · {s.exportSettings.fps} fps · quality{' '}
                {s.exportSettings.quality}
              </small>
            </span>
            {queue[s.id] && (
              <span className="batch-state" data-state={queue[s.id]}>
                {queue[s.id]}
              </span>
            )}
          </label>
        ))}
      </div>
      {!!selected.length && !!plan.errors.length && (
        <div className="batch-preflight" role="alert">
          <strong>Before exporting</strong>
          <ul>
            {plan.errors.map((issue, index) => (
              <li key={index}>{issue}</li>
            ))}
          </ul>
          <p>Relink missing files in Media, or deselect the affected parts.</p>
        </div>
      )}
      {!!plan.entries.length && (
        <details className="batch-file-preview">
          <summary>Preview {plan.entries.length} output filenames</summary>
          <ol>
            {plan.entries.map((entry) => (
              <li key={entry.id}>
                <code>{entry.filename}</code>
              </li>
            ))}
          </ol>
        </details>
      )}
      <ExportDestination
        blob={blob}
        defaultName={`${p.name}-shorts`}
        extension="zip"
        downloadLabel="Download Shorts ZIP"
        disabled={busy}
        onBusyChange={setSaving}
      />
      <button
        className="primary"
        disabled={controlsBusy || !chosen.length || !!plan.errors.length}
        onClick={run}
      >
        Export selected Shorts (.zip)
      </button>
      {busy && (
        <button className="secondary" disabled={cancelling} onClick={cancel}>
          {cancelling ? 'Stopping batch…' : 'Cancel batch export'}
        </button>
      )}
      {status && <p role="status">{status}</p>}
      {packing && !cancelling && (
        <div className="batch-packing">
          <label htmlFor="batch-zip-progress">
            Packing ZIP · {packing.completedFiles}/{packing.totalFiles} files ·{' '}
            {(packing.processedBytes / 1e6).toFixed(1)} / {(packing.totalBytes / 1e6).toFixed(1)} MB
          </label>
          <progress
            id="batch-zip-progress"
            aria-label="ZIP packaging progress"
            value={packing.totalBytes ? packing.processedBytes : packing.completedFiles}
            max={packing.totalBytes || packing.totalFiles || 1}
          />
          <small>{packing.currentFile}</small>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
