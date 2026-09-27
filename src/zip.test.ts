import { afterEach, describe, expect, it, vi } from 'vitest';
import { zipEntryNames, zipFiles, type ZipProgress } from './zip';

afterEach(() => vi.restoreAllMocks());
describe('portable ZIP archives', () => {
  it('retains extensions and keeps sanitized, shortened, Unicode and case-colliding names distinct', () => {
    const names = zipEntryNames([
      `${'🎬'.repeat(120)}.mp4`,
      'part?.mp4',
      'part*.mp4',
      'PART_.mp4',
      'CON.mp4',
      '../file.mp4',
      '...',
      'Résumé.srt',
      'Re\u0301sume\u0301.srt',
    ]);
    expect(names[0].endsWith('.mp4')).toBe(true);
    expect(Array.from(names[0]).length).toBe(100);
    expect(names[0]).not.toContain('\uFFFD');
    expect(names.slice(1, 5)).toEqual(['part_.mp4', 'part_ (1).mp4', 'PART_ (2).mp4', '_CON.mp4']);
    expect(names[5]).not.toContain('/');
    expect(names[6]).toBe('FrostCut');
    expect(new Set(names.map((s) => s.normalize('NFC').toLowerCase())).size).toBe(names.length);
    expect(zipEntryNames(names)).toEqual(names);
  });
  it('stores exact bytes, known CRC-32 and UTF-8 names with a consistent central directory', async () => {
    const events: ZipProgress[] = [];
    const files = [
      { name: 'Türkçe.mp4', blob: new Blob(['123456789']) },
      { name: 'empty.srt', blob: new Blob([]) },
    ];
    const bytes = new Uint8Array(
      await (await zipFiles(files, undefined, (p) => events.push(p))).arrayBuffer(),
    );
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(6, true)).toBe(0x800);
    expect(view.getUint32(14, true)).toBe(0xcbf43926);
    const nameLength = view.getUint16(26, true);
    expect(new TextDecoder().decode(bytes.slice(30, 30 + nameLength))).toBe('Türkçe.mp4');
    expect(new TextDecoder().decode(bytes.slice(30 + nameLength, 39 + nameLength))).toBe(
      '123456789',
    );
    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const directory = view.getUint32(end + 16, true);
    expect(view.getUint32(directory, true)).toBe(0x02014b50);
    expect(view.getUint32(directory + 16, true)).toBe(0xcbf43926);
    expect(view.getUint32(end + 12, true) + directory).toBe(end);
    expect(events[0]).toMatchObject({
      processedBytes: 0,
      totalBytes: 9,
      completedFiles: 0,
      totalFiles: 2,
    });
    expect(events.at(-1)).toMatchObject({ processedBytes: 9, completedFiles: 2 });
    expect(events.every((p, i) => !i || p.processedBytes >= events[i - 1].processedBytes)).toBe(
      true,
    );
  });
  it('rejects oversize archives including headers before reading their blobs', async () => {
    const slice = vi.fn();
    const blob = { size: 0xffff0000 - 30, slice } as unknown as Blob;
    await expect(zipFiles([{ name: 'big.mp4', blob }])).rejects.toThrow('4 GB');
    expect(slice).not.toHaveBeenCalled();
  });
  it('gives a queued cancellation a turn between chunks without scanning the rest', async () => {
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 20));
    const c = new AbortController();
    const blob = new Blob([new Uint8Array(1024 * 1024 + 1)]);
    const slice = vi.spyOn(blob, 'slice');
    await expect(
      zipFiles([{ name: 'video.mp4', blob }], c.signal, (p) => {
        if (p.processedBytes > 0) setTimeout(() => c.abort(), 0);
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(slice).toHaveBeenCalledOnce();
  });
  it('honors cancellation even for an empty archive or before reading a chunk', async () => {
    const c = new AbortController();
    c.abort();
    await expect(zipFiles([], c.signal)).rejects.toMatchObject({ name: 'AbortError' });
    const d = new AbortController();
    const blob = new Blob(['small']);
    const slice = vi.spyOn(blob, 'slice');
    await expect(
      zipFiles([{ name: 'empty.zip', blob }], d.signal, () => d.abort()),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(slice).not.toHaveBeenCalled();
  });
});
