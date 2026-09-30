import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addMedia, applyOperations, createProject, defaultProps, detachAudio, splitClip, validateProject } from './model';
import { baseTransformAt, setAnimatedValue, toggleKeyframe, transformAt } from './motion';
import { editTrackingPoint, setClipTracking, trackingResultIsCurrent } from './clip-tracking';
import { MAX_TRACKING_POINTS, trackingPointAt, validClipTracking, type ClipTracking } from './tracking-data';
import { createEqualPartSequences } from './equal-parts';
import { switchSequence } from './sequences';
import { useEditor } from './store';

vi.mock('idb-keyval', () => ({ set: vi.fn(async () => undefined), get: vi.fn(async () => undefined) }));
vi.mock('./proxies', () => ({ clearProxies: vi.fn() }));
const layer = (): ClipTracking => ({ version: 1, enabled: true, sourceWidth: 1920, sourceHeight: 1080,
  start: 0, end: 12, region: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
  points: [{ time: 0, x: 0.5, y: 0.5, correlation: 1 }, { time: 10, x: 0.6, y: 0.7, correlation: 0.9, margin: 0.1 }] });
const fixture = () => addMedia(createProject('Track', 'YouTube'), { id: 'source', name: 'source.mp4',
  duration: 12, width: 1920, height: 1080, size: 1, type: 'video/mp4' });
beforeEach(() => useEditor.setState({ project: fixture(), past: [], future: [], selected: [], playing: false }));

