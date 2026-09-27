import { mkdir, copyFile, readdir } from 'node:fs/promises';
await mkdir('public/runtime', { recursive: true });
for (const name of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  await copyFile(`node_modules/@ffmpeg/core/dist/esm/${name}`, `public/runtime/${name}`);
}
await mkdir('public/runtime/vision', { recursive: true });
for (const name of await readdir('node_modules/@mediapipe/tasks-vision/wasm')) {
  if (/\.(js|wasm)$/.test(name))
    await copyFile(`node_modules/@mediapipe/tasks-vision/wasm/${name}`, `public/runtime/vision/${name}`);
}
