import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { EffectsRenderer } from './effects-renderer';
import type { VisualEffects } from './visual-effects';

/** Draw only new decoded video frames; paused edits redraw on demand. */
export function EffectPreview({
  videoRef,
  effects,
  active,
  playing,
  source,
  style,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  effects: VisualEffects;
  active: boolean;
  playing: boolean;
  source?: string;
  style: CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useRef(effects);
  settings.current = effects;
  const drawFrame = useRef<() => void>(() => {});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!active) return;
    const video = videoRef.current,
      canvas = canvasRef.current;
    if (!video || !canvas) return;
    setError('');
    let renderer: EffectsRenderer | undefined,
      callback = 0,
      animation = 0,
      failed = false;
    const draw = () => {
      if (failed || video.readyState < 2 || video.seeking) return;
      try {
        renderer ??= new EffectsRenderer(canvas);
        renderer.draw(video, video.videoWidth, video.videoHeight, settings.current);
      } catch (e) {
        failed = true;
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    const frame = () => {
      draw();
      if (!failed && playing) {
        if ('requestVideoFrameCallback' in video) callback = video.requestVideoFrameCallback(frame);
        else animation = requestAnimationFrame(frame);
      }
    };
    drawFrame.current = draw;
    video.addEventListener('loadeddata', draw);
    video.addEventListener('seeked', draw);
    frame();
    return () => {
      video.removeEventListener('loadeddata', draw);
      video.removeEventListener('seeked', draw);
      if (callback) video.cancelVideoFrameCallback(callback);
      if (animation) cancelAnimationFrame(animation);
      drawFrame.current = () => {};
      renderer?.dispose();
    };
  }, [active, playing, source, videoRef]);
  useEffect(() => {
    drawFrame.current();
  }, [effects]);
  return (
    <>
      <canvas
        ref={canvasRef}
        className="effect-preview"
        aria-label="Video with visual effects"
        style={{ ...style, visibility: active ? 'visible' : 'hidden' }}
      />
      {error && active && (
        <div className="effect-preview-error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
