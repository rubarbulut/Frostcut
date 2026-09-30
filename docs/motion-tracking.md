# Local motion tracking — implementation in progress

The editor now exposes a local source-region tracker in the selected video clip's
Motion tracking inspector. Matcher, worker, original-source decoder, review/apply
UI and editable saved motion are implemented. Real footage/browser/export review
remains pending; P2 motion tracking is not marked complete.

## Editor flow

1. Select an unlocked local video clip and open Motion tracking → Select source
   region. Set the source range, sample rate and analysis longest side.
2. Load original reference, then drag a textured rectangle or edit its percentages.
   The rectangle must be at least 8 pixels per side at analysis resolution.
3. Track selected range starts an explicit local job with progress and cancellation.
   Closing the dialog, relinking media, switching selection or changing the project
   cancels/invalidate the job. Nothing starts from mounting/opening the inspector.
4. Review the measured trajectory and any low-correlation/ambiguous target loss.
   Apply measured motion or explicitly Apply tracked portion commits one undoable
   edit. Fewer than two measured points cannot apply. An existing layer is replaced
   only by this explicit action; cancelled/failed jobs leave it intact.
5. Enable/disable/remove the layer or edit saved points one at a time. Point-number
   navigation exposes every point without rendering a full table. Source timestamps
   and X/Y percentages are editable; add at playhead and delete non-anchor points
   are supported. The first point remains the compensation anchor.

Outside the saved half-open source range, original animation resumes. A partial
application can therefore create a visible transition; the review explains this.
No position is extrapolated into the untracked remainder.

## Implemented core

`RegionTracker` measures a selected source rectangle in successive grayscale
frames. It searches every integer position inside a bounded window and compares
a fixed grid of at most 256 reference samples using mean-subtracted normalized
correlation. This uses the mathematical approach described in the
[OpenCV template-matching documentation](https://docs.opencv.org/4.13.0/de/da9/tutorial_template_matching.html).
It is an independent TypeScript implementation; OpenCV is not a runtime dependency.

Coordinates are normalized source-image centers with their original source
timestamps. The reference template remains fixed, avoiding unchecked template
drift. A low-correlation or similarly strong spatially separated match returns a
lost-target result with no position, then stops. Textureless seeds fail with an
actionable error. Correlation/margin thresholds are matching heuristics, not an
object-recognition confidence or calibrated probability.

This tracker handles translation of a textured region. Large appearance changes,
rotation, scale changes, occlusion, repeated patterns or motion outside the local
search window may cause loss. It does not infer a semantic object identity or
invent a trajectory after loss. Actual footage quality remains unverified.

## Worker and memory bounds

- Frames are 8–640 px per side, complete RGBA or grayscale arrays, with valid
  increasing source timestamps and consistent dimensions.
- The bridge transfers one owned RGBA buffer and awaits its result before another
  frame can be submitted. Oversized/shared backing buffers are refused.
- RGBA-to-grayscale conversion and correlation run in the worker. The tracker
  retains only its reference samples, local score buffer and last accepted position;
  it does not keep a decoded-video history or load a model.
- Cancellation terminates the worker and rejects the in-flight operation. Lost
  targets terminate before yielding the final result. Normal completion, consumer
  return and transport/runtime errors clean up as well.
- The on-demand source reader uses the original registered local blob URL, one
  paused off-DOM video and one canvas bounded to the chosen 320/480/640 px longest
  side, without upsampling. It does not use proxy/effected/composited output.
- Loading/seeking waits register listeners before initiating work, have a 15-second
  timeout and observe cancellation. All completion/error/abort paths pause, detach
  and release the decoder/canvas; concurrent reads are refused.
- Source samples are end-exclusive. Their timestamps use the video's reported
  currentTime after seek, not encoded frame PTS. Variable-frame-rate and frame
  presentation accuracy require real-media review. Output quality/fps are unchanged.
- Requests above 50,000 samples are refused before decode. The user can explicitly
  choose a shorter range or lower sample rate. All accepted points are stored;
  only the review SVG is bounded to approximately 1,024 drawing vertices.

## Evidence

The optional per-clip tracking layer preserves every accepted source point (up to
50,000; excess requests are refused, not truncated). Binary-search interpolation
composes region translation compensation with the original animation, current
Fit/Crop/Blur foreground geometry, scale and rotation. This retains intentional
baseline movement; it does not promise to pin a target despite that movement.
Compensation is active only inside the saved half-open source range. No tail is
invented after that range. Existing native animation limits remain unchanged.

Both previews, canvas export and preview handles consume the shared composition.
Transform fields and keyframe capture still edit the baseline, avoiding double
application. Tracking is copied through splits/parts, linked to source time under
move/trim/speed, validated on open and removed from detached audio copies. Point
edits explicitly become manual and drop measured correlation/margin metadata.

Ten focused tests across tracking-layer and native-motion suites passed in 567 ms
with one worker; source type-check passed. Six new tests cover geometry, baseline
preservation, 600-point persistence, invalid data, time mapping, locks, stale
results, manual editing and actual store Undo/Redo. Pixel/media QA remains pending.

Twelve tests across matcher/worker suites passed in 357 ms with one active worker;
source type-check passed. Tests use tiny deterministic pixel arrays to establish
measured translation, brightness normalization, occlusion/ambiguity loss, texture
rejection, input bounds/ownership, source times and color conversion. Worker tests
cover backpressure, abort, errors, transferred-buffer bounds and immediate cleanup
on loss. The bridge uses a fake transport in tests; real worker loading, video
decoding, tracking accuracy and preview/export motion remain unverified.

The integrated source/job/layer/matcher/worker/native-motion suites passed 29 tests
in 1.67 seconds with one active worker; final source type-check passed. Four new
source tests exercise an EventTarget media double and owned bounded pixel buffers,
including abort during load/seek, errors/timeouts, geometry, backpressure and
end-exclusive source sampling. Three job tests cover measured result provenance,
partial/no-tail application, single-seed rejection, request budgets and cleanup on
failure/abort. These do not establish real codec/browser behavior. No actual video,
model inference, render, production build or browser suite was started.

## Remaining acceptance checks

1. Review actual local MP4/WebM and variable-frame-rate seeks, worker loading,
   rectangle pointer/keyboard/numeric interactions and result presentation.
2. Check textured translations, repeated patterns/occlusion, cancellation while
   loading/seeking/matching, relink/project/sequence invalidation and lock guards.
3. Compare measured motion in both previews and decoded MP4, including Fit/Crop/Blur,
   existing animation/scale/rotation, trim/speed, split, episode/sequence and batch
   exports. Verify enable/remove/edit/Undo/Redo and save/open in the browser.
4. Assess real tracking quality and time on representative footage. Do not infer
   performance or accuracy from tiny unit arrays. Heavier checks remain deferred
   while the user does animation work. Project save/open now share a 64 MiB byte
   budget and compact lossless JSON; actual large-file review remains pending.
   See [project-files.md](project-files.md).

This delivers the code path; pending media/UI acceptance is still part of the feature.
Other P2 requirements in `P2-status.md` remain in scope.
