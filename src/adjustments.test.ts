import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addMedia,
  applyOperations,
  createProject,
  deleteRange,
  duration,
  splitClip,
  validateProject,
} from './model';
import {
  adjustmentFilter,
  cutAdjustments,
  hasAdjustments,
  MAX_ADJUSTMENTS,
  newAdjustment,
  patchAdjustment,
  remapAdjustments,
  reorderAdjustment,
  validAdjustments,
} from './adjustments';
import { drawCanvasAdjustments } from './adjustment-renderer';
import { createEqualPartSequences } from './equal-parts';
import { sequenceSnapshot, sequenceViews, switchSequence } from './sequences';
import { useEditor } from './store';
import { deleteSelected } from './Timeline';
import { splitAdjustment } from './AdjustmentControls';

vi.mock('idb-keyval', () => ({
  set: vi.fn(async () => undefined),
  get: vi.fn(async () => undefined),
}));
vi.mock('./proxies', () => ({ clearProxies: vi.fn() }));

function fixture() {
  const p = addMedia(createProject('Grade'), {
    id: 'video',
    name: 'video.mp4',
    duration: 24,
    width: 1920,
    height: 1080,
    size: 1000,
    type: 'video/mp4',
  });
  p.adjustments = [
    { ...newAdjustment(2, 18), exposure: 1 },
    { ...newAdjustment(10, 24), saturation: 0 },
  ];
  return p;
}
const ranges = (p: ReturnType<typeof fixture>) => p.adjustments?.map((a) => [a.start, a.end]);

describe('adjustment data and composition', () => {
  it('validates ranges, limits, IDs and grading controls and round-trips project data', () => {
    const p = fixture();
    expect(validateProject(JSON.parse(JSON.stringify(p))).adjustments).toEqual(p.adjustments);
    for (const patch of [
      { start: -1 },
      { end: 2 },
      { exposure: NaN },
      { contrast: 201 },
      { saturation: -1 },
      { hue: 181 },
      { name: '' },
      { enabled: 'yes' },
    ]) {
      expect(validAdjustments([{ ...p.adjustments![0], ...patch }])).toBe(false);
    }
    expect(validAdjustments([p.adjustments![0], p.adjustments![0]])).toBe(false);
    expect(
      validAdjustments(Array.from({ length: MAX_ADJUSTMENTS + 1 }, () => newAdjustment(0, 1))),
    ).toBe(false);
    expect(() =>
      validateProject({ ...p, adjustments: [{ ...p.adjustments![0], locked: null }] }),
    ).toThrow();
    expect(validAdjustments([newAdjustment(0, 0.0001)])).toBe(true);
  });

  it('uses half-open time ranges, skips neutral/disabled layers and preserves stack order', () => {
    const a = { ...newAdjustment(2, 4), exposure: 1 },
      b = { ...newAdjustment(2, 4), contrast: 50 };
    expect(adjustmentFilter([a, b], 1.999)).toBe('none');
    expect(adjustmentFilter([a, b], 4)).toBe('none');
    const first = adjustmentFilter([a], 2),
      second = adjustmentFilter([b], 2);
    expect(adjustmentFilter([a, b], 2)).toBe(`${first} ${second}`);
    expect(adjustmentFilter(reorderAdjustment([a, b], a.id, 1), 2)).toBe(`${second} ${first}`);
    expect(adjustmentFilter([newAdjustment(0, 10), { ...a, enabled: false }], 2)).toBe('none');
    expect(hasAdjustments([newAdjustment(0, 10)], 10)).toBe(false);
    expect(hasAdjustments([a], 2)).toBe(false);
    expect(hasAdjustments([a], 3)).toBe(true);
  });

  it('restores the canvas context and applies a single composite grade before any later caption draw', () => {
    const p = fixture(),
      calls: string[] = [],
      stack: string[] = [];
    const ctx = {
      canvas: {},
      filter: 'none',
      save() {
        stack.push(this.filter);
      },
      restore() {
        this.filter = stack.pop()!;
      },
      drawImage(source: unknown, x: number, y: number) {
        expect(source).toBe(this.canvas);
        expect([x, y]).toEqual([0, 0]);
        calls.push(this.filter);
      },
    };
    drawCanvasAdjustments(ctx as unknown as CanvasRenderingContext2D, p.adjustments, 12);
    expect(calls).toEqual([adjustmentFilter(p.adjustments, 12)]);
    expect(ctx.filter).toBe('none');
    drawCanvasAdjustments(ctx as unknown as CanvasRenderingContext2D, p.adjustments, 24);
    expect(calls).toHaveLength(1);
    ctx.drawImage = () => {
      throw new Error('lost canvas');
    };
    expect(() =>
      drawCanvasAdjustments(ctx as unknown as CanvasRenderingContext2D, p.adjustments, 12),
    ).toThrow('lost canvas');
    expect(ctx.filter).toBe('none');
    expect(() => drawCanvasAdjustments({} as CanvasRenderingContext2D, p.adjustments, 12)).toThrow(
      'Canvas filters',
    );
  });

  it('protects locked layers while allowing explicit unlock', () => {
    const a = { ...newAdjustment(2, 4), locked: true },
      b = newAdjustment(0, 5),
      layers = [a, b];
    expect(patchAdjustment(layers, a.id, { start: 1 })).toBe(layers);
    expect(patchAdjustment(layers, a.id, { locked: false, start: 1 })).toBe(layers);
    expect(reorderAdjustment(layers, b.id, -1)).toBe(layers);
    expect(patchAdjustment(layers, a.id, { locked: false })[0].locked).toBe(false);
  });
});

