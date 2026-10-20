import { useRef, useState, useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import CaptionLane from './CaptionLane';
import { AdjustmentLabels, AdjustmentLanes } from './AdjustmentLane';
import { cutAdjustments } from './adjustments';
import { removeAdjustment, splitAdjustment } from './AdjustmentControls';
import { FloatingActionBar } from './FloatingActionBar';
import { TimelineMinimap } from './TimelineMinimap';
import {
  MousePointer2,
  Scissors,
  Magnet,
  LockKeyhole,
  UnlockKeyhole,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Trash2,
  Group,
  Copy,
  Minus,
  Plus,
  Hand,
  Maximize2,
  Music,
} from 'lucide-react';
import { useTimelineNavigation } from './timeline-navigation';
import { timelineBeats } from './audio-tools';
import { useEditor, mediaThumbnails, audioWaveforms } from './store';
import {
  type Clip,
  duration,
  clipDuration,
  clipEnd,
  isLocked,
  splitClip,
  uid,
  timecode,
  isAudioClip,
} from './model';
import {
  computeTimelineViewport,
  shouldUpdateViewport,
  filterVisibleClips,
  filterVisibleBeats,
  getVisibleRulerTicks,
  SnapGuideOverlay,
} from './virtualized-timeline';
import { StudioTrackLabel } from './StudioTrackLabel';
export function deleteSelected(ripple = false) {
  const adjustment = useEditor.getState().adjustmentSelection;
  if (adjustment && !ripple) { removeAdjustment(adjustment); return; }
  const s = useEditor.getState(),
    p = structuredClone(s.project),
    selected = p.clips.filter((c) => s.selected.includes(c.id) && !isLocked(p, c));
  if (!selected.length) return;
  if (ripple && p.clips.some((c) => isLocked(p, c))) return;
  if (ripple && p.adjustments?.some((a) => a.locked && a.end > Math.min(...selected.map((c) => c.start)))) return;
  p.clips = p.clips.filter((c) => !selected.some((x) => x.id === c.id));
  if (ripple) {
    const ranges = selected
      .map((c) => ({ start: c.start, end: clipEnd(c) }))
      .sort((a, b) => a.start - b.start);
    const merged: typeof ranges = [];
    for (const r of ranges) {
      const last = merged.at(-1);
      if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
      else merged.push({ ...r });
    }
    for (const range of [...merged].reverse()) p.adjustments = cutAdjustments(p.adjustments, range.start, range.end);
    for (const c of p.clips)
      c.start = Math.max(
        0,
        c.start - merged.reduce((n, r) => n + Math.max(0, Math.min(c.start, r.end) - r.start), 0),
      );
  }
  s.commit(p, ripple ? 'Ripple delete' : 'Delete clips');
  s.select([]);
}
export function splitSelected() {
  const s = useEditor.getState();
  if (s.adjustmentSelection) { splitAdjustment(s.adjustmentSelection, s.playhead); return; }
  let p = s.project;
  for (const c of s.project.clips)
    if (
      (!s.selected.length || s.selected.includes(c.id)) &&
      s.playhead > c.start &&
      s.playhead < clipEnd(c)
    )
      p = splitClip(p, c.id, s.playhead);
  s.commit(p, 'Split clips');
}
export default function Timeline() {
  const adjustmentSelection = useEditor((s) => s.adjustmentSelection);
  const {
      project: p,
      selected,
      select,
      seek,
      commit,
    } = useEditor(
      useShallow((s) => ({
        project: s.project,
        selected: s.selected,
        select: s.select,
        seek: s.seek,
        commit: s.commit,
        mediaRevision: s.mediaRevision,
      })),
    ),
    [zoom, setZoom] = useState(26),
    [snap, setSnap] = useState(true),
    [snapBeats, setSnapBeats] = useState(true),
    [drag, setDrag] = useState<{
      id: string;
      start: number;
      sourceStart: number;
      sourceEnd: number;
    } | null>(null),
    [tool, setTool] = useState('select'),
    body = useRef<HTMLDivElement>(null),
    [viewport, setViewport] = useState(() => computeTimelineViewport(0, 1920, zoom)),
    snapGuideRef = useRef<HTMLDivElement>(null),
    snapOverlayRef = useRef<SnapGuideOverlay>(new SnapGuideOverlay());

  useEffect(() => {
    snapOverlayRef.current.setElement(snapGuideRef.current);
  }, []);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!body.current) return;
        const scrollLeft = body.current.scrollLeft;
        const clientWidth = body.current.clientWidth || 1200;
        setViewport((prev) => {
          if (shouldUpdateViewport(prev, scrollLeft, clientWidth, zoom)) {
            return computeTimelineViewport(scrollLeft, clientWidth, zoom);
          }
          return prev;
        });
      });
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    handleScroll();
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [zoom]);
  const { panning, startPan } = useTimelineNavigation(body, zoom, setZoom, tool === 'hand');
  const total = duration(p),
    width = Math.max(900, (Math.max(total, ...p.adjustments?.map((a) => a.end) ?? []) + 8) * zoom),
    step = zoom < 15 ? 10 : zoom < 35 ? 5 : 2;
  const beats = timelineBeats(p);

  const fitTimeline = useCallback(() => {
    if (!body.current) return;
    const containerWidth = body.current.clientWidth - 80;
    const dur = Math.max(1, total, ...(p.adjustments?.map((a) => a.end) ?? []));
    const targetZoom = Math.max(8, Math.min(240, containerWidth / dur));
    setZoom(Number(targetZoom.toFixed(1)));
    body.current.scrollTo({ left: 0, behavior: 'smooth' });
  }, [total, p.adjustments]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'z' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        fitTimeline();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fitTimeline]);
  function startDrag(e: React.PointerEvent, c: Clip, kind: 'move' | 'in' | 'out') {
    const playhead = useEditor.getState().playhead;
    if (e.button !== 0) return;
    e.stopPropagation();
    if (isLocked(p, c)) return;
    if (tool === 'razor') {
      let splitAt = c.start + e.nativeEvent.offsetX / zoom;
      if (snap) {
        const beatPoints = snapBeats ? timelineBeats(p) : [];
        const beatTolerance = Math.max(0.008, 8 / zoom); // 8ms precision
        const nearest = beatPoints.find((bp) => Math.abs(bp - splitAt) <= beatTolerance);
        if (nearest !== undefined) splitAt = nearest;
      }
      commit(splitClip(p, c.id, splitAt), 'Split clip');
      return;
    }
    const multi = e.shiftKey
      ? selected.includes(c.id)
        ? selected.filter((id) => id !== c.id)
        : [...selected, c.id]
      : selected.includes(c.id)
        ? selected
        : p.clips
            .filter((x) => c.groupId && x.groupId === c.groupId)
            .map((x) => x.id)
            .concat(c.id);
    select([...new Set(multi)]);
    const initialX = e.clientX,
      initialY = e.clientY,
      snapshot = structuredClone(p);
    let latest: { id: string; start: number; sourceStart: number; sourceEnd: number } | null = null;
    const duplicate = e.altKey && kind === 'move',
      ids = multi.includes(c.id) ? multi : [c.id];
    const move = (event: PointerEvent) => {
      const delta = (event.clientX - initialX) / zoom,
        m = snapshot.media.find((m) => m.id === c.mediaId)!;
      let start = Math.max(0, c.start + delta),
        sourceStart = c.sourceStart,
        sourceEnd = c.sourceEnd;
      let trimDelta = delta;
      let snapGuideTime: number | null = null;
      if (kind !== 'move' && snap) {
        const edge = (kind === 'in' ? c.start : clipEnd(c)) + delta;
        const beatPoints = snapBeats ? timelineBeats(snapshot, ids) : [];
        // 8ms magnetic locking priority for detected music beats
        let nearestBeat: number | undefined;
        if (snapBeats && beatPoints.length > 0) {
          const beatTolerance = Math.max(0.008, 8 / zoom);
          nearestBeat = beatPoints
            .filter((point) => Math.abs(point - edge) <= beatTolerance)
            .sort((a, b) => Math.abs(a - edge) - Math.abs(b - edge))[0];
        }
        if (nearestBeat !== undefined) {
          trimDelta += nearestBeat - edge;
          snapGuideTime = nearestBeat;
        } else {
          const candidates = [
            playhead,
            ...beatPoints,
            ...snapshot.clips
              .filter((x) => !ids.includes(x.id))
              .flatMap((x) => [x.start, clipEnd(x)]),
          ];
          const nearest = candidates
            .filter((point) => Math.abs(point - edge) < 8 / zoom)
            .sort((a, b) => Math.abs(a - edge) - Math.abs(b - edge))[0];
          if (nearest !== undefined) {
            trimDelta += nearest - edge;
            snapGuideTime = nearest;
          }
        }
      }
      if (kind === 'move' && snap) {
        const beatPoints = snapBeats ? timelineBeats(snapshot, ids) : [];
        let beatSnapped = false;
        // 8ms magnetic locking priority for detected music beats
        if (snapBeats && beatPoints.length > 0) {
          const beatTolerance = Math.max(0.008, 8 / zoom);
          for (const bp of beatPoints) {
            if (Math.abs(start - bp) <= beatTolerance) {
              start = bp;
              snapGuideTime = bp;
              beatSnapped = true;
              break;
            }
            if (Math.abs(start + clipDuration(c) - bp) <= beatTolerance) {
              start = Math.max(0, bp - clipDuration(c));
              snapGuideTime = bp;
              beatSnapped = true;
              break;
            }
          }
        }
        if (!beatSnapped) {
          const points = [
            0,
            playhead,
            ...beatPoints,
            ...snapshot.clips
              .filter((x) => !ids.includes(x.id))
              .flatMap((x) => [x.start, clipEnd(x)]),
          ];
          for (const point of points) {
            if (Math.abs(start - point) < 8 / zoom) {
              start = point;
              snapGuideTime = point;
              break;
            }
            if (Math.abs(start + clipDuration(c) - point) < 8 / zoom) {
              start = Math.max(0, point - clipDuration(c));
              snapGuideTime = point;
              break;
            }
          }
        }
      }
      if (snapGuideTime !== null) {
        snapOverlayRef.current.show(snapGuideTime, zoom);
      } else {
        snapOverlayRef.current.hide();
      }
      if (kind === 'in') {
        sourceStart = Math.max(
          0,
          Math.min(c.sourceEnd - 0.1, c.sourceStart + trimDelta * c.properties.speed),
        );
        start = c.start + (sourceStart - c.sourceStart) / c.properties.speed;
        if (start < 0) {
          sourceStart -= start * c.properties.speed;
          start = 0;
        }
      }
      if (kind === 'out')
        sourceEnd = Math.max(
          c.sourceStart + 0.1,
          Math.min(m.duration, c.sourceEnd + trimDelta * c.properties.speed),
        );
      latest = { id: c.id, start, sourceStart, sourceEnd };
      setDrag(latest);
    };
    const up = (event: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      snapOverlayRef.current.hide();
      setDrag(null);
      if (!latest || Math.abs(event.clientX - initialX) + Math.abs(event.clientY - initialY) < 3)
        return;
      const next = structuredClone(snapshot),
        change = latest as { start: number; sourceStart: number; sourceEnd: number };
      if (kind === 'move') {
        const target = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest<HTMLElement>('[data-track]')?.dataset.track;
        const track = next.tracks.find(
          (t) => t.id === target && t.kind === (isAudioClip(p, c) ? 'audio' : 'video') && !t.locked,
        );
        const delta = Math.max(
          change.start - c.start,
          -Math.min(...next.clips.filter((x) => ids.includes(x.id)).map((x) => x.start)),
        );
        const newIds: string[] = [];
        for (const clip of next.clips.filter((x) => ids.includes(x.id) && !isLocked(next, x))) {
          const updated = {
            ...structuredClone(clip),
            id: duplicate ? uid() : clip.id,
            start: clip.start + delta,
            trackId: track && isAudioClip(p, c) === isAudioClip(p, clip) ? track.id : clip.trackId,
          };
          if (duplicate) {
            next.clips.push(updated);
            newIds.push(updated.id);
          } else Object.assign(clip, updated);
        }
        if (duplicate) select(newIds);
      } else
        Object.assign(
          next.clips.find((x) => x.id === c.id)!,
          change,
        );
      commit(next, duplicate ? 'Duplicate clips' : kind === 'move' ? 'Move clips' : 'Trim clip');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  }
  function trackPatch(id: string, patch: object) {
    const next = structuredClone(p);
    Object.assign(
      next.tracks.find((t) => t.id === id)!,
      patch,
    );
    commit(next, 'Track settings');
  }
  function scrub(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    seek(Math.max(0, Math.min(total, (e.clientX - rect.left) / zoom)));
  }
  return (
    <section className="timeline-panel">
      <div className="timeline-toolbar">
        <div className="tool-group">
          <button
            className={`icon ${tool === 'hand' ? 'active' : ''}`}
            aria-label="Pan tool"
            title="Pan timeline · drag with middle mouse anytime"
            aria-pressed={tool === 'hand'}
            onClick={() => setTool(tool === 'hand' ? 'select' : 'hand')}
          >
            <Hand size={17} />
          </button>
          <button
            className={`icon ${tool === 'select' ? 'active' : ''}`}
            title="Select tool"
            aria-label="Select tool"
            onClick={() => setTool('select')}
          >
            <MousePointer2 size={17} />
          </button>
          <button
            className={`icon ${tool === 'razor' ? 'active' : ''}`}
            title="Razor tool"
            aria-label="Razor tool"
            onClick={() => setTool(tool === 'razor' ? 'select' : 'razor')}
          >
            <Scissors size={17} />
          </button>
          <span className="divider" />
          <button
            className="icon"
            title="Split at playhead · Ctrl K"
            aria-label="Split at playhead"
            onClick={splitSelected}
          >
            <Scissors size={15} />
          </button>
          <button
            className="icon"
            title="Delete selected"
            aria-label={adjustmentSelection ? 'Delete selected adjustment' : 'Delete selected clips'}
            disabled={!selected.length && !adjustmentSelection}
            onClick={() => deleteSelected()}
          >
            <Trash2 size={16} />
          </button>
          <button
            className="icon"
            title="Ripple delete"
            aria-label="Ripple delete"
            disabled={!selected.length}
            onClick={() => deleteSelected(true)}
          >
            <Minus size={16} />
          </button>
          <button
            className={`icon ${snap ? 'active' : ''}`}
            title="Snapping"
            aria-label="Toggle snapping"
            aria-pressed={snap}
            onClick={() => setSnap(!snap)}
          >
            <Magnet size={16} />
          </button>
          <button
            className={`icon ${snapBeats ? 'active' : ''}`}
            title="Snap to music beats"
            aria-label="Toggle beat snapping"
            aria-pressed={snapBeats}
            onClick={() => setSnapBeats(!snapBeats)}
          >
            <Music size={15} />
          </button>
          <button
            className="icon"
            title="Group selected"
            aria-label="Group selected clips"
            disabled={selected.length < 2}
            onClick={() => {
              const next = structuredClone(p),
                groupId = uid();
              next.clips
                .filter((c) => selected.includes(c.id))
                .forEach((c) => (c.groupId = groupId));
              commit(next, 'Group clips');
            }}
          >
            <Group size={17} />
          </button>
          <button
            className="icon"
            title="Duplicate selected"
            aria-label="Duplicate selected clips"
            disabled={!selected.length}
            onClick={() => {
              const next = structuredClone(p);
              for (const c of p.clips.filter((c) => selected.includes(c.id) && !isLocked(p, c)))
                next.clips.push({ ...structuredClone(c), id: uid(), start: clipEnd(c) });
              commit(next, 'Duplicate clips');
            }}
          >
            <Copy size={16} />
          </button>
        </div>
        <span className="timeline-label">
          TIMELINE <span>{p.clips.length} clips</span>
        </span>
        <div className="zoom-control">
          <button
            type="button"
            className="icon-mini-btn"
            title="Fit to window (Shift+Z)"
            aria-label="Fit to window"
            onClick={fitTimeline}
          >
            <Maximize2 size={13} />
          </button>
          <Minus size={13} />
          <input
            aria-label="Timeline zoom"
            type="range"
            min="8"
            max="240"
            value={zoom}
            onChange={(e) => setZoom(+e.target.value)}
          />
          <Plus size={13} />
        </div>
      </div>
      <TimelineMinimap scrollRef={body} zoom={zoom} />
      <div
        className={`timeline-scroll ${tool === 'hand' ? 'hand-tool' : ''} ${panning ? 'is-panning' : ''}`}
        ref={body}
        onPointerDownCapture={startPan}
        onAuxClick={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
      >
        <div className="track-labels">
          <TimelineClock />
          <div className="track-label caption-track-label">
            <b>C1</b>
            <button
              className="icon tiny"
              aria-label="Add timeline caption"
              title="Add caption at playhead"
              disabled={!p.clips.length}
              onClick={() => {
                const playhead = useEditor.getState().playhead;
                const c =
                  p.clips.find((c) => !isAudioClip(p, c) && selected.includes(c.id)) ??
                  p.clips.find(
                    (c) => !isAudioClip(p, c) && playhead >= c.start && playhead < clipEnd(c),
                  ) ??
                  p.clips.find((c) => !isAudioClip(p, c));
                if (c)
                  useEditor
                    .getState()
                    .selectCaption({ clipId: c.id, wordIds: [], start: playhead });
              }}
            >
              <Plus size={14} />
            </button>
            <button
              className="icon tiny"
              aria-label={p.captions.enabled ? 'Hide captions' : 'Show captions'}
              onClick={() =>
                commit(
                  { ...p, captions: { ...p.captions, enabled: !p.captions.enabled } },
                  'Toggle captions',
                )
              }
            >
              {p.captions.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          </div>
          <AdjustmentLabels />
          {p.tracks.map((t) => (
            <div className="track-label" data-track-kind={t.kind} key={t.id} style={{ height: t.height }}>
              <b>{t.name}</b>
              <StudioTrackLabel project={p} trackId={t.id} />
              <button
                className="icon tiny"
                aria-label={`${t.locked ? 'Unlock' : 'Lock'} ${t.name}`}
                onClick={() => trackPatch(t.id, { locked: !t.locked })}
              >
                {t.locked ? <LockKeyhole size={13} /> : <UnlockKeyhole size={13} />}
              </button>
              <button
                className="icon tiny"
                aria-label={`${t.kind === 'video' ? (t.hidden ? 'Show' : 'Hide') : t.muted ? 'Unmute' : 'Mute'} ${t.name}`}
                onClick={() =>
                  trackPatch(t.id, t.kind === 'video' ? { hidden: !t.hidden } : { muted: !t.muted })
                }
              >
                {t.kind === 'video' ? (
                  t.hidden ? (
                    <EyeOff size={14} />
                  ) : (
                    <Eye size={14} />
                  )
                ) : t.muted ? (
                  <VolumeX size={14} />
                ) : (
                  <Volume2 size={14} />
                )}
              </button>
              <input
                aria-label={`${t.name} track height`}
                title="Track height"
                type="range"
                min="32"
                max="100"
                value={t.height}
                onChange={(e) => trackPatch(t.id, { height: +e.target.value })}
              />
            </div>
          ))}
        </div>
        <div className="timeline-lanes" style={{ width, minWidth: width }}>
          <div ref={snapGuideRef} className="magnetic-snap-guide" aria-hidden="true" />
          {filterVisibleBeats(beats, viewport.startTime, viewport.endTime).map((beat, i) => (
            <div
              className="beat-marker"
              key={`${beat}-${i}`}
              style={{ left: beat * zoom }}
              title={`Beat ${timecode(beat, true)}`}
            />
          ))}
          <div className="ruler" onPointerDown={scrub}>
            {getVisibleRulerTicks(
              viewport.startTime,
              viewport.endTime,
              step,
              Math.ceil(width / zoom / step),
            ).map((i) => (
              <span key={i} style={{ left: i * step * zoom }}>
                {timecode(i * step)}
              </span>
            ))}
          </div>
          <CaptionLane zoom={zoom} snap={snap} />
          <AdjustmentLanes zoom={zoom} snap={snap} razor={tool === 'razor'} />
          {p.tracks.map((t) => {
            const trackClips = p.clips.filter(
              (c) =>
                c.trackId === t.id || (t.id === 'A1' && !isAudioClip(p, c) && !c.audioDetached),
            );
            const visibleClips = filterVisibleClips(
              trackClips,
              viewport.startTime,
              viewport.endTime,
              drag?.id ? [...selected, drag.id] : selected,
            );
            return (
              <div
                key={t.id}
                data-track={t.id}
                className={`track-lane ${t.locked ? 'locked' : ''}`}
                style={{ height: t.height }}
                onPointerDown={(e) => {
                  scrub(e);
                  select([]);
                }}
              >
                {visibleClips.map((original) => {
                  const c = drag?.id === original.id ? { ...original, ...drag } : original,
                    m = p.media.find((m) => m.id === c.mediaId)!;
                  return (
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`${m.name} clip at ${timecode(c.start)}`}
                      key={c.id}
                      className={`timeline-clip ${t.kind === 'audio' ? 'audio' : ''} ${selected.includes(c.id) ? 'selected' : ''} ${c.aiReason ? 'ai-clip' : ''}`}
                      style={{ left: c.start * zoom, width: Math.max(4, clipDuration(c) * zoom) }}
                      onPointerDown={(e) =>
                        t.id === original.trackId
                          ? startDrag(e, original, 'move')
                          : (e.stopPropagation(), select([original.id]))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') select([c.id]);
                      }}
                    >
                      {t.kind === 'video' ? (
                        <>
                          <span className="clip-name">
                            {c.aiReason && '✦ '}
                            {m.name}
                          </span>
                          {c.transition && (
                            <span
                              className="clip-transition-badge"
                              title={`Transition: ${c.transition.type} (${c.transition.duration}s)`}
                            >
                              ⚡ {c.transition.type.replace('-', ' ')}
                            </span>
                          )}
                          <div className="filmstrip">
                            {Array.from(
                              { length: Math.min(20, Math.ceil((clipDuration(c) * zoom) / 70)) },
                              (_, i) => (
                                <span
                                  key={i}
                                  style={{
                                    backgroundImage: mediaThumbnails.has(c.mediaId)
                                      ? `url("${mediaThumbnails.get(c.mediaId)}")`
                                      : undefined,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                  }}
                                />
                              ),
                            )}
                          </div>
                          <span
                            className="trim-handle left"
                            aria-label="Trim start"
                            onPointerDown={(e) => startDrag(e, original, 'in')}
                          />
                          <span
                            className="trim-handle right"
                            aria-label="Trim end"
                            onPointerDown={(e) => startDrag(e, original, 'out')}
                          />
                        </>
                      ) : (
                        <>
                          <span className="clip-name">
                            {isAudioClip(p, c) ? m.name : 'Linked audio'}
                          </span>
                          {isAudioClip(p, c) && (
                            <>
                              <span
                                className="trim-handle left"
                                aria-label="Trim audio start"
                                onPointerDown={(e) => startDrag(e, original, 'in')}
                              />
                              <span
                                className="trim-handle right"
                                aria-label="Trim audio end"
                                onPointerDown={(e) => startDrag(e, original, 'out')}
                              />
                            </>
                          )}
                          <div className="waveform" aria-hidden="true">
                            {Array.from(
                              { length: Math.min(150, Math.floor((clipDuration(c) * zoom) / 4)) },
                              (_, i) => (
                                <i
                                  key={i}
                                  style={{
                                    height: `${(audioWaveforms.get(c.mediaId)?.[Math.floor((c.sourceStart + (i / ((clipDuration(c) * zoom) / 4)) * (c.sourceEnd - c.sourceStart)) * 10)] ?? 0) * 90 + 4}%`,
                                  }}
                                />
                              ),
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              {!p.clips.length && t.id === 'V1' && (
                <span className="lane-hint">Your story, one good moment at a time.</span>
              )}
            </div>
          );
        })}
          <TimelinePlayhead zoom={zoom} />
        </div>
      </div>
      <div className="timeline-footer">
        <span>
          Space <kbd>Play</kbd> &nbsp; Ctrl K <kbd>Split</kbd> &nbsp; Shift <kbd>Multi-select</kbd>{' '}
          &nbsp; Middle drag <kbd>Pan</kbd> &nbsp; Ctrl wheel <kbd>Zoom</kbd> &nbsp; Shift wheel{' '}
          <kbd>Scroll</kbd>
        </span>
        <span>{timecode(total, true)} total</span>
      </div>
      <FloatingActionBar />
    </section>
  );
}

// Only the cursor needs a render on every playback tick. Track geometry stays put.
function TimelinePlayhead({ zoom }: { zoom: number }) {
  const playhead = useEditor((s) => s.playhead);
  return (
    <div
      className="playhead"
      style={{ left: 0, transform: `translateX(${playhead * zoom}px)`, willChange: 'transform' }}
    >
      <span />
    </div>
  );
}

function TimelineClock() {
  const label = useEditor((s) => timecode(s.playhead));
  return <div className="ruler-label">{label}</div>;
}
