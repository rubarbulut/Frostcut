import type { Clip, MediaAsset, Project } from './model';
export type FacePoint = { time: number; x: number; y: number; found: boolean };
/** Coordinates are normalized to the source, then constrained so the canvas stays covered. */
export function reframeClip(p: Project, clip: Clip, asset: MediaAsset, points: FacePoint[]): Clip {
  const { width, height } = p.settings;
  const contain = Math.min(width / asset.width, height / asset.height);
  const fill = Math.max(width / asset.width, height / asset.height);
  if (fill / contain > 5)
    throw new Error(
      'This aspect ratio needs more than 5× zoom. Choose a less extreme canvas size.',
    );
  const clamp = (v: number, bound: number) =>
    Math.max(-Math.min(10000, bound), Math.min(Math.min(10000, bound), v));
  const positions = points.map((pt) => ({
    time: pt.time,
    x: clamp((0.5 - pt.x) * asset.width * fill, (asset.width * fill - width) / 2),
    y: clamp(
      height * 0.4 - height / 2 + (0.5 - pt.y) * asset.height * fill,
      (asset.height * fill - height) / 2,
    ),
  }));
  // Symmetric three-sample smoothing avoids jitter without a cumulative tracking lag.
  const smooth = (key: 'x' | 'y') =>
    positions.map((pt, i) => ({
      time: pt.time,
      value:
        (positions[Math.max(0, i - 1)][key] +
          2 * pt[key] +
          positions[Math.min(positions.length - 1, i + 1)][key]) /
        4,
      easing: 'smooth' as const,
    }));
  return {
    ...clip,
    properties: {
      ...clip.properties,
      x: 0,
      y: 0,
      scale: fill / contain,
      rotation: 0,
      crop: 0,
      animation: 'Custom',
    },
    keyframes: { x: smooth('x'), y: smooth('y') },
  };
}
function videoEvent(
  video: HTMLVideoElement,
  event: string,
  signal: AbortSignal,
  action: () => void,
) {
  return new Promise<void>((resolve, reject) => {
    const clean = () => {
      clearTimeout(timer);
      video.removeEventListener(event, done);
      video.removeEventListener('error', failed);
      signal.removeEventListener('abort', cancelled);
    };
    const done = () => {
      clean();
      resolve();
    };
    const failed = () => {
      clean();
      reject(new Error('This browser could not decode the source video.'));
    };
    const cancelled = () => {
      clean();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const timer = setTimeout(failed, 20000);
    video.addEventListener(event, done, { once: true });
    video.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', cancelled, { once: true });
    if (signal.aborted) cancelled();
    else action();
  });
}
export async function detectFacePath(
  url: string,
  clip: Clip,
  signal: AbortSignal,
  progress: (s: string) => void,
) {
  progress('Loading face detection on this device…');
  const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
  signal.throwIfAborted();
  const detector = await FaceDetector.createFromOptions(
    await FilesetResolver.forVisionTasks('/runtime/vision'),
    {
      baseOptions: { modelAssetPath: '/models/blaze_face_short_range.tflite' },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.5,
    },
  );
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  try {
    await videoEvent(video, 'loadeddata', signal, () => {
      video.src = url;
      video.load();
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(640, video.videoWidth);
    canvas.height = Math.round((canvas.width * video.videoHeight) / video.videoWidth);
    const ctx = canvas.getContext('2d')!;
    const count = Math.min(
      250,
      Math.max(2, Math.ceil((clip.sourceEnd - clip.sourceStart) * 2) + 1),
    );
    const points: FacePoint[] = [];
    let previous: { x: number; y: number } | undefined;
    for (let i = 0; i < count; i++) {
      signal.throwIfAborted();
      const time = clip.sourceStart + ((clip.sourceEnd - clip.sourceStart) * i) / (count - 1);
      const seek = Math.min(time, video.duration - 0.025);
      if (Math.abs(video.currentTime - seek) > 0.001)
        await videoEvent(video, 'seeked', signal, () => {
          video.currentTime = seek;
        });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const faces = detector.detect(canvas).detections.flatMap((d) =>
        d.boundingBox
          ? [
              {
                x: (d.boundingBox.originX + d.boundingBox.width / 2) / canvas.width,
                y: (d.boundingBox.originY + d.boundingBox.height / 2) / canvas.height,
                area: (d.boundingBox.width * d.boundingBox.height) / (canvas.width * canvas.height),
              },
            ]
          : [],
      );
      faces.sort((a, b) =>
        previous
          ? Math.hypot(a.x - previous.x, a.y - previous.y) -
            Math.hypot(b.x - previous.x, b.y - previous.y)
          : b.area - a.area,
      );
      const target = faces[0] ?? previous ?? { x: 0.5, y: 0.5 };
      points.push({ time, x: target.x, y: target.y, found: !!faces.length });
      if (faces.length) previous = target;
      progress(`Following face · ${i + 1}/${count} frames`);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    // Until the first detection, hold that first face rather than sweeping in from center.
    const first = points.find((pt) => pt.found);
    if (first)
      for (const pt of points) {
        if (pt.found) break;
        pt.x = first.x;
        pt.y = first.y;
      }
    return points;
  } finally {
    detector.close();
    video.removeAttribute('src');
    video.load();
  }
}