describe('adjustments follow timeline edits and parts', () => {
  it('ripple-remaps intervals without changing the input and keeps absolute spans for non-ripple deletion', () => {
    const p = fixture(),
      initial = structuredClone(p.adjustments);
    expect(ranges(deleteRange(p, 4, 8))).toEqual([
      [2, 14],
      [6, 20],
    ]);
    expect(ranges(deleteRange(p, 4, 8, false))).toEqual([
      [2, 18],
      [10, 24],
    ]);
    expect(cutAdjustments([newAdjustment(5, 7)], 4, 8)).toEqual([]);
    expect(p.adjustments).toEqual(initial);
    p.adjustments![1].locked = true;
    expect(deleteRange(p, 4, 8)).toBe(p);
    expect(ranges(applyOperations(p, [{ type: 'keep-range', start: 4, end: 16 }]))).toEqual(
      ranges(p),
    );
  });

  it('assembles reordered ranges with independently mapped pieces and unchanged layer order', () => {
    const p = fixture();
    const next = applyOperations(p, [
      {
        type: 'assemble',
        ranges: [
          { start: 12, end: 20 },
          { start: 0, end: 6 },
        ],
      },
    ]);
    expect(ranges(next)).toEqual([
      [0, 6],
      [10, 14],
      [0, 8],
    ]);
    expect(new Set(next.adjustments!.map((a) => a.id)).size).toBe(3);
    expect(duration(next)).toBe(14);
    expect(next.adjustments![0].exposure).toBe(1);
    expect(next.adjustments![2].saturation).toBe(0);
    const joined = remapAdjustments(
      [newAdjustment(0, 20)],
      [
        { start: 0, end: 4 },
        { start: 8, end: 12 },
      ],
    );
    expect(joined?.map((a) => [a.start, a.end])).toEqual([[0, 8]]);
  });

  it('keeps grade timing aligned when speed changes are bounded by an existing fast clip', () => {
    const p = fixture();
    p.clips[0].properties.speed = 2;
    p.adjustments = [{ ...newAdjustment(1, 10), exposure: 1 }];
    const next = applyOperations(p, [{ type: 'speed-range', start: 0, speed: 4 }]);
    expect(next.clips[0].properties.speed).toBe(4);
    expect(duration(next)).toBe(6);
    expect(ranges(next)).toEqual([[0.5, 5]]);
    expect(validateProject(next).adjustments).toEqual(next.adjustments);
    const crossing = applyOperations(fixture(), [{ type: 'speed-range', start: 6, speed: 2 }]);
    expect(ranges(crossing)).toEqual([
      [2, 12],
      [8, 15],
    ]);
  });

  it('saves independent per-sequence layers, clears absent older sequence fields and clips equal parts', () => {
    const p = fixture();
    const parts = createEqualPartSequences(p, { mode: 'count', value: 2 });
    expect(parts.sequences?.map((s) => s.adjustments?.map((a) => [a.start, a.end]))).toEqual([
      [
        [2, 18],
        [10, 24],
      ],
      [
        [2, 12],
        [10, 12],
      ],
      [
        [0, 6],
        [0, 12],
      ],
    ]);
    const roundTrip = validateProject(JSON.parse(JSON.stringify(parts)));
    expect(roundTrip.sequences?.map((s) => s.adjustments)).toEqual(
      parts.sequences?.map((s) => s.adjustments),
    );
    const empty = sequenceSnapshot({ ...p, adjustments: undefined }, 'old', 'Old sequence');
    delete empty.adjustments;
    const multi = {
      ...p,
      activeSequenceId: 'graded',
      sequences: [sequenceSnapshot(p, 'graded', 'Graded'), empty],
    };
    expect(switchSequence(multi, 'old').adjustments).toBeUndefined();
    expect(sequenceViews(multi)[1]).toHaveProperty('adjustments', undefined);
  });

  it('rejects assembly fragment overflow instead of silently dropping effects', () => {
    const layer = newAdjustment(0, 0.25);
    const repeated = Array.from({ length: MAX_ADJUSTMENTS + 1 }, () => ({ start: 0, end: 1 }));
    expect(() => remapAdjustments([layer], repeated)).toThrow('too many adjustment fragments');
  });
});

