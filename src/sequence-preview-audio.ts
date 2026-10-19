import { clipAudible, duration, isMediaClip, isSequenceClip, type Project } from './model';
import { requireClipSource, sequenceProject } from './clip-source';
import { sequenceViews } from './sequences';
import { validateSequenceGraph } from './nested-sequence-plan';
import { compileSequenceAudio } from './sequence-audio';
import { SourceAudioReports, type MountedAudioSource } from './source-audio-reports';

export const PREVIEW_AUDIO_RATE = 48000;
export const PREVIEW_AUDIO_CHANNELS = 2;
export const MAX_PREVIEW_AUDIO_WINDOW_BYTES = 64 * 1024 * 1024;
const BLOCK_BYTES = 8, HEADER_BYTES = 80;
export type PreviewAudioRange = { start: number; end: number };
export type PreviewAudioPlan = {
  readonly startFrame: number; readonly endFrame: number;
  readonly start: number; readonly end: number;
  readonly frames: number; readonly pcmBytes: number; readonly sourceIds: readonly string[];
};
export type PreparedSequenceAudio = PreviewAudioPlan & { readonly blob: Blob };

/** The budget limits one prepared window, not project duration or output quality. */
export function planSequencePreviewAudio(p: Project, range: PreviewAudioRange): PreviewAudioPlan {
  const total = duration(p);
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < 0 ||
    range.end > total || range.end <= range.start)
    throw new Error('Choose an audio preview range inside the sequence.');
  const startFrame = Math.round(range.start * PREVIEW_AUDIO_RATE);
  // Never request a fractional sample beyond the completed root mix.
  const endFrame = Math.min(Math.floor(total * PREVIEW_AUDIO_RATE + 1e-6), Math.round(range.end * PREVIEW_AUDIO_RATE));
  const frames = endFrame - startFrame, pcmBytes = frames * BLOCK_BYTES;
  if (!Number.isSafeInteger(frames) || frames <= 0)
    throw new Error('Choose an audio preview range of at least one sample.');
  if (pcmBytes + HEADER_BYTES > MAX_PREVIEW_AUDIO_WINDOW_BYTES)
    throw new Error('This audio preview window is too large. Prepare a shorter range.');
  return { startFrame, endFrame, start: startFrame / PREVIEW_AUDIO_RATE, end: endFrame / PREVIEW_AUDIO_RATE,
    frames, pcmBytes, sourceIds: sequencePreviewAudioSources(p) };
}

/** File dependencies follow the same audible routing as the actual mixer. */
export function sequencePreviewAudioSources(p: Project): string[] {
  const views = sequenceViews(p); validateSequenceGraph(views);
  if (!p.activeSequenceId || !views.some((s) => s.id === p.activeSequenceId))
    throw new Error('The active sequence is missing.');
  const sequences = new Map(views.map((s) => [s.id, s])), visited = new Set<string>(), ids = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return; visited.add(id);
    const local = sequenceProject(p, sequences.get(id)!);
    for (const clip of local.clips) {
      if (!clipAudible(local, clip)) continue;
      requireClipSource(local, clip);
      if (isMediaClip(clip)) ids.add(clip.mediaId);
      else if (isSequenceClip(clip)) visit(clip.sequenceId);
    }
  };
  visit(p.activeSequenceId);
  return [...ids];
}

/** A float32 stereo WAVE wrapper: no quantization, clipping, normalization or re-encoding. */
export function previewAudioWave(pcm: Uint8Array, plan: PreviewAudioPlan): Blob {
  if (!Number.isSafeInteger(plan.frames) || plan.frames <= 0 || plan.frames * BLOCK_BYTES !== plan.pcmBytes ||
    plan.endFrame - plan.startFrame !== plan.frames || pcm.byteLength !== plan.pcmBytes || pcm.byteLength % BLOCK_BYTES ||
    pcm.byteLength + HEADER_BYTES > MAX_PREVIEW_AUDIO_WINDOW_BYTES)
    throw new Error('Prepared sequence audio has an unexpected sample count. Retry the preview.');
  const header = new Uint8Array(HEADER_BYTES), view = new DataView(header.buffer);
  const text = (at: number, value: string) => [...value].forEach((c, i) => { header[at + i] = c.charCodeAt(0); });
  text(0, 'RIFF'); view.setUint32(4, pcm.byteLength + HEADER_BYTES - 8, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 40, true); view.setUint16(20, 0xfffe, true);
  view.setUint16(22, PREVIEW_AUDIO_CHANNELS, true); view.setUint32(24, PREVIEW_AUDIO_RATE, true);
  view.setUint32(28, PREVIEW_AUDIO_RATE * BLOCK_BYTES, true); view.setUint16(32, BLOCK_BYTES, true);
  view.setUint16(34, 32, true); view.setUint16(36, 22, true); view.setUint16(38, 32, true);
  view.setUint32(40, 3, true); // Front-left + front-right channel mask.
  header.set([3, 0, 0, 0, 0, 0, 0x10, 0, 0x80, 0, 0, 0xaa, 0, 0x38, 0x9b, 0x71], 44);
  text(60, 'fact'); view.setUint32(64, 4, true); view.setUint32(68, plan.frames, true);
  text(72, 'data'); view.setUint32(76, pcm.byteLength, true);
  const payload = pcm.byteOffset === 0 && pcm.byteLength === pcm.buffer.byteLength
    ? pcm.buffer as ArrayBuffer : pcm.slice().buffer as ArrayBuffer;
  return new Blob([header, payload], { type: 'audio/wav' });
}

