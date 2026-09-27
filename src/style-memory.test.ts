import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addMedia, createProject, type Project } from './model';
import { suggestCuts, type CutOptions } from './ai';
import { captionAppearance } from './caption-style';
import {
  STYLE_MEMORY_KEY,
  addMemoryExample,
  emptyStyleMemory,
  memoryObservation,
  mergeStyleMemory,
  readStyleMemory,
  rememberedCaptionStyle,
  rememberedCutOptions,
  setMemoryOutcome,
  validateStyleMemory,
  writeStyleMemory,
  type MemoryExample,
} from './style-memory';
import { useStyleMemory } from './style-memory-store';
import { useEditor } from './store';

vi.mock('idb-keyval', () => ({
  set: vi.fn(async () => undefined),
  get: vi.fn(async () => undefined),
}));
vi.mock('./proxies', () => ({ clearProxies: vi.fn() }));

const options = (): CutOptions => ({
  goal: 'Clean full video',
  count: 3,
  length: 25,
  pacing: 'Natural',
  reorder: false,
  composite: false,
  sensitivity: 50,
});
const example = (id: string, changes: Partial<MemoryExample> = {}): MemoryExample => ({
  ...memoryObservation(createProject(id), createProject(id), options(), true)!,
  id,
  projectId: id,
  date: '2026-09-27T10:00:00.000Z',
  ...changes,
});
const fixture = (): Project =>
  addMedia(createProject('Memory test'), {
    id: 'source',
    name: 'source.mp4',
    duration: 24,
    width: 1080,
    height: 1920,
    size: 1000,
    type: 'video/mp4',
  });

