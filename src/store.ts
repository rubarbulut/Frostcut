import { create } from 'zustand';
import { set, get } from 'idb-keyval';
import { createProject, type Project, type MediaAsset, type Clip, validateProject } from './model';
import { syncSequence } from './sequences';
import { clearProxies } from './proxies';
import type { CutOptions } from './ai';
import { rememberAcceptedEdit, rememberHistoryOutcome } from './style-memory-store';
export const mediaFiles = new Map<string, File>();
export const mediaUrls = new Map<string, string>();
export const mediaThumbnails = new Map<string, string>();
export const audioWaveforms = new Map<string, number[]>();
export function registerMedia(asset: MediaAsset, file: File) {
  clearProxies(asset.id);
  const old = mediaUrls.get(asset.id);
  if (old) URL.revokeObjectURL(old);
  mediaFiles.set(asset.id, file);
  const url = URL.createObjectURL(file);
  mediaUrls.set(asset.id, url);
  audioWaveforms.delete(asset.id);
  mediaThumbnails.delete(asset.id);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;
  const cleanup = () => {
    video.removeAttribute('src');
    video.load();
  };
  const timeout = setTimeout(cleanup, 10000);
  video.onloadeddata = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = Math.round((160 * asset.height) / asset.width);
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (ctx) mediaThumbnails.set(asset.id, canvas.toDataURL('image/jpeg', 0.6));
      useEditor.getState().mediaChanged();
    } catch {
      /* Thumbnail is optional; playback still uses the source. */
    } finally {
      clearTimeout(timeout);
      cleanup();
    }
  };
  video.onerror = () => {
    clearTimeout(timeout);
    cleanup();
  };
}
export function unregisterMedia(assetId: string) {
  clearProxies(assetId);
  const old = mediaUrls.get(assetId);
  if (old) URL.revokeObjectURL(old);
  mediaUrls.delete(assetId);
  mediaFiles.delete(assetId);
  mediaThumbnails.delete(assetId);
  audioWaveforms.delete(assetId);
  useEditor.getState().mediaChanged();
}
type History = { project: Project; label: string; ai: boolean; memoryId?: string };
type State = {
  previewClip?: Clip;
  setPreviewClip: (clip?: Clip) => void;
  captionSelection: { clipId: string; wordIds: string[]; start?: number } | null;
  selectCaption: (selection: State['captionSelection']) => void;
  project: Project;
  past: History[];
  future: History[];
  selected: string[];
  playhead: number;
  playing: boolean;
  previewRate: number;
  setPreviewRate: (rate: number) => void;
  saveStatus: string;
  mediaRevision: number;
  commit: (p: Project, label?: string, ai?: boolean, sourceOptions?: CutOptions) => void;
  undo: () => void;
  redo: () => void;
  revertAI: (all?: boolean) => void;
  load: (p: Project) => void;
  select: (ids: string[]) => void;
  seek: (time: number) => void;
  setPlaying: (value: boolean) => void;
  mediaChanged: () => void;
};
let saveQueue: Promise<unknown> = Promise.resolve();
function persist(project: Project) {
  const snapshot = structuredClone(project);
  useEditor.setState({ saveStatus: 'Saving…' });
  saveQueue = saveQueue
    .catch(() => {})
    .then(() => set('frostcut-project-v1', snapshot))
    .then(() => useEditor.setState({ saveStatus: 'Saved locally' }))
    .catch(() => useEditor.setState({ saveStatus: 'Autosave unavailable — save a project file' }));
}
export const useEditor = create<State>((setState, getState) => ({
  previewClip: undefined,
  setPreviewClip: (previewClip) => setState({ previewClip }),
  captionSelection: null,
  selectCaption: (captionSelection) =>
    setState({ captionSelection, playing: false, ...(captionSelection ? { selected: [] } : {}) }),
  project: createProject(),
  past: [],
  future: [],
  selected: [],
  playhead: 0,
  playing: false,
  previewRate: 1,
  setPreviewRate: (rate) => {
    if (Number.isFinite(rate)) setState({ previewRate: Math.max(0.5, Math.min(4, rate)) });
  },
  saveStatus: 'Saved locally',
  mediaRevision: 0,
  commit: (p, label = 'Edit', ai = false, sourceOptions) => {
    const s = getState();
    if (JSON.stringify(p) === JSON.stringify(s.project)) return;
    const changedTiming =
      JSON.stringify(
        p.clips.map((c) => [
          c.id,
          c.trackId,
          c.start,
          c.sourceStart,
          c.sourceEnd,
          c.properties.speed,
        ]),
      ) !==
      JSON.stringify(
        s.project.clips.map((c) => [
          c.id,
          c.trackId,
          c.start,
          c.sourceStart,
          c.sourceEnd,
          c.properties.speed,
        ]),
      );
    const suggestions =
      changedTiming &&
      p.activeSequenceId === s.project.activeSequenceId &&
      JSON.stringify(p.suggestions) === JSON.stringify(s.project.suggestions)
        ? []
        : p.suggestions;
    const updatedAt = new Date().toISOString();
    const project = syncSequence({
      ...p,
      suggestions,
      updatedAt,
      ...(ai
        ? {
            appliedEdits: [
              ...(p.appliedEdits ?? []).slice(-199),
              {
                label,
                date: updatedAt,
                sequenceId: p.activeSequenceId,
              },
            ],
          }
        : {}),
    });
    const memoryId = ai ? rememberAcceptedEdit(s.project, project, sourceOptions) : undefined;
    setState({
      project,
      previewClip: undefined,
      past: [...s.past.slice(-79), { project: s.project, label, ai, memoryId }],
      future: [],
    });
    persist(project);
  },
  undo: () => {
    const s = getState(),
      last = s.past.at(-1);
    if (!last) return;
    setState({
      project: last.project,
      previewClip: undefined,
      past: s.past.slice(0, -1),
      future: [
        ...s.future,
        { project: s.project, label: last.label, ai: last.ai, memoryId: last.memoryId },
      ],
      playing: false,
      selected: [],
    });
    rememberHistoryOutcome([last.memoryId], 'undone');
    persist(last.project);
  },
  redo: () => {
    const s = getState(),
      last = s.future.at(-1);
    if (!last) return;
    setState({
      project: last.project,
      previewClip: undefined,
      future: s.future.slice(0, -1),
      past: [
        ...s.past,
        { project: s.project, label: last.label, ai: last.ai, memoryId: last.memoryId },
      ],
      playing: false,
      selected: [],
    });
    rememberHistoryOutcome([last.memoryId], 'accepted');
    persist(last.project);
  },
  revertAI: (all = false) => {
    const s = getState();
    const index = all ? s.past.findIndex((h) => h.ai) : s.past.map((h) => h.ai).lastIndexOf(true);
    if (index < 0) return;
    const target = s.past[index].project;
    setState({
      project: target,
      previewClip: undefined,
      past: s.past.slice(0, index),
      future: [
        ...s.future,
        ...s.past
          .slice(index)
          .map((h, i) => ({ ...h, project: s.past[index + i + 1]?.project ?? s.project }))
          .reverse(),
      ],
      selected: [],
      playing: false,
    });
    rememberHistoryOutcome(
      s.past.slice(index).map((h) => h.memoryId),
      'undone',
    );
    persist(target);
  },
  load: (project) => {
    setState({ previewClip: undefined });
    for (const [id, url] of mediaUrls) {
      if (!project.media.some((m) => m.id === id)) {
        clearProxies(id);
        URL.revokeObjectURL(url);
        mediaUrls.delete(id);
        mediaFiles.delete(id);
        mediaThumbnails.delete(id);
        audioWaveforms.delete(id);
      }
    }
    setState({
      project,
      past: [],
      future: [],
      selected: [],
      playhead: 0,
      playing: false,
      captionSelection: null,
    });
    persist(project);
  },
  select: (selected) => setState({ selected }),
  seek: (playhead) => setState({ playhead: Math.max(0, playhead) }),
  setPlaying: (playing) => setState({ playing }),
  mediaChanged: () => setState((s) => ({ mediaRevision: s.mediaRevision + 1 })),
}));
export async function restoreProject(): Promise<Project | undefined> {
  try {
    const p = await get('frostcut-project-v1');
    return p ? validateProject(p) : undefined;
  } catch {
    return undefined;
  }
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function saveProject() {
  const p = useEditor.getState().project;
  downloadBlob(
    new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }),
    `${p.name.replace(/[^\w -]/g, '_')}.frostcut.json`,
  );
}
