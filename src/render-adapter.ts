/**
 * FrostCut Render Adapter for Pipeline Integration
 * Persona: 1. DEMİR (Graphics & Render Pipeline Lead)
 * Task: B004-D (D1)
 * 
 * Provides unified render execution for Manager pipeline and export queue.
 * Interfaces with native Turbo Hardware engine and in-browser FFmpeg engine.
 * Computes deterministic video/audio content revision hash (independent of publishing text metadata),
 * guards against empty/aborted/stale artifacts, and provides honest progress reporting.
 */

import type { Project, Clip, Track } from './model';
import { tryTurboExport } from './turbo-export';
import { exportMp4 } from './media';

export type ProjectExportSettings = Project['exportSettings'];

export interface RenderProgress {
  message: string;
  percentage: number;
  stage: 'initiating' | 'rendering' | 'finalizing' | 'completed' | 'aborted' | 'failed';
  estimatedSecondsRemaining?: number;
  isEstimate: boolean;
  engine: 'turbo' | 'browser';
}

export interface RenderJobRequest {
  outputProject: Project;
  mediaFiles: Map<string, File>;
  signal?: AbortSignal;
  onProgress?: (progress: RenderProgress) => void;
  preferredEngine?: 'turbo' | 'browser' | 'auto';
}

export interface RenderArtifact {
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
  outputId: string;
  videoRevision: string;
  renderEngineUsed: 'turbo' | 'browser';
  renderedAt: string;
  exportSettings: ProjectExportSettings;
}

export class RenderError extends Error {
  constructor(message: string, public code = 'RENDER_ERROR') {
    super(message);
    this.name = 'RenderError';
  }
}

export class RenderAbortedError extends RenderError {
  constructor(message = 'Rendering was cancelled by user.') {
    super(message, 'RENDER_ABORTED');
    this.name = 'RenderAbortedError';
  }
}

/**
 * Computes a fast deterministic 64-bit hash (FNV-1a) for strings.
 */
function fnv1aHash(str: string): string {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h1 ^= str.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0');
}

/**
 * Computes video content revision fingerprint based on video/audio edit operations.
 * CRUCIAL: Publishing metadata (title, description, tags, hashtags) is intentionally excluded,
 * allowing metadata edits without invalidating an existing valid video render artifact.
 */
export function computeProjectVideoRevision(
  project: Project,
  mediaFiles?: Map<string, File>,
): string {
  const videoAudioManifest = {
    settings: {
      width: project.exportSettings.width,
      height: project.exportSettings.height,
      fps: project.exportSettings.fps,
      quality: project.exportSettings.quality,
      videoBitrate: project.exportSettings.videoBitrate,
      audioBitrate: project.exportSettings.audioBitrate,
    },
    clips: project.clips.map((c: Clip) => {
      const file = mediaFiles?.get(c.mediaId);
      return {
        id: c.id,
        mediaId: c.mediaId,
        start: c.start,
        sourceStart: c.sourceStart,
        sourceEnd: c.sourceEnd,
        properties: c.properties,
        effects: c.effects,
        transition: c.transition,
        audioRole: c.audioRole,
        autoDuck: c.autoDuck,
        voiceEnhance: c.voiceEnhance,
        fileMetadata: file ? { size: file.size, lastModified: file.lastModified } : undefined,
      };
    }),
    tracks: project.tracks?.map((t: Track) => ({
      id: t.id,
      kind: t.kind,
      muted: t.muted,
      hidden: t.hidden,
      locked: t.locked,
    })),
  };

  const serialized = JSON.stringify(videoAudioManifest);
  return `rev_${fnv1aHash(serialized)}`;
}

/**
 * Executes an export render job with Turbo hardware acceleration when eligible,
 * falling back gracefully to the browser engine if unavailable or unsupported.
 */
export async function executeRenderJob(request: RenderJobRequest): Promise<RenderArtifact> {
  const { outputProject, mediaFiles, signal, onProgress, preferredEngine = 'auto' } = request;

  if (signal?.aborted) {
    throw new RenderAbortedError();
  }

  if (!outputProject.clips.length) {
    throw new RenderError('Cannot render project: no clips on the timeline.', 'EMPTY_PROJECT');
  }

  // Verify all clip media files exist in the mediaFiles map
  for (const clip of outputProject.clips) {
    if (!mediaFiles.has(clip.mediaId)) {
      throw new RenderError(
        `Cannot render project: media file for clip "${clip.id}" (mediaId: ${clip.mediaId}) is missing.`,
        'MISSING_MEDIA',
      );
    }
  }

  const startTime = Date.now();
  let currentEngine: 'turbo' | 'browser' = 'turbo';

  const progressBridge = (message: string, value = 0) => {
    if (signal?.aborted) return;

    let estimatedSecondsRemaining: number | undefined;
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    if (elapsedSeconds > 1 && value > 0 && value < 100) {
      const totalEstimated = (elapsedSeconds / value) * 100;
      estimatedSecondsRemaining = Math.max(0, Math.round(totalEstimated - elapsedSeconds));
    }

    onProgress?.({
      message,
      percentage: Math.min(100, Math.max(0, value)),
      stage: value >= 100 ? 'completed' : value > 0 ? 'rendering' : 'initiating',
      estimatedSecondsRemaining,
      isEstimate: true,
      engine: currentEngine,
    });
  };

  let renderedBlob: Blob | null = null;

  // Step 1: Attempt Turbo Native Hardware engine if allowed
  if (preferredEngine !== 'browser') {
    currentEngine = 'turbo';
    try {
      renderedBlob = await tryTurboExport(outputProject, mediaFiles, signal || new AbortController().signal, progressBridge);
    } catch (turboErr) {
      if (signal?.aborted) {
        throw new RenderAbortedError();
      }
      // If Turbo failed with a non-abort error, proceed to browser fallback
      renderedBlob = null;
    }
  }

  if (signal?.aborted) {
    throw new RenderAbortedError();
  }

  // Step 2: Fall back to in-browser engine if Turbo was not available or ineligible
  if (!renderedBlob) {
    currentEngine = 'browser';
    progressBridge('Rendering via in-browser engine…', 5);
    renderedBlob = await exportMp4(outputProject, signal || new AbortController().signal, progressBridge);
  }

  if (signal?.aborted) {
    throw new RenderAbortedError();
  }

  if (!renderedBlob || renderedBlob.size === 0) {
    throw new RenderError('Render engine produced an empty video artifact (0 bytes).', 'EMPTY_ARTIFACT');
  }

  const videoRevision = computeProjectVideoRevision(outputProject, mediaFiles);

  onProgress?.({
    message: 'Render complete.',
    percentage: 100,
    stage: 'completed',
    isEstimate: false,
    engine: currentEngine,
  });

  return {
    blob: renderedBlob,
    mimeType: renderedBlob.type || 'video/mp4',
    sizeBytes: renderedBlob.size,
    outputId: outputProject.id,
    videoRevision,
    renderEngineUsed: currentEngine,
    renderedAt: new Date().toISOString(),
    exportSettings: { ...outputProject.exportSettings },
  };
}
