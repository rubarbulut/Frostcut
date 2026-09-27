# Chroma key and clip masks

Select a video clip, open **Properties**, then **Visual effects**.

- **Chroma key:** choose a key color (or Green screen / Blue screen), then adjust
  tolerance, edge softness and spill removal. Put another video on a lower video
  track to fill the removed background.
- **Clip mask:** choose rectangle, ellipse or polygon. Rectangle and ellipse have
  center, size and rotation controls. Polygon supports 3–24 vertices; drag a point,
  use arrow keys (Shift = 5%), or enter its coordinates. Add/remove vertices as needed.
- Feather softens the boundary; Invert retains the area outside the shape. The
  shape coordinates follow the source video before clip transforms.
- Both effects can run together. Toggle an effect to retain its settings, reset
  the mask, or remove the effects entirely. Edits participate in undo/redo and
  project save/open, splits and equal-part sequences. Locked tracks cannot be edited.

The preview and export use the same WebGL shader. Paused previews redraw only
when needed; playing previews request decoded video frames. Export reads the
original media at its original resolution before fitting the output canvas.
Normal preview quality/proxy settings still apply to the editor preview.

These are static masks, not motion tracking or person segmentation. MP4 composites
transparent regions over lower tracks (or the editor background); it does not
export an alpha channel. WebGL is required; an unavailable/lost graphics context
is reported instead of silently exporting the original unprocessed image.

## Small raw-stream regression fixture

`tests/fixtures/short-annexb.h264` is a synthetic 1-second, 320 x 180, 24 fps capture
from the browser encoder: green/red fixture footage with an inverted polygon over
blue. It contains no user footage. Its 1,928 bytes are valid Annex B H.264 but the
local FFmpeg autodetection probe rejects them. Specifying the known input format
decodes all 24 frames and permits a lossless stream-copy into MP4:

```powershell
ffprobe -v error -f h264 -count_frames -show_entries stream=codec_name,width,height,nb_read_frames -of json tests/fixtures/short-annexb.h264
ffmpeg -v error -y -f h264 -r 24 -i tests/fixtures/short-annexb.h264 -c:v copy test-results/short-annexb.mp4
```

The raw canvas export input now uses `-f h264 -r <fps>` before `-i`. Encoded
software MP4 segments continue using MP4 demuxing. This does not alter bitrate,
resolution, frame rate or the encoded image data.

The browser regression in `tests/visual-effects.spec.ts` verifies composited pixels
in actual downloaded MP4s as well as editing, persistence and graphics failure
behavior. Its final rerun is deferred while the user is gaming; see P2-status.md
for the exact completed checks and remaining verification.

References: [FFmpeg input options](https://ffmpeg.org/ffmpeg.html#Main-options),
[WebGL video textures](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Animating_textures_in_WebGL),
[decoded-frame callbacks](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback).
