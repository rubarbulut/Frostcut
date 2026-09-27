import { useEffect, useRef, useState } from 'react';
import { useEditor, downloadBlob } from './store';
import { switchSequence, syncSequence } from './sequences';
import { exportMp4 } from './media';
import { zipFiles, safeFilename } from './zip';
import { duration, timecode } from './model';
export function BatchExport() {
  const p = useEditor((state) => state.project);
  const setPlaying = useEditor((state) => state.setPlaying);
  const sequences = syncSequence(p).sequences ?? [];
  const [selected, setSelected] = useState(
      sequences.filter((s) => s.id !== sequences[0]?.id).map((s) => s.id),
    ),
    [busy, setBusy] = useState(false),
    [cancelling, setCancelling] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    [blob, setBlob] = useState<Blob>();
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
    if (abort.current) return;
    const c = new AbortController();
    abort.current = c;
    setBusy(true);
    setCancelling(false);
    setStatus('Preparing batch…');
    setError('');
    setBlob(undefined);
    setPlaying(false);
    try {
      const files: { name: string; blob: Blob }[] = [];
      const chosen = sequences.filter((s) => selected.includes(s.id));
      for (let i = 0; i < chosen.length; i++) {
        c.signal.throwIfAborted();
        const sequence = chosen[i];
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
      }
      c.signal.throwIfAborted();
      setStatus('Packing MP4 files…');
      const zip = await zipFiles(files, c.signal);
      c.signal.throwIfAborted();
      setBlob(zip);
      setStatus(`${chosen.length} videos ready. Your active sequence is unchanged.`);
    } catch (e) {
      if (abort.current !== c) return;
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
      <div className="batch-sequences">
        {sequences.map((s) => (
          <label key={s.id}>
            <input
              type="checkbox"
              checked={selected.includes(s.id)}
              disabled={busy}
              onChange={(e) => {
                setBlob(undefined);
                setSelected(
                  e.target.checked ? [...selected, s.id] : selected.filter((id) => id !== s.id),
                );
              }}
            />
            <span>
              {s.name}
              <small>
                {timecode(duration({ ...p, ...s }))} · {s.exportSettings.width}×
                {s.exportSettings.height} · {s.exportSettings.fps} fps · quality{' '}
                {s.exportSettings.quality}
              </small>
            </span>
          </label>
        ))}
      </div>
      <button className="primary" disabled={busy || !selected.length} onClick={run}>
        Export selected Shorts (.zip)
      </button>
      {busy && (
        <button className="secondary" disabled={cancelling} onClick={cancel}>
          {cancelling ? 'Stopping batch…' : 'Cancel batch export'}
        </button>
      )}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      {blob && (
        <button
          className="primary"
          onClick={() => downloadBlob(blob, `${safeFilename(p.name)}-shorts.zip`)}
        >
          Download Shorts ZIP
        </button>
      )}
    </div>
  );
}
