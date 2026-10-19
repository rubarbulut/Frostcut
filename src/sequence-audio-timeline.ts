import { clipAudible, duration, isMediaClip, isSequenceClip, type Clip, type Project } from './model';
import { sequenceViews } from './sequences';
import { sequenceProject } from './clip-source';
import { createAudioWindowResolver, createClipAudioPlan, type AudioWindow, type ClipAudioPlan } from './audio-crossfades';
import { MAX_SEQUENCE_FRAME_LAYERS, validateSequenceGraph } from './nested-sequence-plan';
import { TimelineIndex } from './timeline-index';

type PlacementClock = {
  readonly clipId: string;
  readonly instancePath: readonly string[];
  /** The owning sequence's clock, before this placement's trim/rate. */
  readonly time: number;
  readonly sourceTime: number;
  readonly ownerRate: number;
  readonly playbackRate: number;
  readonly gain: number;
  readonly gainAtOwnerTime: (time: number) => number;
  readonly window: Readonly<AudioWindow>;
  readonly voiceEnhance: boolean;
};
export type SequenceAudioPlacement = PlacementClock & (
  | { readonly kind: 'media'; readonly mediaId: string }
  | { readonly kind: 'sequence'; readonly sequenceId: string; readonly frame: SequenceAudioFrame }
);
export type SequenceAudioFrame = {
  readonly sequenceId: string;
  readonly time: number;
  readonly duration: number;
  readonly clockRate: number;
  readonly placements: readonly SequenceAudioPlacement[];
};
type Entry = { clip: Clip; audio: ClipAudioPlan };
type Node = { duration: number; index: TimelineIndex<Entry> };

/** Edit-time audio topology and arbitrary-seek queries, including crossfade handles.
 * Does not flatten group processing into per-leaf gain, decode files or start audio.
 * A live mixer must process each completed child bus before the parent placement.
 */
export class SequenceAudioTimeline {
  private readonly nodes = new Map<string, Node>();
  private readonly rootId: string;

  constructor(project: Project, hasAudio: ReadonlyMap<string, boolean>) {
    const views = sequenceViews(project);
    validateSequenceGraph(views);
    if (!project.activeSequenceId || !views.some((s) => s.id === project.activeSequenceId))
      throw new Error('The active sequence is missing.');
    this.rootId = project.activeSequenceId;
    // Preserve aliases between the current timeline and its active sequence view.
    // No stale active snapshot or per-frame project cloning is needed.
    const snapshot = structuredClone({ ...project, sequences: views });
    const reports = new Map(hasAudio);
    const sequences = new Map(snapshot.sequences!.map((s) => [s.id, s]));
    const compile = (id: string) => {
      if (this.nodes.has(id)) return;
      const local = sequenceProject(snapshot, sequences.get(id)!);
      const resolveWindow = createAudioWindowResolver(local);
      const entries: Entry[] = [];
      for (const clip of local.clips) {
        if (!clipAudible(local, clip)) continue;
        if (isMediaClip(clip)) {
          if (typeof reports.get(clip.mediaId) !== 'boolean')
            throw new Error('The source audio report is incomplete. Relink and retry.');
          if (!reports.get(clip.mediaId)) continue;
        } else if (isSequenceClip(clip)) compile(clip.sequenceId);
        else throw new Error('A clip needs exactly one media or sequence source.');
        const window = Object.freeze(resolveWindow(clip));
        entries.push({ clip, audio: createClipAudioPlan(local, clip, reports, window) });
      }
      this.nodes.set(id, { duration: duration(local), index: new TimelineIndex(entries, ({ audio }) => ({
        start: audio.window.timelineStart, end: audio.window.timelineStart + audio.window.duration,
      })) });
    };
    compile(this.rootId);
  }

  frameAt(time: number, previewRate = 1): SequenceAudioFrame {
    if (!Number.isFinite(time)) throw new Error('Use a finite sequence time.');
    if (!Number.isFinite(previewRate) || previewRate < 0.5 || previewRate > 4)
      throw new Error('Use a preview rate between 0.5 and 4.');
    let count = 0;
    const visit = (id: string, clock: number, path: readonly string[], rate: number): SequenceAudioFrame => {
      const node = this.nodes.get(id)!;
      const placements: SequenceAudioPlacement[] = [];
      const frame: SequenceAudioFrame = { sequenceId: id, time: clock, duration: node.duration, clockRate: rate, placements };
      // Parent out points stay fixed after a child becomes shorter. Outside the
      // child's actual mix there is silence, never a held/repeated last sample.
      if (clock < 0 || clock >= node.duration) return frame;
      for (const { clip, audio } of node.index.at(clock)) {
        if (++count > MAX_SEQUENCE_FRAME_LAYERS)
          throw new Error(`More than ${MAX_SEQUENCE_FRAME_LAYERS} nested audio placements overlap. Reduce simultaneous placements.`);
        const sourceTime = clip.sourceStart + (clock - clip.start) * clip.properties.speed;
        const playbackRate = rate * clip.properties.speed, instancePath = [...path, clip.id];
        const common: PlacementClock = { clipId: clip.id, instancePath, time: clock, sourceTime,
          ownerRate: rate, playbackRate, gain: audio.gainAt(clock), gainAtOwnerTime: audio.gainAt,
          window: audio.window, voiceEnhance: !!clip.voiceEnhance };
        if (isMediaClip(clip)) placements.push({ ...common, kind: 'media', mediaId: clip.mediaId });
        else if (isSequenceClip(clip)) placements.push({ ...common, kind: 'sequence', sequenceId: clip.sequenceId,
          frame: visit(clip.sequenceId, sourceTime, instancePath, playbackRate) });
      }
      return frame;
    };
    return visit(this.rootId, time, [this.rootId], previewRate);
  }
}
