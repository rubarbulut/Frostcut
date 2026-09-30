import { useEffect, useMemo, useState } from 'react';
import { Play, Scissors } from 'lucide-react';
import { Modal, Field } from './components';
import { mediaUrls, useEditor } from './store';
import { duration, timecode, isMediaClip } from './model';
import {
  applySpeechCleanup,
  cleanupRanges,
  speechSuggestions,
  type SpeechSuggestion,
} from './speech-cleanup';

export function SpeechCleanup({ onClose }: { onClose: () => void }) {
  const { project: p, commit, seek, setPlaying } = useEditor();
  const [phrases, setPhrases] = useState(false),
    [filter, setFilter] = useState('all'),
    [chosen, setChosen] = useState<string[]>([]),
    [error, setError] = useState(''),
    [preview, setPreview] = useState<{ item: SpeechSuggestion; later: boolean } | null>(null);
  const candidates = useMemo(() => speechSuggestions(p, phrases), [p, phrases]);
  const visible = candidates.filter((s) => filter === 'all' || s.kind === filter);
  const selected = candidates.filter((s) => chosen.includes(s.id));
  const removed = cleanupRanges(selected).reduce((n, r) => n + r.end - r.start, 0);
  useEffect(() => {
    setPlaying(false);
  }, [setPlaying]);
  const clip = preview && p.clips.find((c) => c.id === preview.item.clipId);
  const range = preview && (preview.later ? preview.item.later! : preview.item);
  const start =
    clip && range
      ? Math.max(
          clip.sourceStart,
          clip.sourceStart + (range.start - clip.start - 0.45) * clip.properties.speed,
        )
      : 0;
  const end =
    clip && range
      ? Math.min(
          clip.sourceEnd,
          clip.sourceStart + (range.end - clip.start + 0.45) * clip.properties.speed,
        )
      : 0;
  function apply() {
    try {
      const next = applySpeechCleanup(p, selected);
      commit(next, `Speech cleanup · ${selected.length} reviewed cuts`, true);
      seek(Math.min(selected[0]?.start ?? 0, duration(next)));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title="Clean up speech" onClose={onClose} wide>
      <p className="modal-intro">
        Review hesitations and repeated takes. Selected cuts remove audio and video, and close gaps
        across the timeline.
      </p>
      <div className="cleanup-options">
        <Field label="Show suggestions">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All suggestions</option>
            <option value="filler">Fillers</option>
            <option value="repeat">Repeated takes</option>
          </select>
        </Field>
        <label className="check-row">
          <input type="checkbox" checked={phrases} onChange={(e) => setPhrases(e.target.checked)} />
          Include possible fillers: “you know”, “I mean”, “şey”, “yani”
        </label>
      </div>
      <p className="subtle">
        Filler vocabulary: English & Turkish. Nothing is selected automatically. Estimated word
        timing needs a careful listen.
      </p>
      {preview && clip && isMediaClip(clip) && (
        <div className="cleanup-preview">
          <b>{preview.later ? 'Later take · comparison' : 'Selected passage · proposed removal'}</b>
          {mediaUrls.has(clip.mediaId) ? (
            <video
              key={`${preview.item.id}:${preview.later}`}
              src={mediaUrls.get(clip.mediaId)}
              controls
              autoPlay
              playsInline
              aria-label="Speech suggestion preview"
              onLoadedMetadata={(e) => {
                e.currentTarget.currentTime = start;
                e.currentTarget.playbackRate = clip.properties.speed;
              }}
              onPlay={(e) => {
                if (e.currentTarget.currentTime >= end || e.currentTarget.currentTime < start)
                  e.currentTarget.currentTime = start;
              }}
              onTimeUpdate={(e) => {
                if (e.currentTarget.currentTime >= end) e.currentTarget.pause();
              }}
            />
          ) : (
            <p>Relink this source in the Media panel to listen.</p>
          )}
          <span>
            {preview.later ? preview.item.later?.text : preview.item.context || preview.item.text}
          </span>
        </div>
      )}
      <div className="cleanup-list">
        {visible.length ? (
          visible.map((s) => (
            <article className="cleanup-card" key={s.id}>
              <label className="cleanup-choice">
                <input
                  type="checkbox"
                  aria-label={`Remove ${s.kind}: ${s.text}`}
                  checked={chosen.includes(s.id)}
                  onChange={(e) =>
                    setChosen(
                      e.target.checked ? [...chosen, s.id] : chosen.filter((id) => id !== s.id),
                    )
                  }
                />
                <span>
                  <small>
                    {s.kind === 'repeat' ? 'REPEATED TAKE' : 'FILLER'} · {timecode(s.start, true)} →{' '}
                    {timecode(s.end, true)}
                  </small>
                  <b>{s.text}</b>
                </span>
              </label>
              {s.context && <p>{s.context}</p>}
              <p>
                {s.reason} {s.estimated && <em>Estimated timing.</em>}
              </p>
              <div className="cleanup-listen">
                <button
                  className="text-button"
                  onClick={() => setPreview({ item: s, later: false })}
                >
                  <Play size={13} />
                  Listen {s.later ? 'to earlier take' : 'in context'}
                </button>
                {s.later && (
                  <button
                    className="text-button"
                    onClick={() => setPreview({ item: s, later: true })}
                  >
                    <Play size={13} />
                    Listen to later take
                  </button>
                )}
              </div>
            </article>
          ))
        ) : (
          <div className="empty-panel">
            <Scissors size={28} />
            <h3>
              No{' '}
              {filter === 'all'
                ? 'speech cleanup suggestions'
                : filter === 'filler'
                  ? 'fillers'
                  : 'repeated takes'}{' '}
              found.
            </h3>
            <p>Review the transcript or try including possible filler phrases.</p>
          </div>
        )}
      </div>
      {error && (
        <p className="caption-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-footer">
        <span>
          {selected.length} selected · {removed.toFixed(2)}s removed · Undo available
        </span>
        <button className="primary" disabled={!selected.length} onClick={apply}>
          Apply selected cuts
        </button>
      </div>
    </Modal>
  );
}