type PreviewAudioEngine = {
  exec: (args: string[]) => Promise<number>;
  ffprobe: (args: string[]) => Promise<number>;
  readFile: (path: string, encoding?: 'utf8') => Promise<Uint8Array | string>;
  deleteFile: (path: string) => Promise<unknown>;
};
export type SequenceAudioPreviewIO = {
  mount: (file: File, directory: string) => Promise<string>;
  unmount: (directory: string) => Promise<void>;
  assertCurrent: () => void;
};

/** Called only inside the shared media-engine queue after explicit preparation.
 * Trim the COMPLETED root bus by sample, so child/group DSP keeps its preceding
 * history. Seeking source inputs directly to this range would reset that history.
 */
export async function renderSequencePreviewAudio(p: Project, range: PreviewAudioRange,
  sourceFiles: ReadonlyMap<string, File>, ff: PreviewAudioEngine, io: SequenceAudioPreviewIO,
  reports: SourceAudioReports, signal: AbortSignal,
  onProgress: (message: string, value?: number) => void): Promise<PreparedSequenceAudio> {
  const guard = () => { signal.throwIfAborted(); io.assertCurrent(); };
  guard();
  const plan = planSequencePreviewAudio(p, range), sources = new Map(sourceFiles);
  for (const id of plan.sourceIds) if (!sources.get(id)) throw new Error('Relink missing media before preparing sequence audio.');
  const mounted: string[] = [], files: string[] = [], inputs = new Map<string, MountedAudioSource>();
  const number = (value: number) => Number(value.toFixed(6)).toString();
  try {
    onProgress('Inspecting sequence audio…');
    for (const [i, id] of plan.sourceIds.entries()) {
      guard(); const directory = `/sequence-preview${i}`; mounted.push(directory);
      const file = sources.get(id)!, path = await io.mount(file, directory);
      guard(); inputs.set(id, { file, path });
    }
    const hasAudio = await reports.probe(ff, inputs, files, signal, 'preview'); guard();
    const graph = compileSequenceAudio(p, hasAudio, 0), args: string[] = [];
    for (const input of graph.inputs) args.push('-ss', number(input.start), '-t', number(input.end - input.start),
      '-i', inputs.get(input.mediaId)!.path);
    const output = 'sequence-preview.f32'; files.push(output);
    onProgress('Preparing sequence audio…');
    const filters = [...graph.filters,
      `[${graph.output}]atrim=start_sample=${plan.startFrame}:end_sample=${plan.endFrame},asetpts=PTS-STARTPTS[preview_audio]`];
    const code = await ff.exec([...args, '-filter_complex_threads', '1', '-filter_complex', filters.join(';'),
      '-map', '[preview_audio]', '-vn', '-ar', String(PREVIEW_AUDIO_RATE), '-ac', String(PREVIEW_AUDIO_CHANNELS),
      '-c:a', 'pcm_f32le', '-f', 'f32le', output]);
    guard();
    if (code !== 0) throw new Error('Sequence audio preparation failed. Check the sources and audio settings.');
    const data = await ff.readFile(output); guard();
    if (!(data instanceof Uint8Array)) throw new Error('Prepared sequence audio is missing. Retry the preview.');
    const blob = previewAudioWave(data, plan);
    return { ...plan, blob };
  } finally {
    for (const file of files) await ff.deleteFile(file).catch(() => {});
    for (const directory of mounted) await io.unmount(directory).catch(() => {});
  }
}
