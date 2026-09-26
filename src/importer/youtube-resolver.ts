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
    return {
      url: trimmed,
      source: 'youtube',
      id: ytId,
      title: `YouTube Media (${ytId})`,
      thumbnailUrl,
      availableFormats: [
        {
          formatId: 'yt-video-1080',
          type: 'video',
          quality: '1080p / 720p',
          ext: 'mp4',
          downloadUrl: trimmed,
        },
        {
          formatId: 'yt-audio-high',
          type: 'audio',
          quality: 'High Audio (320kbps)',
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
 * Uses Cobalt API or direct fetch with progress reporting.
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

  if (mediaMeta.source === 'youtube') {
    // Attempt resolving via Cobalt open stream API
    try {
      report('resolving', 25, 'Fetching media stream information…');
      const cobaltPayload = {
        url: mediaMeta.url,
        videoQuality: '1080',
        audioFormat: targetType === 'audio' ? 'mp3' : 'best',
        downloadMode: targetType === 'audio' ? 'audio' : 'auto',
      };

      const response = await fetch('https://api.cobalt.tools/api/json', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cobaltPayload),
        signal,
      });

      if (response.ok) {
        const data = await response.json();
        const streamUrl = data.url || data.stream;
        if (streamUrl) {
          report('downloading', 45, 'Downloading media data to local memory…');
          const fileRes = await fetch(streamUrl, { signal });
          if (!fileRes.ok) throw new Error(`Download failed with status ${fileRes.status}`);

          const blob = await fileRes.blob();
          report('processing', 90, 'Preparing media file for local editor…');
          const ext = targetType === 'audio' ? 'mp3' : 'mp4';
          const mime = targetType === 'audio' ? 'audio/mpeg' : 'video/mp4';
          const sanitizedTitle = (mediaMeta.title || 'frostcut-import')
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .slice(0, 40);

          const file = new File([blob], `${sanitizedTitle}.${ext}`, { type: mime });
          report('ready', 100, 'Import completed successfully!');
          return file;
        }
      }
    } catch (apiErr) {
      // Fallback: If external API is rate-limited or blocked, create simulated playable clip or throw helpful guidance
      console.warn('External stream resolver unavailable, falling back:', apiErr);
    }
  }

  // Direct fetch for standard URLs
  report('downloading', 35, 'Fetching file directly…');
  const directRes = await fetch(mediaMeta.url, { signal });
  if (!directRes.ok) {
    throw new Error(
      `Could not download remote media directly (${directRes.status}). Ensure the URL allows cross-origin requests.`,
    );
  }

  const blob = await directRes.blob();
  const ext = targetType === 'audio' ? 'mp3' : 'mp4';
  const mime = targetType === 'audio' ? 'audio/mpeg' : 'video/mp4';
  const file = new File([blob], `${mediaMeta.title || 'remote-import'}.${ext}`, { type: mime });

  report('ready', 100, 'Import complete!');
  return file;
}
