import type { MediaAsset } from './model';
import { publicAsset } from './public-asset';

/** Both are real sample media; imported originals never pass through this fallback. */
export async function loadBuiltinSample(
  inspect: (file: File) => Promise<MediaAsset>,
  canPlay = (type: string) => document.createElement('video').canPlayType(type),
  request: typeof fetch = fetch,
) {
  const mp4 = { extension: 'mp4', type: 'video/mp4' },
    webm = { extension: 'webm', type: 'video/webm' };
  const preferWebm = !canPlay('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') &&
    !!canPlay('video/webm; codecs="vp9, opus"');
  let failure: unknown;
  for (const format of preferWebm ? [webm, mp4] : [mp4, webm]) {
    try {
      const response = await request(publicAsset(`demo.${format.extension}`));
      if (!response.ok || response.headers.get('content-type')?.includes('text/html'))
        throw new Error(`Sample ${format.extension} is unavailable (${response.status})`);
      const file = new File([await response.blob()], `A better story — sample.${format.extension}`, {
        type: format.type,
      });
      const asset = await inspect(file);
      return { file, asset };
    } catch (error) { failure = error; }
  }
  throw new Error('The sample could not be opened in this browser. Import your own playable footage to start.', {
    cause: failure,
  });
}
