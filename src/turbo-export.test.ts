import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkTurboEngine, tryTurboExport } from './turbo-export';
import { createProject, addMedia, type Project } from './model';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

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

    it('rejects 10-second source at 2x speed from Turbo fast-path to prevent wrong 10s output', async () => {
      const asset = {
        id: 'm1',
        name: 'clip.mp4',
        duration: 10,
        width: 1080,
        height: 1920,
        size: 50000,
        type: 'video/mp4',
      };
      const project = addMedia(createProject('Speed Test', 'YouTube Shorts'), asset);
      project.clips[0].properties.speed = 2.0;

      const mediaFiles = new Map<string, File>();
      mediaFiles.set('m1', new File(['data'], 'clip.mp4'));
      const controller = new AbortController();

      const result = await tryTurboExport(project, mediaFiles, controller.signal, () => {});
      // Falls back to full renderer without attempting turbo concat
      expect(result).toBeNull();
    });

    it('rejects overlapping tracks and gaps from Turbo fast-path to prevent corrupted concat', async () => {
      const p = createProject('Overlap Test', 'YouTube Shorts');
      p.clips = [
        {
          id: 'c1',
          mediaId: 'm1',
          start: 0,
          sourceStart: 0,
          sourceEnd: 5,
          trackId: 'V1',
          properties: { ...p.clips[0]?.properties, speed: 1.0, volume: 1.0 },
        },
        {
          id: 'c2',
          mediaId: 'm2',
          start: 2, // Overlaps with c1 (0-5s)
          sourceStart: 0,
          sourceEnd: 5,
          trackId: 'V2',
          properties: { ...p.clips[0]?.properties, speed: 1.0, volume: 1.0 },
        },
      ];
      const mediaFiles = new Map<string, File>();
      const controller = new AbortController();

      const result = await tryTurboExport(p, mediaFiles, controller.signal, () => {});
      expect(result).toBeNull();
    });

    it('immediately aborts and returns null when AbortSignal is cancelled', async () => {
      const asset = { id: 'm1', name: 'v.mp4', duration: 5, width: 1080, height: 1920, size: 1000, type: 'video/mp4' };
      const project = addMedia(createProject('Abort Test', 'YouTube Shorts'), asset);
      const mediaFiles = new Map<string, File>();
      const controller = new AbortController();
      controller.abort();

      const result = await tryTurboExport(project, mediaFiles, controller.signal, () => {});
      expect(result).toBeNull();
    });
  });

  describe('B002-D Strict Eligibility Matrix', () => {
    const makeValidProject = () => {
      const asset = { id: 'm1', name: 'v.mp4', duration: 10, width: 1080, height: 1920, size: 1000, type: 'video/mp4' };
      return addMedia(createProject('Valid Base', 'YouTube Shorts'), asset);
    };

    it('rejects custom fadeIn or fadeOut greater than default 0.015s', async () => {
      const { isTurboEligible } = await import('./turbo-export');
      const p1 = makeValidProject();
      p1.clips[0].properties.fadeIn = 0.5;
      expect(isTurboEligible(p1).eligible).toBe(false);

      const p2 = makeValidProject();
      p2.clips[0].properties.fadeOut = 0.5;
      expect(isTurboEligible(p2).eligible).toBe(false);
    });

    it('rejects opacity !== 1.0', async () => {
      const { isTurboEligible } = await import('./turbo-export');
      const p = makeValidProject();
      p.clips[0].properties.opacity = 0.8;
      expect(isTurboEligible(p).eligible).toBe(false);
    });

    it('rejects audioDetached and autoDuck', async () => {
      const { isTurboEligible } = await import('./turbo-export');
      const p1 = makeValidProject();
      p1.clips[0].audioDetached = true;
      expect(isTurboEligible(p1).eligible).toBe(false);

      const p2 = makeValidProject();
      p2.clips[0].autoDuck = true;
      expect(isTurboEligible(p2).eligible).toBe(false);
    });

    it('rejects NaN, Infinity, negative, and invalid timing values', async () => {
      const { isTurboEligible } = await import('./turbo-export');
      const p1 = makeValidProject();
      p1.clips[0].start = NaN;
      expect(isTurboEligible(p1).eligible).toBe(false);

      const p2 = makeValidProject();
      p2.clips[0].sourceStart = Infinity;
      expect(isTurboEligible(p2).eligible).toBe(false);

      const p3 = makeValidProject();
      p3.clips[0].sourceEnd = p3.clips[0].sourceStart; // 0 duration
      expect(isTurboEligible(p3).eligible).toBe(false);
    });

    it('rejects clips referencing missing media assets or exceeding duration', async () => {
      const { isTurboEligible } = await import('./turbo-export');
      const p1 = makeValidProject();
      p1.clips[0].mediaId = 'non-existent-media';
      expect(isTurboEligible(p1).eligible).toBe(false);

      const p2 = makeValidProject();
      p2.clips[0].sourceEnd = 999; // Exceeds 10s duration
      expect(isTurboEligible(p2).eligible).toBe(false);
    });

    it('rejects muted or hidden video tracks and muted A1 audio track', async () => {
      const { isTurboEligible } = await import('./turbo-export');
      const p1 = makeValidProject();
      const v1 = p1.tracks.find((t) => t.id === 'V1')!;
      v1.muted = true;
      expect(isTurboEligible(p1).eligible).toBe(false);

      const p2 = makeValidProject();
      const v1_h = p2.tracks.find((t) => t.id === 'V1')!;
      v1_h.hidden = true;
      expect(isTurboEligible(p2).eligible).toBe(false);

      const p3 = makeValidProject();
      const a1 = p3.tracks.find((t) => t.id === 'A1')!;
      a1.muted = true;
      expect(isTurboEligible(p3).eligible).toBe(false);
    });

    it('rejects clips out of sequential timeline order in project array', async () => {
      const { isTurboEligible } = await import('./turbo-export');
      const p = makeValidProject();
      const asset2 = { id: 'm2', name: 'v2.mp4', duration: 10, width: 1080, height: 1920, size: 1000, type: 'video/mp4' };
      p.media.push(asset2);
      p.clips = [
        { id: 'c2', mediaId: 'm2', start: 10, sourceStart: 0, sourceEnd: 10, trackId: 'V1', properties: { ...p.clips[0].properties } },
        { id: 'c1', mediaId: 'm1', start: 0, sourceStart: 0, sourceEnd: 10, trackId: 'V1', properties: { ...p.clips[0].properties } },
      ];
      expect(isTurboEligible(p).eligible).toBe(false);
      expect(isTurboEligible(p).reason).toContain('sequential timeline order');
    });

    it('rejects micro gaps between clips (>0.001s)', async () => {
      const { isTurboEligible } = await import('./turbo-export');
      const p = makeValidProject();
      const asset2 = { id: 'm2', name: 'v2.mp4', duration: 10, width: 1080, height: 1920, size: 1000, type: 'video/mp4' };
      p.media.push(asset2);
      p.clips = [
        { id: 'c1', mediaId: 'm1', start: 0, sourceStart: 0, sourceEnd: 5, trackId: 'V1', properties: { ...p.clips[0].properties } },
        { id: 'c2', mediaId: 'm2', start: 5.02, sourceStart: 0, sourceEnd: 5, trackId: 'V1', properties: { ...p.clips[0].properties } },
      ];
      expect(isTurboEligible(p).eligible).toBe(false);
      expect(isTurboEligible(p).reason).toContain('Timeline gaps');
    });

    it('rejects non-standard fillMode and custom export videoBitrate/quality', async () => {
      const { isTurboEligible } = await import('./turbo-export');
      const p1 = makeValidProject();
      p1.settings.fillMode = 'crop' as any;
      expect(isTurboEligible(p1).eligible).toBe(false);

      const p2 = makeValidProject();
      p2.exportSettings.videoBitrate = 12000000;
      expect(isTurboEligible(p2).eligible).toBe(false);

      const p3 = makeValidProject();
      p3.exportSettings.quality = 90;
      expect(isTurboEligible(p3).eligible).toBe(false);
    });
  });

  describe('B002-D Server Handler Lifecycle & Security', () => {
    it('returns accurate health status without falsely claiming verified live GPU acceleration', async () => {
      const { createTurboExportHandler } = await import('./server/export-plugin');
      const mockProbe = vi.fn().mockResolvedValue({
        turbo: true,
        encoderAvailable: 'h264_nvenc',
        hardwareCodecCompiled: true,
        hardwareRuntimeVerified: false,
        acceleration: 'codec-compiled-unverified',
        note: 'Hardware codec compiled; runtime GPU unverified',
      });

      const handler = createTurboExportHandler({ probeFn: mockProbe });
      const req: any = { url: '/api/turbo-health', method: 'GET' };
      let responseBody = '';
      const res: any = {
        statusCode: 0,
        setHeader: vi.fn(),
        end: vi.fn((body: string) => { responseBody = body; }),
      };

      await handler(req, res);
      expect(res.statusCode).toBe(200);
      const parsed = JSON.parse(responseBody);
      expect(parsed.hardwareRuntimeVerified).toBe(false);
      expect(parsed.hardwareCodecCompiled).toBe(true);
      expect(parsed.encoderAvailable).toBe('h264_nvenc');
      expect(parsed.acceleration).toBe('codec-compiled-unverified');
    });

    function createMockRequest(formData: FormData) {
      const dummyReq = new Request('http://localhost', { method: 'POST', body: formData });
      const stream: any = Readable.fromWeb(dummyReq.body as any);
      stream.url = '/api/turbo-export';
      stream.method = 'POST';
      stream.headers = Object.fromEntries(dummyReq.headers.entries());
      return stream;
    }

    function createMockResponse() {
      const res: any = Object.assign(new EventEmitter(), {
        statusCode: 0,
        headers: {} as Record<string, string>,
        setHeader: vi.fn((k: string, v: string) => { res.headers[k.toLowerCase()] = v; }),
        end: vi.fn(() => {
          res.writableEnded = true;
          res.emit('finish');
        }),
        writableEnded: false,
        headersSent: false,
      });
      return res;
    }

    it('rejects direct POST to server when project is ineligible (e.g. speed 2x)', async () => {
      const { createTurboExportHandler } = await import('./server/export-plugin');

      const asset = { id: 'm1', name: 'v.mp4', duration: 10, width: 1080, height: 1920, size: 1000, type: 'video/mp4' };
      const project = addMedia(createProject('Ineligible Post', 'YouTube Shorts'), asset);
      project.clips[0].properties.speed = 2.0;

      const fd = new FormData();
      fd.append('project', JSON.stringify(project));
      fd.append('media_m1', new Blob(['video-bytes'], { type: 'video/mp4' }), 'v.mp4');

      const req = createMockRequest(fd);
      const res = createMockResponse();

      let spawnCalled = false;
      const fakeSpawn = vi.fn().mockImplementation(() => {
        spawnCalled = true;
        return new EventEmitter();
      });

      const handler = createTurboExportHandler({ spawnFn: fakeSpawn as any });
      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.end).toHaveBeenCalled();
      const errJson = JSON.parse(res.end.mock.calls[0][0]);
      expect(errJson.error).toContain('Project not eligible for turbo export');
      expect(spawnCalled).toBe(false);
    });

    it('rejects media identifiers containing path traversal attempts', async () => {
      const { createTurboExportHandler } = await import('./server/export-plugin');

      const asset = { id: 'm1', name: 'v.mp4', duration: 10, width: 1080, height: 1920, size: 1000, type: 'video/mp4' };
      const project = addMedia(createProject('Security Test', 'YouTube Shorts'), asset);

      const fd = new FormData();
      fd.append('project', JSON.stringify(project));
      // Attacker attempts path traversal via mediaId
      fd.append('media_../../malicious', new Blob(['evil'], { type: 'video/mp4' }), 'hack.mp4');

      const req = createMockRequest(fd);
      const res = createMockResponse();

      const fakeSpawn = vi.fn();
      const handler = createTurboExportHandler({ spawnFn: fakeSpawn as any });
      await handler(req, res);

      expect(res.statusCode).toBe(400);
      const errJson = JSON.parse(res.end.mock.calls[0][0]);
      expect(errJson.error).toContain('Security error');
      expect(fakeSpawn).not.toHaveBeenCalled();
    });

    it('kills active child process on client disconnect and prevents fallback', async () => {
      const { createTurboExportHandler } = await import('./server/export-plugin');

      const asset = { id: 'm1', name: 'v.mp4', duration: 10, width: 1080, height: 1920, size: 1000, type: 'video/mp4' };
      const project = addMedia(createProject('Cancel Test', 'YouTube Shorts'), asset);

      const fd = new FormData();
      fd.append('project', JSON.stringify(project));
      fd.append('media_m1', new Blob(['bytes'], { type: 'video/mp4' }), 'v.mp4');

      const req = createMockRequest(fd);
      const res = createMockResponse();

      class FakeChild extends EventEmitter {
        stdout = new EventEmitter();
        stderr = new EventEmitter();
        killed = false;
        kill = vi.fn(() => {
          this.killed = true;
          this.emit('close', -1);
        });
      }

      let spawnCount = 0;
      let activeFakeChild: FakeChild | null = null;
      const fakeSpawn = vi.fn().mockImplementation(() => {
        spawnCount++;
        activeFakeChild = new FakeChild();
        return activeFakeChild;
      });

      const mockProbe = vi.fn().mockResolvedValue({
        turbo: true,
        encoderAvailable: 'h264_nvenc',
        hardwareCodecCompiled: true,
        hardwareRuntimeVerified: false,
        acceleration: 'codec-compiled-unverified',
        note: 'Hardware codec compiled',
      });

      const handler = createTurboExportHandler({ spawnFn: fakeSpawn as any, probeFn: mockProbe });
      const handlerPromise = handler(req, res);

      // Wait a microtask for spawn to happen
      await new Promise((r) => setTimeout(r, 15));

      expect(activeFakeChild).not.toBeNull();
      // Simulate client dropping connection mid-render:
      res.emit('close');

      await handlerPromise;

      expect(activeFakeChild!.kill).toHaveBeenCalled();
      // Verifies no secondary fallback child is spawned after abort!
      expect(spawnCount).toBe(1);
    });

    it('handles FFmpeg spawn error without unhandled exception and responds 500 once', async () => {
      const { createTurboExportHandler } = await import('./server/export-plugin');

      const asset = { id: 'm1', name: 'v.mp4', duration: 10, width: 1080, height: 1920, size: 1000, type: 'video/mp4' };
      const project = addMedia(createProject('Spawn Error Test', 'YouTube Shorts'), asset);

      const fd = new FormData();
      fd.append('project', JSON.stringify(project));
      fd.append('media_m1', new Blob(['bytes'], { type: 'video/mp4' }), 'v.mp4');

      const req = createMockRequest(fd);
      const res = createMockResponse();

      class ErrorChild extends EventEmitter {
        stdout = new EventEmitter();
        stderr = new EventEmitter();
        kill = vi.fn();
      }

      let errorChild: ErrorChild | null = null;
      const fakeSpawn = vi.fn().mockImplementation(() => {
        errorChild = new ErrorChild();
        setTimeout(() => {
          errorChild!.emit('error', new Error('spawn ENOENT'));
        }, 5);
        return errorChild;
      });

      const mockProbe = vi.fn().mockResolvedValue({
        turbo: true,
        encoderAvailable: 'h264_nvenc',
        hardwareCodecCompiled: true,
        hardwareRuntimeVerified: false,
        acceleration: 'codec-compiled-unverified',
        note: 'Hardware codec compiled',
      });

      const handler = createTurboExportHandler({ spawnFn: fakeSpawn as any, probeFn: mockProbe });
      await handler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.end).toHaveBeenCalled();
      const errJson = JSON.parse(res.end.mock.calls[0][0]);
      expect(errJson.error).toContain('spawn ENOENT');
    });

    it('performs CPU fallback to libx264 ultrafast when hardware encoder fails', async () => {
      const { createTurboExportHandler } = await import('./server/export-plugin');

      const asset = { id: 'm1', name: 'v.mp4', duration: 10, width: 1080, height: 1920, size: 1000, type: 'video/mp4' };
      const project = addMedia(createProject('Fallback Test', 'YouTube Shorts'), asset);

      const fd = new FormData();
      fd.append('project', JSON.stringify(project));
      fd.append('media_m1', new Blob(['bytes'], { type: 'video/mp4' }), 'v.mp4');

      const req = createMockRequest(fd);
      const res = createMockResponse();

      class MockChild extends EventEmitter {
        stdout = new EventEmitter();
        stderr = new EventEmitter();
        kill = vi.fn();
      }

      const spawnedCommands: { cmd: string; args: string[] }[] = [];
      const fakeSpawn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
        spawnedCommands.push({ cmd, args });
        const child = new MockChild();
        setTimeout(() => {
          if (spawnedCommands.length === 1) {
            // Primary hardware encoder fails (code 1)
            child.stderr.emit('data', Buffer.from('Error initializing hardware GPU device'));
            child.emit('close', 1);
          } else {
            // Fallback CPU child fails without output (or completes)
            child.emit('close', 1);
          }
        }, 5);
        return child;
      });

      const mockProbe = vi.fn().mockResolvedValue({
        turbo: true,
        encoderAvailable: 'h264_nvenc',
        hardwareCodecCompiled: true,
        hardwareRuntimeVerified: false,
        acceleration: 'codec-compiled-unverified',
        note: 'Hardware codec compiled',
      });

      const handler = createTurboExportHandler({ spawnFn: fakeSpawn as any, probeFn: mockProbe });
      await handler(req, res);

      expect(spawnedCommands.length).toBe(2);
      // Primary used hardware encoder
      expect(spawnedCommands[0].args).toContain('h264_nvenc');
      // Fallback dynamically replaced with libx264 ultrafast
      expect(spawnedCommands[1].args).toContain('libx264');
      expect(spawnedCommands[1].args).toContain('-preset');
      expect(spawnedCommands[1].args).toContain('ultrafast');
    });
  });
});
