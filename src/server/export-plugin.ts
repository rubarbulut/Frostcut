import { spawn, type ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, createReadStream, promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import { isTurboEligible } from '../turbo-eligibility';

import { videoBitrate } from '../export-settings';
import { resolve } from 'node:path';

export type TurboHealthInfo = {
  turbo: boolean;
  encoderAvailable: string;
  hardwareCodecCompiled: boolean;
  hardwareRuntimeVerified: boolean;
  acceleration: 'codec-compiled-unverified' | 'software-only' | 'none';
  note: string;
};

let probedFfmpeg: TurboHealthInfo | null = null;
export async function probeFfmpeg(): Promise<TurboHealthInfo> {
  if (probedFfmpeg) return probedFfmpeg;
  return new Promise((resolveProbe) => {
    try {
      const child = spawn('ffmpeg', ['-encoders']);
      let output = '';
      child.stdout?.on('data', (d) => (output += d.toString()));
      child.stderr?.on('data', (d) => (output += d.toString()));
      child.on('error', () => {
        probedFfmpeg = {
          turbo: false,
          encoderAvailable: 'none',
          hardwareCodecCompiled: false,
          hardwareRuntimeVerified: false,
          acceleration: 'none',
          note: 'FFmpeg binary not available on system PATH',
        };
        resolveProbe(probedFfmpeg);
      });
      child.on('close', (code) => {
        if (code !== 0) {
          probedFfmpeg = {
            turbo: false,
            encoderAvailable: 'none',
            hardwareCodecCompiled: false,
            hardwareRuntimeVerified: false,
            acceleration: 'none',
            note: 'FFmpeg probe returned non-zero exit code',
          };
        } else {
          const hasMf = output.includes('h264_mf');
          const hasNvenc = output.includes('h264_nvenc');
          const hasQsv = output.includes('h264_qsv');
          const hasHardware = hasMf || hasNvenc || hasQsv;
          const encoder = hasNvenc ? 'h264_nvenc' : hasQsv ? 'h264_qsv' : hasMf ? 'h264_mf' : 'libx264';
          probedFfmpeg = {
            turbo: true,
            encoderAvailable: encoder,
            hardwareCodecCompiled: hasHardware,
            hardwareRuntimeVerified: false,
            acceleration: hasHardware ? 'codec-compiled-unverified' : 'software-only',
            note: hasHardware
              ? `Hardware codec ${encoder} is compiled in FFmpeg; actual hardware acceleration depends on active GPU runtime`
              : 'Software libx264 available; hardware acceleration codec not compiled',
          };
        }
        resolveProbe(probedFfmpeg);
      });
    } catch {
      probedFfmpeg = {
        turbo: false,
        encoderAvailable: 'none',
        hardwareCodecCompiled: false,
        hardwareRuntimeVerified: false,
        acceleration: 'none',
        note: 'Failed to spawn FFmpeg process',
      };
      resolveProbe(probedFfmpeg);
    }
  });
}

export interface TurboHandlerOptions {
  probeFn?: () => Promise<TurboHealthInfo>;
  spawnFn?: typeof spawn;
  tempBaseDir?: string;
}

export function createTurboExportHandler(options: TurboHandlerOptions = {}) {
  const probe = options.probeFn || probeFfmpeg;
  const spawnProcess = options.spawnFn || spawn;
  const baseTmp = options.tempBaseDir || tmpdir();

  return async (req: any, res: any, next?: any) => {
    const rawUrl = req.url || '';

    // Endpoint 1: Health check
    if (rawUrl.startsWith('/api/turbo-health')) {
      const health = await probe();
      res.statusCode = health.turbo ? 200 : 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          status: health.turbo ? 'available' : 'unavailable',
          turbo: health.turbo,
          encoder: health.encoderAvailable,
          encoderAvailable: health.encoderAvailable,
          hardwareCodecCompiled: health.hardwareCodecCompiled,
          hardwareRuntimeVerified: health.hardwareRuntimeVerified,
          acceleration: health.acceleration,
          note: health.note,
        }),
      );
      return;
    }

    // Endpoint 2: Turbo Native Hardware Export
    if (rawUrl.startsWith('/api/turbo-export') && req.method === 'POST') {
      const tempDir = join(baseTmp, 'frostcut_turbo_' + randomUUID());
      let activeChild: ChildProcess | null = null;
      let clientAborted = false;
      let cleanedUp = false;
      let resolveExecution: (() => void) | null = null;
      const executionPromise = new Promise<void>((r) => { resolveExecution = r; });

      const cleanup = async () => {
        if (cleanedUp) return;
        cleanedUp = true;
        try {
          if (existsSync(tempDir)) {
            await fs.rm(tempDir, { recursive: true, force: true });
          }
        } catch {}
      };

      const abortHandler = () => {
        if (!clientAborted) {
          clientAborted = true;
          if (activeChild) {
            try {
              activeChild.kill();
            } catch {}
            activeChild = null;
          }
          void cleanup();
          resolveExecution?.();
        }
      };

      // Client abort tracking: distinguish between normal completion and premature disconnect
      req.on('aborted', abortHandler);
      req.on('close', () => {
        // If connection closed prematurely before the request stream ended and before response ended
        if (!req.readableEnded && !res.writableEnded) {
          abortHandler();
        }
      });
      res.on('close', () => {
        if (!res.writableEnded) {
          abortHandler();
        }
      });

      const respondError = async (status: number, message: string) => {
        if (!res.writableEnded && !res.headersSent) {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: message }));
        }
        await cleanup();
        resolveExecution?.();
      };

      try {
        await fs.mkdir(tempDir, { recursive: true });

        // Convert Node IncomingMessage to web Request to parse standard FormData
        const webReq = new Request(`http://127.0.0.1:5173${req.url}`, {
          method: req.method,
          headers: req.headers as any,
          body: req as any,
          duplex: 'half',
        } as any);

        const formData = await webReq.formData();
        if (clientAborted) {
          await cleanup();
          return;
        }

        const projectRaw = formData.get('project');
        if (!projectRaw || typeof projectRaw !== 'string') {
          await respondError(400, 'Missing project JSON payload');
          return;
        }

        let project: any;
        try {
          project = JSON.parse(projectRaw);
        } catch {
          await respondError(400, 'Invalid project JSON payload');
          return;
        }

        // Server-side strict scope validation (B002-D)
        const eligibility = isTurboEligible(project);
        if (!eligibility.eligible) {
          await respondError(400, `Project not eligible for turbo export: ${eligibility.reason}`);
          return;
        }

        const assContent = formData.get('ass');

        // Save media files to temp directory with strict path-traversal protection
        const mediaPathMap = new Map<string, string>();
        for (const [key, val] of formData.entries()) {
          if (key.startsWith('media_') && val instanceof Blob) {
            const rawId = key.replace('media_', '');
            if (rawId.includes('/') || rawId.includes('\\') || rawId.includes('..') || !/^[a-zA-Z0-9_-]+$/.test(rawId)) {
              await respondError(400, 'Security error: Invalid media identifier or path traversal detected');
              return;
            }

            const rawExt = ((val as any).name?.split('.').pop() || 'mp4').toLowerCase();
            const safeExt = /^[a-z0-9]{2,5}$/.test(rawExt) ? rawExt : 'mp4';
            const diskPath = join(tempDir, `media_${rawId}.${safeExt}`);
            const resolvedPath = resolve(diskPath);
            const resolvedTempDir = resolve(tempDir);

            if (!resolvedPath.startsWith(resolvedTempDir)) {
              await respondError(400, 'Security error: Invalid media identifier or path traversal detected');
              return;
            }

            const buffer = Buffer.from(await val.arrayBuffer());
            await fs.writeFile(diskPath, buffer);
            mediaPathMap.set(rawId, diskPath);
          }
        }

        const w = Math.round((project.exportSettings?.width || project.settings?.width || 1080) / 2) * 2;
        const h = Math.round((project.exportSettings?.height || project.settings?.height || 1920) / 2) * 2;
        const fps = project.exportSettings?.fps || project.settings?.fps || 30;
        const outputPath = join(tempDir, 'output.mp4');

        // Optional subtitle file
        let assPath: string | null = null;
        if (assContent && typeof assContent === 'string' && assContent.trim().length > 0) {
          assPath = join(tempDir, 'captions.ass');
          if (!resolve(assPath).startsWith(resolve(tempDir))) {
            await respondError(400, 'Security error: Invalid caption path traversal');
            return;
          }
          await fs.writeFile(assPath, assContent, 'utf8');
        }

        const clips = project.clips || [];
        if (!clips.length) {
          await respondError(400, 'Project has no clips to export');
          return;
        }

        // Determine configured hardware encoder
        const health = await probe();
        const selectedEncoder = health.encoderAvailable !== 'none' ? health.encoderAvailable : 'libx264';

        // Calculate dynamic bitrates honoring project export settings
        const vBitrate = project.exportSettings?.videoBitrate
          ? `${Math.round(project.exportSettings.videoBitrate / 1000)}k`
          : `${Math.round(videoBitrate(project) / 1000)}k`;
        const aBitrate = project.exportSettings?.audioBitrate
          ? `${project.exportSettings.audioBitrate}k`
          : '192k';

        // Build FFmpeg command arguments
        const args: string[] = ['-y'];

        // Determine if single clip or multiple clips
        if (clips.length === 1) {
          const clip = clips[0];
          const inputPath = mediaPathMap.get(clip.mediaId);
          if (!inputPath || !existsSync(inputPath)) {
            await respondError(400, `Source media for clip ${clip.mediaId} missing`);
            return;
          }

          const start = clip.sourceStart || 0;
          const end = clip.sourceEnd || (start + (clip.end - clip.start));
          const duration = Math.max(0.1, end - start);

          args.push('-ss', String(start), '-t', String(duration), '-i', inputPath);

          let vFilter = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
          if (assPath) {
            const safeAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
            vFilter += `,subtitles='${safeAssPath}'`;
          }

          args.push(
            '-vf', vFilter,
            '-c:v', selectedEncoder,
          );
          if (selectedEncoder === 'libx264') {
            args.push('-preset', 'ultrafast', '-pix_fmt', 'yuv420p');
          }
          args.push(
            '-b:v', vBitrate,
            '-c:a', 'aac',
            '-b:a', aBitrate,
            '-r', String(fps),
            '-movflags', '+faststart',
            outputPath,
          );
        } else {
          // Multi-clip project
          const filterParts: string[] = [];
          const concatInputs: string[] = [];

          for (let i = 0; i < clips.length; i++) {
            const clip = clips[i];
            const inputPath = mediaPathMap.get(clip.mediaId);
            if (!inputPath || !existsSync(inputPath)) continue;

            const start = clip.sourceStart || 0;
            const end = clip.sourceEnd || (start + (clip.end - clip.start));
            const duration = Math.max(0.1, end - start);

            args.push('-ss', String(start), '-t', String(duration), '-i', inputPath);

            filterParts.push(
              `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v${i}]`,
            );
            filterParts.push(`[${i}:a]asetpts=PTS-STARTPTS[a${i}]`);
            concatInputs.push(`[v${i}][a${i}]`);
          }

          filterParts.push(`${concatInputs.join('')}concat=n=${concatInputs.length}:v=1:a=1[v_concat][a_out]`);

          let finalV = '[v_concat]';
          if (assPath) {
            const safeAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
            filterParts.push(`[v_concat]subtitles='${safeAssPath}'[v_out]`);
            finalV = '[v_out]';
          } else {
            finalV = '[v_concat]';
          }

          args.push(
            '-filter_complex', filterParts.join(';'),
            '-map', finalV,
            '-map', '[a_out]',
            '-c:v', selectedEncoder,
          );
          if (selectedEncoder === 'libx264') {
            args.push('-preset', 'ultrafast', '-pix_fmt', 'yuv420p');
          }
          args.push(
            '-b:v', vBitrate,
            '-c:a', 'aac',
            '-b:a', aBitrate,
            '-r', String(fps),
            '-movflags', '+faststart',
            outputPath,
          );
        }

        if (clientAborted) {
          await cleanup();
          return;
        }



        // Spawn FFmpeg
        const child = spawnProcess('ffmpeg', args);
        activeChild = child;
        let stderr = '';

        child.stdout?.on('data', () => {});
        child.stderr?.on('data', (d: any) => (stderr += d.toString()));

        child.on('error', async (err: Error) => {
          activeChild = null;
          if (clientAborted || res.writableEnded) {
            await cleanup();
            resolveExecution?.();
            return;
          }
          await respondError(500, `FFmpeg process spawn error: ${err.message}`);
        });

        child.on('close', async (code: number) => {
          activeChild = null;
          if (clientAborted || res.writableEnded) {
            await cleanup();
            resolveExecution?.();
            return;
          }
          if (code !== 0) {
            if (selectedEncoder === 'libx264') {
              // Already ran software libx264; no fallback available
              await respondError(500, stderr.trim() || 'Turbo export failed with software encoder.');
              return;
            }

            // Fallback attempt: dynamically replace selectedEncoder with libx264
            const fallbackArgs = args.map((arg) => (arg === selectedEncoder ? 'libx264' : arg));
            const encoderIdx = fallbackArgs.indexOf('libx264');
            if (encoderIdx !== -1 && !fallbackArgs.includes('-preset')) {
              fallbackArgs.splice(encoderIdx + 1, 0, '-preset', 'ultrafast', '-pix_fmt', 'yuv420p');
            }

            if (clientAborted || res.writableEnded) {
              await cleanup();
              resolveExecution?.();
              return;
            }

            const cpuChild = spawnProcess('ffmpeg', fallbackArgs);
            activeChild = cpuChild;
            let cpuStderr = '';
            cpuChild.stderr?.on('data', (d: any) => (cpuStderr += d.toString()));

            cpuChild.on('error', async (err: Error) => {
              activeChild = null;
              if (clientAborted || res.writableEnded) {
                await cleanup();
                resolveExecution?.();
                return;
              }
              await respondError(500, `Fallback process spawn error: ${err.message}`);
            });

            cpuChild.on('close', async (cpuCode: number) => {
              activeChild = null;
              if (clientAborted || res.writableEnded) {
                await cleanup();
                resolveExecution?.();
                return;
              }
              if (cpuCode !== 0 || !existsSync(outputPath)) {
                await respondError(500, cpuStderr.trim() || stderr.trim() || 'Turbo export failed.');
                return;
              }
              await sendOutput();
            });
            return;
          }

          await sendOutput();
        });

        const sendOutput = async () => {
          if (!existsSync(outputPath)) {
            await respondError(500, 'Output video was not created.');
            return;
          }

          const stat = await fs.stat(outputPath);
          if (res.writableEnded || res.headersSent) {
            await cleanup();
            resolveExecution?.();
            return;
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'video/mp4');
          res.setHeader('Content-Length', stat.size);
          res.setHeader('Content-Disposition', 'attachment; filename="frostcut_export.mp4"');

          const stream = createReadStream(outputPath);
          stream.pipe(res);

          const finishHandler = () => {
            void cleanup();
            resolveExecution?.();
          };
          res.on('finish', finishHandler);
          res.on('close', finishHandler);
        };

        await executionPromise;
      } catch (err: any) {
        await respondError(500, err?.message || 'Server error during turbo export');
      }
      return;
    }

    if (next) next();
  };
}

export function turboExportPlugin(): Plugin {
  const handler = createTurboExportHandler();

  return {
    name: 'vite-plugin-turbo-export',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(handler);
    },
  };
}
