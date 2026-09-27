import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, downloadBlob } from './store';
import { duration, uid } from './model';
import { Field } from './components';
import { NumberField } from './CaptionTextControls';
import {
  chapterRangeIssues,
  chapterTimestamp,
  youtubeChapterIssues,
  type ChapterSet,
} from './chapter-data';
import {
  chapterBlocks,
  chapterFingerprint,
  exportChapters,
  saveChapters,
  suggestChapters,
} from './chapters';
import { chapterEmbeddings } from './chapter-worker';
import { safeFilename } from './zip';
import './chapters.css';

export function ChapterTools({ onNavigate }: { onNavigate: () => void }) {
  const key = useEditor((s) => `${s.project.id}:${s.project.activeSequenceId ?? ''}`);
  return <ChapterEditor key={key} onNavigate={onNavigate} />;
}
function ChapterEditor({ onNavigate }: { onNavigate: () => void }) {
  const p = useEditor((s) => s.project),
    total = duration(p);
  const fingerprint = useMemo(() => chapterFingerprint(p), [p]);
  const [draft, setDraft] = useState<ChapterSet | undefined>(
    () => p.chapters && structuredClone(p.chapters),
  );
  const [base, setBase] = useState(p.chapters);
  const [method, setMethod] = useState<'structure' | 'semantic'>('structure');
  const [count, setCount] = useState(5),
    [minimum, setMinimum] = useState(30);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );
  const stale = !!draft && draft.sourceFingerprint !== fingerprint;
  const savedChanged = JSON.stringify(base) !== JSON.stringify(p.chapters);
  const dirty = JSON.stringify(draft) !== JSON.stringify(p.chapters);
  const issues = draft ? chapterRangeIssues(draft, total) : [];
  const youtubeIssues = draft ? youtubeChapterIssues(draft, total) : [];
  const canExport = !!draft && !busy && !dirty && !stale && !issues.length;
  async function generate() {
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError('');
    setStatus('Reading transcript…');
    try {
      const blocks = chapterBlocks(p);
      if (!blocks.length)
        throw new Error('Transcribe or import subtitles for this timeline first.');
      const vectors =
        method === 'semantic'
          ? await chapterEmbeddings(
              blocks.map((b) => b.text),
              controller.signal,
              setStatus,
            )
          : undefined;
      controller.signal.throwIfAborted();
      setDraft(suggestChapters(p, blocks, { count, minimumSeconds: minimum }, vectors));
      setStatus('Review the boundaries and transcript-based titles, then save the chapters.');
    } catch (e) {
      if (controller.signal.aborted)
        setStatus('Cancelled. The previous chapter draft is unchanged.');
      else {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('');
      }
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setBusy(false);
      }
    }
  }
  function addChapter() {
    if (total <= 0) return;
    const next = draft ?? { source: 'manual' as const, sourceFingerprint: fingerprint, items: [] };
    if (next.items.length >= 100) return;
    let start = 0;
    if (next.items.length) {
      const head = useEditor.getState().playhead;
      if (head > 0 && head < total && next.items.every((c) => Math.abs(c.start - head) >= 0.04))
        start = head;
      else {
        const gaps = next.items.map((c, i) => ({
          start: c.start,
          end: next.items[i + 1]?.start ?? total,
        }));
        if (next.items[0].start > 0) gaps.push({ start: 0, end: next.items[0].start });
        const gap = gaps.sort((a, b) => b.end - b.start - (a.end - a.start))[0];
        if (gap.end - gap.start < 0.08)
          return setError('Move or remove a chapter before adding another.');
        start = (gap.start + gap.end) / 2;
      }
    }
    start = Math.min(
      Math.round(start * 100) / 100,
      Math.max(0, Math.floor((total - 0.01) * 100) / 100),
    );
    setDraft({
      ...next,
      items: [
        ...next.items,
        { id: uid(), start, title: `Chapter ${next.items.length + 1}`, reason: 'Added manually' },
      ].sort((a, b) => a.start - b.start),
    });
    setError('');
    setStatus(
      'Chapter added at the playhead, or in the largest available gap. Edit its time and title.',
    );
  }
  function download(format: 'youtube' | 'vtt' | 'json') {
    try {
      const text = exportChapters(p, format);
      downloadBlob(
        new Blob([text], {
          type:
            format === 'json'
              ? 'application/json'
              : format === 'vtt'
                ? 'text/vtt;charset=utf-8'
                : 'text/plain;charset=utf-8',
        }),
        `${safeFilename(p.name)}-chapters.${format === 'youtube' ? 'txt' : format}`,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="creator-section">
      <p>
        Create chapters from the edited original transcript, then adjust the times and titles.
        Suggestions use the current timeline, including cuts and speed changes. Nothing is uploaded.
      </p>
      <div className="creator-grid">
        <Field label="Chapter suggestion method">
          <select
            value={method}
            disabled={busy}
            onChange={(e) => setMethod(e.target.value as typeof method)}
          >
            <option value="structure">Transcript structure · no model download</option>
            <option value="semantic">Semantic topics · local AI</option>
          </select>
        </Field>
        <fieldset disabled={busy} className="chapter-options">
          <NumberField
            label="Maximum chapters"
            value={count}
            min={1}
            max={100}
            step={1}
            onChange={(v) => setCount(Math.round(v))}
          />
          <NumberField
            label="Minimum chapter duration (s)"
            value={minimum}
            min={1}
            max={600}
            step={1}
            onChange={setMinimum}
          />
        </fieldset>
      </div>
      <small className="subtle">
        {method === 'semantic'
          ? 'The first AI run downloads about 118 MB plus tokenizer/runtime files. It reads text on one CPU thread and keeps the transcript on your device. Review the extracted titles.'
          : 'Finds changes in transcript wording and pauses. This mode uses no AI model and works offline with an existing transcript.'}
      </small>
      <div className="button-row">
        <button
          className="primary"
          disabled={busy || total <= 0 || savedChanged}
          onClick={generate}
        >
          Suggest chapters
        </button>
        <button
          className="secondary"
          disabled={busy || total <= 0 || savedChanged || (draft?.items.length ?? 0) >= 100}
          onClick={addChapter}
        >
          Add chapter
        </button>
        {busy && (
          <button className="secondary" onClick={() => abort.current?.abort()}>
            Cancel chapter analysis
          </button>
        )}
      </div>
      {!total && (
        <p>Add footage to the timeline first. Manual chapters do not require a transcript.</p>
      )}
      {savedChanged && (
        <p role="alert">
          Saved chapters changed while this panel was open. Reload them before editing further.
        </p>
      )}
      {(dirty || savedChanged) && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setDraft(p.chapters && structuredClone(p.chapters));
            setBase(p.chapters);
            setError('');
            setStatus('Saved chapters reloaded.');
          }}
        >
          Discard draft and reload saved chapters
        </button>
      )}
      {stale && (
        <div role="alert" className="chapter-stale">
          <p>
            The timeline or transcript changed. Review every chapter time before saving or
            exporting.
          </p>
          <button
            className="secondary"
            disabled={busy || !!issues.length || savedChanged}
            onClick={() => {
              setDraft({ ...draft!, sourceFingerprint: fingerprint });
              setStatus('Times confirmed for the current timeline. Save to keep this review.');
            }}
          >
            I reviewed these times for the current edit
          </button>
        </div>
      )}
      {draft && (
        <>
          <small className="subtle">
            {draft.source === 'semantic'
              ? 'Local AI topic suggestions'
              : draft.source === 'structure'
                ? 'Transcript structure suggestions'
                : 'Manual chapters'}{' '}
            · {draft.items.length} chapters. End times follow the next chapter or the end of the
            sequence.
          </small>
          <ol className="chapter-list">
            {draft.items.map((chapter, index) => (
              <li key={chapter.id}>
                <fieldset disabled={busy || savedChanged} className="chapter-row">
                  <NumberField
                    label={`Chapter ${index + 1} start (s)`}
                    value={chapter.start}
                    min={0}
                    max={Math.max(0, Math.floor((total - 0.01) * 100) / 100)}
                    step={0.01}
                    onChange={(start) =>
                      setDraft({
                        ...draft,
                        items: draft.items
                          .map((c) => (c.id === chapter.id ? { ...c, start } : c))
                          .sort((a, b) => a.start - b.start),
                      })
                    }
                  />
                  <Field label={`Chapter ${index + 1} title`}>
                    <input
                      value={chapter.title}
                      maxLength={120}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          items: draft.items.map((c) =>
                            c.id === chapter.id ? { ...c, title: e.target.value } : c,
                          ),
                        })
                      }
                    />
                  </Field>
                  <button
                    className="text-button"
                    aria-label={`Remove chapter ${index + 1}`}
                    onClick={() =>
                      setDraft({ ...draft, items: draft.items.filter((c) => c.id !== chapter.id) })
                    }
                  >
                    Remove
                  </button>
                </fieldset>
                <div className="button-row">
                  <button
                    className="text-button"
                    disabled={busy || dirty || stale || !!issues.length}
                    title="Save chapter edits before jumping to the timeline"
                    onClick={() => {
                      const state = useEditor.getState();
                      state.setPlaying(false);
                      state.seek(chapter.start);
                      onNavigate();
                    }}
                  >
                    Jump to {chapterTimestamp(chapter.start)}
                  </button>
                  {chapter.reason && <small className="subtle">{chapter.reason}</small>}
                </div>
                {chapter.excerpt && (
                  <details>
                    <summary>Transcript excerpt</summary>
                    <p>{chapter.excerpt}</p>
                  </details>
                )}
              </li>
            ))}
          </ol>
          {issues.length > 0 && <p role="alert">{issues.join(' ')}</p>}
          <div className="button-row">
            <button
              className="primary"
              disabled={busy || !dirty || stale || !!issues.length || savedChanged}
              onClick={() => {
                try {
                  const state = useEditor.getState(),
                    next = saveChapters(state.project, draft);
                  state.commit(next, 'Save chapters');
                  setBase(next.chapters);
                  setDraft(next.chapters);
                  setError('');
                  setStatus('Chapters saved with this sequence. Undo restores the previous list.');
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Save chapters
            </button>
            <button
              className="secondary"
              disabled={!canExport || !!youtubeIssues.length}
              onClick={() => download('youtube')}
            >
              Download YouTube chapters
            </button>
            <button className="secondary" disabled={!canExport} onClick={() => download('vtt')}>
              Download chapter VTT
            </button>
            <button className="secondary" disabled={!canExport} onClick={() => download('json')}>
              Download chapter JSON
            </button>
          </div>
          {youtubeIssues.length > 0 && (
            <small className="subtle">
              YouTube: {youtubeIssues.join(' ')} General VTT/JSON exports remain available for valid
              chapter lists.
            </small>
          )}
          <button
            className="text-button"
            disabled={busy || savedChanged || !p.chapters}
            onClick={() => {
              const state = useEditor.getState();
              state.commit({ ...state.project, chapters: undefined }, 'Remove chapters');
              setDraft(undefined);
              setBase(undefined);
              setStatus('Saved chapters removed. Undo restores them.');
            }}
          >
            Remove saved chapters
          </button>
        </>
      )}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
