import { clipAudible, duration, isMediaClip, isSequenceClip, type Clip, type Project } from './model';
import { sequenceProject } from './clip-source';
import { sequenceViews } from './sequences';
import { validateSequenceGraph } from './nested-sequence-plan';
import { audioFadeFilter, audioWindow } from './audio-crossfades';
import { audioEffectsFilter } from './audio-tools';

export type SequenceAudioInput = { mediaId: string; start: number; end: number; index: number };
export type SequenceAudioGraph = { inputs: SequenceAudioInput[]; filters: string[]; output: string };
const number = (n: number) => Number(n.toFixed(6)).toString();
const format = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
const tempo = (rate: number) => rate < 0.5 ? `atempo=0.5,atempo=${number(rate * 2)}`
  : rate > 2 ? `atempo=2,atempo=${number(rate / 2)}` : `atempo=${number(rate)}`;

/** Compile actual child audio mixes before parent trim/speed/processing/gain/fades.
 * Shared child buses split into independent placement clocks; native inputs never expand per ancestor instance.
 * No codec/model is run here. Audio availability must come from the real ffprobe report.
 */
export function compileSequenceAudio(p: Project, hasAudio: ReadonlyMap<string, boolean>, inputOffset = 1): SequenceAudioGraph {
  const sequences = sequenceViews(p);
  validateSequenceGraph(sequences);
  const rootId = p.activeSequenceId;
  if (!rootId || !sequences.some((s) => s.id === rootId)) throw new Error('The active sequence is missing.');
  if (!Number.isInteger(inputOffset) || inputOffset < 0) throw new Error('Use a valid audio input offset.');
  const nodes = new Map(sequences.map((s, index) => [s.id, { project: sequenceProject(p, s), tag: `seqaudio${index}`,
    seconds: duration(sequenceProject(p, s)), consumers: 0, used: 0, outputs: [] as string[] }]));
  const reachable = new Set<string>();
  const visit = (id: string) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    const node = nodes.get(id)!;
    for (const clip of node.project.clips) {
      if (!clipAudible(node.project, clip) || !isSequenceClip(clip)) continue;
      const child = nodes.get(clip.sequenceId)!;
      child.consumers++;
      child.seconds = Math.max(child.seconds, audioWindow(node.project, clip).end);
      visit(clip.sequenceId);
    }
  };
  nodes.get(rootId)!.consumers = 1; visit(rootId);
  const inputs: SequenceAudioInput[] = [], filters: string[] = [], compiled = new Set<string>();
  const compile = (id: string) => {
    if (compiled.has(id)) return;
    const node = nodes.get(id)!;
    const branches: string[] = [];
    for (const [index, clip] of node.project.clips.entries()) {
      if (!clipAudible(node.project, clip)) continue;
      const window = audioWindow(node.project, clip);
      let from: string;
      let trim: string;
      if (isMediaClip(clip)) {
        if (!hasAudio.has(clip.mediaId)) throw new Error('The source audio report is incomplete. Relink and retry.');
        if (!hasAudio.get(clip.mediaId) || window.end <= window.start) continue;
        const input = { mediaId: clip.mediaId, start: window.start, end: window.end, index: inputOffset + inputs.length };
        inputs.push(input); from = `${input.index}:a`; trim = `atrim=duration=${number(window.end - window.start)}`;
      } else if (isSequenceClip(clip)) {
        compile(clip.sequenceId);
        const child = nodes.get(clip.sequenceId)!;
        from = child.outputs[child.used++];
        trim = `atrim=start=${number(window.start)}:end=${number(window.end)}`;
      } else throw new Error('A clip needs exactly one media or sequence source.');
      const tag = `${node.tag}_clip${index}`;
      const processing = placementProcessing(node.project, clip, window, hasAudio);
      filters.push(`[${from}]${trim},asetpts=PTS-STARTPTS,${tempo(clip.properties.speed)},${format},${processing}[${tag}]`);
      branches.push(`[${tag}]`);
    }
    // Real silence spans empty/shortened child gaps and gives every mix a stable local clock.
    const silent = `${node.tag}_silence`, mix = `${node.tag}_mix`, seconds = Math.max(0.001, node.seconds);
    filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${number(seconds)},asetpts=PTS-STARTPTS,${format}[${silent}]`);
    filters.push(`[${silent}]${branches.join('')}amix=inputs=${branches.length + 1}:normalize=0:duration=longest,atrim=duration=${number(seconds)},asetpts=PTS-STARTPTS[${mix}]`);
    node.outputs = Array.from({ length: node.consumers }, (_, i) => `${node.tag}_out${i}`);
    filters.push(`[${mix}]${node.consumers === 1 ? 'anull' : `asplit=${node.consumers}`}${node.outputs.map((tag) => `[${tag}]`).join('')}`);
    compiled.add(id);
  };
  compile(rootId);
  return { inputs, filters, output: nodes.get(rootId)!.outputs[0] };
}

function placementProcessing(p: Project, clip: Clip, window: ReturnType<typeof audioWindow>, hasAudio: ReadonlyMap<string, boolean>) {
  const fade = audioFadeFilter(window);
  // Preserve fades/duck envelopes before cutting a crossfade handle that extends before t=0.
  const negative = window.timelineStart < 0 ? `,atrim=start=${number(-window.timelineStart)},asetpts=PTS-STARTPTS` : '';
  const delay = Math.round(Math.max(0, window.timelineStart) * 48000);
  return `${audioEffectsFilter(p, clip, window.timelineStart, hasAudio)},${fade}${negative},adelay=delays=${delay}S:all=1`;
}
