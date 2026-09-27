import { useEffect, useRef, useState, useCallback, useMemo, Fragment } from 'react';
import { Play, Pause, SkipBack, SkipForward, Maximize, Film, Cat } from 'lucide-react';
import { useEditor, mediaUrls } from './store';
import {
  type Clip,
  captionGroups,
  duration,
  clipEnd,
  timecode,
  isAudioClip,
  clipAudible,
} from './model';
import { captionEmoji, captionLayout } from './caption-layout';
import { captionAppearance } from './caption-style';
import { captionTypography, captionBoxStyle, captionDecoration } from './caption-typography';
import { transformAt } from './motion';
import { audioGainAt, audioWindow } from './audio-crossfades';
import { usePreviewAudio } from './preview-audio';
import { TransformHandles } from './TransformHandles';
import { PlaybackSpeed } from './PlaybackSpeed';
import { ensureProxy, previewSource, proxyStatus, type PreviewQuality } from './proxies';
function VideoLayer({
  clip,
  quality,
  degraded,
  onDegrade,
}: {
  clip: Clip;
  quality: PreviewQuality;
  degraded: boolean;
  onDegrade: (id: string) => void;
}) {
  const draft = useEditor((s) => s.previewClip);
  if (draft?.id === clip.id) clip = draft;
  const ref = useRef<HTMLVideoElement>(null),
    p = useEditor((s) => s.project),
    playing = useEditor((s) => s.playing),
    previewRate = useEditor((s) => s.previewRate),
    time = useEditor((s) => s.playhead),
    track = p.tracks.find((t) => t.id === clip.trackId)!;
  useEditor((s) => s.mediaRevision);
  const frames = useRef({ time: 0, total: 0, dropped: 0 });
  const active = time >= clip.start && time < clipEnd(clip),
    asset = p.media.find((m) => m.id === clip.mediaId)!,
    url = isAudioClip(p, clip)
      ? mediaUrls.get(clip.mediaId)
      : previewSource(asset, quality, degraded).url,
    source = clip.sourceStart + (time - clip.start) * clip.properties.speed;
  const window = audioWindow(p, clip),
    audioActive = time >= window.timelineStart && time < window.timelineStart + window.duration;
  const props = transformAt(clip, time, p.settings.width, p.settings.height);
  usePreviewAudio(ref, audioGainAt(p, clip, time), playing && audioActive, clip.voiceEnhance);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (
      active &&
      playing &&
      quality === 'Auto' &&
      !degraded &&
      performance.now() - frames.current.time > 2000
    ) {
      const stats = v.getVideoPlaybackQuality?.();
      if (stats) {
        const totalFrames = stats.totalVideoFrames - frames.current.total;
        if (
          totalFrames > 10 &&
          (stats.droppedVideoFrames - frames.current.dropped) / totalFrames > 0.08
        )
          onDegrade(clip.mediaId);
        frames.current = {
          time: performance.now(),
          total: stats.totalVideoFrames,
          dropped: stats.droppedVideoFrames,
        };
      }
    }
    v.playbackRate = clip.properties.speed * previewRate;
    v.preservesPitch = true;
    if (audioActive) {
      if (Math.abs(v.currentTime - source) > 0.2 || !playing) v.currentTime = Math.max(0, source);
      if (playing) v.play().catch(() => useEditor.getState().setPlaying(false));
      else v.pause();
    } else v.pause();
  }, [
    time,
    playing,
    source,
    clip,
    active,
    audioActive,
    url,
    quality,
    degraded,
    onDegrade,
    previewRate,
  ]);
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
      preload="metadata"
      muted={!audioActive || !clipAudible(p, clip)}
      style={{
        visibility: active && !track.hidden && !isAudioClip(p, clip) ? 'visible' : 'hidden',
        opacity: props.opacity,
        transform: `translate(${(props.x / p.settings.width) * 100}%,${(props.y / p.settings.height) * 100}%) rotate(${props.rotation}deg) scale(${props.scale})`,
        clipPath: `inset(${props.crop}%)`,
      }}
    />
  );
}
export default function Preview({
  onImport,
  processing = false,
}: {
  onImport: () => void;
  processing?: boolean;
}) {
  const [quality, setQuality] = useState<PreviewQuality>('Auto'),
    [degraded, setDegraded] = useState<string[]>([]);
  const onDegrade = useCallback(
    (id: string) => setDegraded((ids) => (ids.includes(id) ? ids : [...ids, id])),
    [],
  );
  const p = useEditor((s) => s.project),
    time = useEditor((s) => s.playhead),
    playing = useEditor((s) => s.playing),
    seek = useEditor((s) => s.seek),
    setPlaying = useEditor((s) => s.setPlaying),
    frame = useRef<HTMLDivElement>(null),
    total = duration(p),
    groups = useMemo(() => p.captions.enabled ? captionGroups(p) : [], [p]),
    caption = groups.find((g) => time >= g[0].timelineStart && time < g.at(-1)!.timelineEnd),
    appearance = captionAppearance(p.captions);
  const layout = captionLayout(p);
  const mediaRevision = useEditor((s) => s.mediaRevision);
  useEffect(() => {
    if (processing) return;
    for (const asset of p.media.filter(
      (m) => !m.type.startsWith('audio/') && p.clips.some((c) => c.mediaId === m.id),
    ))
      if (proxyStatus.get(asset.id)?.state !== 'error')
        void ensureProxy(asset, quality, degraded.includes(asset.id));
  }, [p.media, quality, degraded, mediaRevision, processing]);
  const activeClip = p.clips.find((c) => time >= c.start && time < clipEnd(c)) ?? p.clips[0];
  const activeAsset = p.media.find((m) => m.id === activeClip?.mediaId);
  const resolution = activeAsset
    ? previewSource(activeAsset, quality, degraded.includes(activeAsset.id))
    : undefined;
  const status = activeAsset && proxyStatus.get(activeAsset.id);
  useEffect(() => {
    if (!playing) return;
    let raf: number,
      last = performance.now();
    const tick = (now: number) => {
      const s = useEditor.getState(),
        next = s.playhead + ((now - last) / 1000) * s.previewRate;
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
      <div className="preview-quality">
        <select
          aria-label="Preview quality"
          value={quality}
          onChange={(e) => {
            setQuality(e.target.value as PreviewQuality);
            setDegraded([]);
          }}
        >
          {(['Auto', 'Full', 'Half', 'Quarter'] as const).map((q) => (
            <option key={q}>{q}</option>
          ))}
        </select>
        <span>
          {status?.state === 'preparing'
            ? `Optimizing preview${status.progress === undefined ? '…' : ` · ${Math.round(status.progress)}%`}`
            : resolution
              ? `Preview ${resolution.width} × ${resolution.height} · Export ${p.exportSettings.width} × ${p.exportSettings.height}`
              : 'Originals are used for export'}
        </span>
        {status?.state === 'error' && (
          <button
            className="text-button"
            disabled={processing}
            onClick={() => {
              proxyStatus.delete(activeAsset!.id);
              void ensureProxy(activeAsset!, quality, degraded.includes(activeAsset!.id));
            }}
          >
            Retry preview
          </button>
        )}
      </div>
      <div className="preview-stage" ref={frame}>
        {p.clips.length ? (
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
                <VideoLayer
                  key={c.id}
                  clip={c}
                  quality={quality}
                  degraded={degraded.includes(c.mediaId)}
                  onDegrade={onDegrade}
                />
              ))}
            <TransformHandles />
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
                    ...(p.captions.position === 'custom'
                      ? {
                          left: `${layout.x}%`,
                          top: `${layout.y}%`,
                          right: 'auto',
                          width: `${layout.width}%`,
                          transform: 'translate(-50%, -50%)',
                        }
                      : {}),
                    ...(p.captions.position === 'bottom'
                      ? { bottom: `${appearance.margin}%` }
                      : p.captions.position === 'top'
                        ? { top: `${appearance.margin}%` }
                        : {}),
                  } as React.CSSProperties & { '--intensity': number }
                }
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
                        style={
                          {
                            textDecorationLine: captionDecoration(appearance),
                            '--speaker': appearance.speakerColors
                              ? (p.speakers.find((s) => s.id === w.speakerId)?.color ??
                                appearance.accent)
                              : appearance.accent,
                          } as React.CSSProperties
                        }
                      >
                        {w.text}
                      </span>
                      {index < caption.length - 1 ? ' ' : ''}
                      </Fragment>
                    );
                  })}
                  {captionEmoji(p, caption) && (
                    <span className="caption-emoji">{' '}{captionEmoji(p, caption)}</span>
                  )}
                </div>
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
        <PlaybackSpeed />
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
