import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, createReadStream, promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Plugin, ViteDevServer, PreviewServer } from 'vite';

export function turboExportPlugin(): Plugin {
  const handler = async (req: any, res: any, next: any) => {
    const rawUrl = req.url || '';

    // Endpoint 1: Health check
    if (rawUrl.startsWith('/api/turbo-health')) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', turbo: true, hardware: true }));
      return;
    }

    // Endpoint 2: Turbo Native Hardware Export
    if (rawUrl.startsWith('/api/turbo-export') && req.method === 'POST') {
      const tempDir = join(tmpdir(), 'frostcut_turbo_' + randomUUID());
      const cleanup = async () => {
        try {
          if (existsSync(tempDir)) {
            await fs.rm(tempDir, { recursive: true, force: true });
          }
        } catch {}
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
        const projectRaw = formData.get('project');
        if (!projectRaw || typeof projectRaw !== 'string') {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing project JSON payload' }));
          await cleanup();
          return;
        }

        const project = JSON.parse(projectRaw);
        const assContent = formData.get('ass');

        // Save media files to temp directory
        const mediaPathMap = new Map<string, string>();
        for (const [key, val] of formData.entries()) {
          if (key.startsWith('media_') && val instanceof Blob) {
            const mediaId = key.replace('media_', '');
            const ext = (val as any).name?.split('.').pop() || 'mp4';
            const diskPath = join(tempDir, `media_${mediaId}.${ext}`);
            const buffer = Buffer.from(await val.arrayBuffer());
            await fs.writeFile(diskPath, buffer);
            mediaPathMap.set(mediaId, diskPath);
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
          await fs.writeFile(assPath, assContent, 'utf8');
        }

        const clips = project.clips || [];
        if (!clips.length) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Project has no clips to export' }));
          await cleanup();
          return;
        }

        // Build FFmpeg command arguments
        const args: string[] = ['-y'];

        // Determine if single clip or multiple clips
        if (clips.length === 1) {
          const clip = clips[0];
          const inputPath = mediaPathMap.get(clip.mediaId);
          if (!inputPath || !existsSync(inputPath)) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: `Source media for clip ${clip.mediaId} missing` }));
            await cleanup();
            return;
          }

          const start = clip.sourceStart || 0;
          const end = clip.sourceEnd || (start + (clip.end - clip.start));
          const duration = Math.max(0.1, end - start);

          args.push('-ss', String(start), '-t', String(duration), '-i', inputPath);

          let vFilter = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
          if (assPath) {
            // Forward slashes and escape colons for FFmpeg filter
            const safeAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
            vFilter += `,subtitles='${safeAssPath}'`;
          }

          args.push(
            '-vf', vFilter,
            '-c:v', 'h264_mf',
            '-b:v', '6M',
            '-c:a', 'aac',
            '-b:a', '192k',
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
            '-c:v', 'h264_mf',
            '-b:v', '6M',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-r', String(fps),
            '-movflags', '+faststart',
            outputPath,
          );
        }

        // Spawn native hardware-accelerated FFmpeg
        const child = spawn('ffmpeg', args);
        let stderr = '';
        child.stderr.on('data', (d) => (stderr += d.toString()));

        child.on('close', async (code) => {
          if (code !== 0) {
            // Fallback attempt with CPU libx264 ultrafast if h264_mf failed
            const fallbackArgs = args.map((arg) => (arg === 'h264_mf' ? 'libx264' : arg));
            fallbackArgs.splice(fallbackArgs.indexOf('libx264') + 1, 0, '-preset', 'ultrafast', '-pix_fmt', 'yuv420p');

            const cpuChild = spawn('ffmpeg', fallbackArgs);
            let cpuStderr = '';
            cpuChild.stderr.on('data', (d) => (cpuStderr += d.toString()));

            cpuChild.on('close', async (cpuCode) => {
              if (cpuCode !== 0 || !existsSync(outputPath)) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: cpuStderr.trim() || stderr.trim() || 'Turbo export failed.' }));
                await cleanup();
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
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Output video was not created.' }));
            await cleanup();
            return;
          }

          const stat = await fs.stat(outputPath);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'video/mp4');
          res.setHeader('Content-Length', stat.size);
          res.setHeader('Content-Disposition', 'attachment; filename="frostcut_export.mp4"');

          const stream = createReadStream(outputPath);
          stream.pipe(res);

          res.on('finish', cleanup);
          res.on('close', cleanup);
        };
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err?.message || 'Server error during turbo export' }));
        await cleanup();
      }
      return;
    }

    next();
  };

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
