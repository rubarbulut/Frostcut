import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import {
  type Project,
  type MediaAsset,
  type Clip,
  uid,
  duration,
  clipEnd,
  clipDuration,
  captionGroups,
  isAudioClip,
  clipAudible,
} from './model';
import { mediaFiles } from './store';
import { captionAppearance } from './caption-style';
import { cancelBackgroundMediaJobs } from './media-runtime';
import { audioWindow } from './audio-crossfades';
import { audioEffectsFilter } from './audio-tools';
import { renderCanvasVideo } from './visual-renderer';
import { captionEmoji } from './caption-layout';
import { videoBitrate } from './export-settings';
let engine: FFmpeg | undefined;
let busy = false;
let engineQueue: Promise<unknown> = Promise.resolve();
function withEngine<T>(
  signal: AbortSignal,
  onProgress: (message: string, value?: number) => void,
  fn: (ff: FFmpeg) => Promise<T>,
  background = false,
): Promise<T> {
  if (!background) cancelBackgroundMediaJobs();
  const task = engineQueue
    .catch(() => {})
    .then(() => {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      return runEngine(signal, onProgress, fn);
    });
  engineQueue = task.catch(() => {});
  return task;
}
async function mountSource(ff: FFmpeg, file: File, directory: string) {
  await ff.createDir(directory);
  await ff.mount(FFFSType.WORKERFS, { blobs: [{ name: 'media', data: file }] }, directory);
  return `${directory}/media`;
}
async function unmountSource(ff: FFmpeg, directory: string) {
  await ff.unmount(directory).catch(() => {});
  await ff.deleteDir(directory).catch(() => {});
}
export async function inspectMedia(file: File): Promise<MediaAsset> {
  if (file.size > 1_500_000_000)
    throw new Error('For this P0 build, use a source smaller than 1.5 GB.');
  return new Promise((resolve, reject) => {
    const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg)$/i.test(file.name);
    const mediaEl = isAudio ? document.createElement('audio') : document.createElement('video');
    const url = URL.createObjectURL(file);
    mediaEl.preload = 'metadata';
    const cleanup = () => {
      URL.revokeObjectURL(url);
      mediaEl.removeAttribute('src');
      mediaEl.load();
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          isAudio
            ? 'This audio file could not be opened. Try an MP3 or WAV.'
            : 'This video could not be opened. Try an H.264 MP4.',
        ),
      );
    }, 15000);
    mediaEl.onloadedmetadata = () => {
      clearTimeout(timeout);
      const duration = mediaEl.duration;
      const videoWidth = 'videoWidth' in mediaEl ? (mediaEl.videoWidth as number) : 1280;
      const videoHeight = 'videoHeight' in mediaEl ? (mediaEl.videoHeight as number) : 720;
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0 || (!isAudio && !videoWidth))
        return reject(new Error('Choose a playable video file.'));
      resolve({
        id: uid(),
        name: file.name,
        duration,
        width: videoWidth || 1280,
        height: videoHeight || 720,
        size: file.size,
        type: file.type || (isAudio ? 'audio/mpeg' : 'video/mp4'),
      });
    };
    mediaEl.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      reject(
        new Error(
          isAudio
            ? 'Your browser cannot preview this audio format. Try an MP3 or WAV.'
            : 'Your browser cannot preview this format. Try an H.264 MP4.',
        ),
      );
    };
    mediaEl.src = url;
  });
}
async function runEngine<T>(
  signal: AbortSignal,
  onProgress: (message: string, value?: number) => void,
  fn: (ff: FFmpeg) => Promise<T>,
): Promise<T> {
  if (busy) throw new Error('Another media job is running. Wait for it to finish.');
  busy = true;
  const ff = (engine ??= new FFmpeg());
  let logs: string[] = [];
  const log = ({ message }: { message: string }) => {
    logs.push(message);
    logs = logs.slice(-15);
  };
  const progress = ({ progress }: { progress: number }) =>
    onProgress('Rendering your video…', Math.min(99, Math.max(0, progress * 100)));
  const abort = () => {
    ff.terminate();
    engine = undefined;
  };
  signal.addEventListener('abort', abort, { once: true });
  ff.on('log', log);
  ff.on('progress', progress);
  try {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (!ff.loaded) {
      onProgress('Loading the local media engine…');
      const response = await fetch('/runtime/ffmpeg-core.js', { signal });
      if (!response.ok)
        throw new Error(
          'Media engine is unavailable. Run npm install to restore the local runtime.',
        );
      const coreURL = URL.createObjectURL(
        new Blob([await response.text()], { type: 'text/javascript' }),
      );
      try {
        await ff.load({
          coreURL,
          wasmURL: new URL('/runtime/ffmpeg-core.wasm', location.origin).href,
        });
      } finally {
        URL.revokeObjectURL(coreURL);
      }
    }
    return await fn(ff);
  } catch (error) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}${logs.length ? ' — ' + logs.slice(-4).join(' ') : ''}`,
    );
  } finally {
    busy = false;
    signal.removeEventListener('abort', abort);
    ff.off('log', log);
    ff.off('progress', progress);
  }
}
export async function extractAudio(
  file: File,
  signal: AbortSignal,
  onProgress: (message: string, value?: number) => void,
  range?: { start: number; duration: number },
): Promise<Float32Array> {
  return withEngine(signal, onProgress, async (ff) => {
    try {
      const source = await mountSource(ff, file, '/speech-source');
      onProgress('Preparing speech audio…');
      const code = await ff.exec([
        ...(range ? ['-ss', String(range.start)] : []),
        '-i',
        source,
        ...(range ? ['-t', String(range.duration)] : []),
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-f',
        'f32le',
        'audio.f32',
      ]);
      if (code !== 0) throw new Error('Could not read an audio track. Use a video with speech.');
      const data = (await ff.readFile('audio.f32')) as Uint8Array;
      return new Float32Array(data.slice().buffer as ArrayBuffer);
    } finally {
      await unmountSource(ff, '/speech-source');
      await ff.deleteFile('audio.f32').catch(() => {});
    }
  });
}
export async function generatePreviewProxy(
  file: File,
  width: number,
  height: number,
  signal: AbortSignal,
  progress: (message: string, value?: number) => void,
): Promise<Blob> {
  return withEngine(
    signal,
    progress,
    async (ff) => {
      try {
        const source = await mountSource(ff, file, '/proxy-source');
        const code = await ff.exec([
          '-i',
          source,
          '-vf',
          `scale=${width}:${height}`,
          '-r',
          '30',
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-crf',
          '30',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '96k',
          '-movflags',
          '+faststart',
          'preview.mp4',
        ]);
        if (code !== 0)
          throw new Error('Preview optimization failed. The original file is still available.');
        const bytes = (await ff.readFile('preview.mp4')) as Uint8Array;
        return new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'video/mp4' });
      } finally {
        await ff.deleteFile('preview.mp4').catch(() => {});
        await unmountSource(ff, '/proxy-source');
      }
    },
    true,
  );
}
const number = (n: number) => Number(n.toFixed(4)).toString();
const assTime = (t: number) => {
  const ticks = Math.round(t * 100);
  return `${Math.floor(ticks / 360000)}:${String(Math.floor(ticks / 6000) % 60).padStart(2, '0')}:${String(Math.floor(ticks / 100) % 60).padStart(2, '0')}.${String(ticks % 100).padStart(2, '0')}`;
};
const assColor = (hex: string) => '&H' + hex.slice(5, 7) + hex.slice(3, 5) + hex.slice(1, 3) + '&';
const assText = (text: string) => text.replace(/[{}\\]/g, '').replace(/\r?\n/g, ' ');
export function createAss(p: Project, width: number, height: number) {
  const appearance = captionAppearance(p.captions),
    font = Math.round((width * appearance.size) / 100),
    alignment = p.captions.position === 'top' ? 8 : p.captions.position === 'center' ? 5 : 2;
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nScaledBorderAndShadow: yes\nWrapStyle: 0\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Noto Sans,${font},${assColor(appearance.color)},${assColor(appearance.accent)},${assColor(appearance.outlineColor)},&H00000000,${appearance.bold ? -1 : 0},0,0,0,100,100,0,0,1,${number((appearance.outline * width) / 1080)},0,${alignment},${Math.round(width * 0.07)},${Math.round(width * 0.07)},${Math.round((height * appearance.margin) / 100)},1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  if (!p.captions.enabled) return header;
  return (
    header +
    captionGroups(p)
      .flatMap((group) =>
        group.map((active, i) => {
          const start = i === 0 ? group[0].timelineStart : active.timelineStart,
            end = group[i + 1]?.timelineStart ?? group.at(-1)!.timelineEnd;
          const text = group
            .map((w) => {
              const color = appearance.speakerColors
                ? (p.speakers.find((s) => s.id === w.speakerId)?.color ?? appearance.accent)
                : appearance.accent;
              const highlight = w.id === active.id && w.important;
              const pop =
                highlight && p.captions.preset === 'Brainrot'
                  ? `\\fscx${100 + p.captions.intensity * 0.2}\\fscy${100 + p.captions.intensity * 0.2}`
                  : '';
              return `{\\c${assColor(highlight ? color : appearance.color)}${pop}}${assText(w.text)}{\\r}`;
            })
            .join(' ');
          return `Dialogue: 0,${assTime(start)},${assTime(end)},Default,,0,0,0,,${text}`;
        }),
      )
      .join('\n')
  );
}
export async function exportMp4(
  p: Project,
  signal: AbortSignal,
  onProgress: (message: string, value?: number) => void,
): Promise<Blob> {
  if (!p.clips.length) throw new Error('Add a video before exporting.');
  for (const c of p.clips)
    if (!mediaFiles.has(c.mediaId)) throw new Error('Relink missing media before exporting.');
  return withEngine(signal, onProgress, async (ff) => {
    const files: string[] = [],
      w = Math.round(p.exportSettings.width / 2) * 2,
      h = Math.round(p.exportSettings.height / 2) * 2,
      fps = p.exportSettings.fps,
      total = duration(p);
    try {
      const animated = p.clips.some(
        (c) =>
          c.properties.animation !== 'None' ||
          c.properties.crop > 0 ||
          Object.values(c.keyframes ?? {}).some((frames) => frames.length),
      );
      const visual =
        animated ||
        (p.captions.enabled &&
          (p.captions.position === 'custom' || captionGroups(p).some((g) => captionEmoji(p, g))))
          ? await renderCanvasVideo(p, w, h, fps, ff, files, signal, onProgress)
          : undefined;
      const args: string[] = [
        ...(visual
          ? [...(visual.raw ? ['-r', String(fps)] : []), '-i', visual.path]
          : ['-f', 'lavfi', '-i', `color=c=0x090d10:s=${w}x${h}:r=${fps}:d=${number(total)}`]),
        '-f',
        'lavfi',
        '-i',
        `anullsrc=r=48000:cl=stereo:d=${number(total)}`,
      ];
      const mediaIds = [...new Set(p.clips.map((c) => c.mediaId))];
      const inputPaths = new Map<string, string>();
      for (const [i, id] of mediaIds.entries())
        inputPaths.set(id, await mountSource(ff, mediaFiles.get(id)!, `/input${i}`));
      // One input per clip keeps trim timestamps independent, including duplicated clips.
      for (const c of p.clips) {
        const window = audioWindow(p, c);
        args.push(
          '-ss',
          number(window.start),
          '-t',
          number(window.end - window.start),
          '-i',
          inputPaths.get(c.mediaId)!,
        );
      }
      const filters: string[] = [],
        audios: string[] = ['[1:a]'];
      let base = '0:v';
      const ordered = [...p.clips].sort(
        (a, b) =>
          p.tracks.findIndex((t) => t.id === b.trackId) -
          p.tracks.findIndex((t) => t.id === a.trackId),
      );
      // Probe each asset's audio rather than assuming every imported video has sound.
      const hasAudio = new Map<string, boolean>();
      for (const [i, id] of mediaIds.entries()) {
        const probe = `probe${i}.json`;
        files.push(probe);
        const code = await ff.ffprobe([
          '-v',
          'error',
          '-select_streams',
          'a',
          '-show_entries',
          'stream=codec_type',
          '-of',
          'json',
          inputPaths.get(id)!,
          '-o',
          probe,
        ]);
        // core 0.12.10 can return -1 after a successful probe (upstream issue #817).
        // Validate the actual report; never interpret probe failure as silent footage.
        if (code !== 0 && code !== -1)
          throw new Error('Could not inspect source audio. Relink the video and retry.');
        const result = JSON.parse((await ff.readFile(probe, 'utf8')) as string);
        if (!Array.isArray(result.streams))
          throw new Error('The source audio report is incomplete. Try relinking this video.');
        hasAudio.set(id, !!result.streams?.length);
      }
      for (const [index, c] of ordered.entries()) {
        const input = p.clips.findIndex((x) => x.id === c.id) + 2,
          props = c.properties,
          track = p.tracks.find((t) => t.id === c.trackId)!,
          len = clipDuration(c),
          tag = `v${index}`;
        const window = audioWindow(p, c);
        const sw = Math.max(2, Math.round((w * props.scale) / 2) * 2),
          sh = Math.max(2, Math.round((h * props.scale) / 2) * 2),
          crop = props.crop / 100;
        if (!isAudioClip(p, c) && !track.hidden && !visual) {
          const transform = `trim=start=${number(c.sourceStart - window.start)}:end=${number(c.sourceEnd - window.start)},setpts=(PTS-STARTPTS)/${props.speed},crop=iw*${1 - 2 * crop}:ih*${1 - 2 * crop},scale=${sw}:${sh}:force_original_aspect_ratio=decrease,setsar=1,format=rgba,rotate=${number((props.rotation * Math.PI) / 180)}:c=none:ow=rotw(${number((props.rotation * Math.PI) / 180)}):oh=roth(${number((props.rotation * Math.PI) / 180)}),colorchannelmixer=aa=${props.opacity},setpts=PTS+${number(c.start)}/TB`;
          filters.push(`[${input}:v]${transform}[${tag}]`);
          filters.push(
            `[${base}][${tag}]overlay=x=(W-w)/2+${number((props.x * w) / p.settings.width)}:y=(H-h)/2+${number((props.y * h) / p.settings.height)}:enable='between(t,${number(c.start)},${number(clipEnd(c))})':eof_action=pass:shortest=0[base${index}]`,
          );
          base = `base${index}`;
        }
        if (hasAudio.get(c.mediaId) && clipAudible(p, c)) {
          const tempo =
            props.speed < 0.5
              ? `atempo=0.5,atempo=${props.speed * 2}`
              : props.speed > 2
                ? `atempo=2,atempo=${props.speed / 2}`
                : `atempo=${props.speed}`;
          filters.push(
            `[${input}:a]atrim=duration=${number(window.end - window.start)},asetpts=PTS-STARTPTS,${tempo},${audioEffectsFilter(p, c, window.timelineStart)},afade=t=in:d=${window.fadeIn},afade=t=out:st=${Math.max(0, window.duration - window.fadeOut)}:d=${window.fadeOut},adelay=${Math.round(window.timelineStart * 1000)}|${Math.round(window.timelineStart * 1000)}[a${index}]`,
          );
          audios.push(`[a${index}]`);
        }
      }
      filters.push(
        `${audios.join('')}amix=inputs=${audios.length}:normalize=0:duration=longest[audio]`,
      );
      if (!visual && p.captions.enabled && captionGroups(p).length) {
        files.push('captions.ass', 'NotoSans.ttf');
        await ff.writeFile('captions.ass', createAss(p, w, h));
        const response = await fetch('/fonts/NotoSans.ttf');
        if (!response.ok) throw new Error('Caption font is unavailable.');
        await ff.writeFile('NotoSans.ttf', new Uint8Array(await response.arrayBuffer()));
        filters.push(`[${base}]subtitles=captions.ass:fontsdir=/[out]`);
      } else if (!visual) filters.push(`[${base}]null[out]`);
      onProgress('Rendering your video…', 0);
      files.push('output.mp4');
      const code = await ff.exec([
        ...args,
        '-filter_complex_threads',
        '1',
        '-filter_complex',
        filters.join(';'),
        '-map',
        visual ? '0:v' : '[out]',
        '-map',
        '[audio]',
        '-t',
        number(total),
        '-r',
        String(fps),
        ...(visual
          ? ['-c:v', 'copy']
          : [
              '-c:v',
              'libx264',
              '-preset',
              'ultrafast',
              '-b:v',
              String(videoBitrate(p)),
              '-pix_fmt',
              'yuv420p',
            ]),
        '-c:a',
        'aac',
        '-b:a',
        `${p.exportSettings.audioBitrate ?? 160}k`,
        '-movflags',
        '+faststart',
        'output.mp4',
      ]);
      if (code !== 0)
        throw new Error('MP4 rendering failed. Try a smaller resolution or a shorter selection.');
      const data = (await ff.readFile('output.mp4')) as Uint8Array;
      return new Blob([data.slice().buffer as ArrayBuffer], { type: 'video/mp4' });
    } finally {
      for (const file of files) await ff.deleteFile(file).catch(() => {});
      for (const [i] of [...new Set(p.clips.map((c) => c.mediaId))].entries())
        await unmountSource(ff, `/input${i}`);
    }
  });
}
export const animationTransform = (c: Clip, time: number) => {
  const t = Math.max(0, Math.min(1, (time - c.start) / clipDuration(c))),
    name = c.properties.animation;
  if (name === 'Punch In') return `scale(${1 + (t < 0.2 ? t / 0.2 : 1) * 0.15})`;
  if (name === 'Punch Out') return `scale(${1.15 - Math.min(1, t / 0.2) * 0.15})`;
  if (name === 'Smooth Zoom') return `scale(${1 + t * 0.18})`;
  if (name === 'Bounce') return `translateY(${Math.sin(t * 12) * Math.exp(-t * 7) * -18}px)`;
  if (name === 'Slide Left') return `translateX(${Math.max(0, 1 - t * 4) * 35}%)`;
  if (name === 'Slide Right') return `translateX(${-Math.max(0, 1 - t * 4) * 35}%)`;
  if (name === 'Shake') return `translateX(${Math.sin(t * 80) * 3}px)`;
  return '';
};
