import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { captionGroups, duration, clipEnd, type Project, type Clip } from './model';
import { transformAt, type MotionClip } from './motion';
import { captionAppearance } from './caption-style';
import { captionFontFamily } from './caption-typography';
import { mediaUrls } from './store';
import { captionEmoji, captionLayout } from './caption-layout';
import { videoBitrate } from './export-settings';
import { hasVisualEffects } from './visual-effects';
import { EffectsRenderer } from './effects-renderer';
import { drawCanvasAdjustments } from './adjustment-renderer';
import { AspectFrameRenderer, imagePlacement, needsBlurFill } from './aspect-fill';
import { captionTimelineIndex, clipTimelineIndex } from './timeline-index';
import {
  TRANSITION_SHADERS_GLSL,
  computeTransitionProgress,
  type TransitionConfig,
  type TransitionType,
} from './transitions-engine';

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

const transitionVertexSource = `
attribute vec2 position;
varying vec2 uv;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
  uv = vec2((position.x + 1.0) * 0.5, (1.0 - position.y) * 0.5);
}`;

const transitionFragmentSource = `
precision highp float;
varying vec2 uv;
uniform sampler2D texFrom;
uniform sampler2D texTo;
uniform float progress;
uniform vec2 resolution;
uniform int transitionType;
uniform vec2 direction;
uniform float softness;
uniform float intensity;

${TRANSITION_SHADERS_GLSL}

void main() {
  vec4 color = vec4(0.0);
  if (transitionType == 0) {
    color = transitionCrossDissolve(uv, texFrom, texTo, progress);
  } else if (transitionType == 1) {
    color = transitionLumaWipe(uv, texFrom, texTo, progress, softness);
  } else if (transitionType == 2) {
    color = transitionWhipPan(uv, texFrom, texTo, progress, direction);
  } else if (transitionType == 3) {
    color = transitionCrossZoom(uv, texFrom, texTo, progress, intensity);
  } else if (transitionType == 4) {
    color = transitionGlitchSplit(uv, texFrom, texTo, progress, intensity);
  } else if (transitionType == 5) {
    color = transitionDirectionalWipe(uv, texFrom, texTo, progress, direction, softness);
  } else {
    color = transitionCrossDissolve(uv, texFrom, texTo, progress);
  }
  gl_FragColor = color;
}`;

export class TransitionBlender {
  public canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private texFrom: WebGLTexture | null = null;
  private texTo: WebGLTexture | null = null;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private disposed = false;

  constructor(canvas?: HTMLCanvasElement) {
    this.canvas = canvas ?? (typeof document !== 'undefined' ? document.createElement('canvas') : ({} as HTMLCanvasElement));
    const gl = typeof this.canvas.getContext === 'function' ? this.canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
    }) : null;
    if (!gl) return;
    this.gl = gl;

    const shaders: WebGLShader[] = [];
    try {
      const compile = (kind: number, source: string) => {
        const shader = gl.createShader(kind);
        if (!shader) throw new Error('Could not allocate transition shader.');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(`Transition shader compilation failed: ${gl.getShaderInfoLog(shader)}`);
        return shader;
      };

      const program = gl.createProgram();
      if (!program) throw new Error('Could not allocate transition program.');
      this.program = program;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, transitionVertexSource));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, transitionFragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(`Transition program linking failed: ${gl.getProgramInfoLog(program)}`);

      this.buffer = gl.createBuffer()!;
      this.texFrom = gl.createTexture()!;
      this.texTo = gl.createTexture()!;

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      // TextureUnit 0 (texFrom)
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texFrom);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      // TextureUnit 1 (texTo)
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.texTo);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    } catch {
      this.gl = null;
      this.program = null;
    } finally {
      shaders.forEach((shader) => gl.deleteShader(shader));
    }
  }

  private uniform(name: string) {
    if (!this.uniforms.has(name) && this.gl && this.program) {
      this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this.uniforms.get(name) ?? null;
  }

  draw(
    sourceFrom: CanvasImageSource,
    sourceTo: CanvasImageSource,
    width: number,
    height: number,
    progress: number,
    config: TransitionConfig,
  ): HTMLCanvasElement {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      if (this.gl) this.gl.viewport(0, 0, width, height);
    }

    const gl = this.gl;
    if (!gl || !this.program || !this.texFrom || !this.texTo) {
      const ctx = this.canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, width, height);
        ctx.globalAlpha = 1.0;
        ctx.drawImage(sourceFrom, 0, 0, width, height);
        ctx.globalAlpha = Math.max(0, Math.min(1, progress));
        ctx.drawImage(sourceTo, 0, 0, width, height);
        ctx.globalAlpha = 1.0;
      }
      return this.canvas;
    }

    gl.useProgram(this.program);

    // Bind sourceFrom to WebGL Texture Unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texFrom);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceFrom as TexImageSource);
    gl.uniform1i(this.uniform('texFrom'), 0);

    // Bind sourceTo to WebGL Texture Unit 1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texTo);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceTo as TexImageSource);
    gl.uniform1i(this.uniform('texTo'), 1);

    const clampedProgress = Math.max(0, Math.min(1, progress));
    gl.uniform1f(this.uniform('progress'), clampedProgress);
    gl.uniform2f(this.uniform('resolution'), width, height);

    let typeIndex = 0;
    switch (config.type) {
      case 'cross-dissolve': typeIndex = 0; break;
      case 'luma-wipe': typeIndex = 1; break;
      case 'whip-pan': typeIndex = 2; break;
      case 'cross-zoom': typeIndex = 3; break;
      case 'glitch-split': typeIndex = 4; break;
      case 'directional-wipe': typeIndex = 5; break;
      default: typeIndex = 0;
    }
    gl.uniform1i(this.uniform('transitionType'), typeIndex);

    let dir: [number, number] = [1.0, 0.0];
    switch (config.direction) {
      case 'left': dir = [-1.0, 0.0]; break;
      case 'right': dir = [1.0, 0.0]; break;
      case 'up': dir = [0.0, -1.0]; break;
      case 'down': dir = [0.0, 1.0]; break;
    }
    gl.uniform2f(this.uniform('direction'), dir[0], dir[1]);
    gl.uniform1f(this.uniform('softness'), config.softness ?? 0.2);
    gl.uniform1f(this.uniform('intensity'), config.intensity ?? 0.5);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return this.canvas;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.gl) {
      if (this.buffer) this.gl.deleteBuffer(this.buffer);
      if (this.texFrom) this.gl.deleteTexture(this.texFrom);
      if (this.texTo) this.gl.deleteTexture(this.texTo);
      if (this.program) this.gl.deleteProgram(this.program);
      this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  }
}

