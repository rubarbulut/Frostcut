import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { Play, Pause } from 'lucide-react';
import { mediaUrls, useEditor } from './store';
import { PlaybackSpeed } from './PlaybackSpeed';
import { hasVisualEffects } from './visual-effects';
import { EffectPreview } from './EffectPreview';
import { AdjustmentComposite } from './AdjustmentComposite';
import { frameObjectFit, needsBlurFill } from './aspect-fill';
import {
  applyOperations,
  clipEnd,
  duration,
  timecode,
  type Clip,
  type Project,
  type Operation,
  isAudioClip,
} from './model';
import { transformAt } from './motion';
import { createClipAudioPlan } from './audio-crossfades';
import { usePreviewAudio } from './preview-audio';
import { captionAppearance } from './caption-style';
import { captionTypography, captionBoxStyle, captionDecoration } from './caption-typography';
import { captionEmoji, captionLayout } from './caption-layout';
import { captionTimelineIndex, clipTimelineIndex } from './timeline-index';
export function OperationsPreview({
  project,
  operations,
}: {
  project: Project;
  operations: Operation[];
}) {
  const proposed = useMemo(() => {
    try { return { project: applyOperations(project, operations), error: '' }; }
    catch (error) { return { project: undefined, error: (error as Error).message }; }
  }, [project, operations]);
  return proposed.project ? <EditPreview project={proposed.project} /> : <p role="alert">{proposed.error}</p>;
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
  const audio = useMemo(() => createClipAudioPlan(p, clip), [p, clip]),
    window = audio.window,
    track = p.tracks.find((t) => t.id === clip.trackId)!;
  const audible = time >= window.timelineStart && time < window.timelineStart + window.duration;
  const previewRate = useEditor((s) => s.previewRate);
  const withEffects = !isAudioClip(p, clip) && hasVisualEffects(clip.effects);
  const asset = p.media.find((m) => m.id === clip.mediaId)!;
  const withBlur = !isAudioClip(p, clip) && needsBlurFill(asset, p.settings, p.settings.fillMode);
  const active = time >= clip.start && time < clipEnd(clip) && !track.hidden && !isAudioClip(p, clip);
  const effectStyle = {
    objectFit: frameObjectFit(p.settings.fillMode),
    opacity: props.opacity,
    transform: `translate(${(props.x / p.settings.width) * 100}%, ${(props.y / p.settings.height) * 100}%) rotate(${props.rotation}deg) scale(${props.scale})`,
    clipPath: `inset(${props.crop}%)`,
  };
  usePreviewAudio(ref, audio.gainAt(time), playing && audible, clip.voiceEnhance);
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
    <>
      <video
        ref={ref}
        src={mediaUrls.get(clip.mediaId)}
        playsInline
        preload="auto"
        muted={!audible || !audio.audible}
        style={{
          ...effectStyle,
          visibility: active && !withEffects && !withBlur ? 'visible' : 'hidden',
        }}
      />
      {(withEffects || withBlur) && (
        <EffectPreview
          videoRef={ref}
          effects={clip.effects}
          frame={withBlur ? p.settings : undefined}
          active={active}
          playing={playing}
          source={mediaUrls.get(clip.mediaId)}
          style={effectStyle}
        />
      )}
    </>
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
  const clips = useMemo(() => clipTimelineIndex(p, true), [p.clips, p.tracks]),
    captions = useMemo(() => captionTimelineIndex(p), [p]),
    caption = captions.first(time),
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
          <AdjustmentComposite layers={p.adjustments} time={time}>
          {clips.at(time)
            .map((c) => (
              <ProposedLayer key={c.id} p={p} clip={c} time={time} playing={playing} />
            ))}
          </AdjustmentComposite>
          {caption && (
            <div
              className={`caption-overlay caption-${p.captions.preset.toLowerCase()} position-${position}`}
              style={{
                ...captionTypography(appearance),
                fontSize: `${appearance.size}cqw`,
                fontWeight: appearance.bold ? 700 : 400,
                color: appearance.color,
                textShadow:
                  appearance.shadow !== false
                    ? '0 2px 4px rgba(0,0,0,0.8), 0 1px 2px rgba(0,0,0,0.9)'
                    : 'none',
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
              <div
                className="caption-box"
                style={captionBoxStyle(appearance)}
              >
                {caption.map((w, index) => {
                  const isSpoken = time >= w.timelineStart && time < w.timelineEnd;
                  const isKeyword = w.important && isSpoken;
                  const anim = appearance.animation ?? 'pop';
                  const animClass = isSpoken && anim !== 'none' ? `caption-anim-${anim}` : '';
                  const keywordClass = isKeyword
                    ? 'keyword active'
                    : isSpoken
                      ? 'spoken-word'
                      : '';
                  return (
                    <Fragment key={w.id}>
                    <span
                      className={`${keywordClass} ${animClass}`.trim()}
                      style={{
                        textDecorationLine: captionDecoration(appearance),
                        '--speaker': appearance.speakerColors
                          ? (p.speakers.find((s) => s.id === w.speakerId)?.color ??
                            appearance.accent)
                          : appearance.accent,
                        color: isKeyword
                          ? appearance.speakerColors
                            ? (p.speakers.find((s) => s.id === w.speakerId)?.color ??
                              appearance.accent)
                            : appearance.accent
                          : undefined,
                      } as React.CSSProperties}
                    >
                      {w.text}
                    </span>
                    {index < caption.length - 1 ? ' ' : ''}
                    </Fragment>
                  );
                })}
                {captionEmoji(p, caption) && <span className="caption-emoji">{' '}{captionEmoji(p, caption)}</span>}
              </div>
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
