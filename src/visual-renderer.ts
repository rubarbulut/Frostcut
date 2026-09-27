import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { captionGroups, clipEnd, duration, isAudioClip, type Project } from './model';
import { transformAt, type MotionClip } from './motion';
import { captionAppearance } from './caption-style';
import { captionFontFamily } from './caption-typography';
import { mediaUrls } from './store';
import { captionEmoji, captionLayout } from './caption-layout';
import { videoBitrate } from './export-settings';

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
export function drawCanvasCaption(
  ctx: CanvasRenderingContext2D,
  p: Project,
  group: ReturnType<typeof captionGroups>[number],
  time: number,
  width: number,
  height: number,
) {
  const appearance = captionAppearance(p.captions),
    font = (width * appearance.size) / 100,
    lineHeight = font * (appearance.lineHeight ?? 1.22);
  const spacingContext = ctx as CanvasRenderingContext2D & { letterSpacing: string };
  if (appearance.letterSpacing && !('letterSpacing' in ctx))
    throw new Error('Letter spacing export needs a current browser version. Update your browser or reset letter spacing to 0.');
  ctx.save();
  ctx.font = `${appearance.italic ? 'italic ' : ''}${appearance.bold ? 700 : 400} ${font}px ${captionFontFamily(appearance.fontFamily)}`;
  if ('letterSpacing' in ctx) spacingContext.letterSpacing = `${(appearance.letterSpacing ?? 0) * font}px`;
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = ((appearance.outline * width) / 1080) * 2;
  const space = Math.max(0, ctx.measureText(' ').width + (appearance.wordSpacing ?? 0) * font);
  const emoji = captionEmoji(p, group),
    layout = captionLayout(p);
  const display = emoji
    ? [...group, { ...group.at(-1)!, id: 'emoji', text: emoji, important: false }]
    : group;
  const align = appearance.align ?? 'center';
  const boxed = (appearance.boxOpacity ?? 0) > 0;
  const padX = boxed ? ((appearance.boxPadding ?? 4) + 12) * width / 1080 : 0;
  const padY = boxed ? (appearance.boxPadding ?? 4) * width / 1080 : 0;
  const columnWidth = width * layout.width / 100;
  const contentWidth = Math.max(1, columnWidth - padX * 2);
  const columnLeft = width * layout.x / 100 - columnWidth / 2;
  const rows: { word: (typeof group)[number]; width: number }[][] = [[]];
  let rowWidth = 0;
  for (const word of display) {
    const size = ctx.measureText(word.text).width;
    if (rowWidth + space + size > contentWidth && rows.at(-1)!.length) {
      rows.push([]);
      rowWidth = 0;
    }
    if (rows.at(-1)!.length) rowWidth += space;
    rows.at(-1)!.push({ word, width: size });
    rowWidth += size;
  }
  const rowWidths = rows.map((row) => row.reduce((n, w) => n + w.width, 0) + space * (row.length - 1));
  const textWidth = align === 'justify' ? contentWidth : Math.min(contentWidth, Math.max(...rowWidths));
  const blockWidth = textWidth + padX * 2;
  const blockLeft = align === 'left' || align === 'justify' ? columnLeft
    : align === 'right' ? columnLeft + columnWidth - blockWidth : width * layout.x / 100 - blockWidth / 2;
  const blockHeight = rows.length * lineHeight + padY * 2;
  const top =
    p.captions.position === 'custom'
      ? (height * layout.y) / 100 - blockHeight / 2
      : p.captions.position === 'top'
        ? (height * appearance.margin) / 100
        : p.captions.position === 'center'
          ? (height - blockHeight) / 2
          : height * (1 - appearance.margin / 100) - blockHeight;

  if (boxed) {
    const boxX = blockLeft, boxY = top, boxW = blockWidth, boxH = blockHeight;
    const radius = Math.min((appearance.boxRadius ?? 8) * width / 1080, boxH / 2);

    ctx.save();
    ctx.globalAlpha = appearance.boxOpacity ?? 0;
    ctx.fillStyle = appearance.boxColor ?? '#000000';
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, radius);
      ctx.fill();
    } else {
      ctx.fillRect(boxX, boxY, boxW, boxH);
    }
    ctx.restore();
  }

  for (const [index, row] of rows.entries()) {
    const justify = align === 'justify' && index < rows.length - 1 && row.length > 1;
    const gap = justify ? space + Math.max(0, textWidth - rowWidths[index]) / (row.length - 1) : space;
    let x = blockLeft + padX + (align === 'right' ? textWidth - rowWidths[index]
      : align === 'center' ? (textWidth - rowWidths[index]) / 2 : 0);
    for (const { word, width: wordWidth } of row) {
      const isSpoken = time >= word.timelineStart && time < word.timelineEnd;
      const isKeyword = word.important && isSpoken;
      const anim = appearance.animation ?? 'pop';
      const active = isKeyword || (anim !== 'none' && isSpoken);
      ctx.fillStyle = active
        ? appearance.speakerColors
          ? (p.speakers.find((s) => s.id === word.speakerId)?.color ?? appearance.accent)
          : appearance.accent
        : appearance.color;
      ctx.strokeStyle = appearance.outlineColor;
      ctx.save();
      if (appearance.shadow !== false) {
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = width * 4 / 1080;
        ctx.shadowOffsetY = width * 2 / 1080;
      }
      let scale = 1;
      let offsetY = 0;
      if (active) {
        if (p.captions.preset === 'Brainrot') {
          scale = 1 + p.captions.intensity * 0.002;
        } else if (anim === 'pop') {
          scale = 1.15;
        } else if (anim === 'bounce') {
          offsetY = -lineHeight * 0.12;
          scale = 1.08;
        } else if (anim === 'glow') {
          ctx.shadowColor = ctx.fillStyle as string;
          ctx.shadowBlur = Math.round(width * 0.02);
        }
      }
      ctx.translate(x + wordWidth / 2, top + padY + index * lineHeight + lineHeight / 2 + offsetY);
      ctx.scale(scale, scale);
      if (appearance.outline > 0) ctx.strokeText(word.text, -wordWidth / 2, -font / 2);
      ctx.fillText(word.text, -wordWidth / 2, -font / 2);
      if (word.id !== 'emoji') {
        const thickness = Math.max(1, font * 0.045);
        if (appearance.underline) ctx.fillRect(-wordWidth / 2, font * 0.45, wordWidth, thickness);
        if (appearance.strikethrough) ctx.fillRect(-wordWidth / 2, font * 0.03, wordWidth, thickness);
      }
      ctx.restore();
      x += wordWidth + gap;
    }
  }
  ctx.restore();
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
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const videos = new Map<string, HTMLVideoElement>();
  const groups = p.captions.enabled ? captionGroups(p) : [];
  await document.fonts.load(`700 ${width * 0.1}px Noto`);
  await document.fonts.load(`400 ${width * 0.1}px Noto`);
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
      if ((await VideoEncoder.isConfigSupported(config)).supported) {
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
    } catch {
      encoder?.close();
      encoder = undefined;
    }
  }
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
    for (let frame = 0; frame < frames; frame++) {
      aborted(signal);
      if (encoderError) throw encoderError;
      const time = frame / fps;
      ctx.fillStyle = '#090d10';
      ctx.fillRect(0, 0, width, height);
      const active = p.clips
        .filter(
          (c) =>
            !isAudioClip(p, c) &&
            time >= c.start &&
            time < clipEnd(c) &&
            !p.tracks.find((t) => t.id === c.trackId)?.hidden,
        )
        .sort(
          (a, b) =>
            p.tracks.findIndex((t) => t.id === b.trackId) -
            p.tracks.findIndex((t) => t.id === a.trackId),
        );
      for (const clip of active) {
        let video = videos.get(clip.mediaId);
        if (!video) {
          const url = mediaUrls.get(clip.mediaId);
          if (!url) throw new Error('Relink missing source media before export.');
          video = document.createElement('video');
          video.muted = true;
          video.playsInline = true;
          video.preload = 'auto';
          videos.set(clip.mediaId, video);
          await videoEvent(video, 'loadeddata', signal, () => {
            video!.src = url;
            video!.load();
          });
        }
        const source = Math.min(
          video.duration - 0.001,
          Math.max(0, clip.sourceStart + (time - clip.start) * clip.properties.speed),
        );
        if (Math.abs(video.currentTime - source) > 0.0001)
          await videoEvent(video, 'seeked', signal, () => {
            video!.currentTime = source;
          });
        const props = transformAt(clip as MotionClip, time, p.settings.width, p.settings.height);
        const fit = Math.min(width / video.videoWidth, height / video.videoHeight);
        ctx.save();
        ctx.translate(
          width / 2 + (props.x * width) / p.settings.width,
          height / 2 + (props.y * height) / p.settings.height,
        );
        ctx.rotate((props.rotation * Math.PI) / 180);
        ctx.scale(props.scale, props.scale);
        ctx.globalAlpha = props.opacity;
        const crop = props.crop / 100;
        ctx.beginPath();
        ctx.rect(
          -width / 2 + width * crop,
          -height / 2 + height * crop,
          width * (1 - crop * 2),
          height * (1 - crop * 2),
        );
        ctx.clip();
        ctx.drawImage(
          video,
          (-video.videoWidth * fit) / 2,
          (-video.videoHeight * fit) / 2,
          video.videoWidth * fit,
          video.videoHeight * fit,
        );
        ctx.restore();
      }
      const caption = groups.find(
        (g) => time >= g[0].timelineStart && time < g.at(-1)!.timelineEnd,
      );
      if (caption) drawCanvasCaption(ctx, p, caption, time, width, height);
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
      } else {
        const name = `visual-frame-${String(pendingImages.length).padStart(3, '0')}.png`;
        await ff.writeFile(name, await canvasPng(canvas));
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
      if (encoder.state !== 'closed') encoder.close();
      for (const video of videos.values()) {
        video.removeAttribute('src');
        video.load();
      }
      videos.clear();
      chunks.length = 0;
      progress('Using the software renderer for this device…', 0);
      return await renderCanvasVideo(p, width, height, fps, ff, files, signal, progress, true);
    }
    throw error;
  } finally {
    if (encoder?.state !== 'closed') encoder?.close();
    for (const video of videos.values()) {
      video.removeAttribute('src');
      video.load();
    }
    for (const image of pendingImages) await ff.deleteFile(image).catch(() => {});
  }
}
