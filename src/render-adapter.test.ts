/**
 * Tests for Render Adapter & Video Content Revision Integrity (D1)
 * Persona: 1. DEMİR (Graphics & Render Pipeline Lead)
 * Task: B004-D (D1)
 * 
 * Verifies that:
 * 1. Metadata changes (title, description) do NOT invalidate video encode revision.
 * 2. Visual, audio, speed, and settings edits produce distinct revisions.
 * 3. Empty projects, missing media, and aborted signals are rejected before rendering.
 * 4. Turbo execution falls back cleanly to browser engine when unavailable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeProjectVideoRevision,
  executeRenderJob,
  RenderError,
  RenderAbortedError,
} from './render-adapter';
import type { Project, Clip } from './model';

// Mock dependencies
vi.mock('./turbo-export', () => ({
  tryTurboExport: vi.fn(),
  checkTurboEngine: vi.fn().mockResolvedValue(true),
  isTurboEligible: vi.fn().mockReturnValue({ eligible: true }),
}));

vi.mock('./media', () => ({
  exportMp4: vi.fn(),
}));

describe('B004-D: Render Adapter & Content Revision Integrity (Demir)', () => {
  const sampleClip: Clip = {
    id: 'clip_01',
    mediaId: 'media_video_01',
    trackId: 'track_01',
    start: 0,
    sourceStart: 0,
    sourceEnd: 10,
    properties: {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
      volume: 1,
      speed: 1,
      fadeIn: 0,
      fadeOut: 0,
      crop: 0,
      animation: 'None',
    },
  };

  const sampleProject: Project = {
    id: 'project_test_01',
    version: 1,
    name: 'Sample Edit',
    createdAt: '2026-10-20T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z',
    settings: {
      preset: 'YouTube',
      width: 1920,
      height: 1080,
      fps: 60,
      language: 'en',
    },
    clips: [sampleClip],
    media: [
      {
        id: 'media_video_01',
        name: 'gameplay.mp4',
        duration: 60,
        type: 'video',
        width: 1920,
        height: 1080,
        size: 50000000,
      },
    ],
    tracks: [
      {
        id: 'track_01',
        name: 'Video 1',
        kind: 'video',
        locked: false,
        muted: false,
        hidden: false,
        height: 80,
      },
    ],
    transcripts: [],
    speakers: [],
    captions: {
      preset: 'Clean',
      intensity: 1,
      wordsPerCaption: 3,
      position: 'bottom',
      emoji: 'None',
      enabled: false,
      safeArea: true,
    },
    suggestions: [],
    exportSettings: {
      width: 1920,
      height: 1080,
      fps: 60,
      quality: 80,
      videoBitrate: 8000,
      audioBitrate: 192,
    },
    publishing: {
      title: 'Initial Title',
      description: 'Initial Description',
      hashtags: '#gaming',
    },
  } as any;

  const mockFile = new File([new Uint8Array(100)], 'gameplay.mp4', { type: 'video/mp4' });
  const mediaFilesMap = new Map<string, File>([['media_video_01', mockFile]]);

  describe('1. Video Content Revision Isolation (Metadata vs Content)', () => {
    it('produces identical revision when publishing metadata changes without video edits', () => {
      const rev1 = computeProjectVideoRevision(sampleProject, mediaFilesMap);

      const modifiedMetadataProject: Project = {
        ...sampleProject,
        publishing: {
          title: 'Brand New Viral Title!',
          description: 'Completely different description text with lots of new tags.',
          hashtags: '#viral #highlights #epic',
        },
      } as any;

      const rev2 = computeProjectVideoRevision(modifiedMetadataProject, mediaFilesMap);

      // CRITICAL CONTRACT: Metadata changes must NOT change video revision!
      expect(rev1).toBe(rev2);
    });

    it('produces new revision when timeline clip start/sourceStart changes', () => {
      const revOriginal = computeProjectVideoRevision(sampleProject, mediaFilesMap);

      const editedClipsProject: Project = {
        ...sampleProject,
        clips: [
          {
            ...sampleClip,
            start: 2, // Shifted start
            sourceEnd: 12,
          },
        ],
      } as any;

      const revEdited = computeProjectVideoRevision(editedClipsProject, mediaFilesMap);
      expect(revOriginal).not.toBe(revEdited);
    });

    it('produces new revision when export resolution changes', () => {
      const rev1080p = computeProjectVideoRevision(sampleProject, mediaFilesMap);

      const project4k: Project = {
        ...sampleProject,
        exportSettings: {
          ...sampleProject.exportSettings,
          width: 3840,
          height: 2160,
        },
      } as any;

      const rev4k = computeProjectVideoRevision(project4k, mediaFilesMap);
      expect(rev1080p).not.toBe(rev4k);
    });

    it('produces new revision when track mute status changes', () => {
      const revUnmuted = computeProjectVideoRevision(sampleProject, mediaFilesMap);

      const mutedProject: Project = {
        ...sampleProject,
        tracks: [
          {
            id: 'track_01',
            name: 'Video 1',
            kind: 'video',
            locked: false,
            muted: true, // Muted
            hidden: false,
            height: 80,
          },
        ],
      } as any;

      const revMuted = computeProjectVideoRevision(mutedProject, mediaFilesMap);
      expect(revUnmuted).not.toBe(revMuted);
    });
  });

  describe('2. Render Job Preflight & Validation', () => {
    it('rejects render when project contains no clips', async () => {
      const emptyProject = { ...sampleProject, clips: [] };

      await expect(
        executeRenderJob({
          outputProject: emptyProject as any,
          mediaFiles: mediaFilesMap,
        }),
      ).rejects.toThrow(RenderError);
    });

    it('rejects render when clip media file is missing from mediaFiles map', async () => {
      const emptyMediaMap = new Map<string, File>();

      await expect(
        executeRenderJob({
          outputProject: sampleProject,
          mediaFiles: emptyMediaMap,
        }),
      ).rejects.toThrow(/media file for clip.*is missing/);
    });

    it('aborts immediately when signal is cancelled prior to render', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        executeRenderJob({
          outputProject: sampleProject,
          mediaFiles: mediaFilesMap,
          signal: controller.signal,
        }),
      ).rejects.toThrow(RenderAbortedError);
    });
  });

  describe('3. Execution & Engine Fallback', () => {
    it('executes Turbo native export when available and eligible', async () => {
      const { tryTurboExport } = await import('./turbo-export');
      const mockBlob = new Blob([new Uint8Array(1024 * 500)], { type: 'video/mp4' });
      vi.mocked(tryTurboExport).mockResolvedValueOnce(mockBlob);

      const progressHistory: number[] = [];

      const artifact = await executeRenderJob({
        outputProject: sampleProject,
        mediaFiles: mediaFilesMap,
        onProgress: (p) => progressHistory.push(p.percentage),
      });

      expect(artifact.renderEngineUsed).toBe('turbo');
      expect(artifact.blob).toBe(mockBlob);
      expect(artifact.sizeBytes).toBe(mockBlob.size);
      expect(artifact.videoRevision.startsWith('rev_')).toBe(true);
      expect(progressHistory).toContain(100);
    });

    it('falls back cleanly to browser export when Turbo is unavailable', async () => {
      const { tryTurboExport } = await import('./turbo-export');
      const { exportMp4 } = await import('./media');

      // Turbo returns null (e.g. unsupported filter or offline engine)
      vi.mocked(tryTurboExport).mockResolvedValueOnce(null);

      const fallbackBlob = new Blob([new Uint8Array(1024 * 300)], { type: 'video/mp4' });
      vi.mocked(exportMp4).mockResolvedValueOnce(fallbackBlob);

      const artifact = await executeRenderJob({
        outputProject: sampleProject,
        mediaFiles: mediaFilesMap,
        preferredEngine: 'auto',
      });

      expect(artifact.renderEngineUsed).toBe('browser');
      expect(artifact.blob).toBe(fallbackBlob);
      expect(exportMp4).toHaveBeenCalledTimes(1);
    });
  });
});
