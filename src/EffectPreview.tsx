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
      callback = 0,
      animation = 0,
      failed = false;
    const draw = () => {
      if (failed || video.readyState < 2 || video.seeking) return;
      try {
        const source = { width: video.videoWidth, height: video.videoHeight };
        let image: CanvasImageSource = video;
        if (hasVisualEffects(settings.current)) {
          renderer ??= new EffectsRenderer(composite ? undefined : canvas);
          image = renderer.draw(video, source.width, source.height, settings.current!);
        }
        if (frame) {
          compositor ??= new AspectFrameRenderer(canvas);
          const scale = Math.min(1, Math.max(1, canvas.clientWidth * devicePixelRatio) / frame.width, Math.max(1, canvas.clientHeight * devicePixelRatio) / frame.height);
          compositor.draw(image, source, { width: frame.width * scale, height: frame.height * scale }, 'blur-background');
        }
      } catch (e) {
        failed = true;
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    const nextFrame = () => {
      draw();
      if (!failed && playing) {
        if ('requestVideoFrameCallback' in video) callback = video.requestVideoFrameCallback(nextFrame);
        else animation = requestAnimationFrame(nextFrame);
      }
    };
    drawFrame.current = draw;
    video.addEventListener('loadeddata', draw);
    video.addEventListener('seeked', draw);
    const observer = frame ? new ResizeObserver(draw) : undefined;
    observer?.observe(canvas);
    nextFrame();
    return () => {
      video.removeEventListener('loadeddata', draw);
      video.removeEventListener('seeked', draw);
      if (callback) video.cancelVideoFrameCallback(callback);
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
        style={{ ...style, ...(composite ? { objectFit: 'fill' } : {}), visibility: active ? 'visible' : 'hidden' }}
      />
      {error && active && (
        <div className="effect-preview-error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