describe('source-time tracking layer', () => {
  it('composes translation with baseline scale/rotation and current fill geometry', () => {
    const clip = { ...fixture().clips[0], tracking: layer(), properties: { ...defaultProps, x: 20, y: 30, scale: 2, rotation: 90 } };
    const base = baseTransformAt(clip, 5, 1080, 1920);
    const fit = transformAt(clip, 5, 1080, 1920, 'fit');
    expect(fit.x).toBeCloseTo(base.x + 121.5);
    expect(fit.y).toBeCloseTo(base.y - 108);
    expect(transformAt(clip, 5, 1080, 1920, 'blur-background')).toEqual(fit);
    const crop = transformAt(clip, 5, 1080, 1920, 'crop');
    expect(crop.x).toBeCloseTo(base.x + 384);
    expect(crop.y).toBeCloseTo(base.y - 341.3333333333);
  });

  it('preserves baseline keys and exact disabled/outside-range motion without baking offsets twice', () => {
    const clip = { ...fixture().clips[0], tracking: layer(), keyframes: { x: [{ time: 0, value: 0 }, { time: 10, value: 100 }] } };
    const withKey = toggleKeyframe(clip, 'x', 5, 1920, 1080);
    expect(withKey.keyframes.x?.find((p) => p.time === 5)?.value).toBe(50);
    const edited = setAnimatedValue(withKey, 'x', 80, 5, 1920, 1080);
    expect(transformAt(edited, 5, 1920, 1080).x).toBeCloseTo(-16);
    expect(edited.tracking).toEqual(clip.tracking);
    expect(transformAt({ ...clip, tracking: { ...clip.tracking, enabled: false } }, 5, 1920, 1080)).toEqual(baseTransformAt(clip, 5, 1920, 1080));
    for (const time of [-1, 12, 14]) expect(transformAt(clip, time, 1920, 1080)).toEqual(baseTransformAt(clip, time, 1920, 1080));
    expect(clip.keyframes.x).toHaveLength(2);
  });

  it('round-trips every point beyond the native animation cap and rejects malformed imported data', () => {
    const t = { ...layer(), points: Array.from({ length: 600 }, (_, i) => ({ time: i / 60, x: i / 600, y: 0.5, correlation: 1 })) };
    const p = fixture(), next = setClipTracking(p, p.clips[0].id, t);
    expect(validateProject(JSON.parse(JSON.stringify(next))).clips[0].tracking?.points).toEqual(t.points);
    expect(trackingPointAt(t.points, 123.5 / 60).x).toBeCloseTo(123.5 / 600);
    for (const invalid of [null, { ...t, enabled: 'yes' }, { ...t, points: [t.points[0]] },
      { ...t, points: [t.points[1], t.points[0]] }, { ...t, region: { x: 0.9, y: 0, width: 0.2, height: 1 } },
      { ...t, sourceWidth: 1 }, { ...t, points: [{ ...t.points[0], correlation: NaN }, t.points[1]] },
      { ...t, points: Array(MAX_TRACKING_POINTS + 1).fill(t.points[0]) }]) {
      expect(validClipTracking(invalid, 12)).toBe(false);
      expect(() => validateProject({ ...next, clips: [{ ...next.clips[0], tracking: invalid }] })).toThrow();
    }
    expect(p.clips[0].tracking).toBeUndefined();
  });

  it('maps split/move/trim/speed and independent episode sequences to the same source path', () => {
    const p = fixture(); p.clips[0].tracking = layer(); p.clips[0].properties.speed = 2;
    const clip = p.clips[0], split = splitClip(p, clip.id, 3), second = split.clips[1];
    expect(transformAt(second, 4, 1920, 1080)).toEqual(transformAt(clip, 4, 1920, 1080));
    const moved = applyOperations(split, [{ type: 'move', clipId: second.id, start: 20 },
      { type: 'trim', clipId: second.id, sourceStart: 8, sourceEnd: 12 }, { type: 'speed', clipId: second.id, speed: 1 }]);
    expect(transformAt(moved.clips[1], 21, 1920, 1080)).toMatchObject({
      x: transformAt(clip, 4.5, 1920, 1080).x, y: transformAt(clip, 4.5, 1920, 1080).y,
    });
    const parts = createEqualPartSequences(p, { mode: 'count', value: 2 });
    const part2 = switchSequence(parts, parts.sequences![2].id);
    expect(transformAt(part2.clips[0], 1, 1920, 1080)).toEqual(transformAt(clip, 4, 1920, 1080));
    part2.clips[0].tracking!.points[0].x = 0.1;
    expect(p.clips[0].tracking.points[0].x).toBe(0.5);
    expect(() => validateProject(JSON.parse(JSON.stringify(parts)))).not.toThrow();
  });

  it('guards locks/stale results and keeps tracking off detached audio', () => {
    const p = fixture(), clip = p.clips[0];
    expect(trackingResultIsCurrent(p, p, clip.id, 'blob:source', 'blob:source')).toBe(true);
    expect(trackingResultIsCurrent(p, { ...p }, clip.id, 'blob:source', 'blob:source')).toBe(false);
    expect(trackingResultIsCurrent(p, p, clip.id, 'blob:source', 'blob:new')).toBe(false);
    const tracked = setClipTracking(p, clip.id, layer()), detached = detachAudio(tracked, clip.id);
    expect(detached.clips[0].tracking).toEqual(layer());
    expect(detached.clips[1].tracking).toBeUndefined();
    const locked = structuredClone(p); locked.tracks.find((t) => t.id === 'A1')!.locked = true;
    expect(setClipTracking(locked, clip.id, layer())).toBe(locked);
    expect(setClipTracking(detached, detached.clips[1].id, layer())).toBe(detached);
  });

  it('makes point edits explicit/manual and restores application/edit/removal through actual undo/redo', () => {
    const p = useEditor.getState().project, id = p.clips[0].id;
    useEditor.getState().commit(setClipTracking(p, id, layer()), 'Apply tracking');
    const applied = useEditor.getState().project;
    const edited = editTrackingPoint(applied.clips[0].tracking!, 1, { x: 0.8, time: 11 });
    expect(edited.points[1]).toEqual({ time: 11, x: 0.8, y: 0.7, manual: true });
    expect(() => editTrackingPoint(edited, 1, { time: 0 })).toThrow();
    useEditor.getState().commit(setClipTracking(applied, id, edited), 'Edit point');
    useEditor.getState().undo(); expect(useEditor.getState().project).toBe(applied);
    useEditor.getState().undo(); expect(useEditor.getState().project).toBe(p);
    useEditor.getState().redo(); useEditor.getState().redo();
    const restored = useEditor.getState().project;
    expect(restored.clips[0].tracking).toEqual(edited);
    useEditor.getState().commit(setClipTracking(restored, id, undefined), 'Remove tracking');
    useEditor.getState().undo(); expect(useEditor.getState().project).toBe(restored);
  });
});
