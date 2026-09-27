import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
// Public upstream MediaPipe QA portrait; never redistributed as application stock footage.
const directory = 'tests/fixtures/p1-local';
await mkdir(directory, { recursive: true });
const response = await fetch('https://storage.googleapis.com/mediapipe-assets/portrait.jpg');
if (!response.ok) throw new Error(`Portrait fixture download failed: ${response.status}`);
await writeFile(`${directory}/portrait.jpg`, new Uint8Array(await response.arrayBuffer()));
const result = spawnSync(
  'ffmpeg',
  [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=gray:s=640x360:r=30:d=3',
    '-loop',
    '1',
    '-i',
    `${directory}/portrait.jpg`,
    '-filter_complex',
    '[1:v]scale=-2:340[face];[0:v][face]overlay=x=40+80*t:y=10:shortest=1',
    '-t',
    '3',
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    `${directory}/moving-face.mp4`,
  ],
  { stdio: 'inherit' },
);
if (result.status !== 0)
  throw new Error(
    'FFmpeg could not prepare the moving-face fixture. Install native ffmpeg for QA.',
  );
console.log('Prepared the local three-second moving-face QA clip.');
