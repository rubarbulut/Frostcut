import { describe, expect, it, vi } from 'vitest';
import { loadBuiltinSample } from './builtin-sample';
import type { MediaAsset } from './model';

const inspected: MediaAsset = {
  id: 'checked-sample', name: 'inspected sample', duration: 24.008,
  width: 360, height: 640, size: 680890, type: 'video/webm',
};
const response = () => new Response(new Blob(['sample bytes']), {
  headers: { 'content-type': 'video/webm' },
});

describe('built-in sample compatibility', () => {
  it('uses only the original MP4 when the browser can inspect it', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response());
    const inspect = vi.fn().mockResolvedValue(inspected);
    const result = await loadBuiltinSample(inspect, () => 'probably', request);
    expect(request.mock.calls.map(([url]) => url)).toEqual(['/demo.mp4']);
    expect(inspect.mock.calls[0][0].name).toBe('A better story — sample.mp4');
    expect(result.asset).toBe(inspected);
  });

  it('opens real WebM directly on a browser without H.264/AAC support', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response());
    const inspect = vi.fn().mockResolvedValue(inspected);
    const result = await loadBuiltinSample(inspect,
      type => type.startsWith('video/webm') ? 'probably' : '', request);
    expect(request.mock.calls.map(([url]) => url)).toEqual(['/demo.webm']);
    expect(result.file.type).toBe('video/webm');
    expect(result.file.name).toBe('A better story — sample.webm');
    expect(result.asset.duration).toBe(24.008); // Keep actual inspected timing, including codec padding.
    expect(inspect).toHaveBeenCalledWith(result.file);
  });

  it('retries with a real inspected alternate when the capability hint was too optimistic', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => response());
    const inspect = vi.fn().mockRejectedValueOnce(new Error('unsupported H.264'))
      .mockResolvedValueOnce(inspected);
    const result = await loadBuiltinSample(inspect, () => 'probably', request);
    expect(request.mock.calls.map(([url]) => url)).toEqual(['/demo.mp4', '/demo.webm']);
    expect(inspect.mock.calls.map(([file]) => file.type)).toEqual(['video/mp4', 'video/webm']);
    expect(result.asset).toBe(inspected);
  });

  it('rejects HTML fallbacks and reports failure rather than inventing playable metadata', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response('<html>not a video</html>', { headers: { 'content-type': 'text/html' } }));
    const inspect = vi.fn();
    await expect(loadBuiltinSample(inspect, () => 'probably', request))
      .rejects.toThrow('Import your own playable footage');
    expect(inspect).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(2);
  });
});
