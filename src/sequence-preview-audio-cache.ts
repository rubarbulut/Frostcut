import type { Project, Word } from './model';
import { sequenceViews } from './sequences';
import {
  MAX_PREVIEW_AUDIO_WINDOW_BYTES, planSequencePreviewAudio, sequencePreviewAudioSources,
  type PreparedSequenceAudio, type PreviewAudioPlan, type PreviewAudioRange,
} from './sequence-preview-audio';

type Progress = (message: string, value?: number) => void;
export type PrepareSequenceAudio = (project: Project, range: PreviewAudioRange, signal: AbortSignal,
  onProgress: Progress) => Promise<PreparedSequenceAudio>;
/** Check before using a held result: relinking can happen without replacing Project. */
export type CachedSequenceAudio = PreparedSequenceAudio & { readonly isCurrent: () => boolean };
type Job = {
  controller: AbortController; generation: number; plan: PreviewAudioPlan;
  promise: Promise<CachedSequenceAudio>; clients: Set<Progress>; finished: boolean;
};
const cancelled = () => new DOMException('Sequence audio preparation was cancelled.', 'AbortError');
const times = (words?: readonly Word[]) => words?.map((word) => [word.start, word.end]);

/** Dependencies of sequence-audio/audio-crossfades/audio-tools, without visual data.
 * Keep raw speech intervals, even when currently merged: ffprobe may later prove
 * one of the overlapping speakers silent. An all-sources-audible filter string
 * alone would incorrectly reuse the other speaker's changed ducking envelope.
 * Conservatively includes inactive timelines and source durations, but no text,
 * style, transforms, tracking, render settings, selection or playback rate.
 */
function audioEdit(project: Project) {
  return JSON.stringify({ project: project.id, active: project.activeSequenceId,
    media: project.media.map((media) => [media.id, media.duration]),
    speech: project.transcripts.map((transcript) => [transcript.mediaId, times(transcript.words)]),
    sequences: sequenceViews(project).map((sequence) => ({ id: sequence.id,
      tracks: sequence.tracks.map((track) => [track.id, track.kind, track.muted]),
      clips: sequence.clips.map((clip) => [clip.id, clip.mediaId, clip.sequenceId, clip.trackId,
        clip.start, clip.sourceStart, clip.sourceEnd, clip.properties.speed, clip.properties.volume,
        clip.properties.fadeIn, clip.properties.fadeOut, !!clip.voiceEnhance, !!clip.autoDuck,
        clip.audioRole, !!clip.audioDetached, times(clip.captionWords)]),
    })),
  });
}

/** Owned, bounded prepared-audio cache. No constructor/update/lookup starts media
 * work. The owner calls update on immutable project edits and media revisions,
 * prepare only on an explicit action, and dispose on unmount/project close.
 * At most two windows and 64 MiB of completed WAV blobs per owner by default;
 * worker/decoder memory and blobs retained by a transport are separate budgets.
 */
