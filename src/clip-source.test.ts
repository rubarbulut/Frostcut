import { describe, expect, it, vi } from 'vitest';
import { addMedia, applyOperations, createProject, detachAudio, isMediaClip, isSequenceClip, splitClip, validateProject } from './model';
import { createSequence, insertSequenceReference, removeSequence, sequenceReferences, switchSequence } from './sequences';
import { clipSource, clipTrimLimit, requireClipSource, requireMediaClip, sourceMediaIds, sourceSequence } from './clip-source';
import { projectFileBlob, readProjectFile } from './project-file';
import { useEditor } from './store';
import { batchPlan } from './batch-plan';
import { setClipTracking } from './clip-tracking';
import { editCaption } from './caption-editing';

vi.mock('idb-keyval', () => ({ set: vi.fn(async () => undefined), get: vi.fn(async () => undefined) }));
vi.mock('./proxies', () => ({ clearProxies: vi.fn() }));
function fixture() {
  const footage = addMedia(createProject('Sources', 'YouTube'), { id: 'video', name: 'Original.mp4',
    duration: 12, width: 1920, height: 1080, size: 1, type: 'video/mp4' });
  const empty = createSequence(footage, 'Parent'), childId = empty.sequences![0].id;
  return { project: insertSequenceReference(empty, childId, { start: 3, sourceStart: 2, sourceEnd: 10 }), childId };
}

