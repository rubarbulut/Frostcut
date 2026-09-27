import { useEffect, useRef, useState } from 'react';
import { Field } from './components';
import { downloadBlob } from './store';
import {
  chooseExportFolder,
  exportFilename,
  isSaveCancelled,
  saveInExportFolder,
  supportsExportFolder,
  type ExportFolder,
} from './export-destination';

// Remember only for this open editor session; no persistent filesystem permission or path.
let sessionFolder: ExportFolder | undefined;

export function ExportDestination({
  blob,
  defaultName,
  extension,
  downloadLabel,
  disabled = false,
  onBusyChange,
}: {
  blob?: Blob;
  defaultName: string;
  extension: 'zip' | 'mp4';
  downloadLabel: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [folder, setFolder] = useState(sessionFolder);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const saving = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      saving.current?.abort();
    };
  }, []);
  useEffect(() => {
    setName(defaultName);
  }, [defaultName]);
  useEffect(() => {
    setMessage('');
    setError('');
  }, [blob]);
  const filename = exportFilename(name, extension);
  async function pick() {
    setWorking(true);
    onBusyChange?.(true);
    setError('');
    setMessage('');
    try {
      const next = await chooseExportFolder();
      if (mounted.current) {
        sessionFolder = next;
        setFolder(next);
      }
    } catch (e) {
      if (mounted.current && !isSaveCancelled(e))
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) {
        setWorking(false);
        onBusyChange?.(false);
      }
    }
  }
  async function save() {
    if (!blob || saving.current) return;
    const c = new AbortController();
    saving.current = c;
    setWorking(true);
    onBusyChange?.(true);
    setError('');
    setMessage('');
    try {
      if (folder) {
        const savedName = await saveInExportFolder(folder, filename, blob, c.signal);
        if (mounted.current) setMessage(`Saved to ${folder.name} / ${savedName}`);
      } else {
        downloadBlob(blob, filename);
        setMessage(`Download requested: ${filename}. Check your browser downloads.`);
      }
    } catch (e) {
      if (mounted.current && !isSaveCancelled(e))
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      saving.current = null;
      if (mounted.current) {
        setWorking(false);
        onBusyChange?.(false);
      }
    }
  }
  return (
    <fieldset className="export-destination" disabled={disabled || working}>
      <legend>Save location</legend>
      <Field label="Output file name">
        <input
          value={name}
          maxLength={110}
          onChange={(e) => {
            setName(e.target.value);
            setMessage('');
          }}
        />
      </Field>
      <p className="subtle output-path">
        {folder ? `${folder.name} / ${filename}` : `Browser downloads / ${filename}`}
      </p>
      <div className="button-row">
        {supportsExportFolder() && (
          <button className="secondary" onClick={pick}>
            {folder ? 'Change folder…' : 'Choose folder…'}
          </button>
        )}
        {folder && (
          <button
            className="text-button"
            onClick={() => {
              sessionFolder = undefined;
              setFolder(undefined);
              setError('');
              setMessage('');
            }}
          >
            Use browser downloads
          </button>
        )}
      </div>
      <small className="subtle">
        {folder
          ? 'Existing names get a numbered copy. This folder is remembered until you close or reload the editor.'
          : supportsExportFolder()
            ? 'Choose a folder, or use your browser’s download location.'
            : 'Folder selection is unavailable here. To choose a location for each download, enable “Ask where to save” in your browser’s download settings.'}
      </small>
      {blob && (
        <button className="primary full" onClick={save}>
          {working
            ? 'Saving…'
            : folder
              ? `Save ${extension === 'zip' ? 'ZIP' : 'MP4'} to folder`
              : downloadLabel}
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert">
          {error}
          {blob && ' The rendered file is still available; you can retry saving.'}
        </p>
      )}
    </fieldset>
  );
}
