import { useEffect, useRef, useState, useCallback, useMemo, Fragment } from 'react';
import { Play, Pause, SkipBack, SkipForward, Maximize, Film, Cat } from 'lucide-react';
import { useEditor, mediaUrls } from './store';
import {
  type Clip,
  type Project,
  type Track,
  duration,
  clipEnd,
  timecode,
  isAudioClip,
  changeAspectRatio,
} from './model';
import { captionEmoji, captionLayout } from './caption-layout';
import { captionAppearance } from './caption-style';
import { captionTypography, captionBoxStyle, captionDecoration } from './caption-typography';
import { transformAt } from './motion';
import { createClipAudioPlan, type ClipAudioPlan } from './audio-crossfades';
import { usePreviewAudio } from './preview-audio';
import { TransformHandles } from './TransformHandles';
import { PlaybackSpeed } from './PlaybackSpeed';
import { hasVisualEffects } from './visual-effects';
import { EffectPreview } from './EffectPreview';
import { AdjustmentComposite } from './AdjustmentComposite';
import { frameAspectRatio, frameFillMode, frameObjectFit, needsBlurFill } from './aspect-fill';
import { AudioPeakMeter } from './AudioPeakMeter';
import { captionTimelineIndex } from './timeline-index';
import { ensureProxy, previewSource, proxyStatus, type PreviewQuality } from './proxies';
import { gopReverseEngine } from './shuttle-controller';
import { findProjectTransitions, TransitionBlender, type ActiveTransition } from './visual-renderer';
import { computeTransitionProgress } from './transitions-engine';
function VideoLayer({
  clip,
  quality,
  degraded,
  onDegrade,
  onRegisterVideo,
  activeTransition,
  plan,
}: {
  clip: Clip;
  quality: PreviewQuality;
  degraded: boolean;
  onDegrade: (id: string) => void;
  onRegisterVideo?: (id: string, el: HTMLVideoElement | null) => void;
  activeTransition?: ActiveTransition;
  plan?: ClipAudioPlan;
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

  useEffect(() => {
    if (ref.current) onRegisterVideo?.(clip.id, ref.current);
    return () => {
      onRegisterVideo?.(clip.id, null);
    };
  }, [clip.id, onRegisterVideo]);

  const inTransition =
    activeTransition &&
    (activeTransition.clipFrom.id === clip.id || activeTransition.clipTo.id === clip.id);
  const active = (time >= clip.start && time < clipEnd(clip)) || !!inTransition,
    asset = p.media.find((m) => m.id === clip.mediaId)!,
    url = isAudioClip(p, clip)
      ? mediaUrls.get(clip.mediaId)
      : previewSource(asset, quality, degraded).url,
    source = Math.max(0, clip.sourceStart + (time - clip.start) * clip.properties.speed);
  const audio = useMemo(() => plan ?? createClipAudioPlan(p, clip), [p, clip, plan]),
    window = audio.window,
    audioActive = time >= window.timelineStart && time < window.timelineStart + window.duration;
  const props = transformAt(clip, time, p.settings.width, p.settings.height, p.settings.fillMode);
  const withEffects = !isAudioClip(p, clip) && hasVisualEffects(clip.effects);
  const withBlur = !isAudioClip(p, clip) && needsBlurFill(asset, p.settings, p.settings.fillMode);
  const hiddenByTransition =
    !!activeTransition &&
    (activeTransition.clipFrom.id === clip.id || activeTransition.clipTo.id === clip.id);
  const isVideoDirectlyVisible =
    active && !track.hidden && !isAudioClip(p, clip) && !withEffects && !withBlur && !hiddenByTransition;
  const isVideoRenderingNeeded = active && !track.hidden && !isAudioClip(p, clip);

  const effectStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: frameObjectFit(p.settings.fillMode),
    opacity: isVideoDirectlyVisible ? props.opacity : 0,
    transform: `translate(${(props.x / p.settings.width) * 100}%,${(props.y / p.settings.height) * 100}%) rotate(${props.rotation}deg) scale(${props.scale})`,
    clipPath: `inset(${props.crop}%)`,
    pointerEvents: isVideoDirectlyVisible ? 'auto' : 'none',
  };
  usePreviewAudio(ref, audio.gainAt(time), playing && audioActive && previewRate > 0, clip.voiceEnhance, clip.audioRole);
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
    if (previewRate < 0) {
      v.playbackRate = 1;
      v.preservesPitch = true;
      v.pause();
      if (active && (Math.abs(v.currentTime - source) > 0.02 || !playing)) {
        if (gopReverseEngine.shouldSeekVideoElement(source, v, p.settings.fps, previewRate, clip.id)) {
          v.currentTime = Math.max(0.001, source);
        }
      }
    } else {
      v.playbackRate = Math.min(16, Math.max(0.25, clip.properties.speed * previewRate));
      v.preservesPitch = true;
      if (active) {
        if (!v.seeking && (Math.abs(v.currentTime - source) > 0.05 || !playing)) {
          v.currentTime = Math.max(0.001, source);
        }
        if (playing) {
          v.play().catch(() => useEditor.getState().setPlaying(false));
        } else {
          v.pause();
        }
      } else {
        v.pause();
      }
    }
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
  useEffect(() => {
    const v = ref.current;
    return () => {
      if (v) {
        v.pause();
        // Strict Mode replays cleanup while the same video is still mounted.
        if (!v.isConnected) {
          v.removeAttribute('src');
          v.load();
        }
      }
    };
  }, []);
  if (!url)
    return active ? (
      <div className="missing-preview">
        <Film />
        <span>Missing media</span>
        <small>Relink this file in the Media panel.</small>
      </div>
    ) : null;
  return (
    <>
      <video
        ref={ref}
        src={url}
        playsInline
        preload="auto"
        muted={!audioActive || !audio.audible}
        style={{
          ...effectStyle,
          visibility: isVideoRenderingNeeded ? 'visible' : 'hidden',
        }}
      />
      {(withEffects || withBlur) && (
        <EffectPreview
          videoRef={ref}
          effects={clip.effects}
          frame={withBlur ? p.settings : undefined}
          active={active && !track.hidden && !hiddenByTransition}
          playing={playing}
          source={url}
          style={{
            ...effectStyle,
            opacity: props.opacity,
            pointerEvents: 'auto',
          }}
        />
      )}
    </>
  );
}

