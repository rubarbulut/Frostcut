# Local motion tracking — implementation in progress

This P2 feature is not yet available in the editor. The current delivery is the
actual region-matching algorithm, cancellable one-frame worker bridge and saved
source-time motion layer. Source video decoding and selection/review UI remain required.

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
- The frame provider must also observe the AbortSignal during source loading/seeks.
  No actual provider or user-facing tracking job is connected yet.

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

## Next delivery requirements

1. Add an on-demand source frame provider using original local media, a bounded
   canvas and reported video source timestamps. Abort must cancel decode/seek
   waits and release video/canvas resources. Never start tracking from mounting UI.
2. Add original-source region selection, start/end/sample-rate/search controls,
   progress/cancel, lost-target diagnostics and a trajectory review. Snapshot source
   clip/media/settings so stale results cannot apply after edits or sequence changes.
3. Explicitly apply measured points through the implemented independent tracking
   layer as one undoable edit; handle partial results explicitly.
4. Add a bounded/paginated point editor exposing all saved tracking points. Native
   animation keys stay separate; no cap expansion or path approximation is needed.
5. Verify persistence, split/move/trim/speed, Undo/Redo, sequence/parts/batch behavior
   and preview/export keyframe consumption with brief code checks. Real source and
   rendered output checks remain deferred while the user is doing animation work.

This is one step toward full motion tracking, not a delivered replacement for it.
Other P2 requirements in `P2-status.md` remain in scope.
