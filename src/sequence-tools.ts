import type { Project, CaptionStyle } from './model';
import { sequenceViews, syncSequence } from './sequences';

export type PartNaming = { prefix: string; start: number; digits: number };

export function partNamePreview(p: Project, ids: string[], naming: PartNaming) {
  const selected = new Set(ids);
  const parts = sequenceViews(p).filter((s) => selected.has(s.id));
  if (!parts.length) throw new Error('Select at least one part.');
  if (parts.length !== selected.size) throw new Error('A selected part is no longer available.');
  if (!naming.prefix.trim()) throw new Error('Enter a series name or prefix.');
  if (!Number.isInteger(naming.start) || naming.start < 0 || naming.start > 9999)
    throw new Error('Start numbering between 0 and 9999.');
  if (!Number.isInteger(naming.digits) || naming.digits < 1 || naming.digits > 4)
    throw new Error('Use 1 to 4 numbering digits.');
  return parts.map((part, index) => {
    const name = `${naming.prefix.trim()} ${String(naming.start + index).padStart(naming.digits, '0')}`;
    if (name.length > 80)
      throw new Error('Shorten the prefix: part names can contain up to 80 characters.');
    return { id: part.id, previous: part.name, name };
  });
}

export function renameParts(p: Project, ids: string[], naming: PartNaming): Project {
  const names = new Map(partNamePreview(p, ids, naming).map((item) => [item.id, item.name]));
  const current = syncSequence(p);
  return {
    ...current,
    sequences: current.sequences!.map((s) =>
      names.has(s.id) ? { ...s, name: names.get(s.id)! } : s,
    ),
  };
}

/** Copy presentation only; keep each part's words, language, timing and saved presets. */
export function copyCaptionStyle(p: Project, sourceId: string, ids: string[]): Project {
  const current = syncSequence(p);
  const source = current.sequences?.find((s) => s.id === sourceId);
  if (!source) throw new Error('Choose an available source part.');
  const targets = new Set(ids.filter((id) => id !== sourceId));
  if (!targets.size) throw new Error('Select at least one other part.');
  if ([...targets].some((id) => !current.sequences!.some((s) => s.id === id)))
    throw new Error('A selected part is no longer available.');
  const {
    preset,
    intensity,
    wordsPerCaption,
    position,
    customPosition,
    emoji,
    appearance,
    safeArea,
  } = source.captions;
  const style: CaptionStyle & { safeArea: boolean } = {
    preset,
    intensity,
    wordsPerCaption,
    position,
    customPosition,
    emoji,
    appearance,
    safeArea,
  };
  const sequences = current.sequences!.map((s) =>
    targets.has(s.id) ? { ...s, captions: { ...s.captions, ...structuredClone(style) } } : s,
  );
  return {
    ...current,
    sequences,
    captions:
      sequences.find((s) => s.id === current.activeSequenceId)?.captions ?? current.captions,
  };
}
