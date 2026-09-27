import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { mediaUrls, useEditor } from './store';
import { PlaybackSpeed } from './PlaybackSpeed';
import {
  applyOperations,
  captionAt,
  clipEnd,
  duration,
  timecode,
  type Clip,
  type Project,
  type Operation,
  clipAudible,
  isAudioClip,
} from './model';
import { transformAt } from './motion';
import { audioGainAt, audioWindow } from './audio-crossfades';
import { usePreviewAudio } from './preview-audio';
import { captionAppearance } from './caption-style';
import { captionEmoji, captionLayout } from './caption-layout';
export function OperationsPreview({
  project,
  operations,
}: {
  project: Project;
  operations: Operation[];
}) {
  const proposed = useMemo(() => applyOperations(project, operations), [project, operations]);
  return <EditPreview project={proposed} />;
}
function ProposedLayer({
  p,
  clip,
  time,
  playing,
}: {
  p: Project;
  clip: Clip;
  time: number;
  playing: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null),
    props = transformAt(clip, time, p.settings.width, p.settings.height);
  const window = audioWindow(p, clip),
    track = p.tracks.find((t) => t.id === clip.trackId)!;
  const audible = time >= window.timelineStart && time < window.timelineStart + window.duration;
  const previewRate = useEditor((s) => s.previewRate);
  usePreviewAudio(ref, audioGainAt(p, clip, time), playing && audible, clip.voiceEnhance);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const source = Math.max(0, clip.sourceStart + (time - clip.start) * clip.properties.speed);
    if (!playing || Math.abs(video.currentTime - source) > 0.15) video.currentTime = source;
    video.playbackRate = clip.properties.speed * previewRate;
    video.preservesPitch = true;
    if (playing && audible) void video.play().catch(() => {});
    else video.pause();
  }, [p, clip, time, playing, audible, previewRate]);
  return (
    <video
      ref={ref}
      src={mediaUrls.get(clip.mediaId)}
      playsInline
      preload="auto"
      muted={!audible || !clipAudible(p, clip)}
      style={{
        visibility:
          time >= clip.start && time < clipEnd(clip) && !track.hidden && !isAudioClip(p, clip)
            ? 'visible'
            : 'hidden',
        opacity: props.opacity,
        transform: `translate(${(props.x / p.settings.width) * 100}%, ${(props.y / p.settings.height) * 100}%) rotate(${props.rotation}deg) scale(${props.scale})`,
        clipPath: `inset(${props.crop}%)`,
      }}
    />
  );
}
/** Isolated playback of a proposed project; never changes the editor or its undo history. */
export function EditPreview({
  project: p,
  label = 'Edited preview',
}: {
  project: Project;
  label?: string;
}) {
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    total = duration(p);
  useEffect(() => {
    setTime(0);
    setPlaying(false);
  }, [p]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0,
      last = performance.now(),
      current = time;
    const tick = (now: number) => {
      current = Math.min(total, current + ((now - last) / 1000) * useEditor.getState().previewRate);
      last = now;
      setTime(current);
      if (current >= total) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, total]);
  const caption = captionAt(p, time),
    appearance = captionAppearance(p.captions),
    layout = captionLayout(p);
  const position = p.captions.position;
  return (
    <section className="edit-preview" aria-label={label}>
      <b>{label}</b>
      <div className="edit-preview-stage">
        <div
          className="video-canvas"
          style={{ aspectRatio: `${p.settings.width}/${p.settings.height}` }}
        >
          {[...p.clips]
            .filter((c) => time >= c.start - 1 && time <= clipEnd(c) + 1)
            .sort(
              (a, b) =>
                p.tracks.findIndex((t) => t.id === b.trackId) -
                p.tracks.findIndex((t) => t.id === a.trackId),
            )
            .map((c) => (
              <ProposedLayer key={c.id} p={p} clip={c} time={time} playing={playing} />
            ))}
          {caption && (
            <div
              className={`caption-overlay caption-${p.captions.preset.toLowerCase()} position-${position}`}
              style={{
                fontFamily: 'Noto, sans-serif',
                fontSize: `${appearance.size}cqw`,
                fontWeight: appearance.bold ? 700 : 400,
                color: appearance.color,
                textShadow: 'none',
                WebkitTextStroke: `${appearance.outline / 10.8}cqw ${appearance.outlineColor}`,
                paintOrder: 'stroke',
                ...(position === 'custom'
                  ? {
                      left: `${layout.x}%`,
                      top: `${layout.y}%`,
                      width: `${layout.width}%`,
                      right: 'auto',
                      transform: 'translate(-50%,-50%)',
                    }
                  : position === 'bottom'
                    ? { bottom: `${appearance.margin}%` }
                    : position === 'top'
                      ? { top: `${appearance.margin}%` }
                      : {}),
              }}
            >
              {caption.map((w) => (
                <span
                  key={w.id}
                  style={{
                    color:
                      w.important && time >= w.timelineStart && time < w.timelineEnd
                        ? appearance.speakerColors
                          ? (p.speakers.find((s) => s.id === w.speakerId)?.color ??
                            appearance.accent)
                          : appearance.accent
                        : undefined,
                  }}
                >
                  {w.text}{' '}
                </span>
              ))}
              {captionEmoji(p, caption)}
            </div>
          )}
        </div>
      </div>
      <div className="edit-preview-transport">
        <PlaybackSpeed />
        <button
          className="icon"
          aria-label={playing ? 'Pause edited preview' : 'Play edited preview'}
          disabled={!total}
          onClick={() => {
            if (time >= total) setTime(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <input
          aria-label="Edited preview playhead"
          type="range"
          min="0"
          max={total || 1}
          step="0.01"
          value={time}
          onChange={(e) => {
            setPlaying(false);
            setTime(+e.target.value);
          }}
        />
        <span>
          {timecode(time, true)} / {timecode(total, true)}
        </span>
      </div>
      <small>{p.clips.length} clips · Preview only; your timeline changes when you apply.</small>
    </section>
  );
}
