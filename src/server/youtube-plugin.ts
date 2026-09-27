import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, createReadStream, promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Plugin, ViteDevServer, PreviewServer } from 'vite';

export function youtubeIngestPlugin(): Plugin {
  const handler = async (req: any, res: any, next: any) => {
    const rawUrl = req.url || '';

    // Endpoint 1: /api/youtube-meta?url=...
    if (rawUrl.startsWith('/api/youtube-meta')) {
      try {
        const parsed = new URL(rawUrl, 'http://127.0.0.1:5173');
        const targetUrl = parsed.searchParams.get('url');

        if (!targetUrl) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing url query parameter' }));
          return;
        }

        const child = spawn('python', [
          '-m',
          'yt_dlp',
          '--dump-json',
          '--no-warnings',
          '--no-playlist',
          targetUrl,
        ]);

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (d) => (stdout += d.toString()));
        child.stderr.on('data', (d) => (stderr += d.toString()));

        child.on('close', (code) => {
          if (code !== 0) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: stderr.trim() || 'Could not fetch YouTube video information.',
              }),
            );
            return;
          }

          try {
            const data = JSON.parse(stdout);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                success: true,
                id: data.id,
                title: data.title,
                duration: data.duration,
                thumbnailUrl: data.thumbnail,
                uploader: data.uploader || data.channel,
              }),
            );
          } catch (parseErr) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Failed to parse video metadata' }));
          }
        });
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err?.message || 'Server error' }));
      }
      return;
    }

    // Endpoint 2: /api/youtube-download?url=...&type=video|audio
    if (rawUrl.startsWith('/api/youtube-download')) {
      try {
        const parsed = new URL(rawUrl, 'http://127.0.0.1:5173');
        const targetUrl = parsed.searchParams.get('url');
        const type = parsed.searchParams.get('type') === 'audio' ? 'audio' : 'video';

        if (!targetUrl) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing url query parameter' }));
          return;
        }

        const tempId = 'frostcut_' + randomUUID();
        const tempBase = join(tmpdir(), tempId);
        const outputTemplate = `${tempBase}.%(ext)s`;

        const args =
          type === 'audio'
            ? [
                '-m',
                'yt_dlp',
                '--no-playlist',
                '-f',
                'ba/b',
                '-x',
                '--audio-format',
                'mp3',
                '-o',
                outputTemplate,
                targetUrl,
              ]
            : [
                '-m',
                'yt_dlp',
                '--no-playlist',
                '-f',
                'bv*[ext=mp4][vcodec^=avc]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/best',
                '--merge-output-format',
                'mp4',
                '-S',
                'res:1080,codec:h264',
                '--postprocessor-args',
                'ffmpeg:-c:v copy -c:a aac',
                '-o',
                outputTemplate,
                targetUrl,
              ];

        const child = spawn('python', args);

        let stderr = '';
        child.stderr.on('data', (d) => (stderr += d.toString()));

        child.on('close', async (code) => {
          if (code !== 0) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: stderr.trim() || 'Failed to download YouTube media stream.',
              }),
            );
            return;
          }

          const finalExt = type === 'audio' ? '.mp3' : '.mp4';
          const finalPath = `${tempBase}${finalExt}`;

          if (!existsSync(finalPath)) {
            // Check if another extension was produced
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Downloaded file not found on disk.' }));
            return;
          }

          const stat = await fs.stat(finalPath);
          const mime = type === 'audio' ? 'audio/mpeg' : 'video/mp4';

          res.statusCode = 200;
          res.setHeader('Content-Type', mime);
          res.setHeader('Content-Length', stat.size);
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="youtube_${tempId}${finalExt}"`,
          );

          const stream = createReadStream(finalPath);
          stream.pipe(res);

          const cleanup = async () => {
            try {
              if (existsSync(finalPath)) await fs.unlink(finalPath);
            } catch {}
          };

          res.on('finish', cleanup);
          res.on('close', cleanup);
        });
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err?.message || 'Server error' }));
      }
      return;
    }

    next();
  };

  return {
    name: 'vite-plugin-youtube-ingest',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(handler);
    },
  };
}
