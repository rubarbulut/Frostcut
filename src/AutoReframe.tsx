import { useEffect, useRef, useState } from 'react';
import { isAudioClip, isLocked, isMediaClip, type Project } from './model';
import { useEditor, mediaUrls } from './store';
import { detectFacePath, reframeClip } from './reframe';
import { EditPreview } from './EditPreview';
import { Field } from './components';
export function AutoReframe() {
  const { project: p, selected, commit, setPlaying } = useEditor();
  const candidates = p.clips.filter(isMediaClip).filter((c) => !isAudioClip(p, c));
  const [id, setId] = useState(
    selected.find((id) => candidates.some((c) => c.id === id)) ?? candidates[0]?.id ?? '',
  );
  const [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{
    base: Project;
    project: Project;
    matched: number;
    total: number;
  }>();
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const clip = candidates.find((c) => c.id === id);
  async function run() {
    if (!clip) return;
    const url = mediaUrls.get(clip.mediaId),
      asset = p.media.find((m) => m.id === clip.mediaId)!;
    if (!url) {
      setError('Relink this source video before reframing.');
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError('');
    setDraft(undefined);
    setPlaying(false);
    try {
      const points = await detectFacePath(url, clip, controller.signal, setStatus);
      controller.signal.throwIfAborted();
      const reframed = reframeClip(p, clip, asset, points);
      setDraft({
        base: p,
        project: { ...p, clips: p.clips.map((c) => (c.id === id ? reframed : c)) },
        matched: points.filter((pt) => pt.found).length,
        total: points.length,
      });
      setStatus('Review the crop before applying.');
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
      else setStatus('Cancelled.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="creator-section">
      <p>
        Follow a face as the source is cropped to your current canvas. Choose a vertical project
        size for landscape-to-Shorts reframing.
      </p>
      <Field label="Reframe clip">
        <select
          value={id}
          disabled={busy}
          onChange={(e) => {
            setId(e.target.value);
            setDraft(undefined);
          }}
        >
          {candidates.map((c, i) => (
            <option key={c.id} value={c.id}>
              {i + 1}. {p.media.find((m) => m.id === c.mediaId)?.name}
            </option>
          ))}
        </select>
      </Field>
      <p className="subtle">
        Tracks the nearest detected face after starting with the largest. Off-screen or undetected
        faces hold the previous crop. Camera motion and multiple people need a review.
      </p>
      <button className="primary" onClick={run} disabled={busy || !clip || isLocked(p, clip)}>
        Analyze face framing
      </button>
      {busy && (
        <button className="secondary" onClick={() => abort.current?.abort()}>
          Cancel analysis
        </button>
      )}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      {draft && (
        <>
          <p>
            {draft.matched}/{draft.total} sampled frames contain a face.
            {!draft.matched && ' No face found: this proposal is a centered crop.'}
          </p>
          <EditPreview project={draft.project} label="Reframe preview" />
          <button
            className="primary"
            disabled={draft.base !== p}
            onClick={() => {
              if (useEditor.getState().project !== draft.base) return;
              commit(draft.project, 'Auto Reframe', true);
              setDraft(undefined);
              setStatus(
                'Applied. Position keyframes remain editable in Properties; Undo restores the previous framing.',
              );
            }}
          >
            Apply framing
          </button>
          {draft.base !== p && (
            <p role="alert">The timeline changed. Analyze again before applying.</p>
          )}
        </>
      )}
    </div>
  );
}
