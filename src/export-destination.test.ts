import { describe, expect, it, vi } from 'vitest';
import { exportFilename, saveInExportFolder, type ExportFolder } from './export-destination';

function folderFixture(existing = new Set<string>()) {
  const write = vi.fn(async (_blob: Blob) => {});
  const close = vi.fn(async () => {});
  const abort = vi.fn(async () => {});
  const created: string[] = [];
  const folder: ExportFolder = {
    name: 'Exports',
    requestPermission: async () => 'granted',
    getFileHandle: async (name, options) => {
      if (!options?.create && !existing.has(name))
        throw new DOMException('Missing', 'NotFoundError');
      if (options?.create) created.push(name);
      return { createWritable: async () => ({ write, close, abort }) };
    },
  };
  return { folder, write, close, abort, created };
}
describe('export destinations without media encoding', () => {
  it('keeps extensions, Unicode, safe names and Windows reserved names usable', () => {
    expect(exportFilename(' Bölüm 01.ZIP ', 'zip')).toBe('Bölüm 01.zip');
    expect(exportFilename('CON', 'mp4')).toBe('_CON.mp4');
    expect(exportFilename('../part?', 'zip')).not.toContain('/');
    expect(exportFilename('...', 'zip')).toBe('FrostCut.zip');
    expect(exportFilename('a'.repeat(120), 'mp4').length).toBeLessThanOrEqual(104);
  });
  it('writes the same blob to a numbered copy and reports success only after close', async () => {
    const f = folderFixture(new Set(['part.zip', 'part (1).zip']));
    const blob = new Blob(['small fixture']);
    expect(await saveInExportFolder(f.folder, 'part.zip', blob)).toBe('part (2).zip');
    expect(f.created).toEqual(['part (2).zip']);
    expect(f.write).toHaveBeenCalledWith(blob);
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.abort).not.toHaveBeenCalled();
  });
  it('does not write after permission denial or an already cancelled save', async () => {
    const f = folderFixture();
    f.folder.requestPermission = async () => 'denied';
    await expect(saveInExportFolder(f.folder, 'part.zip', new Blob())).rejects.toThrow(
      'not granted',
    );
    const c = new AbortController();
    c.abort();
    await expect(
      saveInExportFolder(f.folder, 'part.zip', new Blob(), c.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.created).toEqual([]);
    expect(f.write).not.toHaveBeenCalled();
  });
  it('aborts the file transaction on write failure and does not claim a completed save', async () => {
    const f = folderFixture();
    f.write.mockRejectedValueOnce(new DOMException('Disk full', 'QuotaExceededError'));
    await expect(saveInExportFolder(f.folder, 'part.zip', new Blob())).rejects.toThrow('Disk full');
    expect(f.abort).toHaveBeenCalledOnce();
    expect(f.close).not.toHaveBeenCalled();
  });
  it('stops an in-flight save without closing and publishing its bytes', async () => {
    const f = folderFixture(),
      c = new AbortController();
    f.write.mockImplementationOnce(async () => {
      c.abort();
    });
    await expect(
      saveInExportFolder(f.folder, 'part.zip', new Blob(), c.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.abort).toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();
  });
});
