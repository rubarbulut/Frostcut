import { useState } from 'react';
import { Plus, Play, Trash2 } from 'lucide-react';
import { Modal, Field } from './components';
import { useEditor } from './store';
import { clipEnd, timecode, isAudioClip } from './model';
import {
  captionBounds,
  editCaption,
  removeCaption,
  suggestCaptionInterval,
} from './caption-editing';
export default function CaptionEditor() {
  const { project: p, captionSelection: selection, selectCaption, commit, seek } = useEditor();
  const [error, setError] = useState('');
  const clip = p.clips.find((c) => c.id === selection?.clipId);
  const existing =
    selection?.wordIds.length && clip ? captionBounds(p, clip.id, selection.wordIds) : null;
  const initial = clip
    ? (existing ?? suggestCaptionInterval(p, clip.id, selection?.start ?? clip.start))
    : { start: 0, end: 1 };
  const [text, setText] = useState(existing?.words.map((w) => w.text).join(' ') ?? '');
  const [start, setStart] = useState(initial.start.toFixed(3)),
    [end, setEnd] = useState(initial.end.toFixed(3));
  const [speakerId, setSpeakerId] = useState(existing?.words[0].speakerId ?? p.speakers[0].id);
  if (!clip || !selection) return null;
  const oneWord = selection.wordIds.length === 1,
    adding = !selection.wordIds.length;
  const close = () => selectCaption(null);
  function submit() {
    try {
      const next = editCaption(useEditor.getState().project, clip!.id, selection!.wordIds, {
        text,
        start: start.trim() ? Number(start) : NaN,
        end: end.trim() ? Number(end) : NaN,
        speakerId,
      });
      commit(next, adding ? 'Add caption' : 'Edit caption text and timing');
      seek(Number(start));
      close();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title={adding ? 'Add a caption.' : 'Make every word land.'} onClose={close}>
      <p className="modal-intro">
        Edit the words and when they appear. Video and audio timing stay unchanged.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {adding && p.clips.length > 1 && (
          <Field label="Video clip">
            <select
              value={clip.id}
              onChange={(e) =>
                selectCaption({
                  clipId: e.target.value,
                  wordIds: [],
                  start: useEditor.getState().playhead,
                })
              }
            >
              {p.clips
                .filter((c) => !isAudioClip(p, c))
                .map((c) => (
                  <option value={c.id} key={c.id}>
                    {p.media.find((m) => m.id === c.mediaId)?.name} · {timecode(c.start, true)}–
                    {timecode(clipEnd(c), true)}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <Field label={oneWord ? 'Word' : 'Caption text'}>
          {oneWord ? (
            <input
              autoFocus
              aria-label="Edit subtitle word"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          ) : (
            <textarea
              autoFocus
              rows={3}
              aria-label="Caption text"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </Field>
        <div className="number-grid">
          <Field label="Start (seconds)">
            <input
              type="number"
              step="0.001"
              min={clip.start}
              max={clipEnd(clip)}
              aria-label="Caption start"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="End (seconds)">
            <input
              type="number"
              step="0.001"
              min={clip.start}
              max={clipEnd(clip)}
              aria-label="Caption end"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>
        <div className="caption-time-help">
          <span>
            {timecode(Number(start), true)} → {timecode(Number(end), true)}
          </span>
          <button
            type="button"
            className="text-button"
            onClick={() => seek(Math.max(clip.start, Math.min(clipEnd(clip), Number(start) || 0)))}
          >
            <Play size={12} />
            Seek to start
          </button>
        </div>
        <small className="subtle">
          Timeline time · clip {timecode(clip.start, true)}–{timecode(clipEnd(clip), true)}. Other
          uses of this source keep their own captions.
        </small>
        <Field label="Speaker">
          <select value={speakerId} onChange={(e) => setSpeakerId(e.target.value)}>
            {p.speakers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        {error && (
          <p className="caption-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          {!adding ? (
            <button
              className="text-button"
              type="button"
              onClick={() => {
                try {
                  commit(removeCaption(p, clip.id, selection.wordIds), 'Remove caption');
                  close();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Trash2 size={14} />
              Remove caption only
            </button>
          ) : (
            <small className="subtle">New word timing is distributed across the interval.</small>
          )}
          <button className="primary" type="submit">
            {adding ? (
              <>
                <Plus size={15} />
                Add caption
              </>
            ) : oneWord ? (
              'Save text'
            ) : (
              'Save caption'
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
