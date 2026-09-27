import { useEffect, useRef, useState, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEditor } from './store';
import { clipEnd, timelineWords, type TimelineWord } from './model';
import { transcriptGroups, editCaption } from './caption-editing';
export default function CaptionLane({ zoom, snap }: { zoom: number; snap: boolean }) {
  const {
    project: p,
    commit,
    selectCaption,
    seek,
    setPlaying,
    select,
  } = useEditor(
    useShallow((s) => ({
      project: s.project,
      commit: s.commit,
      selectCaption: s.selectCaption,
      seek: s.seek,
      setPlaying: s.setPlaying,
      select: s.select,
    })),
  );
  const [drag, setDrag] = useState<{ key: string; start: number; end: number } | null>(null),
    [error, setError] = useState('');
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => () => cleanup.current(), []);
  const groups = useMemo(() => transcriptGroups(p), [p]);
  const blocks = useMemo(
    () =>
      groups.map((g) => {
        const key = g[0].clipId + g[0].id;
        return {
          g,
          key,
          start: drag?.key === key ? drag.start : g[0].timelineStart,
          end: drag?.key === key ? drag.end : Math.max(...g.map((w) => w.timelineEnd)),
        };
      }),
    [groups, drag],
  );
  const currentBlocks = useEditor(
    useShallow((s) => blocks.filter((b) => s.playhead >= b.start && s.playhead < b.end)),
  );
  function edit(group: TimelineWord[]) {
    selectCaption({ clipId: group[0].clipId, wordIds: group.map((w) => w.id) });
  }
  function startDrag(e: React.PointerEvent, group: TimelineWord[], kind: 'move' | 'start' | 'end') {
    const playhead = useEditor.getState().playhead;
    e.preventDefault();
    e.stopPropagation();
    const clip = p.clips.find((c) => c.id === group[0].clipId)!;
    if (p.tracks.find((t) => t.id === clip.trackId)?.locked) {
      setError('Unlock this video track to edit its captions.');
      return;
    }
    cleanup.current();
    setError('');
    select([]);
    setPlaying(false);
    const ids = group.map((w) => w.id),
      start = group[0].timelineStart,
      end = Math.max(...group.map((w) => w.timelineEnd)),
      key = clip.id + group[0].id,
      initialX = e.clientX;
    const others = timelineWords(p).filter((w) => w.clipId === clip.id && !ids.includes(w.id));
    const min = Math.max(
      clip.start,
      ...others.filter((w) => w.timelineEnd <= start + 0.001).map((w) => w.timelineEnd),
    );
    const max = Math.min(
      clipEnd(clip),
      ...others.filter((w) => w.timelineStart >= end - 0.001).map((w) => w.timelineStart),
    );
    let latest = { start, end };
    const move = (event: PointerEvent) => {
      const delta = (event.clientX - initialX) / zoom;
      let from = start,
        to = end;
      if (kind === 'move') {
        from = Math.max(min, Math.min(max - (end - start), start + delta));
        if (snap && Math.abs(from - playhead) < 6 / zoom)
          from = Math.max(min, Math.min(max - (end - start), playhead));
        to = from + end - start;
      }
      if (kind === 'start') from = Math.max(min, Math.min(end - 0.04, start + delta));
      if (kind === 'end') to = Math.min(max, Math.max(start + 0.04, end + delta));
      latest = { start: from, end: to };
      setDrag({ key, ...latest });
    };
    const clear = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    const cancel = () => {
      clear();
      setDrag(null);
    };
    const up = (event: PointerEvent) => {
      clear();
      setDrag(null);
      if (Math.abs(event.clientX - initialX) < 3) {
        edit(group);
        return;
      }
      try {
        commit(
          editCaption(p, clip.id, ids, {
            ...latest,
            text: group.map((w) => w.text).join(' '),
            speakerId: group[0].speakerId,
          }),
          'Move or resize caption',
        );
        seek(latest.start);
      } catch (e) {
        setError((e as Error).message);
      }
    };
    cleanup.current = clear;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', cancel, { once: true });
  }
  return (
    <div className="caption-lane" data-track="C1">
      {!groups.length && (
        <span className="caption-lane-hint">
          Transcribe or add a caption · text stays independent of your cuts
        </span>
      )}
      {blocks.map((block, i) => {
        const { g, key, start, end } = block;
        return (
          <div
            role="button"
            tabIndex={0}
            key={key}
            aria-label={`Caption ${i + 1}: ${g.map((w) => w.text).join(' ')}`}
            className={`caption-block ${currentBlocks.includes(block) ? 'current' : ''}`}
            style={{ left: start * zoom, width: Math.max(5, (end - start) * zoom) }}
            title={`${g.map((w) => w.text).join(' ')} · drag to move, edges to resize, click to edit`}
            onPointerDown={(e) => startDrag(e, g, 'move')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.stopPropagation();
                edit(g);
              }
            }}
          >
            <span className="caption-block-text">{g.map((w) => w.text).join(' ')}</span>
            <span
              className="caption-edge start"
              aria-label={`Caption ${i + 1} start handle`}
              onPointerDown={(e) => startDrag(e, g, 'start')}
            />
            <span
              className="caption-edge end"
              aria-label={`Caption ${i + 1} end handle`}
              onPointerDown={(e) => startDrag(e, g, 'end')}
            />
          </div>
        );
      })}
      {error && (
        <button role="alert" className="caption-lane-error" onClick={() => setError('')}>
          {error} ×
        </button>
      )}
    </div>
  );
}