export type ActiveTransition = {
  clipFrom: Clip;
  clipTo: Clip;
  transition: TransitionConfig;
  start: number;
  end: number;
  duration: number;
};

export function findProjectTransitions(p: Project): ActiveTransition[] {
  const transitions: ActiveTransition[] = [];
  const tracks = p.tracks.filter((t) => t.kind !== 'audio' && !t.hidden);
  for (const track of tracks) {
    const trackClips = p.clips
      .filter((c) => c.trackId === track.id)
      .sort((a, b) => a.start - b.start);

    for (let i = 1; i < trackClips.length; i++) {
      const clipA = trackClips[i - 1];
      const clipB = trackClips[i];
      const endA = clipEnd(clipA);
      const startB = clipB.start;

      const transitionConfig = clipB.transition ?? clipA.transition;
      if (!transitionConfig) continue;

      const dur = Math.max(0.05, transitionConfig.duration);
      if (startB < endA) {
        const transStart = startB;
        const transEnd = Math.min(endA, startB + dur);
        transitions.push({
          clipFrom: clipA,
          clipTo: clipB,
          transition: transitionConfig,
          start: transStart,
          end: transEnd,
          duration: Math.max(0.0001, transEnd - transStart),
        });
      } else if (Math.abs(startB - endA) < 0.05) {
        transitions.push({
          clipFrom: clipA,
          clipTo: clipB,
          transition: transitionConfig,
          start: startB,
          end: startB + dur,
          duration: dur,
        });
      }
    }
  }

  for (const clipB of p.clips) {
    if (!clipB.transition) continue;
    if (transitions.some((t) => t.clipTo.id === clipB.id)) continue;
    const candidates = p.clips
      .filter((c) => c.id !== clipB.id && c.start <= clipB.start)
      .sort((a, b) => clipEnd(b) - clipEnd(a));
    const clipA = candidates[0];
    if (clipA) {
      const endA = clipEnd(clipA);
      const startB = clipB.start;
      const dur = Math.max(0.05, clipB.transition.duration);
      if (startB < endA) {
        const transStart = startB;
        const transEnd = Math.min(endA, startB + dur);
        transitions.push({
          clipFrom: clipA,
          clipTo: clipB,
          transition: clipB.transition,
          start: transStart,
          end: transEnd,
          duration: Math.max(0.0001, transEnd - transStart),
        });
      } else if (Math.abs(startB - endA) < 0.05) {
        transitions.push({
          clipFrom: clipA,
          clipTo: clipB,
          transition: clipB.transition,
          start: startB,
          end: startB + dur,
          duration: dur,
        });
      }
    }
  }

  return transitions;
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
  const clips = clipTimelineIndex(p), captions = captionTimelineIndex(p);
  const projectTransitions = findProjectTransitions(p);
  await document.fonts.load(`700 ${width * 0.1}px Noto`);
  aborted(signal);
  await document.fonts.load(`400 ${width * 0.1}px Noto`);
  aborted(signal);
  const frames = Math.ceil(duration(p) * fps);
  const chunks: Uint8Array[] = [],
    segments: string[] = [],
    pendingImages: string[] = [];
  let encoder: VideoEncoder | undefined, encoderError: Error | undefined;
  let effectRenderer: EffectsRenderer | undefined;
  let aspectRenderer: AspectFrameRenderer | undefined;
  let transitionBlender: TransitionBlender | undefined;
  let canvasFrom: HTMLCanvasElement | undefined;
  let canvasTo: HTMLCanvasElement | undefined;
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
    transitionBlender?.dispose();
    transitionBlender = undefined;
    effectRenderer?.dispose();
    effectRenderer = undefined;
    aspectRenderer?.dispose();
    aspectRenderer = undefined;
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

  const getClipVideo = async (clip: Clip, time: number) => {
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
    // Avoid sub-frame jitter seeks (0.005s is < 1/60s frame duration)
    if (Math.abs(video.currentTime - source) > 0.005) {
      await videoEvent(video, 'seeked', signal, () => {
        video!.currentTime = source;
      });
    }
    return video;
  };

  const drawClipToContext = (
    clip: Clip,
    video: HTMLVideoElement,
    time: number,
    targetCtx: CanvasRenderingContext2D,
  ) => {
    const props = transformAt(clip as MotionClip, time, p.settings.width, p.settings.height, p.settings.fillMode);
    const sourceSize = { width: video.videoWidth, height: video.videoHeight };
    const frameSize = { width, height };
    targetCtx.save();
    targetCtx.translate(
      width / 2 + (props.x * width) / p.settings.width,
      height / 2 + (props.y * height) / p.settings.height,
    );
    targetCtx.rotate((props.rotation * Math.PI) / 180);
    targetCtx.scale(props.scale, props.scale);
    targetCtx.globalAlpha = props.opacity;
    const crop = props.crop / 100;
    targetCtx.beginPath();
    targetCtx.rect(
      -width / 2 + width * crop,
      -height / 2 + height * crop,
      width * (1 - crop * 2),
      height * (1 - crop * 2),
    );
    targetCtx.clip();
    let image: CanvasImageSource = hasVisualEffects(clip.effects)
      ? (effectRenderer ??= new EffectsRenderer()).draw(video, video.videoWidth, video.videoHeight, clip.effects!)
      : video;
    let placement = imagePlacement(sourceSize, frameSize, p.settings.fillMode);
    if (needsBlurFill(sourceSize, frameSize, p.settings.fillMode)) {
      image = (aspectRenderer ??= new AspectFrameRenderer()).draw(image, sourceSize, frameSize, p.settings.fillMode);
      placement = { x: 0, y: 0, width, height };
    }
    targetCtx.drawImage(
      image,
      placement.x - width / 2,
      placement.y - height / 2,
      placement.width,
      placement.height,
    );
    targetCtx.restore();
  };

  try {
    aborted(signal);
    for (let frame = 0; frame < frames; frame++) {
      aborted(signal);
      if (encoderError) throw encoderError;
      const time = frame / fps;
      ctx.fillStyle = '#090d10';
      ctx.fillRect(0, 0, width, height);

      const activeTransition = projectTransitions.find((tr) => time >= tr.start && time < tr.end);
      const active = clips.at(time);

      if (activeTransition) {
        const tProgress = computeTransitionProgress(time, activeTransition.start, activeTransition.duration);

        // Render outgoing clip (Clip A / texFrom)
        const videoFrom = await getClipVideo(activeTransition.clipFrom, time);
        canvasFrom ??= document.createElement('canvas');
        if (canvasFrom.width !== width || canvasFrom.height !== height) {
          canvasFrom.width = width;
          canvasFrom.height = height;
        }
        const ctxFrom = canvasFrom.getContext('2d', { alpha: true })!;
        ctxFrom.clearRect(0, 0, width, height);
        drawClipToContext(activeTransition.clipFrom, videoFrom, time, ctxFrom);

        // Render incoming clip (Clip B / texTo)
        const videoTo = await getClipVideo(activeTransition.clipTo, time);
        canvasTo ??= document.createElement('canvas');
        if (canvasTo.width !== width || canvasTo.height !== height) {
          canvasTo.width = width;
          canvasTo.height = height;
        }
        const ctxTo = canvasTo.getContext('2d', { alpha: true })!;
        ctxTo.clearRect(0, 0, width, height);
        drawClipToContext(activeTransition.clipTo, videoTo, time, ctxTo);

        // Dual-texture hardware WebGL blend
        transitionBlender ??= new TransitionBlender();
        const blended = transitionBlender.draw(
          canvasFrom,
          canvasTo,
          width,
          height,
          tProgress,
          activeTransition.transition,
        );
        ctx.drawImage(blended, 0, 0, width, height);

        // Draw any other clips (e.g. on upper tracks) that aren't part of this transition
        for (const clip of active) {
          if (clip.id === activeTransition.clipFrom.id || clip.id === activeTransition.clipTo.id) continue;
          const video = await getClipVideo(clip, time);
          drawClipToContext(clip, video, time, ctx);
        }
      } else {
        for (const clip of active) {
          const video = await getClipVideo(clip, time);
          drawClipToContext(clip, video, time, ctx);
        }
      }
      drawCanvasAdjustments(ctx, p.adjustments, time);
      const caption = captions.first(time);
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
        // Throttle without stalling GPU hardware pipeline
        if (encoder.encodeQueueSize > 16) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
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
