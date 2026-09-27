import type { CutOptions } from './ai';
import { brandStyle } from './brand-kits';
import { uid, type CaptionStyle, type Project } from './model';

export const STYLE_MEMORY_KEY = 'frostcut-style-memory-v1';
export type MemoryExample = {
  id: string;
  projectId: string;
  sequenceId: string;
  projectName: string;
  date: string;
  format: 'portrait' | 'landscape' | 'square';
  state: 'accepted' | 'undone';
  options?: CutOptions;
  style?: CaptionStyle;
};
export type StyleMemory = {
  version: 1;
  enabled: boolean;
  examples: MemoryExample[];
  dismissed: string[];
};
export const emptyStyleMemory = (): StyleMemory => ({
  version: 1,
  enabled: false,
  examples: [],
  dismissed: [],
});
export function memoryFormat(p: Project): MemoryExample['format'] {
  return p.settings.width === p.settings.height
    ? 'square'
    : p.settings.width > p.settings.height
      ? 'landscape'
      : 'portrait';
}
export function validMemoryOptions(value: unknown): value is CutOptions {
  if (!value || typeof value !== 'object') return false;
  const o = value as CutOptions;
  return (
    [
      'Short-form clips',
      'Clean full video',
      'Highlights only',
      'Remove silences',
      'Custom',
    ].includes(o.goal) &&
    [0, 3, 5, 10].includes(o.count) &&
    [0, 14, 25, 45, 75].includes(o.length) &&
    ['Natural', 'Fast', 'Hyper'].includes(o.pacing) &&
    typeof o.reorder === 'boolean' &&
    typeof o.composite === 'boolean' &&
    typeof o.sensitivity === 'number' &&
    Number.isFinite(o.sensitivity) &&
    o.sensitivity >= 0 &&
    o.sensitivity <= 100
  );
}
function optionsOnly(o: CutOptions): CutOptions {
  return {
    goal: o.goal,
    count: o.count,
    length: o.length,
    pacing: o.pacing,
    reorder: o.reorder,
    composite: o.composite,
    sensitivity: o.sensitivity,
  };
}
export function memoryObservation(
  before: Project,
  after: Project,
  options?: CutOptions,
  approveStyle = false,
): MemoryExample | undefined {
  const oldStyle = brandStyle(before.captions),
    style = brandStyle(after.captions);
  const changedStyle = approveStyle || JSON.stringify(oldStyle) !== JSON.stringify(style);
  if (!changedStyle && !validMemoryOptions(options)) return;
  return {
    id: uid(),
    projectId: before.id,
    sequenceId: before.activeSequenceId ?? 'original',
    projectName: before.name.slice(0, 120),
    date: new Date().toISOString(),
    format: memoryFormat(before),
    state: 'accepted',
    ...(validMemoryOptions(options) ? { options: optionsOnly(options) } : {}),
    ...(changedStyle ? { style } : {}),
  };
}
export function validateStyleMemory(value: unknown): StyleMemory {
  const fail = (): never => {
    throw new Error('This style memory contains invalid or unsupported data.');
  };
  if (!value || typeof value !== 'object') return fail();
  const m = value as StyleMemory;
  const text = (s: unknown, max: number): s is string =>
    typeof s === 'string' && !!s.trim() && s.length <= max;
  if (
    m.version !== 1 ||
    typeof m.enabled !== 'boolean' ||
    !Array.isArray(m.examples) ||
    m.examples.length > 100 ||
    !Array.isArray(m.dismissed) ||
    m.dismissed.length > 100 ||
    m.dismissed.some((s) => !text(s, 100))
  )
    return fail();
  const examples = m.examples.map((e) => {
    if (
      !e ||
      !text(e.id, 100) ||
      !text(e.projectId, 100) ||
      !text(e.sequenceId, 100) ||
      !text(e.projectName, 120) ||
      !text(e.date, 40) ||
      !Number.isFinite(Date.parse(e.date)) ||
      !['portrait', 'landscape', 'square'].includes(e.format) ||
      !['accepted', 'undone'].includes(e.state) ||
      (e.options === undefined && e.style === undefined) ||
      (e.options !== undefined && !validMemoryOptions(e.options))
    )
      return fail();
    return {
      id: e.id,
      projectId: e.projectId,
      sequenceId: e.sequenceId,
      projectName: e.projectName,
      date: new Date(e.date).toISOString(),
      format: e.format,
      state: e.state,
      ...(e.options ? { options: optionsOnly(e.options) } : {}),
      ...(e.style !== undefined ? { style: brandStyle(e.style) } : {}),
    };
  });
  if (new Set(examples.map((e) => e.id)).size !== examples.length) return fail();
  return { version: 1, enabled: m.enabled, examples, dismissed: [...new Set(m.dismissed)] };
}
export function addMemoryExample(m: StyleMemory, e: MemoryExample): StyleMemory {
  return { ...m, examples: [...m.examples.filter((x) => x.id !== e.id), e].slice(-100) };
}
export function setMemoryOutcome(
  m: StyleMemory,
  ids: string[],
  state: MemoryExample['state'],
): StyleMemory {
  const selected = new Set(ids);
  // Forget/reset must remain effective: undo/redo never recreate removed observations.
  return { ...m, examples: m.examples.map((e) => (selected.has(e.id) ? { ...e, state } : e)) };
}
function preferenceId(kind: string, format: string, value: unknown) {
  const json = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < json.length; i++) hash = Math.imul(hash ^ json.charCodeAt(i), 16777619);
  return `${kind}:${format}:${json.length}:${hash >>> 0}`;
}
function learn<T>(
  m: StyleMemory,
  format: string,
  kind: string,
  select: (e: MemoryExample) => T | undefined,
) {
  // One current vote per project/sequence; repeated clicks in one edit cannot dominate memory.
  const latest = new Map<string, { example: MemoryExample; value: T }>();
  for (const example of [...m.examples].sort((a, b) => a.date.localeCompare(b.date))) {
    const value = select(example);
    if (example.state !== 'accepted' || example.format !== format || value === undefined) continue;
    latest.set(JSON.stringify([example.projectId, example.sequenceId]), { example, value });
  }
  if (latest.size < 2) return;
  const groups = new Map<string, { value: T; examples: MemoryExample[]; latest: string }>();
  for (const { example, value } of latest.values()) {
    const key = JSON.stringify(value),
      group = groups.get(key) ?? { value, examples: [], latest: example.date };
    group.examples.push(example);
    group.latest = example.date > group.latest ? example.date : group.latest;
    groups.set(key, group);
  }
  const best = [...groups.values()].sort(
    (a, b) => b.examples.length - a.examples.length || b.latest.localeCompare(a.latest),
  )[0];
  if (best.examples.length < 2) return;
  const id = preferenceId(kind, format, best.value);
  return {
    id,
    value: structuredClone(best.value),
    examples: best.examples,
    total: latest.size,
    dismissed: m.dismissed.includes(id),
  };
}
export function rememberedCutOptions(m: StyleMemory, p: Project, goal: string) {
  return learn(m, memoryFormat(p), 'cut', (e) =>
    e.options?.goal === goal ? e.options : undefined,
  );
}
export function rememberedCaptionStyle(m: StyleMemory, p: Project) {
  return learn(m, memoryFormat(p), 'captions', (e) => e.style);
}
export function readStyleMemory(storage: Pick<Storage, 'getItem'> = localStorage) {
  const saved = storage.getItem(STYLE_MEMORY_KEY);
  if (!saved) return emptyStyleMemory();
  if (saved.length > 1_000_000)
    throw new Error('The saved style memory is too large. Restore a smaller backup.');
  return validateStyleMemory(JSON.parse(saved));
}
export function writeStyleMemory(m: StyleMemory, storage: Pick<Storage, 'setItem'> = localStorage) {
  const checked = validateStyleMemory(m);
  storage.setItem(STYLE_MEMORY_KEY, JSON.stringify(checked));
  return checked;
}
export function mergeStyleMemory(current: StyleMemory, content: string): StyleMemory {
  if (content.length > 1_000_000)
    throw new Error('Choose a style memory JSON file smaller than 1 MB.');
  const imported = validateStyleMemory(JSON.parse(content));
  const examples = new Map([...imported.examples, ...current.examples].map((e) => [e.id, e]));
  return {
    ...current,
    examples: [...examples.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-100),
    dismissed: [...new Set([...imported.dismissed, ...current.dismissed])].slice(-100),
  };
}