describe('local style memory', () => {
  it('records detached settings only, and captures the options used to generate a suggestion', () => {
    const p = fixture(),
      opts = options();
    const suggestions = suggestCuts(p, opts);
    expect(suggestions.length).toBeGreaterThan(0);
    opts.pacing = 'Hyper';
    expect(suggestions[0].sourceOptions?.pacing).toBe('Natural');
    const e = memoryObservation(p, p, suggestions[0].sourceOptions)!;
    expect(e.options?.pacing).toBe('Natural');
    expect(e.style).toBeUndefined();
    expect(e).not.toHaveProperty('media');
    expect(e).not.toHaveProperty('transcripts');
    expect(memoryObservation(p, p)).toBeUndefined();
    const styled = structuredClone(p);
    styled.captions.appearance = { ...captionAppearance(p.captions), color: '#ABCDEF' };
    const caption = memoryObservation(p, styled)!;
    styled.captions.appearance.color = '#000000';
    expect(caption.style?.appearance?.color).toBe('#abcdef');
    expect(caption.style).not.toHaveProperty('enabled');
  });

  it('requires two agreeing independent votes and separates format and Auto Cut goal', () => {
    const p = createProject(),
      a = example('a');
    let m = addMemoryExample(emptyStyleMemory(), a);
    m = addMemoryExample(m, { ...a, id: 'repeat' });
    expect(rememberedCutOptions(m, p, options().goal)).toBeUndefined();
    m = addMemoryExample(m, example('b', { options: { ...options(), pacing: 'Fast' } }));
    expect(rememberedCutOptions(m, p, options().goal)).toBeUndefined();
    m = addMemoryExample(m, example('c'));
    const learned = rememberedCutOptions(m, p, options().goal)!;
    expect(learned.examples.map((e) => e.projectId)).toEqual(['a', 'c']);
    expect(learned.total).toBe(3);
    expect(rememberedCutOptions(m, p, 'Remove silences')).toBeUndefined();
    expect(
      rememberedCutOptions(m, createProject('Landscape', 'YouTube'), options().goal),
    ).toBeUndefined();
    learned.value.pacing = 'Hyper';
    expect(m.examples[0].options?.pacing).toBe('Natural');
    // A distinct sequence is a distinct decision even within the same project.
    const sequences = {
      ...emptyStyleMemory(),
      examples: [a, { ...a, id: 'second-seq', sequenceId: 'seq2' }],
    };
    expect(rememberedCutOptions(sequences, p, options().goal)?.total).toBe(2);
  });

  it('restores the previous vote after undo, supports dismissing values, and never revives forgotten records', () => {
    const p = createProject(),
      a = example('a'),
      b = example('b');
    let m = { ...emptyStyleMemory(), examples: [a, b] };
    const previous = rememberedCutOptions(m, p, options().goal)!;
    m = addMemoryExample(m, {
      ...a,
      id: 'new-a',
      date: '2026-09-27T11:00:00.000Z',
      options: { ...options(), pacing: 'Hyper' },
    });
    expect(rememberedCutOptions(m, p, options().goal)).toBeUndefined();
    m = setMemoryOutcome(m, ['new-a'], 'undone');
    expect(rememberedCutOptions(m, p, options().goal)?.id).toBe(previous.id);
    m.dismissed = [previous.id];
    expect(rememberedCutOptions(m, p, options().goal)?.dismissed).toBe(true);
    expect(rememberedCaptionStyle(m, p)?.dismissed).toBe(false);
    m.examples = m.examples.filter((e) => e.id !== b.id);
    expect(setMemoryOutcome(m, [b.id], 'accepted').examples).toHaveLength(2);
  });

  it('uses the most common complete caption style with recency breaking ties', () => {
    const p = createProject(),
      red = { ...p.captions, appearance: { ...captionAppearance(p.captions), color: '#ff0000' } };
    const m = {
      ...emptyStyleMemory(),
      examples: [
        example('a'),
        example('b'),
        example('c', { style: red }),
        example('d', { style: red, date: '2026-09-27T11:00:00.000Z' }),
      ],
    };
    expect(rememberedCaptionStyle(m, p)?.value.appearance?.color).toBe('#ff0000');
    const validated = validateStyleMemory(m);
    validated.examples[0].style!.appearance!.color = '#FFFFFF';
    expect(rememberedCaptionStyle(validateStyleMemory(validated), p)?.total).toBe(4);
  });

  it('bounds, canonicalizes and validates imports; preserves current decisions and the learning switch', () => {
    const a = example('a'),
      current = { ...emptyStyleMemory(), examples: [{ ...a, state: 'undone' as const }] };
    const imported = { ...emptyStyleMemory(), enabled: true, examples: [a, example('b')] };
    const merged = mergeStyleMemory(current, JSON.stringify(imported));
    expect(merged.enabled).toBe(false);
    expect(merged.examples.find((e) => e.id === a.id)?.state).toBe('undone');
    expect(merged.examples).toHaveLength(2);
    const canonical = validateStyleMemory({
      ...imported,
      examples: [{ ...a, date: '2026-09-27T12:00:00+02:00', media: 'discard' }],
    });
    expect(canonical.examples[0].date).toBe('2026-09-27T10:00:00.000Z');
    expect(canonical.examples[0]).not.toHaveProperty('media');
    for (const bad of [
      { ...imported, version: 2 },
      { ...imported, examples: [a, a] },
      { ...imported, examples: [{ ...a, style: null }] },
      { ...imported, examples: [{ ...a, date: 'invalid' }] },
      { ...imported, examples: [{ ...a, options: { ...options(), sensitivity: NaN } }] },
      { ...imported, examples: [{ ...a, style: { ...a.style, wordsPerCaption: 500 } }] },
    ])
      expect(() => validateStyleMemory(bad)).toThrow();
    expect(() => mergeStyleMemory(current, 'x'.repeat(1_000_001))).toThrow('smaller than 1 MB');
    let full = emptyStyleMemory();
    for (let i = 0; i < 102; i++) full = addMemoryExample(full, { ...a, id: `id-${i}` });
    expect(full.examples).toHaveLength(100);
    expect(full.examples[0].id).toBe('id-2');
  });

  it('round-trips local storage and surfaces corrupt or unsavable memory', () => {
    const values = new Map<string, string>(),
      storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
      };
    expect(readStyleMemory(storage).enabled).toBe(false);
    const m = { ...emptyStyleMemory(), examples: [example('a')] };
    const saved = writeStyleMemory(m, storage);
    expect(readStyleMemory(storage)).toEqual(saved);
    values.set(STYLE_MEMORY_KEY, 'corrupt');
    expect(() => readStyleMemory(storage)).toThrow();
    expect(() =>
      writeStyleMemory(m, {
        setItem: () => {
          throw new Error('quota');
        },
      }),
    ).toThrow('quota');
  });
});

