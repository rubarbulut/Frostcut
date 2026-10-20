import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { EffectsRenderer } from './effects-renderer';
import { hasVisualEffects, type VisualEffects } from './visual-effects';
import { AspectFrameRenderer, type FrameSize } from './aspect-fill';

/** Draw only new decoded video frames; paused edits redraw on demand. */
export function EffectPreview({
  videoRef,
  effects,
  active,
  playing,
  source,
  style,
  frame,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  effects?: VisualEffects;
  active: boolean;
  playing: boolean;
  source?: string;
  style: CSSProperties;
  frame?: FrameSize;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useRef(effects);
  settings.current = effects;
  const drawFrame = useRef<() => void>(() => {});
  const [error, setError] = useState('');
  const composite = !!frame;
  useEffect(() => {
    if (!active) return;
    const video = videoRef.current,
      canvas = canvasRef.current;
    if (!video || !canvas) return;
    setError('');
    let renderer: EffectsRenderer | undefined,
      compositor: AspectFrameRenderer | undefined,
      animation = 0,
      failed = false;
    const draw = (): boolean => {
      if (failed || video.readyState < 2 || video.seeking || !video.videoWidth || !video.videoHeight) return false;
      try {
        const sourceDim = { width: video.videoWidth, height: video.videoHeight };
        let image: CanvasImageSource = video;
        if (hasVisualEffects(settings.current)) {
          renderer ??= new EffectsRenderer(composite ? undefined : canvas);
          image = renderer.draw(video, sourceDim.width, sourceDim.height, settings.current!);
        }
        if (frame) {
          compositor ??= new AspectFrameRenderer(canvas);
          const clientW = canvas.clientWidth || frame.width;
          const clientH = canvas.clientHeight || frame.height;
          const scale = Math.min(1, Math.max(1, clientW * devicePixelRatio) / frame.width, Math.max(1, clientH * devicePixelRatio) / frame.height);
          compositor.draw(image, sourceDim, { width: frame.width * scale, height: frame.height * scale }, 'blur-background');
        }
        return true;
      } catch (e) {
        failed = true;
        setError(e instanceof Error ? e.message : String(e));
        return false;
      }
    };
    const nextFrame = () => {
      const drawn = draw();
      if (!failed) {
        if (playing) {
          animation = requestAnimationFrame(nextFrame);
        } else if (!drawn) {
          animation = requestAnimationFrame(nextFrame);
        }
      }
    };
    drawFrame.current = () => {
      // An effect can be disabled while the blur compositor remains mounted.
      // Retry that explicit edit, not every frame of a failed renderer.
      if (failed) {
        renderer?.dispose();
        renderer = undefined;
        failed = false;
        setError('');
      }
      nextFrame();
    };
    video.addEventListener('loadedmetadata', nextFrame);
    video.addEventListener('loadeddata', nextFrame);
    video.addEventListener('canplay', nextFrame);
    video.addEventListener('canplaythrough', nextFrame);
    video.addEventListener('seeked', nextFrame);
    video.addEventListener('timeupdate', nextFrame);
    const observer = frame ? new ResizeObserver(nextFrame) : undefined;
    observer?.observe(canvas);
    nextFrame();
    return () => {
      video.removeEventListener('loadedmetadata', nextFrame);
      video.removeEventListener('loadeddata', nextFrame);
      video.removeEventListener('canplay', nextFrame);
      video.removeEventListener('canplaythrough', nextFrame);
      video.removeEventListener('seeked', nextFrame);
      video.removeEventListener('timeupdate', nextFrame);
      if (animation) cancelAnimationFrame(animation);
      drawFrame.current = () => {};
      observer?.disconnect();
      renderer?.dispose();
      compositor?.dispose();
    };
  }, [active, playing, source, videoRef, composite, frame?.width, frame?.height]);
  useEffect(() => {
    drawFrame.current();
  }, [effects]);
  return (
    <>
      <canvas
        key={composite ? 'composite' : 'effects'}
        ref={canvasRef}
        className="effect-preview"
        aria-label={composite ? 'Video with synchronized blur background' : 'Video with visual effects'}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          ...style,
          ...(composite ? { objectFit: 'fill' } : {}),
          visibility: active ? 'visible' : 'hidden',
        }}
      />
      {error && active && (
        <div className="effect-preview-error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
