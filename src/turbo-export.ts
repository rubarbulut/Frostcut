import { type Project } from './model';
import { createAss } from './media';

/**
 * Checks whether the local Turbo Hardware Export engine is running and accessible.
 */
export async function checkTurboEngine(): Promise<boolean> {
  try {
    const res = await fetch('/api/turbo-health', {
      method: 'GET',
      signal: 'timeout' in AbortSignal ? (AbortSignal as any).timeout(2000) : undefined,
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.turbo;
  } catch {
    return false;
  }
}

/**
 * Attempts to render the project using the native Turbo Hardware FFmpeg engine.
 * Returns the rendered Blob, or null if the turbo engine is unavailable or not supported.
 */
export async function tryTurboExport(
  project: Project,
  mediaFiles: Map<string, File>,
  signal: AbortSignal,
  onProgress: (message: string, value?: number) => void,
): Promise<Blob | null> {
  // Check engine availability first
  const isAvailable = await checkTurboEngine();
  if (!isAvailable || signal.aborted) return null;

  try {
    onProgress('Connecting to Turbo Hardware Render Engine…', 10);

    const formData = new FormData();
    formData.append('project', JSON.stringify(project));

    const w = Math.round((project.exportSettings?.width || project.settings?.width || 1080) / 2) * 2;
    const h = Math.round((project.exportSettings?.height || project.settings?.height || 1920) / 2) * 2;

    // Generate ASS subtitle script if captions are enabled
    if (project.captions?.enabled) {
      try {
        const ass = createAss(project, w, h);
        formData.append('ass', ass);
      } catch {}
    }

    // Append all required source files
    const usedMediaIds = new Set(project.clips.map((c) => c.mediaId));
    for (const mediaId of usedMediaIds) {
      const file = mediaFiles.get(mediaId);
      if (!file) return null; // Missing source, cannot turbo export
      formData.append(`media_${mediaId}`, file, file.name);
    }

    onProgress('Rendering with GPU Hardware Acceleration…', 45);

    const res = await fetch('/api/turbo-export', {
      method: 'POST',
      body: formData,
      signal,
    });

    if (!res.ok) {
      return null;
    }

    onProgress('Packaging MP4 video…', 90);
    const blob = await res.blob();
    if (!blob || blob.size === 0) return null;

    onProgress('Export complete!', 100);
    return blob;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    // Fall back to in-browser engine on any unexpected network/server error
    return null;
  }
}
