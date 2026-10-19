// Run explicitly on the GitHub runner, never on application startup or install.
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source = 'public/demo.mp4', output = 'browser-demo/demo.webm';
await mkdir('browser-demo', { recursive: true });
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0)
    throw new Error(`${command} failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout;
}
run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', source,
  '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libvpx-vp9', '-lossless', '1',
  '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', '-threads', '2',
  '-c:a', 'libopus', '-b:a', '192k', output]);

function frames(path) {
  return run('ffmpeg', ['-v', 'error', '-i', path, '-map', '0:v:0',
    '-pix_fmt', 'yuv420p', '-f', 'framemd5', '-'])
    .split('\n').filter(line => line.trim() && !line.startsWith('#'))
    .map(line => line.split(',').at(-1).trim());
}
const originalFrames = frames(source), portableFrames = frames(output);
if (!originalFrames.length || originalFrames.length !== portableFrames.length ||
  originalFrames.some((hash, i) => hash !== portableFrames[i]))
  throw new Error('The portable sample must preserve every decoded source video frame');

function probe(path) {
  return JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration:stream=codec_name,codec_type,width,height,sample_rate,channels',
    '-of', 'json', path]));
}
const original = probe(source), portable = probe(output);
const video = value => value.streams.find(stream => stream.codec_type === 'video');
if (video(original).width !== video(portable).width ||
  video(original).height !== video(portable).height ||
  Math.abs(Number(original.format.duration) - Number(portable.format.duration)) > 1 / 30)
  throw new Error('The portable sample changed dimensions or exceeded one frame of codec padding');
if (original.streams.some(stream => stream.codec_type === 'audio') &&
  !portable.streams.some(stream => stream.codec_type === 'audio'))
  throw new Error('The portable sample lost its audio');
const sha256 = async path => createHash('sha256').update(await readFile(path)).digest('hex');
await writeFile('browser-demo/metadata.json', JSON.stringify({
  source, output, sourceSha256: await sha256(source), outputSha256: await sha256(output),
  verifiedVideoFrames: originalFrames.length, videoFramesIdentical: true,
  original, portable,
  note: 'Additional VP9 lossless video / Opus audio sample for browsers without H.264. The original MP4 remains unchanged.',
}, null, 2) + '\n');
console.log(`Verified ${originalFrames.length} identical decoded video frames and retained audio`);
