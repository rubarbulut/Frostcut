import { clipEnd, type Clip, type ProjectSequence, type Track } from './model';
import { animatedProperties, type AnimatedProperty } from './motion';
import { TimelineIndex } from './timeline-index';
import { validVisualEffects } from './visual-effects';

/** A real editable sequence reference, not a copied timeline or synthetic media file. */
export type SequenceReferenceClip = Omit<Clip, 'mediaId' | 'tracking' | 'captionWords' | 'audioRole' | 'autoDuck' | 'voiceEnhance'> & {
  sequenceId: string;
  mediaId?: never;
};
export type SequencePlanClip = Clip | SequenceReferenceClip;
export type SequencePlanNode = Omit<ProjectSequence, 'clips'> & { clips: SequencePlanClip[] };
export const MAX_SEQUENCE_DEPTH = 8;
export const MAX_SEQUENCE_FRAME_LAYERS = 2048;
export const isSequenceReference = (clip: SequencePlanClip): clip is SequenceReferenceClip =>
  'sequenceId' in clip;
const finite = (n: unknown, min = 0, max = 86400): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const string = (s: unknown): s is string => typeof s === 'string' && !!s && s.length <= 1000;
export function validSequenceReference(value: unknown): value is SequenceReferenceClip {
  const c = value as SequenceReferenceClip;
  if (!c || !string(c.id) || !string(c.sequenceId) || c.mediaId !== undefined || !string(c.trackId) ||
    !finite(c.start) || !finite(c.sourceStart) || !finite(c.sourceEnd, c.sourceStart + 0.001) ||
    !c.properties || (c.audioDetached !== undefined && typeof c.audioDetached !== 'boolean') ||
    (c.effects !== undefined && !validVisualEffects(c.effects)) ||
    ('tracking' in c && c.tracking !== undefined) || ('captionWords' in c && c.captionWords !== undefined)) return false;
  const props = c.properties;
  for (const key of ['x', 'y', 'rotation'] as const) if (!finite(props[key], -10000, 10000)) return false;
  if (!finite(props.scale, 0.1, 5) || !finite(props.opacity, 0, 1) || !finite(props.volume, 0, 2) ||
    !finite(props.speed, 0.25, 4) || !finite(props.crop, 0, 45) ||
    !finite(props.fadeIn, 0, 10000) || !finite(props.fadeOut, 0, 10000) ||
    !['None', 'Custom', 'Punch In', 'Punch Out', 'Smooth Zoom', 'Bounce', 'Slide Left', 'Slide Right', 'Shake'].includes(props.animation)) return false;
  if (c.keyframes !== undefined) {
    if (!c.keyframes || typeof c.keyframes !== 'object' || Array.isArray(c.keyframes)) return false;
    for (const [property, frames] of Object.entries(c.keyframes)) {
      if (!(animatedProperties as readonly string[]).includes(property) || !Array.isArray(frames) || frames.length > 258) return false;
      const key = property as AnimatedProperty;
      if (frames.some((f, i) => !f || !finite(f.time) ||
        !finite(f.value, key === 'scale' ? 0.1 : key === 'opacity' ? 0 : -10000,
          key === 'scale' ? 5 : key === 'opacity' ? 1 : 10000) ||
        (i > 0 && f.time <= frames[i - 1].time) ||
        (f.easing !== undefined && !['linear', 'smooth'].includes(f.easing)))) return false;
    }
  }
  return true;
}

type FrameLayerBase = {
  /** Clip clock is local to its owning sequence; sourceTime maps into media/child time. */
  time: number;
  sourceTime: number;
  visible: boolean;
  audible: boolean;
  /** Product of ancestor and own speeds; media consumers also apply preview rate. */
  playbackRate: number;
  /** Distinguishes multiple placements of the same child clip. */
  instancePath: readonly string[];
};
export type SequenceFrameLayer = FrameLayerBase & (
  | { kind: 'media'; clip: Clip }
  | { kind: 'sequence'; clip: SequenceReferenceClip; frame: SequenceFramePlan }
);
export type SequenceFramePlan = {
  sequence: SequencePlanNode;
  time: number;
  duration: number;
  layers: SequenceFrameLayer[];
};
type CompiledNode = { sequence: SequencePlanNode; duration: number; index: TimelineIndex<SequencePlanClip>; tracks: Map<string, Track> };

