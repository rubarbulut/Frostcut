import { safeFilename } from './zip';

export type ExportFolder = {
  name: string;
  requestPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
  getFileHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
      abort: () => Promise<void>;
    }>;
  }>;
};
type PickerWindow = {
  showDirectoryPicker?: (options: {
    id: string;
    mode: 'readwrite';
    startIn: 'downloads';
  }) => Promise<ExportFolder>;
};
export const supportsExportFolder = () =>
  typeof window !== 'undefined' &&
  typeof (window as unknown as PickerWindow).showDirectoryPicker === 'function';
export function chooseExportFolder() {
  const picker = (window as unknown as PickerWindow).showDirectoryPicker;
  if (!picker)
    throw new Error('Folder selection is unavailable in this browser. Use browser downloads.');
  return picker.call(window, { id: 'frostcut-exports', mode: 'readwrite', startIn: 'downloads' });
}
export function exportFilename(name: string, extension: 'mp4' | 'zip') {
  let stem = name.trim().replace(new RegExp(`\\.${extension}$`, 'i'), '');
  stem = safeFilename(stem).replace(/[. ]+$/g, '') || 'FrostCut';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = `_${stem}`;
  return `${stem}.${extension}`;
}
export function isSaveCancelled(error: unknown) {
  return !!error && typeof error === 'object' && 'name' in error && error.name === 'AbortError';
}

/** Reuse a rendered Blob; choose a numbered name rather than overwrite an existing output. */
export async function saveInExportFolder(
  folder: ExportFolder,
  name: string,
  blob: Blob,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (
    folder.requestPermission &&
    (await folder.requestPermission({ mode: 'readwrite' })) !== 'granted'
  )
    throw new Error(
      'Folder access was not granted. Choose a folder again or use browser downloads.',
    );
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  let candidate = '';
  for (let n = 0; n < 1000; n++) {
    signal?.throwIfAborted();
    const next = n ? `${stem} (${n})${extension}` : name;
    try {
      await folder.getFileHandle(next);
    } catch (error) {
      const code = (error as { name?: string }).name;
      if (code === 'NotFoundError') {
        candidate = next;
        break;
      }
      if (code !== 'TypeMismatchError') throw error;
    }
  }
  if (!candidate)
    throw new Error('Too many files share this name. Choose a different output name.');
  signal?.throwIfAborted();
  const handle = await folder.getFileHandle(candidate, { create: true });
  signal?.throwIfAborted();
  const writer = await handle.createWritable();
  const abort = () => {
    void writer.abort().catch(() => {});
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    await writer.write(blob);
    signal?.throwIfAborted();
    await writer.close();
    return candidate;
  } catch (error) {
    await writer.abort().catch(() => {});
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}