describe('editor history and style memory integration', () => {
  let values: Map<string, string>;
  const commitStyle = (preset: 'Clean' | 'Bold' | 'Brainrot', ai = true) => {
    const editor = useEditor.getState();
    editor.commit(
      { ...editor.project, captions: { ...editor.project.captions, preset } },
      `Style ${preset}`,
      ai,
      options(),
    );
  };
  beforeEach(() => {
    values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    });
    const project = fixture();
    project.captions.preset = 'Clean';
    useEditor.setState({ project, past: [], future: [], selected: [] });
    useStyleMemory.setState({
      memory: { ...emptyStyleMemory(), enabled: true },
      error: '',
      unreadable: false,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('tracks accepted, undone and redone edits with one persistent observation per edit', () => {
    commitStyle('Bold');
    const id = useEditor.getState().past[0].memoryId;
    expect(id).toBeTruthy();
    expect(useStyleMemory.getState().memory.examples[0]).toMatchObject({ id, state: 'accepted' });
    useEditor.getState().undo();
    expect(useEditor.getState().project.captions.preset).toBe('Clean');
    expect(readStyleMemory().examples[0].state).toBe('undone');
    expect(useEditor.getState().future[0].memoryId).toBe(id);
    useEditor.getState().redo();
    expect(useEditor.getState().project.captions.preset).toBe('Bold');
    expect(readStyleMemory().examples).toHaveLength(1);
    expect(readStyleMemory().examples[0].state).toBe('accepted');
  });

  it('reverts multiple AI edits and restores only the observations actually redone', () => {
    commitStyle('Bold');
    commitStyle('Clean', false);
    commitStyle('Brainrot');
    expect(useStyleMemory.getState().memory.examples).toHaveLength(2);
    useEditor.getState().revertAI(true);
    expect(useStyleMemory.getState().memory.examples.map((e) => e.state)).toEqual([
      'undone',
      'undone',
    ]);
    useEditor.getState().redo();
    useEditor.getState().redo(); // Manual edit has no memory observation.
    expect(useStyleMemory.getState().memory.examples.map((e) => e.state)).toEqual([
      'accepted',
      'undone',
    ]);
    useEditor.getState().redo();
    expect(useStyleMemory.getState().memory.examples.map((e) => e.state)).toEqual([
      'accepted',
      'accepted',
    ]);
  });

  it('does not learn while disabled, from manual changes or after an explicit forget/reset', () => {
    useStyleMemory.getState().change((m) => ({ ...m, enabled: false }));
    commitStyle('Bold');
    expect(useStyleMemory.getState().memory.examples).toHaveLength(0);
    useStyleMemory.getState().change((m) => ({ ...m, enabled: true }));
    commitStyle('Clean', false);
    expect(useStyleMemory.getState().memory.examples).toHaveLength(0);
    commitStyle('Bold');
    useEditor.getState().undo();
    useStyleMemory.getState().reset();
    useEditor.getState().redo();
    expect(useStyleMemory.getState().memory).toEqual(emptyStyleMemory());
    expect(readStyleMemory()).toEqual(emptyStyleMemory());
  });

  it('preserves editing and history outcomes when storage fails, then retries the latest state', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('Quota exceeded');
      },
    });
    commitStyle('Bold');
    expect(useEditor.getState().project.captions.preset).toBe('Bold');
    expect(useStyleMemory.getState().error).toContain('not saved');
    useEditor.getState().undo();
    expect(useStyleMemory.getState().memory.examples[0].state).toBe('undone');
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    });
    expect(useStyleMemory.getState().retry()).toBe(true);
    expect(readStyleMemory().examples[0].state).toBe('undone');
    expect(useStyleMemory.getState().error).toBe('');
  });
});
