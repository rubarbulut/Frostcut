# Frame fill and synchronized backgrounds

The Preview toolbar offers Fit, Crop and Blur background. This is a saved,
undoable sequence setting, independent of preview resolution. Old project files
without a fill setting use Fit. Aspect buttons identify the actual dimensions,
including Shorts converted from a landscape sequence and custom resolutions.

- Fit contains the full image in the frame.
- Crop covers the frame with a centered image and clips the excess.
- Blur background combines a darkened, blurred cover image with a fitted
  foreground. Matching-aspect footage needs no backdrop.

Main preview and proposed-edit preview draw both blur images from the same decoded
video frame. There is no separate background video to drift, freeze, use the wrong
clip or continue through a gap. Preview draws when a decoded frame arrives, when
a paused seek/edit completes, or when its viewport changes. Its canvas is bounded
to the visible device-pixel size; final export uses the requested output size.

Chroma key and masks process the source before either image is drawn. The complete
background/foreground plane then receives clip opacity, movement, scale, rotation
and crop together. Timeline adjustment layers grade the final video composite;
captions remain above it. Export uses the same geometry and blur parameters.
The blur radius scales with output size, and overscan keeps filtered edges outside
the frame. The canvas is reused and its backing size is released on cleanup.

Visible differing-aspect footage with Crop/Blur routes export through the visual
renderer. Fit and matching-aspect footage retain the existing export path unless
another feature requires visual compositing. Canvas-filter failures are shown;
an unsupported browser can explicitly choose Fit.

Eight focused tests passed in 766 ms with one worker; source type-check passed.
They check contain/cover geometry, actual ratio selection, transformed handle
bounds, export routing, same-frame composition, filter reset/unsupported errors
and canvas reuse/cleanup. These checks do not establish browser pixel accuracy
or real MP4 fidelity.

Pending visual QA: play/pause/seek, clip gaps and cuts, hidden tracks, overlapping
clips and opacity, proxy switching, effect disable/recovery, all four aspect ratios,
custom export dimensions, chroma/masks, grade/caption ordering and batch output.
Actual media rendering is deferred while the user is doing animation work.
