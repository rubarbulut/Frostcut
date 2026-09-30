import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { duration, type Project } from './model';
import { mediaUrls } from './store';
import { videoBitrate } from './export-settings';
import { compileProjectSequencePlan, SequenceCompositor, type VisualFrameSource } from './sequence-compositor';
export { drawCanvasCaption } from './canvas-captions';

function aborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
}
async function videoEvent(
  video: HTMLVideoElement,
  event: 'loadeddata' | 'seeked',
  signal: AbortSignal,
  start: () => void,
) {
  aborted(signal);
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener(event, done);
      video.removeEventListener('error', error);
      signal.removeEventListener('abort', cancel);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const error = () => {
      cleanup();
      reject(new Error('A source frame could not be decoded. Relink the original video.'));
    };
    const cancel = () => {
      cleanup();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const timeout = setTimeout(error, 30000);
    video.addEventListener(event, done, { once: true });
    video.addEventListener('error', error, { once: true });
    signal.addEventListener('abort', cancel, { once: true });
    start();
  });
}
async function canvasPng(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('A video frame could not be drawn.'))),
      'image/png',
    ),
  );
  return new Uint8Array(await blob.arrayBuffer());
}
/** Draw at exact output frame times; keep only a few encoded frames in flight. */
export async function renderCanvasVideo(
  p: Project,
  width: number,
  height: number,
  fps: number,
  ff: FFmpeg,
  files: string[],
  signal: AbortSignal,
  progress: (message: string, value?: number) => void,
  forceSoftware = false,
) {
  aborted(signal);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const videos = new Map<string, HTMLVideoElement>();
  const { plan, sequenceId } = compileProjectSequencePlan(p);
  const compositor = new SequenceCompositor(p);
  await document.fonts.load(`700 ${width * 0.1}px Noto`);
  aborted(signal);
  await document.fonts.load(`400 ${width * 0.1}px Noto`);
  aborted(signal);
  const frames = Math.ceil(duration(p) * fps);
  const chunks: Uint8Array[] = [],
    segments: string[] = [],
    pendingImages: string[] = [];
  let encoder: VideoEncoder | undefined, encoderError: Error | undefined;
  const config: VideoEncoderConfig = {
    codec: 'avc1.640034',
    width,
    height,
    framerate: fps,
    bitrate: videoBitrate(p),
    avc: { format: 'annexb' },
  };
  if (!forceSoftware && typeof VideoEncoder !== 'undefined') {
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      aborted(signal);
      if (support.supported) {
        encoder = new VideoEncoder({
          output: (chunk) => {
            const bytes = new Uint8Array(chunk.byteLength);
            chunk.copyTo(bytes);
            chunks.push(bytes);
          },
          error: (error) => {
            encoderError = error;
          },
        });
        encoder.configure(config);
      }
    } catch (error) {
      if (encoder && encoder.state !== 'closed') encoder.close();
      encoder = undefined;
      if (signal.aborted) throw error;
    }
  }
  // Closing the encoder rejects pending flushes instead of draining queued frames on cancel.
  const releaseRenderer = () => {
    compositor.dispose();
    if (encoder && encoder.state !== 'closed') encoder.close();
    for (const video of videos.values()) {
      video.removeAttribute('src');
      video.load();
    }
    videos.clear();
  };
  signal.addEventListener('abort', releaseRenderer, { once: true });
  const flushImages = async () => {
    if (!pendingImages.length) return;
    const name = `visual-part-${segments.length}.mp4`;
    files.push(name);
    const code = await ff.exec([
      '-framerate',
      String(fps),
      '-i',
      'visual-frame-%03d.png',
      '-frames:v',
      String(pendingImages.length),
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-b:v',
      String(videoBitrate(p)),
      '-pix_fmt',
      'yuv420p',
      name,
    ]);
    if (code !== 0) throw new Error('The software animation renderer could not encode this part.');
    segments.push(name);
    for (const image of pendingImages) await ff.deleteFile(image);
    pendingImages.length = 0;
  };
  try {
    aborted(signal);
    const sourceFrame: VisualFrameSource = async (layer) => {
      const clip = layer.clip;
      let video = videos.get(clip.mediaId);
      if (!video) {
        const url = mediaUrls.get(clip.mediaId);
        if (!url) throw new Error('Relink missing source media before export.');
        video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        videos.set(clip.mediaId, video);
        await videoEvent(video, 'loadeddata', signal, () => { video!.src = url; video!.load(); });
      }
      const source = Math.min(video.duration - 0.001, Math.max(0, layer.sourceTime));
      if (Math.abs(video.currentTime - source) > 0.0001)
        await videoEvent(video, 'seeked', signal, () => { video!.currentTime = source; });
      return { image: video, width: video.videoWidth, height: video.videoHeight };
    };
    for (let frame = 0; frame < frames; frame++) {
      aborted(signal);
      if (encoderError) throw encoderError;
      const time = frame / fps;
      await compositor.draw(ctx, plan.frameAt(sequenceId, time), sourceFrame, signal);
      if (encoder) {
        const videoFrame = new VideoFrame(canvas, {
          timestamp: Math.round(time * 1e6),
          duration: Math.round(1e6 / fps),
        });
        try {
          encoder.encode(videoFrame, { keyFrame: frame % (fps * 2) === 0 });
        } finally {
          videoFrame.close();
        }
        if (encoder.encodeQueueSize > 4) await encoder.flush();
        aborted(signal);
      } else {
        const name = `visual-frame-${String(pendingImages.length).padStart(3, '0')}.png`;
        const png = await canvasPng(canvas);
        aborted(signal);
        await ff.writeFile(name, png);
        pendingImages.push(name);
        if (pendingImages.length >= 24) await flushImages();
      }
      if (frame % Math.max(1, Math.floor(fps / 3)) === 0)
        progress(
          `Drawing animations and captions · ${frame + 1}/${frames} frames`,
          ((frame + 1) / frames) * 80,
        );
    }
    if (encoder) {
      await encoder.flush();
      aborted(signal);
      if (encoderError) throw encoderError;
      const length = chunks.reduce((n, c) => n + c.length, 0),
        output = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.length;
      }
      files.push('visual.h264');
      await ff.writeFile('visual.h264', output);
      return { path: 'visual.h264', raw: true };
    }
    await flushImages();
    files.push('visual-parts.txt', 'visual.mp4');
    await ff.writeFile('visual-parts.txt', segments.map((name) => `file '${name}'`).join('\n'));
    const code = await ff.exec([
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      'visual-parts.txt',
      '-c',
      'copy',
      'visual.mp4',
    ]);
    if (code !== 0) throw new Error('Animated video parts could not be combined.');
    return { path: 'visual.mp4', raw: false };
  } catch (error) {
    if (!signal.aborted && encoder && !forceSoftware) {
      releaseRenderer();
      signal.removeEventListener('abort', releaseRenderer);
      chunks.length = 0;
      progress('Using the software renderer for this device…', 0);
      return await renderCanvasVideo(p, width, height, fps, ff, files, signal, progress, true);
    }
    throw error;
  } finally {
    signal.removeEventListener('abort', releaseRenderer);
    releaseRenderer();
    for (const image of pendingImages) await ff.deleteFile(image).catch(() => {});
  }
}
