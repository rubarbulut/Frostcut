import { useState, useRef, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Upload,
  Search,
  ArrowRightLeft,
  MessageSquareText,
  Plus,
  Settings2,
  Clock3,
  Download,
  Scissors,
  Trash2,
} from 'lucide-react';
import { downloadBlob, useEditor } from './store';
import { timelineWords, timecode, deleteRange, clipEnd, type Word, isAudioClip } from './model';
import { transcriptGroups } from './caption-editing';
import { createSrt } from './subtitles';
import { SpeechCleanup } from './SpeechCleanup';
export function TranscriptPanel({
  onTranscribe,
  onSrt,
}: {
  onTranscribe: () => void;
  onSrt: () => void;
}) {
  const {
    project: p,
    commit,
    seek,
    selected,
    selectCaption,
  } = useEditor(
    useShallow((s) => ({
      project: s.project,
      commit: s.commit,
      seek: s.seek,
      selected: s.selected,
      selectCaption: s.selectCaption,
    })),
  );
  const [query, setQuery] = useState(''),
    [replacement, setReplacement] = useState(''),
    [scope, setScope] = useState('project'),
    [cleanup, setCleanup] = useState(false),
    [chosen, setChosen] = useState<string[]>([]);
  const anchor = useRef(0),
    all = useMemo(() => timelineWords(p), [p]),
    words = scope === 'clip' ? all.filter((w) => selected.includes(w.clipId)) : all;
  // Keep all overlapping words active, but render only when that membership changes.
  const currentWords = useEditor(
    useShallow((s) =>
      all.filter((w) => s.playhead >= w.timelineStart && s.playhead < w.timelineEnd),
    ),
  );
  const currentKeys = new Set(currentWords.map((w) => w.clipId + ':' + w.id));
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setChosen([]);
    anchor.current = 0;
    if (content.current) content.current.scrollTop = 0;
  }, [p.id, p.activeSequenceId]);
  const groups = useMemo(
    () => transcriptGroups(p).filter((g) => scope !== 'clip' || selected.includes(g[0].clipId)),
    [p, scope, selected],
  );
  const picked = words.filter((w) => chosen.includes(w.clipId + ':' + w.id));
  function selectWord(index: number, shift: boolean) {
    const w = words[index];
    seek(w.timelineStart);
    if (shift)
      setChosen(
        words
          .slice(Math.min(anchor.current, index), Math.max(anchor.current, index) + 1)
          .map((w) => w.clipId + ':' + w.id),
      );
    else {
      anchor.current = index;
      setChosen([w.clipId + ':' + w.id]);
    }
  }
  function add() {
    const playhead = useEditor.getState().playhead;
    const clip =
      p.clips.find((c) => !isAudioClip(p, c) && selected.includes(c.id)) ??
      p.clips.find((c) => !isAudioClip(p, c) && playhead >= c.start && playhead < clipEnd(c)) ??
      p.clips.find((c) => !isAudioClip(p, c));
    if (clip) selectCaption({ clipId: clip.id, wordIds: [], start: playhead });
  }
  function removeFromVideo() {
    let next = p;
    const ranges = picked
        .map((w) => ({ start: w.timelineStart, end: w.timelineEnd }))
        .sort((a, b) => a.start - b.start),
      merged: typeof ranges = [];
    for (const r of ranges) {
      const last = merged.at(-1);
      if (last && r.start - last.end < 0.3) last.end = Math.max(last.end, r.end);
      else merged.push({ ...r });
    }
    for (const r of merged.reverse()) next = deleteRange(next, r.start, r.end);
    commit(next, 'Delete transcript selection from video');
    setChosen([]);
  }
  function replaceAll() {
    if (!query) return;
    const next = structuredClone(p),
      re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const apply = (list: Word[]) => list.forEach((w) => (w.text = w.text.replace(re, replacement)));
    if (scope === 'project') {
      next.transcripts.forEach((t) => apply(t.words));
      next.clips.forEach((c) => {
        if (c.captionWords) apply(c.captionWords);
      });
    } else {
      for (const c of next.clips.filter((c) => selected.includes(c.id))) {
        c.captionWords ??= structuredClone(
          next.transcripts.find((t) => t.mediaId === c.mediaId)?.words ?? [],
        );
        apply(c.captionWords);
      }
    }
    commit(next, 'Find and replace');
  }
  return (
    <div className="transcript-panel">
      <div className="panel-title">
        <span>Transcript</span>
        <div className="transcript-header-tools">
          <button
            className="icon"
            title="Transcription settings"
            aria-label="Transcription settings"
            onClick={onTranscribe}
          >
            <Settings2 size={14} />
          </button>
          <button
            className="icon"
            title="Import SRT"
            aria-label="Import SRT transcript"
            onClick={onSrt}
          >
            <Upload size={14} />
          </button>
        </div>
      </div>
      <button className="add-caption-button" disabled={!p.clips.length} onClick={add}>
        <Plus size={15} />
        Add caption
      </button>
      {all.length > 0 && (
        <div className="transcript-p1-tools">
          <button className="text-button" onClick={() => setCleanup(true)}>
            <Scissors size={14} />
            Clean up speech
          </button>
          <button
            className="text-button"
            title="Export the current caption language as SRT"
            onClick={() =>
              downloadBlob(
                new Blob([createSrt(p)], { type: 'text/plain;charset=utf-8' }),
                `${p.name.replace(/[<>:"/\\|?*]/g, '_')}.srt`,
              )
            }
          >
            <Download size={14} />
            Export SRT
          </button>
        </div>
      )}
      {cleanup && <SpeechCleanup onClose={() => setCleanup(false)} />}
      {!all.length ? (
        <div className="empty-panel">
          <MessageSquareText size={32} />
          <h3>Every word, editable.</h3>
          <p>Transcribe locally, or write your first caption by hand.</p>
          <button className="primary" disabled={!p.media.length} onClick={onTranscribe}>
            Transcribe video
          </button>
          <button className="text-button" disabled={!p.media.length} onClick={onSrt}>
            Import an SRT transcript
          </button>
          <small>Speech model downloads on first use. Footage stays here.</small>
        </div>
      ) : (
        <>
          <div className="transcript-search">
            <Search size={15} />
            <input
              aria-label="Find in transcript"
              placeholder="Find a word…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {query && (
            <div className="replace-row">
              <input
                aria-label="Replace with"
                placeholder="Replace with…"
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
              />
              <button
                className="icon"
                title="Replace all matches"
                aria-label="Replace all matches"
                onClick={replaceAll}
              >
                <ArrowRightLeft size={16} />
              </button>
            </div>
          )}
          <select
            className="scope-select"
            aria-label="Transcript search scope"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="project">Whole project</option>
            <option value="clip">Selected clips</option>
          </select>
          <div className="transcript-info">
            {p.transcripts.some((t) => t.source === 'demo')
              ? 'Demo captions · illustrative sample'
              : p.transcripts.some((t) => t.source === 'imported')
                ? 'Imported SRT · estimated word timing'
                : (p.transcripts.find((t) => t.model)?.model ?? 'Your captions')}
            <span>
              Click words to seek · Shift-click to select
              <br />
              Click a time range to edit text and timing
            </span>
          </div>
          <div className="transcript-content" ref={content}>
            {groups.map((group, i) => (
              <div className="transcript-paragraph" key={group[0].clipId + group[0].id}>
                <div className="transcript-speaker">
                  <span
                    style={{ color: p.speakers.find((s) => s.id === group[0].speakerId)?.color }}
                  >
                    {p.speakers.find((s) => s.id === group[0].speakerId)?.name}
                  </span>
                </div>
                <button
                  className="caption-timestamp"
                  aria-label={`Edit caption ${i + 1} timing`}
                  onClick={() =>
                    selectCaption({ clipId: group[0].clipId, wordIds: group.map((w) => w.id) })
                  }
                >
                  <Clock3 size={11} />
                  {timecode(group[0].timelineStart, true)} →{' '}
                  {timecode(Math.max(...group.map((w) => w.timelineEnd)), true)}
                </button>
                <p>
                  {group.map((w) => (
                    <button
                      key={w.clipId + w.id}
                      title={
                        w.timingEstimated
                          ? 'Estimated word timing — click the time range to adjust'
                          : undefined
                      }
                      className={`word ${chosen.includes(w.clipId + ':' + w.id) ? 'chosen' : ''} ${currentKeys.has(w.clipId + ':' + w.id) ? 'current' : ''} ${query && w.text.toLowerCase().includes(query.toLowerCase()) ? 'match' : ''}`}
                      onClick={(e) =>
                        selectWord(
                          words.findIndex((item) => item.id === w.id && item.clipId === w.clipId),
                          e.shiftKey,
                        )
                      }
                      onDoubleClick={() => selectCaption({ clipId: w.clipId, wordIds: [w.id] })}
                    >
                      {w.confidence !== undefined && w.confidence < 0.5 ? `[${w.text}?]` : w.text}
                    </button>
                  ))}
                </p>
              </div>
            ))}
          </div>
          {
            <div className="transcript-actions">
              <span>
                {picked.length
                  ? `${picked.length} words selected`
                  : 'Select words · Shift-click for a range'}
              </span>
              <button
                className="primary small"
                aria-label="Edit words & timing"
                disabled={new Set(picked.map((w) => w.clipId)).size !== 1}
                onClick={() =>
                  selectCaption({ clipId: picked[0].clipId, wordIds: picked.map((w) => w.id) })
                }
              >
                <Clock3 size={13} />
                Edit
              </button>
              <select
                aria-label="Assign speaker"
                disabled={!picked.length}
                defaultValue=""
                onChange={(e) => {
                  const next = structuredClone(p);
                  for (const c of next.clips) {
                    const ids = picked.filter((w) => w.clipId === c.id).map((w) => w.id);
                    if (!ids.length) continue;
                    c.captionWords ??= structuredClone(
                      p.transcripts.find((t) => t.mediaId === c.mediaId)?.words ?? [],
                    );
                    c.captionWords.forEach((w) => {
                      if (ids.includes(w.id)) w.speakerId = e.target.value;
                    });
                  }
                  commit(next, 'Assign speaker');
                }}
              >
                <option value="" disabled>
                  Set speaker
                </option>
                {p.speakers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                className="danger small"
                aria-label="Delete from video"
                title="Delete selected words from video"
                onClick={removeFromVideo}
                disabled={!picked.length}
              >
                <Trash2 size={14} />
              </button>
            </div>
          }
        </>
      )}
    </div>
  );
}
