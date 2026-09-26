import { useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Maximize, Film, Cat } from 'lucide-react';
import { useEditor, mediaUrls } from './store';
import { type Clip, captionAt, duration, clipEnd, timecode } from './model';
import { animationTransform } from './media';
import { captionAppearance } from './caption-style';
function VideoLayer({ clip }: { clip: Clip }) {
  const ref = useRef<HTMLVideoElement>(null),
    p = useEditor((s) => s.project),
    playing = useEditor((s) => s.playing),
    time = useEditor((s) => s.playhead),
    track = p.tracks.find((t) => t.id === clip.trackId)!;
  useEditor((s) => s.mediaRevision);
  const active = time >= clip.start && time < clipEnd(clip),
    url = mediaUrls.get(clip.mediaId),
    source = clip.sourceStart + (time - clip.start) * clip.properties.speed;
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.playbackRate = clip.properties.speed;
    const fade = Math.min(
      1,
      (time - clip.start) / Math.max(0.001, clip.properties.fadeIn),
      (clipEnd(clip) - time) / Math.max(0.001, clip.properties.fadeOut),
    );
    v.volume = Math.min(1, clip.properties.volume * Math.max(0, fade));
    if (active) {
      if (Math.abs(v.currentTime - source) > 0.2 || !playing) v.currentTime = Math.max(0, source);
      if (playing) v.play().catch(() => useEditor.getState().setPlaying(false));
      else v.pause();
    } else v.pause();
  }, [time, playing, source, clip, active]);
  if (!url)
    return active ? (
      <div className="missing-preview">
        <Film />
        <span>Missing media</span>
        <small>Relink this file in the Media panel.</small>
      </div>
    ) : null;
  return (
    <video
      ref={ref}
      src={url}
      playsInline
      preload="auto"
      muted={!active || track.muted || p.tracks.find((t) => t.id === 'A1')?.muted}
      style={{
        visibility: active && !track.hidden ? 'visible' : 'hidden',
        opacity: clip.properties.opacity,
        transform: `translate(${(clip.properties.x / p.settings.width) * 100}%,${(clip.properties.y / p.settings.height) * 100}%) scale(${clip.properties.scale}) rotate(${clip.properties.rotation}deg) ${animationTransform(clip, time)}`,
        clipPath: `inset(${clip.properties.crop}%)`,
      }}
    />
  );
}
export default function Preview({ onImport }: { onImport: () => void }) {
  const p = useEditor((s) => s.project),
    time = useEditor((s) => s.playhead),
    playing = useEditor((s) => s.playing),
    seek = useEditor((s) => s.seek),
    setPlaying = useEditor((s) => s.setPlaying),
    frame = useRef<HTMLDivElement>(null),
    total = duration(p),
    caption = captionAt(p, time),
    appearance = captionAppearance(p.captions);
  useEffect(() => {
    if (!playing) return;
    let raf: number,
      last = performance.now();
    const tick = (now: number) => {
      const s = useEditor.getState(),
        next = s.playhead + (now - last) / 1000;
      last = now;
      if (next >= duration(s.project)) {
        s.seek(duration(s.project));
        s.setPlaying(false);
        return;
      }
      s.seek(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  useEffect(() => {
    if (time > total) seek(total);
  }, [total, time, seek]);
  function toggle() {
    if (time >= total) seek(0);
    setPlaying(!playing);
  }
  return (
    <section className="preview-panel">
      <div className="panel-title">
        <span>Preview</span>
        <span className="subtle">
          {p.settings.width} × {p.settings.height} <span className="separator">/</span>{' '}
          {p.settings.fps} fps
        </span>
      </div>
      <div className="preview-stage" ref={frame}>
        {p.clips.length ? (
          <div
            className="video-canvas"
            style={{ aspectRatio: `${p.settings.width}/${p.settings.height}` }}
          >
            {[...p.clips]
              .sort(
                (a, b) =>
                  p.tracks.findIndex((t) => t.id === b.trackId) -
                  p.tracks.findIndex((t) => t.id === a.trackId),
              )
              .map((c) => (
                <VideoLayer key={c.id} clip={c} />
              ))}
            {p.captions.safeArea && (
              <div className="safe-area">
                <span>Caption safe area</span>
              </div>
            )}
            {caption && (
              <div
                className={`caption-overlay caption-${p.captions.preset.toLowerCase()} position-${p.captions.position}`}
                style={
                  {
                    '--intensity': p.captions.intensity / 100,
                    fontFamily: 'Noto, sans-serif',
                    fontSize: `${appearance.size}cqw`,
                    fontWeight: appearance.bold ? 700 : 400,
                    color: appearance.color,
                    textShadow: 'none',
                    WebkitTextStroke: `${appearance.outline / 10.8}cqw ${appearance.outlineColor}`,
                    paintOrder: 'stroke',
                    ...(p.captions.position === 'bottom'
                      ? { bottom: `${appearance.margin}%` }
                      : p.captions.position === 'top'
                        ? { top: `${appearance.margin}%` }
                        : {}),
                  } as React.CSSProperties & { '--intensity': number }
                }
              >
                {caption.map((w) => (
                  <span
                    key={w.id}
                    className={
                      w.important && time >= w.timelineStart && time < w.timelineEnd
                        ? 'keyword active'
                        : ''
                    }
                    style={
                      {
                        '--speaker': appearance.speakerColors
                          ? (p.speakers.find((s) => s.id === w.speakerId)?.color ??
                            appearance.accent)
                          : appearance.accent,
                      } as React.CSSProperties
                    }
                  >
                    {w.text}{' '}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="empty-preview">
            <Cat size={42} strokeWidth={1.2} />
            <h3>A good story starts here.</h3>
            <p>Drop in your footage. We’ll make room for the good parts.</p>
            <button className="primary" onClick={onImport}>
              Import a video
            </button>
            <small>MP4, MOV, WebM · stays on your device</small>
          </div>
        )}
      </div>
      <div className="transport">
        <span className="timecode">
          {timecode(time, true)} <span>/ {timecode(total, true)}</span>
        </span>
        <div>
          <button className="icon" aria-label="Go to start" onClick={() => seek(0)}>
            <SkipBack size={16} />
          </button>
          <button
            className="play-button"
            aria-label={playing ? 'Pause' : 'Play'}
            disabled={!total}
            onClick={toggle}
          >
            {playing ? <Pause size={19} /> : <Play size={19} fill="currentColor" />}
          </button>
          <button
            className="icon"
            aria-label="Go to end"
            onClick={() => {
              seek(total);
              setPlaying(false);
            }}
          >
            <SkipForward size={16} />
          </button>
        </div>
        <button
          className="icon"
          aria-label="Fullscreen preview"
          onClick={() => frame.current?.requestFullscreen?.()}
        >
          <Maximize size={16} />
        </button>
      </div>
      <input
        className="mobile-scrubber"
        aria-label="Playhead"
        type="range"
        min="0"
        max={total || 1}
        step="0.01"
        value={time}
        onChange={(e) => seek(+e.target.value)}
      />
    </section>
  );
}