export type ClipPlan = {
  readonly clip: Clip;
  readonly isAudio: boolean;
  readonly track: Track | undefined;
  readonly isTrackHidden: boolean;
  readonly audioPlan: ClipAudioPlan;
  readonly visualStart: number;
  readonly visualEnd: number;
  readonly audioStart: number;
  readonly audioEnd: number;
  readonly audible: boolean;
};

export type ProjectPreviewPlan = {
  readonly project: Project;
  readonly tracksMap: Map<string, Track>;
  readonly tracksOrder: Map<string, number>;
  readonly transitions: ActiveTransition[];
  readonly videoPlans: ClipPlan[];
  readonly audioPlans: ClipPlan[];
  readonly clipPlanMap: Map<string, ClipPlan>;
};

/**
 * Projeye bağlı immutable önizleme planı.
 * Edit-başına bir kez oluşturulur; her playhead tick'inde createClipAudioPlan
 * ve komşu/speech araması yapılması önlenir.
 */
export function buildProjectPreviewPlan(project: Project): ProjectPreviewPlan {
  const tracksMap = new Map(project.tracks.map((t) => [t.id, t]));
  const tracksOrder = new Map(project.tracks.map((t, i) => [t.id, i]));
  const transitions = findProjectTransitions(project);

  const clipPlanMap = new Map<string, ClipPlan>();
  const videoPlans: ClipPlan[] = [];
  const audioPlans: ClipPlan[] = [];

  for (const clip of project.clips) {
    const isAudio = isAudioClip(project, clip);
    const track = tracksMap.get(clip.trackId);
    const isTrackHidden = track?.hidden ?? false;
    let audioPlan: ClipAudioPlan;
    try {
      audioPlan = createClipAudioPlan(project, clip);
    } catch {
      audioPlan = {
        window: {
          pre: 0,
          post: 0,
          fadeIn: 0,
          fadeOut: 0,
          start: clip.sourceStart,
          end: clip.sourceEnd,
          timelineStart: clip.start,
          duration: clipEnd(clip) - clip.start,
        },
        audible: false,
        gainAt: () => 0,
      };
    }
    const win = audioPlan.window;
    const plan: ClipPlan = {
      clip,
      isAudio,
      track,
      isTrackHidden,
      audioPlan,
      visualStart: clip.start,
      visualEnd: clipEnd(clip),
      audioStart: win.timelineStart,
      audioEnd: win.timelineStart + win.duration,
      audible: audioPlan.audible,
    };
    clipPlanMap.set(clip.id, plan);
    if (isAudio) {
      audioPlans.push(plan);
    } else {
      videoPlans.push(plan);
    }
  }

  // Katman ve timeline sırasına göre sırala
  videoPlans.sort((a, b) => {
    const trackDiff = (tracksOrder.get(b.clip.trackId) ?? 0) - (tracksOrder.get(a.clip.trackId) ?? 0);
    if (trackDiff !== 0) return trackDiff;
    return a.clip.start - b.clip.start;
  });

  return {
    project,
    tracksMap,
    tracksOrder,
    transitions,
    videoPlans,
    audioPlans,
    clipPlanMap,
  };
}

