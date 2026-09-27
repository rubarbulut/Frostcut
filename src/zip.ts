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
    name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .trim()
      .slice(0, 100) || 'FrostCut'
  );
}
/** Stored ZIP entries keep MP4 bytes intact. CRC passes use bounded buffers, not a second full copy. */
export async function zipFiles(
  files: { name: string; blob: Blob }[],
  signal?: AbortSignal,
): Promise<Blob> {
  if (files.length > 65535) throw new Error('Too many files for this ZIP.');
  const parts: BlobPart[] = [],
    directory: BlobPart[] = [];
  let offset = 0,
    centralSize = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(safeFilename(file.name));
    if (offset + file.blob.size > 0xffff0000)
      throw new Error('This batch exceeds the 4 GB ZIP limit. Export fewer Shorts at once.');
    let crc = 0xffffffff;
    for (let start = 0; start < file.blob.size; start += 4 * 1024 * 1024) {
      signal?.throwIfAborted();
      const bytes = new Uint8Array(
        await file.blob.slice(start, start + 4 * 1024 * 1024).arrayBuffer(),
      );
      for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
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