export class SequencePreviewAudioCache {
  private project?: Project;
  private edit?: string;
  private sourceIds: readonly string[] = [];
  private sources = new Map<string, File | undefined>();
  private generation = 0;
  private closed = false;
  private entries: CachedSequenceAudio[] = [];
  private pending?: Job;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly render: PrepareSequenceAudio, private readonly resolveSource: (id: string) => File | undefined,
    private readonly byteBudget = MAX_PREVIEW_AUDIO_WINDOW_BYTES) {
    if (!Number.isSafeInteger(byteBudget) || byteBudget < 88 || byteBudget > MAX_PREVIEW_AUDIO_WINDOW_BYTES)
      throw new Error('Choose a supported prepared-audio cache budget.');
  }

  update(project: Project) {
    this.assertOpen();
    try {
      // The editor replaces Project objects. Playhead/meter ticks need no rescan.
      let ids = this.sourceIds, edit = this.edit;
      if (project !== this.project) {
        ids = sequencePreviewAudioSources(project); edit = audioEdit(project);
      }
      const sources = new Map(ids.map((id) => [id, this.resolveSource(id)]));
      const changed = edit !== this.edit || !this.sameSources(sources);
      this.project = project; this.edit = edit; this.sourceIds = ids; this.sources = sources;
      if (changed) this.invalidate();
    } catch (error) {
      this.project = undefined; this.edit = undefined; this.sourceIds = []; this.sources.clear(); this.invalidate();
      throw error;
    }
  }

  subscribeInvalidation(listener: () => void) {
    this.assertOpen(); this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Returns an entire containing window; its start is the transport's offset. */
  peek(range: PreviewAudioRange): CachedSequenceAudio | undefined {
    this.assertOpen(); this.refreshSources();
    const plan = this.plan(range);
    const index = this.entries.findIndex((entry) => entry.startFrame <= plan.startFrame && entry.endFrame >= plan.endFrame);
    if (index < 0) return;
    const [entry] = this.entries.splice(index, 1); this.entries.push(entry);
    return entry;
  }

  prepare(range: PreviewAudioRange, signal: AbortSignal, onProgress: Progress = () => {}): Promise<CachedSequenceAudio> {
    try {
      this.assertOpen(); signal.throwIfAborted();
      const cached = this.peek(range);
      if (cached) return Promise.resolve(cached);
      const plan = this.plan(range);
      if (plan.pcmBytes + 80 > this.byteBudget) throw new Error('Prepare a shorter audio preview range for this cache.');
      if ([...this.sources.values()].some((file) => !file)) throw new Error('Relink missing media before preparing sequence audio.');
      let job = this.pending;
      if (job && (job.plan.startFrame !== plan.startFrame || job.plan.endFrame !== plan.endFrame)) {
        this.cancelPending(); job = undefined;
      }
      if (!job) job = this.start(plan);
      return this.join(job, signal, onProgress);
    } catch (error) { return Promise.reject(error); }
  }

  dispose() {
    if (this.closed) return;
    this.closed = true; this.invalidate(); this.listeners.clear();
    this.project = undefined; this.edit = undefined; this.sources.clear(); this.sourceIds = [];
  }

  private assertOpen() { if (this.closed) throw cancelled(); }
  private plan(range: PreviewAudioRange) {
    if (!this.project) throw new Error('Choose a valid sequence before preparing its audio.');
    return planSequencePreviewAudio(this.project, range);
  }
  private refreshSources() {
    const next = new Map(this.sourceIds.map((id) => [id, this.resolveSource(id)]));
    if (!this.sameSources(next)) { this.sources = next; this.invalidate(); }
  }
  private sameSources(next: ReadonlyMap<string, File | undefined>) {
    return next.size === this.sources.size && [...next].every(([id, file]) => this.sources.has(id) && this.sources.get(id) === file);
  }
  private cancelPending() {
    const job = this.pending; this.pending = undefined;
    job?.controller.abort(cancelled());
  }
  private invalidate() {
    ++this.generation; this.entries = []; this.cancelPending();
    // One observer must not prevent resource cleanup for other preview owners.
    for (const listener of this.listeners) { try { listener(); } catch { /* Observer failure is isolated. */ } }
  }
  private current(generation: number) {
    if (this.closed) return false;
    this.refreshSources(); return generation === this.generation;
  }
  private start(plan: PreviewAudioPlan): Job {
    const controller = new AbortController(), project = this.project!;
    const job: Job = { controller, generation: this.generation, plan, clients: new Set(), finished: false,
      promise: undefined as unknown as Promise<CachedSequenceAudio> };
    this.pending = job;
    const guard = () => {
      controller.signal.throwIfAborted();
      if (!this.current(job.generation)) throw cancelled();
    };
    let abort!: () => void;
    const aborted = new Promise<never>((_, reject) => {
      abort = () => reject(controller.signal.reason ?? cancelled());
      controller.signal.addEventListener('abort', abort, { once: true });
    });
    const work = Promise.resolve().then(async () => {
      guard();
      const result = await this.render(project, { start: plan.start, end: plan.end }, controller.signal, (message, value) => {
        if (controller.signal.aborted || this.pending !== job) return;
        for (const client of job.clients) { try { client(message, value); } catch { /* Observer only. */ } }
      });
      guard();
      if (result.startFrame !== plan.startFrame || result.endFrame !== plan.endFrame || result.frames !== plan.frames ||
        result.start !== plan.start || result.end !== plan.end || result.pcmBytes !== plan.pcmBytes ||
        result.blob.type !== 'audio/wav' || result.blob.size !== plan.pcmBytes + 80 ||
        JSON.stringify(result.sourceIds) !== JSON.stringify(plan.sourceIds))
        throw new Error('Prepared sequence audio does not match the requested range. Retry the preview.');
      const entry: CachedSequenceAudio = Object.freeze({ ...result, sourceIds: Object.freeze([...plan.sourceIds]),
        isCurrent: () => this.current(job.generation) });
      this.entries.push(entry);
      while (this.entries.length > 2 || this.entries.reduce((bytes, item) => bytes + item.blob.size, 0) > this.byteBudget)
        this.entries.shift();
      return entry;
    });
    job.promise = Promise.race([work, aborted]).finally(() => {
      job.finished = true; controller.signal.removeEventListener('abort', abort);
      if (this.pending === job) this.pending = undefined;
    });
    return job;
  }
  private join(job: Job, signal: AbortSignal, progress: Progress): Promise<CachedSequenceAudio> {
    // Distinct wrapper supports two callers using the same callback independently.
    const client: Progress = (message, value) => progress(message, value);
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (action: () => void) => {
        if (done) return; done = true;
        signal.removeEventListener('abort', abort); job.clients.delete(client);
        action();
        if (!job.finished && !job.clients.size && this.pending === job) this.cancelPending();
      };
      const abort = () => finish(() => reject(signal.reason ?? cancelled()));
      job.clients.add(client); signal.addEventListener('abort', abort, { once: true });
      job.promise.then((entry) => finish(() => resolve(entry)), (error) => finish(() => reject(error)));
      if (signal.aborted) abort();
    });
  }
}