/**
 * ActiveWindowDecoder: Sanallaştırılmış Video Dekoder Havuzu (Virtual Decoder Pool)
 * Tarayıcının donanım video dekoderlerini verimli yönetmek için:
 * - Kompozisyona katkı veren tüm aktif görsel katmanlar ve duyulur ses pencereleri korunur.
 * - Aktif geçiş (transition) kaynakları kesintisiz GPU harmanlaması için havuza alınır.
 * - Bir sonraki kurgu noktasına yaklaşan klipler için sınırlı pre-roll ayrılır;
 *   ihtiyaç dışı uzak ve geçmiş klipler DOM'dan unmount edilerek dekoder kaynakları temizlenir.
 *
 * NOT: Edit-başına üretilen immutable ProjectPreviewPlan kullanılarak her playhead tick'inde
 * createClipAudioPlan ve komşu/speech araması yapılması önlenmiştir.
 */
export function getActiveWindowClips(
  projectOrPlan: Project | ProjectPreviewPlan,
  time: number,
  preRollWindow = 2.0,
  maxPreRoll = 2,
): Clip[] {
  const plan = 'videoPlans' in projectOrPlan ? projectOrPlan : buildProjectPreviewPlan(projectOrPlan);

  const pool: Clip[] = [];

  // 1. Canlı geçiş (Transition) penceresinde olan her iki klibi donanım dekoder havuzuna al
  const activeTransition = plan.transitions.find((tr) => time >= tr.start && time < tr.end);
  if (activeTransition) {
    if (!pool.some((p) => p.id === activeTransition.clipFrom.id)) pool.push(activeTransition.clipFrom);
    if (!pool.some((p) => p.id === activeTransition.clipTo.id)) pool.push(activeTransition.clipTo);
  }

  // 2. Playhead zamanına temas eden TÜM aktif video katmanları (görsel veya duyulur ses katkısı veren)
  for (const vp of plan.videoPlans) {
    const isVisuallyActive = !vp.isTrackHidden && time >= vp.visualStart && time < vp.visualEnd;
    const isAudioActive = vp.audible && time >= vp.audioStart && time < vp.audioEnd;

    if (isVisuallyActive || isAudioActive) {
      if (!pool.some((p) => p.id === vp.clip.id)) {
        pool.push(vp.clip);
      }
    }
  }

  // 3. Bir sonraki kurgu noktasına < preRollWindow mesafede olan ön yükleme (pre-roll) klipleri
  let preRollAdded = 0;
  for (const vp of plan.videoPlans) {
    if (preRollAdded >= maxPreRoll) break;
    if (
      !vp.isTrackHidden &&
      vp.clip.start >= time &&
      vp.clip.start - time <= preRollWindow &&
      !pool.some((p) => p.id === vp.clip.id)
    ) {
      pool.push(vp.clip);
      preRollAdded++;
    }
  }

  // 4. Aktif ses klipleri (özel A1, A2 vb. ses kanalları - donanım video dekoderi tüketmez)
  const activeAudio: Clip[] = [];
  for (const ap of plan.audioPlans) {
    if (ap.audible && time >= ap.audioStart && time < ap.audioEnd) {
      activeAudio.push(ap.clip);
    }
  }

  return [...pool, ...activeAudio];
}

