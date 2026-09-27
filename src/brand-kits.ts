import { captionAppearance } from './caption-style';
import { createProject, uid, validateProject, type CaptionStyle, type Project } from './model';

export const BRAND_KITS_KEY = 'frostcut-brand-kits-v1';
export type BrandExample = { key: string; label: string; style: CaptionStyle };
export type BrandKit = {
  version: 1;
  id: string;
  name: string;
  style: CaptionStyle;
  examples: BrandExample[];
};
const fail = (): never => {
  throw new Error('This brand kit contains invalid or unsupported settings.');
};
const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' && !!v.trim() && v.length <= max;

/** Canonical, validated style only: never copy media, language, captions or saved presets. */
export function brandStyle(value: unknown): CaptionStyle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const input = value as CaptionStyle;
  const p = createProject();
  p.captions = {
    ...p.captions,
    preset: input.preset,
    intensity: input.intensity,
    wordsPerCaption: input.wordsPerCaption,
    position: input.position,
    customPosition: input.customPosition,
    emoji: input.emoji ?? 'None',
    appearance: input.appearance,
  };
  try {
    validateProject(p);
  } catch {
    return fail();
  }
  const appearance = captionAppearance(p.captions);
  for (const key of ['color', 'accent', 'outlineColor', 'boxColor'] as const)
    if (appearance[key]) appearance[key] = appearance[key]!.toLowerCase();
  return {
    preset: p.captions.preset,
    intensity: p.captions.intensity,
    wordsPerCaption: p.captions.wordsPerCaption,
    position: p.captions.position,
    customPosition:
      p.captions.position === 'custom' && input.customPosition
        ? { x: input.customPosition.x, y: input.customPosition.y }
        : undefined,
    emoji: p.captions.emoji,
    appearance,
  };
}
export function validateBrandKit(value: unknown): BrandKit {
  if (!value || typeof value !== 'object') return fail();
  const kit = value as BrandKit;
  if (
    kit.version !== 1 ||
    !text(kit.id, 100) ||
    !text(kit.name, 60) ||
    !Array.isArray(kit.examples) ||
    kit.examples.length > 20
  )
    return fail();
  const examples = kit.examples.map((e) => {
    if (!e || !text(e.key, 500) || !text(e.label, 120)) return fail();
    return { key: e.key, label: e.label, style: brandStyle(e.style) };
  });
  if (new Set(examples.map((e) => e.key)).size !== examples.length) return fail();
  return { version: 1, id: kit.id, name: kit.name.trim(), style: brandStyle(kit.style), examples };
}
export function approvedExample(p: Project): BrandExample {
  const sequence = p.sequences?.find((s) => s.id === p.activeSequenceId)?.name;
  return {
    key: JSON.stringify([p.id, p.activeSequenceId ?? null]),
    label: `${p.name}${sequence ? ` · ${sequence}` : ''}`.slice(0, 120),
    style: brandStyle(p.captions),
  };
}
export function createBrandKit(name: string, p: Project): BrandKit {
  const example = approvedExample(p);
  return validateBrandKit({
    version: 1,
    id: uid(),
    name,
    style: example.style,
    examples: [example],
  });
}
export function addBrandExample(kit: BrandKit, p: Project): BrandKit {
  const sample = approvedExample(p);
  const examples = kit.examples.filter((e) => e.key !== sample.key);
  if (examples.length >= 20)
    throw new Error('Remove an approved example before adding another (maximum 20).');
  // Recapturing one sequence updates its vote, rather than biasing the learned preference.
  return validateBrandKit({ ...kit, examples: [...examples, sample] });
}
/** Select an observed, coherent style. Ties prefer the most recently approved example. */
export function learnedBrandStyle(kit: BrandKit) {
  const groups = new Map<string, { style: CaptionStyle; labels: string[]; recent: number }>();
  kit.examples.forEach((sample, index) => {
    const style = brandStyle(sample.style),
      key = JSON.stringify(style);
    const group = groups.get(key) ?? { style, labels: [], recent: index };
    group.labels.push(sample.label);
    group.recent = index;
    groups.set(key, group);
  });
  return [...groups.values()].sort(
    (a, b) => b.labels.length - a.labels.length || b.recent - a.recent,
  )[0];
}
export function applyBrandKit(p: Project, kit: BrandKit): Project {
  return { ...p, captions: { ...p.captions, ...brandStyle(kit.style) } };
}
function validateLibrary(value: unknown): BrandKit[] {
  if (!Array.isArray(value)) return fail();
  if (value.length > 20) throw new Error('Remove a brand kit before adding another (maximum 20).');
  const kits = value.map(validateBrandKit);
  if (new Set(kits.map((k) => k.id)).size !== kits.length) return fail();
  if (new Set(kits.map((k) => k.name.toLowerCase())).size !== kits.length)
    throw new Error('Choose a different brand kit name.');
  return kits;
}
export function readBrandKits(storage: Pick<Storage, 'getItem'> = localStorage): BrandKit[] {
  const saved = storage.getItem(BRAND_KITS_KEY);
  if (!saved) return [];
  if (saved.length > 2_000_000) return fail();
  return validateLibrary(JSON.parse(saved));
}
export function saveBrandKits(kits: BrandKit[], storage: Pick<Storage, 'setItem'> = localStorage) {
  const checked = validateLibrary(kits);
  storage.setItem(BRAND_KITS_KEY, JSON.stringify(checked));
  return checked;
}
export function importBrandKit(content: string, existing: BrandKit[]): BrandKit {
  if (content.length > 100_000)
    throw new Error('This brand kit file is too large (maximum 100 KB).');
  const kit = validateBrandKit(JSON.parse(content));
  let name = kit.name;
  for (let count = 1; existing.some((k) => k.name.toLowerCase() === name.toLowerCase()); count++)
    name = `${kit.name.slice(0, 45)} (imported ${count})`;
  return { ...kit, id: uid(), name };
}
