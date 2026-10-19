import { describe, expect, it, vi } from 'vitest';
import { addMedia, createProject, defaultProps, type Project, type SequenceClip, type Word } from './model';
import { sequenceSnapshot } from './sequences';
import { requireMediaClip } from './clip-source';
import { SequencePreviewAudioCache, type PrepareSequenceAudio } from './sequence-preview-audio-cache';
import { planSequencePreviewAudio, previewAudioWave, type PreparedSequenceAudio, type PreviewAudioRange } from './sequence-preview-audio';

const range = { start: 0, end: 0.01 }, signal = () => new AbortController().signal;
function fixture() {
  const p = addMedia(createProject('Cache', 'YouTube'), { id: 'voice', name: 'voice.mp4', duration: 20,
    width: 1920, height: 1080, size: 1, type: 'video/mp4' });
  const child = sequenceSnapshot(p, 'child', 'Child');
  child.clips = [{ ...requireMediaClip(p.clips[0]), sourceEnd: 10 }];
  const instance: SequenceClip = { id: 'instance', sequenceId: 'child', trackId: 'V1', start: 0,
    sourceStart: 0, sourceEnd: 10, properties: { ...defaultProps } };
  const root = sequenceSnapshot(p, 'root', 'Root'); root.clips = [instance];
  const project: Project = { ...p, ...root, id: p.id, name: p.name, activeSequenceId: 'root', sequences: [root, child] };
  const sources = new Map([['voice', new File(['metadata only'], 'voice.mp4')]]);
  const render = vi.fn<PrepareSequenceAudio>(async (p, r) => prepared(p, r));
  const cache = new SequencePreviewAudioCache(render, (id) => sources.get(id));
  cache.update(project);
  return { project, sources, render, cache };
}
function prepared(project: Project, r: PreviewAudioRange): PreparedSequenceAudio {
  const plan = planSequencePreviewAudio(project, r);
  return { ...plan, blob: previewAudioWave(new Uint8Array(plan.pcmBytes), plan) };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const word = (start: number, end: number): Word => ({ id: `${start}`, start, end, text: 'hello', speakerId: 'speaker' });

describe('owned sequence audio windows', () => {
  it('starts no media work on construction/update/lookup and reuses an aligned containing window', async () => {
    const { project, render, cache } = fixture();
    cache.update({ ...project, name: 'Renamed' });
    expect(cache.peek(range)).toBeUndefined(); expect(render).not.toHaveBeenCalled();
    const entry = await cache.prepare(range, signal());
    expect(entry.isCurrent()).toBe(true);
    expect(cache.peek({ start: 1 / 48000, end: 2 / 48000 })).toBe(entry);
    expect(await cache.prepare({ start: 0, end: 0.01 + 1e-9 }, signal())).toBe(entry);
    expect(render).toHaveBeenCalledTimes(1);
    expect(cache.peek({ start: 0, end: 0.02 })).toBeUndefined();
    cache.dispose(); expect(entry.isCurrent()).toBe(false);
  });

  it('retains audio across visual/caption-text edits but invalidates nested audio edits', async () => {
    const { project, cache, render } = fixture();
    const base: Project = { ...project, transcripts: [{ mediaId: 'voice', language: 'en', source: 'imported', words: [word(0, 1)] }] };
    cache.update(base);
    const entry = await cache.prepare(range, signal());
    const visual = structuredClone(base);
    visual.name = 'Renamed'; visual.captions.appearance = { ...visual.captions.appearance!, color: '#ff0000' };
    visual.clips[0].properties.rotation = 30; visual.clips[0].properties.opacity = 0.3;
    visual.tracks[0].hidden = true; visual.tracks[0].height = 200;
    visual.sequences![1].clips[0].properties.x = 50;
    visual.transcripts[0].words[0].text = 'edited'; visual.transcripts[0].words[0].speakerId = 'other';
    cache.update(visual);
    expect(cache.peek(range)).toBe(entry);
    const visualEntry = await cache.prepare(range, signal());
    const visualAgain = structuredClone(visual); visualAgain.transcripts[0].words[0].text = 'another';
    cache.update(visualAgain); expect(cache.peek(range)).toBe(visualEntry);
    expect(await cache.prepare(range, signal())).toBe(visualEntry);
    const audio = structuredClone(visualAgain); audio.sequences![1].clips[0].properties.volume = 0.5;
    cache.update(audio); expect(visualEntry.isCurrent()).toBe(false); expect(cache.peek(range)).toBeUndefined();
    await cache.prepare(range, signal());
    expect(render).toHaveBeenCalledTimes(2);
    expect(entry.blob.size).toBe(3920);
    cache.dispose();
  });

  it('tracks every mixer dependency including speech intervals hidden by overlapping speakers', async () => {
    const changes: ((p: Project) => void)[] = [
      (p) => { p.clips[0].start = 1; }, (p) => { p.clips[0].sourceStart = 1; },
      (p) => { p.clips[0].sourceEnd = 9; }, (p) => { p.clips[0].properties.speed = 2; },
      (p) => { p.clips[0].properties.volume = 0.2; }, (p) => { p.clips[0].properties.fadeIn = 0.1; },
      (p) => { p.clips[0].properties.fadeOut = 0.1; }, (p) => { p.clips[0].voiceEnhance = true; },
      (p) => { p.clips[0].autoDuck = true; }, (p) => { p.clips[0].audioRole = 'music'; },
      (p) => { p.clips[0].audioDetached = true; }, (p) => { p.clips[0].trackId = 'A1'; },
      (p) => { p.tracks.find((track) => track.id === 'A1')!.muted = true; },
      (p) => { p.tracks[0].kind = 'audio'; }, (p) => { p.media[0].duration = 21; },
      (p) => { p.sequences![1].clips[0].properties.volume = 0.3; },
      (p) => { p.sequences![1].clips[0].captionWords = [word(2, 3)]; },
      (p) => { p.transcripts[0].words[1].end = 2.5; },
    ];
    for (const change of changes) {
      const { project, cache, render } = fixture();
      const base = { ...project, transcripts: [{ mediaId: 'voice', language: 'en', source: 'imported' as const,
        words: [word(0, 10), word(2, 3)] }] };
      cache.update(base); const entry = await cache.prepare(range, signal());
      const next = structuredClone(base); change(next); cache.update(next);
      expect(entry.isCurrent()).toBe(false); expect(cache.peek(range)).toBeUndefined();
      expect(render).toHaveBeenCalledTimes(1); // Invalidating never launches a new render.
      cache.dispose();
    }
  });

  it('uses actual File identity, detects relink/removal on a held lease and permits missing muted media', async () => {
    const { project, sources, cache, render } = fixture();
    const entry = await cache.prepare(range, signal()), invalidated = vi.fn(() => { expect(entry.isCurrent()).toBe(false); });
    cache.subscribeInvalidation(invalidated);
    sources.set('voice', new File(['metadata only'], 'voice.mp4')); // Same metadata is still a different original.
    expect(entry.isCurrent()).toBe(false); expect(invalidated).toHaveBeenCalledTimes(1);
    await cache.prepare(range, signal()); expect(render).toHaveBeenCalledTimes(2);
    sources.delete('voice'); expect(cache.peek(range)).toBeUndefined();
    await expect(cache.prepare(range, signal())).rejects.toThrow('Relink');
    const muted = structuredClone(project); muted.clips[0].audioDetached = true; cache.update(muted);
    expect((await cache.prepare(range, signal())).sourceIds).toEqual([]);
    cache.dispose();
  });

  it('coalesces matching preparation with independent cancellation and progress subscribers', async () => {
    const { project, render, cache } = fixture(), work = deferred<PreparedSequenceAudio>();
    const a = new AbortController(), b = new AbortController(), progress = vi.fn();
    render.mockImplementation(async (_p, _r, _signal, report) => { report('Queued', 0); return work.promise; });
    const first = cache.prepare(range, a.signal, progress), second = cache.prepare(range, b.signal, progress);
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve(); expect(render).toHaveBeenCalledTimes(1); expect(progress).toHaveBeenCalledTimes(2);
    a.abort(); await rejected; expect(render.mock.calls[0][2].aborted).toBe(false);
    work.resolve(prepared(project, range)); const entry = await second;
    expect(cache.peek(range)).toBe(entry); cache.dispose();
  });

  it('cancels the engine request when the last waiter leaves and discards late success', async () => {
    const { project, render, cache } = fixture(), work = deferred<PreparedSequenceAudio>(), cancel = new AbortController();
    render.mockReturnValue(work.promise);
    const pending = cache.prepare(range, cancel.signal), rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve(); cancel.abort(); await rejected;
    expect(render.mock.calls[0][2].aborted).toBe(true);
    work.resolve(prepared(project, range)); await Promise.resolve(); await Promise.resolve();
    expect(cache.peek(range)).toBeUndefined();
    render.mockImplementation(async (p, r) => prepared(p, r)); await cache.prepare(range, signal());
    expect(render).toHaveBeenCalledTimes(2); cache.dispose();
  });

  it('settles superseded/disposed jobs promptly even when a renderer ignores cancellation', async () => {
    for (const action of ['edit', 'file', 'range', 'dispose', 'invalid'] as const) {
      const { project, sources, render, cache } = fixture(), work = deferred<PreparedSequenceAudio>();
      render.mockReturnValueOnce(work.promise);
      const pending = cache.prepare(range, signal()), rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      await Promise.resolve();
      if (action === 'edit') {
        const next = structuredClone(project); next.sequences![1].clips[0].properties.speed = 2; cache.update(next);
      } else if (action === 'file') { sources.delete('voice'); cache.update(project); }
      else if (action === 'range') await cache.prepare({ start: 1, end: 1.01 }, signal());
      else if (action === 'dispose') cache.dispose();
      else {
        const next = structuredClone(project); next.clips[0] = { ...next.clips[0], sequenceId: 'missing' } as SequenceClip;
        expect(() => cache.update(next)).toThrow();
      }
      await rejected; expect(render.mock.calls[0][2].aborted).toBe(true);
      work.resolve(prepared(project, range)); await Promise.resolve(); await Promise.resolve();
      if (action !== 'dispose' && action !== 'invalid') expect(cache.peek(range)).toBeUndefined();
      cache.dispose();
    }
  });

  it('keeps equivalent visual edits during an in-flight render without accepting stale audio edits', async () => {
    const { project, render, cache } = fixture(), work = deferred<PreparedSequenceAudio>();
    render.mockReturnValue(work.promise);
    const pending = cache.prepare(range, signal()); await Promise.resolve();
    const next = structuredClone(project); next.clips[0].properties.scale = 2; cache.update(next);
    expect(render.mock.calls[0][2].aborted).toBe(false);
    work.resolve(prepared(project, range)); expect((await pending).isCurrent()).toBe(true); cache.dispose();
  });

  it('evicts by both byte budget and LRU window count without starting replacement work', async () => {
    const { project, render, sources } = fixture();
    const cache = new SequencePreviewAudioCache(render, (id) => sources.get(id), 7840); cache.update(project);
    const a = await cache.prepare(range, signal()), b = await cache.prepare({ start: 1, end: 1.01 }, signal());
    expect(cache.peek(range)).toBe(a); // Make a more recent than b.
    const c = await cache.prepare({ start: 2, end: 2.01 }, signal());
    expect(cache.peek({ start: 1, end: 1.01 })).toBeUndefined(); expect(cache.peek(range)).toBe(a);
    expect(cache.peek({ start: 2, end: 2.01 })).toBe(c);
    await cache.prepare({ start: 3, end: 3.02 }, signal()); // 7760 bytes replaces both windows.
    expect(cache.peek(range)).toBeUndefined(); expect(cache.peek({ start: 2, end: 2.01 })).toBeUndefined();
    expect(b.isCurrent()).toBe(true); // A transport can own an evicted blob; cache memory is separate.
    await expect(cache.prepare({ start: 0, end: 0.03 }, signal())).rejects.toThrow('shorter');
    expect(render).toHaveBeenCalledTimes(4); cache.dispose();
  });

  it('does not poison retries after failure or cache malformed/stale window output', async () => {
    const { project, render, cache } = fixture();
    render.mockRejectedValueOnce(new Error('Decoder failed'));
    await expect(cache.prepare(range, signal())).rejects.toThrow('Decoder failed');
    for (const change of [
      (p: PreparedSequenceAudio) => ({ ...p, endFrame: p.endFrame + 1 }),
      (p: PreparedSequenceAudio) => ({ ...p, blob: new Blob(['wrong']) }),
      (p: PreparedSequenceAudio) => ({ ...p, sourceIds: [] }),
    ]) {
      render.mockResolvedValueOnce(change(prepared(project, range)));
      await expect(cache.prepare(range, signal())).rejects.toThrow('does not match');
      expect(cache.peek(range)).toBeUndefined();
    }
    await cache.prepare(range, signal()); expect(render).toHaveBeenCalledTimes(5);
    const aborted = new AbortController(); aborted.abort();
    await expect(cache.prepare(range, aborted.signal)).rejects.toMatchObject({ name: 'AbortError' });
    cache.dispose(); cache.dispose();
    await expect(cache.prepare(range, signal())).rejects.toMatchObject({ name: 'AbortError' });
    expect(() => cache.update(project)).toThrow();
  });
});