describe('real media and live sequence source model', () => {
  it('keeps exclusive source identity and round-trips actual references without synthetic media/files', async () => {
    const { project: p, childId } = fixture(), clip = p.clips[0];
    expect(isSequenceClip(clip)).toBe(true); expect(isMediaClip(clip)).toBe(false);
    expect(clip.mediaId).toBeUndefined(); expect(clip.sequenceId).toBe(childId);
    expect(p.media.map((m) => m.id)).toEqual(['video']);
    const restored = await readProjectFile(projectFileBlob(p));
    expect(restored.clips).toEqual(p.clips); expect(restored.sequences).toEqual(p.sequences);
    expect(requireClipSource(restored, restored.clips[0])).toMatchObject({ kind: 'sequence', sourceId: childId, duration: 12, width: 1920, height: 1080 });
    expect(() => requireMediaClip(restored.clips[0])).toThrow('original media');
    const childClip = sourceSequence(p, childId)!.clips[0];
    expect(requireMediaClip(childClip).mediaId).toBe('video');
    expect(clipSource(p, childClip)).toMatchObject({ kind: 'media', name: 'Original.mp4', duration: 12 });
  });

  it('uses the active source edit and new Project cache identity, preserving a shortened reference gap', () => {
    const { project: p, childId } = fixture(), reference = p.clips[0];
    const edited = switchSequence(p, childId);
    const next = { ...edited, clips: edited.clips.map((c) => ({ ...c, sourceEnd: 4 })), settings: { ...edited.settings, width: 1080, height: 1920 } };
    expect(requireClipSource(next, reference)).toMatchObject({ duration: 4, width: 1080, height: 1920 });
    expect(requireClipSource(p, reference).duration).toBe(12);
    expect(clipTrimLimit(next, reference)).toBe(10);
    const parent = switchSequence(next, p.activeSequenceId!);
    const trimmed = applyOperations(parent, [{ type: 'trim', clipId: reference.id, sourceStart: 2, sourceEnd: 9 }]);
    expect(trimmed.clips[0].sourceEnd).toBe(9);
    expect(() => validateProject(JSON.parse(JSON.stringify(trimmed)))).not.toThrow();
  });

  it('preserves references under split/move/trim/speed and real editor history', () => {
    const { project: p } = fixture(), reference = p.clips[0];
    const split = splitClip(p, reference.id, 7);
    const moved = applyOperations(split, [{ type: 'move', clipId: split.clips[1].id, start: 20 },
      { type: 'speed', clipId: split.clips[1].id, speed: 2 }]);
    expect(moved.clips.map((c) => c.sequenceId)).toEqual([reference.sequenceId, reference.sequenceId]);
    expect([moved.clips[1].start, moved.clips[1].sourceStart, moved.clips[1].properties.speed]).toEqual([20, 6, 2]);
    useEditor.setState({ project: p, past: [], future: [], selected: [] });
    useEditor.getState().commit(moved, 'Edit reference');
    useEditor.getState().undo(); expect(useEditor.getState().project).toBe(p);
    useEditor.getState().redo(); expect(useEditor.getState().project.clips).toEqual(moved.clips);
  });

  it('duplicates an editable workspace while keeping child bindings and copying native source data independently', () => {
    const { project: p } = fixture(), oldId = p.activeSequenceId!, oldClip = p.clips[0];
    const duplicate = createSequence(p, 'Parent copy', oldId);
    expect(duplicate.clips[0].sequenceId).toBe(oldClip.sequenceId);
    expect(duplicate.clips[0].id).not.toBe(oldClip.id);
    duplicate.clips[0].properties.volume = 0.2;
    expect(switchSequence(duplicate, oldId).clips[0].properties.volume).toBe(1);
    expect(p.clips[0].properties.volume).toBe(1);
    expect(() => createSequence(p, '')).toThrow('name');
    expect(() => createSequence(p, 'Copy', 'missing')).toThrow('existing');
  });

  it('protects locks, self/indirect cycles, missing sources and source deletion', () => {
    const { project: p, childId } = fixture();
    expect(() => insertSequenceReference(p, p.activeSequenceId!)).toThrow('itself');
    expect(() => insertSequenceReference(p, 'missing')).toThrow('existing');
    expect(() => insertSequenceReference(p, childId, { sourceEnd: 13 })).toThrow('source range');
    const locked = { ...p, tracks: p.tracks.map((t) => ({ ...t, locked: t.id === 'A1' })) };
    expect(() => insertSequenceReference(locked, childId)).toThrow('Unlock');
    const child = switchSequence(p, childId);
    expect(() => insertSequenceReference(child, p.activeSequenceId!)).toThrow('cycle');
    expect(sequenceReferences(p, childId).map((s) => s.name)).toEqual(['Parent']);
    expect(() => removeSequence(p, childId)).toThrow('used by Parent');
    expect(removeSequence(p, p.activeSequenceId!).sequences).toHaveLength(1);
    const malformed = structuredClone(p); malformed.clips[0].sequenceId = 'missing';
    expect(() => validateProject(malformed)).toThrow();
    const both = { ...p, clips: [{ ...p.clips[0], mediaId: 'video' }] };
    expect(() => validateProject(both)).toThrow();
    const inactiveCycle = structuredClone(p);
    const placement = p.clips[0]; if (!isSequenceClip(placement)) throw new Error('Expected reference');
    inactiveCycle.sequences![0].clips = [{ ...placement, sequenceId: p.activeSequenceId!, id: 'loop' }];
    expect(() => validateProject(inactiveCycle)).toThrow();
  });

  it('collects descendant file dependencies once and uses them in real batch preflight', () => {
    const { project: p, childId } = fixture();
    const middle = createSequence(p, 'Middle');
    const nested = insertSequenceReference(middle, p.activeSequenceId!);
    expect(sourceMediaIds(nested)).toEqual(['video']);
    const plan = batchPlan(nested, [nested.activeSequenceId!], new Set());
    expect(plan.errors).toEqual(['Middle: Relink: Original.mp4']);
    expect(batchPlan(nested, [nested.activeSequenceId!], new Set(['video'])).errors).toEqual([]);
    const broken = structuredClone(nested); broken.clips[0].sequenceId = childId + '-missing';
    expect(() => sourceMediaIds(broken)).toThrow('missing');
    const placement = nested.clips[0]; if (!isSequenceClip(placement)) throw new Error('Expected reference');
    const cycle = structuredClone(nested); cycle.sequences![0].clips = [{ ...placement, sequenceId: nested.activeSequenceId!, id: 'cycle' }];
    expect(() => sourceMediaIds(cycle)).toThrow('cycle');
  });

  it('detaches real nested audio identity and refuses source-video tracking on a group', () => {
    const { project: p } = fixture(), reference = p.clips[0];
    const detached = detachAudio(p, reference.id);
    expect(detached.clips).toHaveLength(2);
    expect(detached.clips[0].audioDetached).toBe(true);
    expect(detached.clips[1]).toMatchObject({ trackId: 'A1', sequenceId: reference.sequenceId });
    expect(detached.clips[1].mediaId).toBeUndefined(); expect(detached.clips[1].captionWords).toBeUndefined();
    expect(() => validateProject(JSON.parse(JSON.stringify(detached)))).not.toThrow();
    expect(setClipTracking(p, reference.id, undefined)).toBe(p);
    expect(() => editCaption(p, reference.id, [], { text: 'Group caption', start: 3, end: 4, speakerId: p.speakers[0].id })).toThrow('original media');
  });
});
