import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from './store';
import { switchSequence, sequenceViews } from './sequences';
import { exportMp4 } from './media';
import { zipFiles, safeFilename } from './zip';
import { duration, timecode } from './model';
import { estimatedMegabytes } from './export-settings';
import { ExportDestination } from './ExportDestination';
type PartStatus = 'Waiting' | 'Rendering' | 'Rendered' | 'Cancelled' | 'Failed' | 'Skipped';
export function BatchExport() {
  const p = useEditor((state) => state.project);
  const setPlaying = useEditor((state) => state.setPlaying);
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
  function select(ids: string[]) {
    setSelected(ids);
    setBlob(undefined);
    setQueue({});
    setStatus('');
    setError('');
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
    const c = new AbortController();
    abort.current = c;
    setBusy(true);
    setCancelling(false);
    setStatus('Preparing batch…');
    setError('');
    setBlob(undefined);
    setPlaying(false);
    setQueue(Object.fromEntries(chosen.map((s) => [s.id, 'Waiting' as PartStatus])));
    let currentId: string | undefined;
    try {
      const files: { name: string; blob: Blob }[] = [];
      for (let i = 0; i < chosen.length; i++) {
        c.signal.throwIfAborted();
        const sequence = chosen[i];
        currentId = sequence.id;
        setQueue((q) => ({ ...q, [sequence.id]: 'Rendering' }));
        const project = switchSequence(p, sequence.id);
        const rendered = await exportMp4(project, c.signal, (message, percent) => {
          if (c.signal.aborted || abort.current !== c) return;
          setStatus(
            `${i + 1}/${chosen.length} · ${sequence.name} · ${message}${percent === undefined ? '' : ` ${Math.round(percent)}%`}`,
          );
        });
        c.signal.throwIfAborted();
        files.push({
          name: `${String(i + 1).padStart(2, '0')}-${safeFilename(sequence.name)}.mp4`,
          blob: rendered,
        });
        setQueue((q) => ({ ...q, [sequence.id]: 'Rendered' }));
        currentId = undefined;
      }
      c.signal.throwIfAborted();
      setStatus('Packing MP4 files…');
      const zip = await zipFiles(files, c.signal);
      c.signal.throwIfAborted();
      setBlob(zip);
      setStatus(`${chosen.length} videos ready. Your active sequence is unchanged.`);
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
      <ExportDestination
        blob={blob}
        defaultName={`${p.name}-shorts`}
        extension="zip"
        downloadLabel="Download Shorts ZIP"
        disabled={busy}
        onBusyChange={setSaving}
      />
      <button className="primary" disabled={controlsBusy || !chosen.length} onClick={run}>
        Export selected Shorts (.zip)
      </button>
      {busy && (
        <button className="secondary" disabled={cancelling} onClick={cancel}>
          {cancelling ? 'Stopping batch…' : 'Cancel batch export'}
        </button>
      )}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
