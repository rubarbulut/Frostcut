const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function header(size: number, fields: [number, number, 2 | 4][]) {
  const bytes = new Uint8Array(size),
    view = new DataView(bytes.buffer);
  for (const [offset, value, length] of fields)
    length === 2 ? view.setUint16(offset, value, true) : view.setUint32(offset, value, true);
  return bytes;
}
export function safeFilename(name: string) {
  return (
    Array.from(name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim())
      .slice(0, 100)
      .join('') || 'FrostCut'
  );
}
/** Portable, unique ZIP leaf names; reserve room for the extension before shortening. */
export function zipEntryNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw) => {
    const cleaned = raw
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .trim()
      .replace(/[. ]+$/g, '');
    const extension = cleaned.match(/\.[a-z0-9]{1,12}$/i)?.[0] ?? '';
    let stem =
      (extension ? cleaned.slice(0, -extension.length) : cleaned).replace(/[. ]+$/g, '') ||
      'FrostCut';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = `_${stem}`;
    for (let number = 0; ; number++) {
      const suffix = number ? ` (${number})` : '';
      const name = `${Array.from(stem)
        .slice(0, 100 - suffix.length - extension.length)
        .join('')}${suffix}${extension}`;
      const key = name.normalize('NFC').toLowerCase();
      if (!used.has(key)) {
        used.add(key);
        return name;
      }
    }
  });
}
export type ZipProgress = {
  processedBytes: number;
  totalBytes: number;
  completedFiles: number;
  totalFiles: number;
  currentFile: string;
};
/** Stored ZIP entries keep MP4 bytes intact. CRC passes use bounded buffers, not a second full copy. */
export async function zipFiles(
  files: { name: string; blob: Blob }[],
  signal?: AbortSignal,
  onProgress?: (progress: ZipProgress) => void,
): Promise<Blob> {
  signal?.throwIfAborted();
  if (files.length > 65535) throw new Error('Too many files for this ZIP.');
  const names = zipEntryNames(files.map((file) => file.name));
  const encodedNames = names.map((name) => new TextEncoder().encode(name));
  const totalBytes = files.reduce((sum, file) => sum + file.blob.size, 0);
  const archiveSize = files.reduce(
    (sum, file, index) => sum + file.blob.size + 76 + 2 * encodedNames[index].length,
    22,
  );
  if (archiveSize > 0xffff0000)
    throw new Error('This batch exceeds the 4 GB ZIP limit. Export fewer Shorts at once.');
  const parts: BlobPart[] = [],
    directory: BlobPart[] = [];
  let offset = 0,
    centralSize = 0;
  let processedBytes = 0,
    completedFiles = 0,
    lastYield = performance.now();
  const report = (currentFile: string) => {
    onProgress?.({
      processedBytes,
      totalBytes,
      completedFiles,
      totalFiles: files.length,
      currentFile,
    });
    signal?.throwIfAborted();
  };
  report(names[0] ?? '');
  for (const [index, file] of files.entries()) {
    signal?.throwIfAborted();
    const name = encodedNames[index];
    let crc = 0xffffffff;
    for (let start = 0; start < file.blob.size; start += 1024 * 1024) {
      signal?.throwIfAborted();
      const bytes = new Uint8Array(await file.blob.slice(start, start + 1024 * 1024).arrayBuffer());
      signal?.throwIfAborted();
      for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
      processedBytes += bytes.length;
      if (performance.now() - lastYield >= 16) {
        report(names[index]);
        // Give input/paint a turn, including a queued Cancel click, during long archives.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        signal?.throwIfAborted();
        lastYield = performance.now();
      }
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    parts.push(
      header(30, [
        [0, 0x04034b50, 4],
        [4, 20, 2],
        [6, 0x800, 2],
        [12, 33, 2],
        [14, crc, 4],
        [18, file.blob.size, 4],
        [22, file.blob.size, 4],
        [26, name.length, 2],
      ]),
      name,
      file.blob,
    );
    directory.push(
      header(46, [
        [0, 0x02014b50, 4],
        [4, 20, 2],
        [6, 20, 2],
        [8, 0x800, 2],
        [14, 33, 2],
        [16, crc, 4],
        [20, file.blob.size, 4],
        [24, file.blob.size, 4],
        [28, name.length, 2],
        [42, offset, 4],
      ]),
      name,
    );
    offset += 30 + name.length + file.blob.size;
    centralSize += 46 + name.length;
    completedFiles++;
    report(names[index]);
  }
  signal?.throwIfAborted();
  return new Blob(
    [
      ...parts,
      ...directory,
      header(22, [
        [0, 0x06054b50, 4],
        [8, files.length, 2],
        [10, files.length, 2],
        [12, centralSize, 4],
        [16, offset, 4],
      ]),
    ],
    { type: 'application/zip' },
  );
}