describe('actual editor adjustment history and selected-clip ripple deletion', () => {
  beforeEach(() =>
    useEditor.setState({
      project: fixture(),
      past: [],
      future: [],
      selected: [],
      adjustmentSelection: undefined,
      previewAdjustment: undefined,
    }),
  );
  it('clears draft values and preserves grading through undo/redo/save validation', () => {
    const s = useEditor.getState(),
      a = s.project.adjustments![0];
    s.selectAdjustment(a.id);
    s.setPreviewAdjustment({ ...a, exposure: 2 });
    s.commit(
      { ...s.project, adjustments: patchAdjustment(s.project.adjustments!, a.id, { exposure: 2 }) },
      'Grade',
    );
    expect(useEditor.getState().previewAdjustment).toBeUndefined();
    useEditor.getState().undo();
    expect(useEditor.getState().project.adjustments![0].exposure).toBe(1);
    useEditor.getState().redo();
    expect(validateProject(useEditor.getState().project).adjustments![0].exposure).toBe(2);
    splitAdjustment(a.id, 8);
    expect(ranges(useEditor.getState().project)).toEqual([
      [2, 8],
      [8, 18],
      [10, 24],
    ]);
  });
  it('handles the timeline toolbar ripple path and respects locked grades', () => {
    let p = fixture();
    p = splitClip(p, p.clips[0].id, 4);
    const middle = p.clips.find((c) => c.start === 4)!;
    p = splitClip(p, middle.id, 8);
    useEditor.setState({ project: p, selected: [middle.id] });
    deleteSelected(true);
    expect(ranges(useEditor.getState().project)).toEqual([
      [2, 14],
      [6, 20],
    ]);
    const locked = structuredClone(p);
    locked.adjustments![1].locked = true;
    useEditor.setState({ project: locked, selected: [middle.id] });
    deleteSelected(true);
    expect(useEditor.getState().project).toBe(locked);
  });
});
