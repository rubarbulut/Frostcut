import { create } from 'zustand';
import type { Project } from './model';
import type { CutOptions } from './ai';
import {
  addMemoryExample,
  emptyStyleMemory,
  memoryObservation,
  readStyleMemory,
  setMemoryOutcome,
  validateStyleMemory,
  writeStyleMemory,
  type StyleMemory,
} from './style-memory';

function initial() {
  if (typeof localStorage === 'undefined')
    return { memory: emptyStyleMemory(), error: '', unreadable: false };
  try {
    return { memory: readStyleMemory(), error: '', unreadable: false };
  } catch {
    return {
      memory: emptyStyleMemory(),
      error:
        'Saved style memory could not be read. Reset it explicitly before recording new preferences.',
      unreadable: true,
    };
  }
}
type State = ReturnType<typeof initial> & {
  change: (fn: (memory: StyleMemory) => StyleMemory) => boolean;
  reset: () => boolean;
  retry: () => boolean;
};
export const useStyleMemory = create<State>((set, get) => {
  const persist = (memory: StyleMemory) => {
    try {
      writeStyleMemory(memory);
      set({ memory, error: '', unreadable: false });
      return true;
    } catch (e) {
      // Keep undo/redo outcomes correct in this session even if browser storage is unavailable.
      set({
        memory,
        error: `Style memory is not saved: ${e instanceof Error ? e.message : String(e)}`,
      });
      return false;
    }
  };
  return {
    ...initial(),
    change: (fn) => {
      if (get().unreadable) return false;
      try {
        return persist(validateStyleMemory(fn(get().memory)));
      } catch (e) {
        set({ error: (e as Error).message });
        return false;
      }
    },
    reset: () => persist(emptyStyleMemory()),
    retry: () => (get().unreadable ? false : persist(get().memory)),
  };
});
export function rememberAcceptedEdit(
  before: Project,
  after: Project,
  options?: CutOptions,
  approveStyle = false,
) {
  const state = useStyleMemory.getState();
  if (!state.memory.enabled || state.unreadable) return;
  try {
    const example = memoryObservation(before, after, options, approveStyle);
    if (!example) return;
    state.change((m) => addMemoryExample(m, example));
    return example.id;
  } catch {
    return;
  } // Learning never prevents a user's actual project edit.
}
export function rememberHistoryOutcome(ids: (string | undefined)[], state: 'accepted' | 'undone') {
  const selected = ids.filter((id): id is string => !!id);
  if (!selected.length) return;
  const store = useStyleMemory.getState();
  if (!store.memory.examples.some((e) => selected.includes(e.id) && e.state !== state)) return;
  store.change((m) => setMemoryOutcome(m, selected, state));
}
