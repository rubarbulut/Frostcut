import { describe, expect, it, vi } from 'vitest';
import { addMedia, createProject } from './model';
import { MAX_PROJECT_FILE_BYTES, assertProjectFileSize, projectFileBlob, readProjectFile } from './project-file';
import { createEqualPartSequences } from './equal-parts';

describe('project file round trip and byte budget', () => {
  it('saves compact UTF-8 JSON retaining full tracking, sequence and typography data', async () => {
    const p = createEqualPartSequences(addMedia(createProject('Bölüm 🎬', 'YouTube'), {
      id: 'm', name: 'video.mp4', duration: 12, width: 1920, height: 1080, size: 1, type: 'video/mp4',
    }), { mode: 'count', value: 2 });
    p.clips[0].tracking = { version: 1, enabled: true, sourceWidth: 1920, sourceHeight: 1080,
      start: 0, end: 12, region: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
      points: Array.from({ length: 600 }, (_, i) => ({ time: i / 60, x: i / 600, y: 0.5, correlation: 0.98 })) };
    const original = structuredClone(p), blob = projectFileBlob(p), text = await blob.text();
    expect(blob.type).toBe('application/json');
    expect(blob.size).toBe(new TextEncoder().encode(text).byteLength);
    expect(blob.size).toBeLessThan(new Blob([JSON.stringify(p, null, 2)]).size);
    const restored = await readProjectFile(blob);
    expect(restored.clips[0].tracking?.points).toEqual(p.clips[0].tracking.points);
    expect(restored.sequences?.map((s) => s.name)).toEqual(p.sequences?.map((s) => s.name));
    expect(restored.name).toBe('Bölüm 🎬');
    expect(p).toEqual(original);
  });
  it('accepts legacy formatted files and applies full model validation', async () => {
    const p = createProject('Legacy');
    expect((await readProjectFile(new Blob([JSON.stringify(p, null, 2)]))).name).toBe('Legacy');
    await expect(readProjectFile(new Blob(['{ broken']))).rejects.toThrow('JSON');
    await expect(readProjectFile(new Blob(['{"version":1}']))).rejects.toThrow('valid FrostCut');
  });
  it('uses identical inclusive byte boundaries and rejects excessive imports before reading', async () => {
    expect(() => assertProjectFileSize(MAX_PROJECT_FILE_BYTES)).not.toThrow();
    expect(() => assertProjectFileSize(MAX_PROJECT_FILE_BYTES + 1)).toThrow('64 MiB');
    expect(() => assertProjectFileSize(NaN)).toThrow();
    const text = vi.fn(async () => '{}');
    await expect(readProjectFile({ size: MAX_PROJECT_FILE_BYTES + 1, text })).rejects.toThrow('autosave remain unchanged');
    expect(text).not.toHaveBeenCalled();
  });
});
