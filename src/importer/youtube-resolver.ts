import type { IngestJobProgress, IngestMediaType, RemoteMediaMeta } from './types';

/**
 * Extracts standard 11-character YouTube video ID from various YouTube URL formats.
 */
export function extractYouTubeId(rawUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();

  // Pattern matches:
  // - youtube.com/watch?v=ID
  // - youtu.be/ID
  // - youtube.com/shorts/ID
  // - youtube.com/embed/ID
  // - music.youtube.com/watch?v=ID
  const match = trimmed.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i,
  );
  if (match) return match[1];

  // Specific 11-character ID (requires alphanumeric mix)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed) && /[A-Z]/.test(trimmed) && /[0-9]/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Generates reliable YouTube thumbnail URLs for a given video ID.
 */
export function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Checks whether a given string is a valid remote URL (YouTube, MP4, or MP3).
 */
export function isValidMediaUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (extractYouTubeId(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      (/\.(mp4|webm|mov|mp3|wav|m4a|aac|ogg)(\?.*)?$/i.test(parsed.pathname) ||
        parsed.hostname.includes('youtube') ||
        parsed.hostname.includes('youtu.be'))
    );
  } catch {
    return false;
  }
}

/**
 * Resolves media metadata from a YouTube URL or direct media link.
 */
export async function resolveRemoteMedia(
  rawUrl: string,
  preferredType: IngestMediaType = 'video',
): Promise<RemoteMediaMeta> {
  const trimmed = rawUrl ? rawUrl.trim() : '';
  if (!isValidMediaUrl(trimmed)) {
    throw new Error('Please enter a valid YouTube link or direct video/audio URL.');
  }

  const ytId = extractYouTubeId(trimmed);

  if (ytId) {
    const thumbnailUrl = getYouTubeThumbnail(ytId);
    let resolvedTitle = `YouTube Media (${ytId})`;

    // Try fetching enriched metadata from local engine if available
    try {
      const metaRes = await fetch(`/api/youtube-meta?url=${encodeURIComponent(trimmed)}`);
      if (metaRes.ok) {
        const metaData = await metaRes.json();
        if (metaData.title) resolvedTitle = metaData.title;
      }
    } catch {
      // Offline or standalone mode: continue with standard YouTube ID & thumbnail
    }

    return {
      url: trimmed,
      source: 'youtube',
      id: ytId,
      title: resolvedTitle,
      thumbnailUrl,
      availableFormats: [
        {
          formatId: 'yt-video-1080',
          type: 'video',
          quality: '1080p / 720p (H.264 MP4)',
          ext: 'mp4',
          downloadUrl: trimmed,
        },
        {
          formatId: 'yt-audio-high',
          type: 'audio',
          quality: 'High Audio (AAC/MP3)',
          ext: 'mp3',
          downloadUrl: trimmed,
        },
      ],
    };
  }

  // Direct media URL
  try {
    const parsed = new URL(trimmed);
    const fileName = parsed.pathname.split('/').pop() || 'remote-media';
    const isAudio = /\.(mp3|wav|m4a|aac|ogg)$/i.test(fileName);
    return {
      url: trimmed,
      source: 'direct',
      title: decodeURIComponent(fileName),
      availableFormats: [
        {
          formatId: isAudio ? 'direct-audio' : 'direct-video',
          type: isAudio ? 'audio' : 'video',
          quality: 'Direct Source',
          ext: isAudio ? 'mp3' : 'mp4',
          downloadUrl: trimmed,
        },
      ],
    };
  } catch (err) {
    throw new Error('Please enter a valid YouTube link or direct video/audio URL.');
  }
}

/**
 * Downloads a remote YouTube stream or direct URL into a standard browser File object.
 * Uses local high-performance yt-dlp backend with direct fallbacks.
 */
export async function downloadRemoteMedia(
  mediaMeta: RemoteMediaMeta,
  targetType: IngestMediaType = 'video',
  onProgress?: (progress: IngestJobProgress) => void,
  signal?: AbortSignal,
): Promise<File> {
  const report = (phase: IngestJobProgress['phase'], percent: number, message: string) => {
    onProgress?.({ phase, percent, message });
  };

  report('resolving', 10, 'Connecting to stream resolver…');

  const sanitizedTitle = (mediaMeta.title || 'frostcut-import')
    .replace(/[^a-zA-Z0-9_\- ]/g, '_')
    .trim()
    .slice(0, 50) || 'youtube_import';
  const ext = targetType === 'audio' ? 'mp3' : 'mp4';
  const mime = targetType === 'audio' ? 'audio/mpeg' : 'video/mp4';

  if (mediaMeta.source === 'youtube') {
    report('resolving', 25, 'Fetching high-quality H.264 stream from media engine…');

    try {
      const downloadEndpoint = `/api/youtube-download?url=${encodeURIComponent(mediaMeta.url)}&type=${targetType}`;
      report('downloading', 45, 'Downloading video & audio streams…');

      const response = await fetch(downloadEndpoint, { signal });

      if (!response.ok) {
        let errMsg = `Download failed (${response.status})`;
        try {
          const errJson = await response.json();
          if (errJson.error) errMsg = errJson.error;
        } catch {}
        throw new Error(errMsg);
      }

      report('processing', 85, 'Packaging video into local media container…');
      const blob = await response.blob();

      if (blob.type.includes('text') || blob.size < 1000) {
        throw new Error('The downloaded stream was invalid or empty.');
      }

      const file = new File([blob], `${sanitizedTitle}.${ext}`, { type: mime });
      report('ready', 100, 'Import completed successfully!');
      return file;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`YouTube download error: ${message}`);
    }
  }

  // Direct fetch for standard URLs (direct MP4/MP3)
  report('downloading', 35, 'Fetching file directly…');
  const directRes = await fetch(mediaMeta.url, { signal });
  if (!directRes.ok) {
    throw new Error(
      `Could not download remote media directly (${directRes.status}). Ensure the URL allows cross-origin requests.`,
    );
  }

  const blob = await directRes.blob();
  if (blob.type.includes('text')) {
    throw new Error('The provided URL returned a web page instead of media content.');
  }

  const file = new File([blob], `${sanitizedTitle}.${ext}`, { type: mime });
  report('ready', 100, 'Import complete!');
  return file;
}
