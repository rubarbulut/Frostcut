import { expect, it } from 'vitest';
import { publicAsset } from './public-asset';

it('keeps root hosting and per-PR subdirectory assets inside their deployment', () => {
  for (const base of ['/', '/Frostcut/', '/Frostcut/previews/pr-123/', '/Frostcut']) {
    const prefix = base.endsWith('/') ? base : base + '/';
    for (const path of ['runtime/ffmpeg-core.wasm', '/fonts/NotoSans.ttf', 'spoken-demo.srt'])
      expect(publicAsset(path, base)).toBe(prefix + path.replace(/^\//, ''));
  }
  expect(publicAsset('models/face.tflite')).toBe('/models/face.tflite');
});