export function ActiveWindowDecoder({
  project,
  time,
  quality,
  degraded,
  onDegrade,
  onRegisterVideo,
  activeTransition,
  plan,
}: {
  project: Project;
  time: number;
  quality: PreviewQuality;
  degraded: string[];
  onDegrade: (id: string) => void;
  onRegisterVideo?: (id: string, el: HTMLVideoElement | null) => void;
  activeTransition?: ActiveTransition;
  plan?: ProjectPreviewPlan;
}) {
  const currentPlan = useMemo(
    () => plan ?? buildProjectPreviewPlan(project),
    [plan, project],
  );
  const windowClips = useMemo(
    () => getActiveWindowClips(currentPlan, time),
    [currentPlan, time],
  );

  return (
    <>
      {windowClips.map((c) => (
        <VideoLayer
          key={c.id}
          clip={c}
          quality={quality}
          degraded={degraded.includes(c.mediaId)}
          onDegrade={onDegrade}
          onRegisterVideo={onRegisterVideo}
          activeTransition={activeTransition}
          plan={currentPlan.clipPlanMap.get(c.id)?.audioPlan}
        />
      ))}
    </>
  );
}

/**
 * LiveTransitionCompositor: Canlı Önizleme Viewport Geçiş Kompozitörü
 * İki aktif videoyu WebGL shader (Whip Pan, Cross Zoom, Glitch Split vb.)
 * ile harmanlar. Gerçek medya/cihaz QA'sı sahada test edilmeyi beklemektedir.
 */
