import { get, set, del } from 'idb-keyval';
import type { MediaAsset } from './model';
import { mediaFiles, mediaUrls, useEditor } from './store';
import { generatePreviewProxy } from './media';
import { backgroundMediaJobs } from './media-runtime';

export type PreviewQuality = 'Auto' | 'Full' | 'Half' | 'Quarter';
type Proxy = { url: string; width: number; height: number };
export const previewProxies = new Map<string, Map<string, Proxy>>();
export const proxyStatus = new Map<
  string,
  { state: 'preparing' | 'ready' | 'error' | 'cancelled'; progress?: number; message?: string }
>();
const jobs = new Map<string, AbortController>();
export function proxyDimensions(asset: MediaAsset, quality: PreviewQuality, degraded = false) {
  if (quality === 'Full') return null;
  const heavy =
    Math.max(asset.width, asset.height) > 1280 || asset.duration > 120 || asset.size > 100e6;
  if (quality === 'Auto' && !heavy && !degraded) return null;
  const scale =
    quality === 'Half'
      ? 0.5
      : quality === 'Quarter'
        ? 0.25
        : Math.min(degraded ? 0.25 : 0.5, 540 / Math.min(asset.width, asset.height));
  return {
    width: Math.max(2, Math.round((asset.width * scale) / 2) * 2),
    height: Math.max(2, Math.round((asset.height * scale) / 2) * 2),
  };
}
export function previewSource(asset: MediaAsset, quality: PreviewQuality, degraded = false) {
  const dimensions = proxyDimensions(asset, quality, degraded);
  const proxy =
    dimensions && previewProxies.get(asset.id)?.get(`${dimensions.width}x${dimensions.height}`);
  return proxy ?? { url: mediaUrls.get(asset.id), width: asset.width, height: asset.height };
}
export function clearProxies(id: string) {
  jobs.get(id)?.abort();
  for (const proxy of previewProxies.get(id)?.values() ?? []) URL.revokeObjectURL(proxy.url);
  previewProxies.delete(id);
  proxyStatus.delete(id);
}
export async function ensureProxy(
  asset: MediaAsset,
  quality: PreviewQuality = 'Auto',
  degraded = false,
) {
  const dimensions = proxyDimensions(asset, quality, degraded),
    file = mediaFiles.get(asset.id);
  if (!dimensions || !file) return;
  const tag = `${dimensions.width}x${dimensions.height}`;
  if (previewProxies.get(asset.id)?.has(tag) || jobs.has(asset.id)) return;
  const controller = new AbortController();
  jobs.set(asset.id, controller);
  backgroundMediaJobs.add(controller);
  const key = `frostcut-proxy:${file.name}:${file.size}:${file.lastModified}:${tag}`;
  proxyStatus.set(asset.id, { state: 'preparing' });
  useEditor.getState().mediaChanged();
  try {
    let blob = await get<Blob>(key).catch(() => undefined);
    if (controller.signal.aborted) return;
    if (!blob) {
      blob = await generatePreviewProxy(
        file,
        dimensions.width,
        dimensions.height,
        controller.signal,
        (_, progress) => {
          proxyStatus.set(asset.id, { state: 'preparing', progress });
          useEditor.getState().mediaChanged();
        },
      );
      // Keep a bounded cache of the latest three proxy files.
      const cache = (await get<string[]>('frostcut-proxy-index').catch(() => [])) ?? [];
      for (const old of cache.filter((k) => k !== key).slice(2)) await del(old).catch(() => {});
      await set(key, blob).catch(() => {});
      await set('frostcut-proxy-index', [key, ...cache.filter((k) => k !== key).slice(0, 2)]).catch(
        () => {},
      );
    }
    if (controller.signal.aborted || mediaFiles.get(asset.id) !== file) return;
    const versions = previewProxies.get(asset.id) ?? new Map<string, Proxy>();
    versions.set(tag, { url: URL.createObjectURL(blob), ...dimensions });
    previewProxies.set(asset.id, versions);
    proxyStatus.set(asset.id, { state: 'ready' });
  } catch (error) {
    proxyStatus.set(
      asset.id,
      controller.signal.aborted
        ? { state: 'cancelled' }
        : { state: 'error', message: String(error) },
    );
  } finally {
    jobs.delete(asset.id);
    backgroundMediaJobs.delete(controller);
    useEditor.getState().mediaChanged();
  }
}
