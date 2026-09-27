import { type Project, type MediaAsset, defaultProps, uid, duration } from './model';
export type Attribution = {
  title: string;
  creator: string;
  license: string;
  licenseUrl: string;
  url: string;
};
export type StockVideo = {
  id: string;
  attribution: Attribution;
  url: string;
  thumbnail: string;
  size: number;
  mime: string;
};
export function httpsUrl(value: unknown, domains?: string[]) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && (!domains || domains.includes(url.hostname))
      ? url.href
      : '';
  } catch {
    return '';
  }
}
function plain(value: string) {
  return (
    new DOMParser()
      .parseFromString(value, 'text/html')
      .body.textContent?.replace(/\s+/g, ' ')
      .trim()
      .slice(0, 600) ?? ''
  );
}
export async function searchStock(query: string, signal: AbortSignal): Promise<StockVideo[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: `filetype:video ${query}`,
    gsrlimit: '24',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size|mime',
    iiurlwidth: '320',
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { signal });
  if (!response.ok)
    throw new Error(`Commons search unavailable (${response.status}). Try again later.`);
  const result = await response.json();
  if (result.error) throw new Error(result.error.info ?? 'Commons search failed.');
  const videos: StockVideo[] = [];
  for (const page of Object.values(result.query?.pages ?? {}) as {
    pageid: number;
    title: string;
    imageinfo?: {
      url: string;
      descriptionurl: string;
      thumburl?: string;
      size: number;
      mime: string;
      extmetadata?: Record<string, { value: string }>;
    }[];
  }[]) {
    const info = page.imageinfo?.[0];
    if (!info || info.size > 100 * 1024 * 1024 || !['video/webm', 'video/mp4'].includes(info.mime))
      continue;
    const meta = info.extmetadata ?? {},
      license = plain(meta.LicenseShortName?.value ?? '');
    // P1 supports attribution licenses and public-domain material, not missing/ambiguous terms.
    if (!/^(CC BY(?:-SA)? |CC0|Public domain)/i.test(license)) continue;
    const url = httpsUrl(info.url, ['upload.wikimedia.org']);
    const pageUrl = httpsUrl(info.descriptionurl, ['commons.wikimedia.org']);
    const licenseUrl =
      httpsUrl(meta.LicenseUrl?.value) ||
      (/CC0/i.test(license)
        ? 'https://creativecommons.org/publicdomain/zero/1.0/'
        : /Public domain/i.test(license)
          ? 'https://creativecommons.org/publicdomain/mark/1.0/'
          : '');
    if (!url || !pageUrl || !licenseUrl) continue;
    videos.push({
      id: String(page.pageid),
      url,
      thumbnail: httpsUrl(info.thumburl, ['upload.wikimedia.org', 'thumb.wikimedia.org']),
      size: info.size,
      mime: info.mime,
      attribution: {
        title: plain(page.title.replace(/^File:/, '')),
        creator: plain(meta.Artist?.value ?? 'See source page'),
        license,
        licenseUrl,
        url: pageUrl,
      },
    });
  }
  return videos.sort((a, b) => a.size - b.size);
}
export function insertBroll(p: Project, asset: MediaAsset, start: number, end: number): Project {
  const track = p.tracks.find((t) => t.id === 'V2');
  if (!track || track.locked) throw new Error('Unlock V2 before inserting B-roll.');
  const from = Math.max(0, Math.min(start, duration(p))),
    length = Math.min(asset.duration, end - from, duration(p) - from);
  if (length < 0.1) throw new Error('Choose at least 0.1 seconds inside the timeline.');
  if (
    p.clips.some(
      (c) =>
        c.trackId === 'V2' &&
        c.start < from + length &&
        c.start + (c.sourceEnd - c.sourceStart) / c.properties.speed > from,
    )
  )
    throw new Error('V2 already contains footage in this range. Move it or choose another time.');
  return {
    ...p,
    media: [...p.media, asset],
    clips: [
      ...p.clips,
      {
        id: uid(),
        mediaId: asset.id,
        trackId: 'V2',
        start: from,
        sourceStart: 0,
        sourceEnd: length,
        properties: { ...defaultProps, volume: 0 },
        aiReason: 'Illustrative stock B-roll selected by you.',
      },
    ],
  };
}
export async function downloadStock(
  video: StockVideo,
  signal: AbortSignal,
  progress: (message: string) => void,
) {
  const response = await fetch(video.url, { signal });
  if (!response.ok || !response.body)
    throw new Error(`Video download failed (${response.status}).`);
  const reader = response.body.getReader(),
    parts: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 100 * 1024 * 1024)
        throw new Error(
          'This source exceeds the 100 MB stock import limit. Choose a smaller clip.',
        );
      parts.push(value as Uint8Array<ArrayBuffer>);
      progress(`Downloading stock footage · ${(total / 1024 / 1024).toFixed(1)} MB`);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return new File(parts, video.attribution.title, { type: video.mime });
}
