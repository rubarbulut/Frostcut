import { captionGroups, clipEnd, type Project } from './model';

type Range = { start: number; end: number; endInclusive?: boolean };
type Entry<T> = Range & { item: T; order: number };
type Node<T> = {
  entry: Entry<T>;
  left?: Node<T>;
  right?: Node<T>;
  minStart: number;
  maxEnd: number;
  minOrder: number;
};

/** Static interval index: arbitrary seeks, overlaps and original first-match order. */
export class TimelineIndex<T> {
  private readonly root?: Node<T>;

  constructor(items: readonly T[], range: (item: T) => Range) {
    const entries = items.map((item, order) => ({ ...range(item), item, order }))
      .filter((e) => Number.isFinite(e.start) && Number.isFinite(e.end) &&
        (e.end > e.start || (e.endInclusive && e.end === e.start)))
      .sort((a, b) => a.start - b.start || a.order - b.order);
    const build = (low: number, high: number): Node<T> | undefined => {
      if (low >= high) return;
      const mid = (low + high) >>> 1;
      const entry = entries[mid], left = build(low, mid), right = build(mid + 1, high);
      return {
        entry, left, right,
        minStart: Math.min(entry.start, left?.minStart ?? Infinity, right?.minStart ?? Infinity),
        maxEnd: Math.max(entry.end, left?.maxEnd ?? -Infinity, right?.maxEnd ?? -Infinity),
        minOrder: Math.min(entry.order, left?.minOrder ?? Infinity, right?.minOrder ?? Infinity),
      };
    };
    this.root = build(0, entries.length);
  }

  private contains(entry: Entry<T>, time: number) {
    return time >= entry.start && (time < entry.end || (entry.endInclusive && time === entry.end));
  }

  at(time: number): T[] {
    if (!Number.isFinite(time)) return [];
    const active: Entry<T>[] = [];
    const visit = (node?: Node<T>) => {
      if (!node || node.minStart > time || node.maxEnd < time) return;
      visit(node.left);
      if (this.contains(node.entry, time)) active.push(node.entry);
      visit(node.right);
    };
    visit(this.root);
    return active.sort((a, b) => a.order - b.order).map((e) => e.item);
  }

  first(time: number): T | undefined {
    if (!Number.isFinite(time)) return;
    let best: Entry<T> | undefined;
    const visit = (node?: Node<T>) => {
      if (!node || node.minStart > time || node.maxEnd < time ||
        (best && node.minOrder >= best.order)) return;
      if ((!best || node.entry.order < best.order) && this.contains(node.entry, time)) best = node.entry;
      visit(node.left);
      visit(node.right);
    };
    visit(this.root);
    return best?.item;
  }
}

/** Build once per edit/export, preserving stable bottom-to-top clip draw order. */
export function clipTimelineIndex(p: Project, previewWindow = false) {
  const tracks = new Map(p.tracks.map((t, order) => [t.id, { ...t, order }]));
  const clips = p.clips.map((clip, order) => ({ clip, order }))
    .filter(({ clip }) => previewWindow ||
      (tracks.get(clip.trackId)?.kind !== 'audio' && !tracks.get(clip.trackId)?.hidden))
    .sort((a, b) =>
      (tracks.get(b.clip.trackId)?.order ?? -1) - (tracks.get(a.clip.trackId)?.order ?? -1) ||
      a.order - b.order)
    .map(({ clip }) => clip);
  const pad = previewWindow ? 1 : 0;
  return new TimelineIndex(clips, (clip) => ({
    start: clip.start - pad, end: clipEnd(clip) + pad, endInclusive: previewWindow,
  }));
}

export function captionTimelineIndex(p: Project) {
  return new TimelineIndex(p.captions.enabled ? captionGroups(p) : [], (group) => ({
    start: group[0].timelineStart, end: group.at(-1)!.timelineEnd,
  }));
}