export function LiveTransitionCompositor({
  activeTransition,
  project,
  time,
  playing,
  videoMap,
}: {
  activeTransition: ActiveTransition;
  project: Project;
  time: number;
  playing: boolean;
  videoMap: Map<string, HTMLVideoElement>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blenderRef = useRef<TransitionBlender | null>(null);

  useEffect(() => {
    return () => {
      blenderRef.current?.dispose();
      blenderRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const vFrom = videoMap.get(activeTransition.clipFrom.id);
    const vTo = videoMap.get(activeTransition.clipTo.id);
    if (!vFrom && !vTo) return;

    let rafId = 0;
    const render = () => {
      if (!canvas) return;
      const progress = computeTransitionProgress(
        time,
        activeTransition.start,
        activeTransition.duration,
      );

      const w = project.settings.width;
      const h = project.settings.height;

      blenderRef.current ??= new TransitionBlender(canvas);

      const sourceA = vFrom && vFrom.readyState >= 2 ? vFrom : null;
      const sourceB = vTo && vTo.readyState >= 2 ? vTo : null;

      let drawn = false;
      if (sourceA && sourceB && sourceA !== sourceB) {
        const currentTime = playing ? useEditor.getState().playhead : time;
        const progress = computeTransitionProgress(
          currentTime,
          activeTransition.start,
          activeTransition.duration,
        );
        blenderRef.current.draw(
          sourceA,
          sourceB,
          w,
          h,
          progress,
          activeTransition.transition,
        );
        drawn = true;
      }

      if (playing) {
        rafId = requestAnimationFrame(render);
      } else if (!drawn) {
        rafId = requestAnimationFrame(render);
      }
    };

    render();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [activeTransition, project.settings, time, playing, videoMap]);

  return (
    <canvas
      ref={canvasRef}
      className="live-transition-canvas"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        pointerEvents: 'none',
        zIndex: 5,
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
  const previewAdjustment = useEditor((s) => s.previewAdjustment);
  const [quality, setQuality] = useState<PreviewQuality>('Auto'),
    [degraded, setDegraded] = useState<string[]>([]);
  const onDegrade = useCallback(
    (id: string) => setDegraded((ids) => (ids.includes(id) ? ids : [...ids, id])),
    [],
  );
  const [videoMap] = useState(() => new Map<string, HTMLVideoElement>());
  const onRegisterVideo = useCallback((id: string, el: HTMLVideoElement | null) => {
    if (el) videoMap.set(id, el);
    else videoMap.delete(id);
  }, [videoMap]);
  const p = useEditor((s) => s.project),
    commit = useEditor((s) => s.commit),
    time = useEditor((s) => s.playhead),
    playing = useEditor((s) => s.playing),
    seek = useEditor((s) => s.seek),
    setPlaying = useEditor((s) => s.setPlaying),
    frame = useRef<HTMLDivElement>(null),
    total = duration(p),
    captions = useMemo(() => captionTimelineIndex(p), [p]),
    caption = captions.first(time),
    appearance = captionAppearance(p.captions);
  const previewPlan = useMemo(() => buildProjectPreviewPlan(p), [p]);
  const activeTransition = previewPlan.transitions.find((tr) => time >= tr.start && time < tr.end);
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
    if (!playing) {
      gopReverseEngine.reset();
      return;
    }
    let raf: number,
      last = performance.now();
    const tick = (now: number) => {
      const s = useEditor.getState();
      const elapsed = (now - last) / 1000;
      last = now;
      if (s.previewRate < 0) {
        const next = gopReverseEngine.computeNextReversePlayhead(
          s.playhead,
          elapsed,
          s.previewRate,
          s.project.settings.fps,
        );
        if (next <= 0) {
          s.seek(0);
          s.setPlaying(false);
          return;
        }
        s.seek(next);
      } else {
        const next = s.playhead + elapsed * s.previewRate;
        if (next >= duration(s.project)) {
          s.seek(duration(s.project));
          s.setPlaying(false);
          return;
        }
        s.seek(next);
      }
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
        <div className="aspect-ratio-selector" role="group" aria-label="Aspect ratio">
          {[
            { label: '16:9', ratio: '16:9' as const, title: '16:9 Landscape (YouTube)' },
            { label: '9:16', ratio: '9:16' as const, title: '9:16 Portrait (Shorts/TikTok)' },
            { label: '1:1', ratio: '1:1' as const, title: '1:1 Square (Instagram)' },
            { label: '4:5', ratio: '4:5' as const, title: '4:5 Social Portrait' },
          ].map((item) => {
            const currentRatio = frameAspectRatio(p.settings);
            return (
              <button
                key={item.ratio}
                type="button"
                className={`aspect-btn ${currentRatio === item.ratio ? 'active' : ''}`}
                title={item.title}
                onClick={() => commit(changeAspectRatio(p, item.ratio), `Aspect ratio: ${item.label}`)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <span className="subtle">
          {p.settings.width} × {p.settings.height} <span className="separator">/</span>{' '}
          {p.settings.fps} fps
        </span>
      </div>
      <div className="preview-quality">
        <select
          aria-label="Frame fill"
          value={frameFillMode(p.settings.fillMode)}
          disabled={processing}
          onChange={(e) => commit(
            { ...p, settings: { ...p.settings, fillMode: e.target.value as NonNullable<typeof p.settings.fillMode> } },
            'Frame fill',
          )}
        >
          <option value="fit">Fit · keep whole image</option>
          <option value="crop">Crop · fill frame</option>
          <option value="blur-background">Blur background</option>
        </select>
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
            <AdjustmentComposite layers={p.adjustments} time={time} draft={previewAdjustment}>
              <ActiveWindowDecoder
                project={p}
                time={time}
                quality={quality}
                degraded={degraded}
                onDegrade={onDegrade}
                onRegisterVideo={onRegisterVideo}
                activeTransition={activeTransition}
                plan={previewPlan}
              />
            </AdjustmentComposite>
            {activeTransition && (
              <LiveTransitionCompositor
                activeTransition={activeTransition}
                project={p}
                time={time}
                playing={playing}
                videoMap={videoMap}
              />
            )}
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
        <AudioPeakMeter />
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
