export type AdjustmentLayer = {
  id: string;
  name: string;
  start: number;
  end: number;
  enabled: boolean;
  locked: boolean;
  exposure: number;
  contrast: number;
  saturation: number;
  hue: number;
};
export const MAX_ADJUSTMENTS = 128;
export const neutralAdjustment = { exposure: 0, contrast: 100, saturation: 100, hue: 0 };
export function newAdjustment(start: number, end: number): AdjustmentLayer {
  return {
    id: crypto.randomUUID(),
    name: 'Adjustment',
    start,
    end,
    enabled: true,
    locked: false,
    ...neutralAdjustment,
  };
}
export function validAdjustments(value: unknown): value is AdjustmentLayer[] {
  if (!Array.isArray(value) || value.length > MAX_ADJUSTMENTS) return false;
  const number = (n: unknown, min: number, max: number): n is number =>
    typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  return (
    new Set(value.map((a) => a?.id)).size === value.length &&
    value.every(
      (a) =>
        a &&
        typeof a.id === 'string' &&
        !!a.id.trim() &&
        a.id.length <= 100 &&
        typeof a.name === 'string' &&
        !!a.name.trim() &&
        a.name.length <= 80 &&
        typeof a.enabled === 'boolean' &&
        typeof a.locked === 'boolean' &&
        number(a.start, 0, 86400) &&
        number(a.end, 0, 86400) &&
        a.end > a.start &&
        number(a.exposure, -4, 4) &&
        number(a.contrast, 0, 200) &&
        number(a.saturation, 0, 300) &&
        number(a.hue, -180, 180),
    )
  );
}
const effective = (a: AdjustmentLayer) =>
  a.enabled && (a.exposure !== 0 || a.contrast !== 100 || a.saturation !== 100 || a.hue !== 0);
export const hasAdjustments = (layers: AdjustmentLayer[] | undefined, end: number) =>
  !!layers?.some((a) => effective(a) && a.start < end && a.end > 0);
/** Stored order is bottom to top. Each grade acts on the result of those before it. */
export function adjustmentFilter(layers: AdjustmentLayer[] | undefined, time: number) {
  const n = (v: number) => String(+v.toFixed(8));
  return (
    layers
      ?.filter((a) => effective(a) && time >= a.start && time < a.end)
      .map(
        (a) =>
          `brightness(${n(2 ** a.exposure)}) contrast(${n(a.contrast / 100)}) saturate(${n(a.saturation / 100)}) hue-rotate(${n(a.hue)}deg)`,
      )
      .join(' ') || 'none'
  );
}
export function patchAdjustment(
  layers: AdjustmentLayer[],
  id: string,
  patch: Partial<Omit<AdjustmentLayer, 'id'>>,
) {
  const current = layers.find((a) => a.id === id);
  if (
    !current ||
    (current.locked && (Object.keys(patch).length !== 1 || patch.locked === undefined))
  )
    return layers;
  const next = layers.map((a) => (a.id === id ? { ...a, ...patch } : a));
  if (!validAdjustments(next)) throw new Error('Check the adjustment range and color values.');
  return next;
}
export function reorderAdjustment(layers: AdjustmentLayer[], id: string, delta: -1 | 1) {
  const index = layers.findIndex((a) => a.id === id),
    other = index + delta;
  if (
    index < 0 ||
    other < 0 ||
    other >= layers.length ||
    layers[index].locked ||
    layers[other].locked
  )
    return layers;
  const next = [...layers];
  [next[index], next[other]] = [next[other], next[index]];
  return next;
}
export function cutAdjustments(layers: AdjustmentLayer[] | undefined, start: number, end: number) {
  const map = (time: number) => (time <= start ? time : time < end ? start : time - (end - start));
  return layers?.flatMap((a) => {
    const next = { ...a, start: map(a.start), end: map(a.end) };
    return next.end > next.start ? [next] : [];
  });
}
export function remapAdjustments(
  layers: AdjustmentLayer[] | undefined,
  ranges: { start: number; end: number }[],
) {
  if (!layers) return undefined;
  const next = layers.flatMap((a) => {
    let cursor = 0;
    const pieces: AdjustmentLayer[] = [];
    for (const range of ranges) {
      if (range.end <= range.start) continue;
      const from = Math.max(a.start, range.start),
        to = Math.min(a.end, range.end);
      if (to > from) {
        const start = cursor + from - range.start,
          end = cursor + to - range.start,
          last = pieces.at(-1);
        if (last && Math.abs(last.end - start) < 1e-7) last.end = end;
        else pieces.push({ ...a, id: crypto.randomUUID(), start, end });
      }
      cursor += range.end - range.start;
    }
    return pieces;
  });
  if (next.length > MAX_ADJUSTMENTS)
    throw new Error(
      'This edit would create too many adjustment fragments. Simplify the adjustment layers first.',
    );
  return next;
}
export function speedAdjustments(
  layers: AdjustmentLayer[] | undefined,
  start: number,
  factor: number,
) {
  const map = (time: number) => (time <= start ? time : start + (time - start) / factor);
  return layers?.map((a) => ({ ...a, start: map(a.start), end: map(a.end) }));
}