/** Immutable edit-time compilation. Preserves hierarchy for group effects/captions/audio. */
export class NestedSequencePlan {
  private readonly nodes = new Map<string, CompiledNode>();
  constructor(sequences: readonly SequencePlanNode[]) {
    if (!sequences.length || sequences.length > 30) throw new Error('A nested project supports 1–30 sequences.');
    for (const sequence of sequences) {
      if (!string(sequence.id) || this.nodes.has(sequence.id)) throw new Error('Sequence IDs must be unique.');
      if (!Array.isArray(sequence.clips) || sequence.clips.length > 10000) throw new Error('A sequence supports up to 10,000 clips.');
      // Snapshot once: active edit and saved sequences must be supplied by sequenceViews.
      const snapshot = structuredClone(sequence), tracks = new Map(snapshot.tracks.map((t) => [t.id, t]));
      const ids = new Set<string>();
      for (const clip of snapshot.clips) {
        if (!string(clip.id) || ids.has(clip.id) || !tracks.has(clip.trackId)) throw new Error('Sequence clips need unique IDs and existing tracks.');
        ids.add(clip.id);
        if (isSequenceReference(clip) && !validSequenceReference(clip)) throw new Error('The nested sequence clip has invalid source timing or transforms.');
      }
      const order = new Map(snapshot.tracks.map((t, i) => [t.id, i]));
      const clips = snapshot.clips.map((clip, i) => ({ clip, i }))
        .sort((a, b) => order.get(b.clip.trackId)! - order.get(a.clip.trackId)! || a.i - b.i).map(({ clip }) => clip);
      const duration = Math.max(0, ...clips.map(clipEnd));
      if (!finite(duration)) throw new Error('Sequence duration must stay within 24 hours.');
      this.nodes.set(snapshot.id, { sequence: snapshot, duration, tracks,
        index: new TimelineIndex(clips, (clip) => ({ start: clip.start, end: clipEnd(clip) })) });
    }
    // Check every sequence, including inactive/unreachable ones, with memoized DAG depths.
    const visiting = new Set<string>(), depths = new Map<string, number>();
    const depth = (id: string): number => {
      const node = this.nodes.get(id);
      if (!node) throw new Error('A referenced sequence is missing.');
      if (visiting.has(id)) throw new Error('Nested sequences cannot contain a reference cycle.');
      const cached = depths.get(id); if (cached !== undefined) return cached;
      visiting.add(id);
      let longest = 1;
      for (const clip of node.sequence.clips) if (isSequenceReference(clip)) longest = Math.max(longest, 1 + depth(clip.sequenceId));
      visiting.delete(id);
      if (longest > MAX_SEQUENCE_DEPTH) throw new Error(`Nested sequences support at most ${MAX_SEQUENCE_DEPTH} levels. Simplify the reference chain.`);
      depths.set(id, longest); return longest;
    };
    for (const id of this.nodes.keys()) depth(id);
  }

  frameAt(sequenceId: string, time: number): SequenceFramePlan {
    if (!Number.isFinite(time)) throw new Error('Use a finite sequence time.');
    let layerCount = 0;
    const visit = (id: string, clock: number, path: readonly string[], inheritedRate: number, visible: boolean, audible: boolean): SequenceFramePlan => {
      const node = this.nodes.get(id);
      if (!node) throw new Error('This sequence is no longer available.');
      const frame: SequenceFramePlan = { sequence: node.sequence, time: clock, duration: node.duration, layers: [] };
      // A shortened child leaves a gap inside an existing reference's fixed out point.
      // Never hold/repeat its last frame or silently change the parent's timing.
      if (clock < 0 || clock >= node.duration) return frame;
      for (const clip of node.index.at(clock)) {
        const track = node.tracks.get(clip.trackId)!;
        const video = track.kind === 'video';
        const layerVisible = visible && video && !track.hidden;
        const layerAudible = audible && !track.muted &&
          (!video || (!clip.audioDetached && !node.tracks.get('A1')?.muted));
        if (!layerVisible && !layerAudible) continue;
        if (++layerCount > MAX_SEQUENCE_FRAME_LAYERS)
          throw new Error(`More than ${MAX_SEQUENCE_FRAME_LAYERS} nested layers overlap at this time. Reduce simultaneous placements.`);
        const sourceTime = clip.sourceStart + (clock - clip.start) * clip.properties.speed;
        const playbackRate = inheritedRate * clip.properties.speed, instancePath = [...path, clip.id];
        const base = { time: clock, sourceTime, visible: layerVisible, audible: layerAudible, playbackRate, instancePath };
        if (isSequenceReference(clip)) frame.layers.push({ ...base, kind: 'sequence', clip,
          frame: visit(clip.sequenceId, sourceTime, instancePath, playbackRate, layerVisible, layerAudible) });
        else frame.layers.push({ ...base, kind: 'media', clip });
      }
      return frame;
    };
    return visit(sequenceId, time, [sequenceId], 1, true, true);
  }
}
