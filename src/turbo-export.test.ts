import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkTurboEngine, tryTurboExport } from './turbo-export';
import { createProject, addMedia, type Project } from './model';

describe('Turbo Hardware Export Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkTurboEngine', () => {
    it('returns true when turbo health endpoint responds with 200 ok and turbo true', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok', turbo: true, hardware: true }),
      }) as any;

      const available = await checkTurboEngine();
      expect(available).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/turbo-health', expect.any(Object));
    });

    it('returns false when endpoint returns 404 (e.g. hosted Vercel)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }) as any;

      const available = await checkTurboEngine();
      expect(available).toBe(false);
    });

    it('returns false when network fails or times out', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as any;

      const available = await checkTurboEngine();
      expect(available).toBe(false);
    });
  });

  describe('tryTurboExport', () => {
    it('returns null if turbo engine is offline so client can fall back to in-browser engine', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as any;

      const project = createProject('Test Project', 'YouTube Shorts');
      const mediaFiles = new Map<string, File>();
      const controller = new AbortController();

      const result = await tryTurboExport(project, mediaFiles, controller.signal, () => {});
      expect(result).toBeNull();
    });

    it('returns Blob when turbo engine successfully renders project with source files', async () => {
      const dummyBlob = new Blob(['mp4-test-bytes-content'], { type: 'video/mp4' });

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/turbo-health') {
          return { ok: true, json: async () => ({ status: 'ok', turbo: true }) };
        }
        if (url === '/api/turbo-export') {
          return {
            ok: true,
            blob: async () => dummyBlob,
          };
        }
        return { ok: false };
      }) as any;

      const asset = {
        id: 'media-1',
        name: 'video.mp4',
        duration: 10,
        width: 1080,
        height: 1920,
        size: 50000,
        type: 'video/mp4',
      };
      const project = addMedia(createProject('Test Project', 'YouTube Shorts'), asset);
      const mediaFiles = new Map<string, File>();
      mediaFiles.set('media-1', new File(['video-data'], 'video.mp4', { type: 'video/mp4' }));

      const controller = new AbortController();
      const progressSteps: string[] = [];

      const result = await tryTurboExport(project, mediaFiles, controller.signal, (msg) => {
        progressSteps.push(msg);
      });

      expect(result).not.toBeNull();
      expect(result).toBe(dummyBlob);
      expect(progressSteps.length).toBeGreaterThan(0);
    });
  });
});
