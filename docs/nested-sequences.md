# Nested sequences — implementation in progress

Existing Shorts/parts remain independent sequence copies. The new
`nested-sequence-plan.ts` implements an actual reference graph and hierarchical
time plan; it does not turn those copies into nested edits. The development branch
`codex/nested-sequences` now adds the canonical source model, persistence and edit
operations. Recursive canvas visual composition is now connected to the canvas
video renderer. Actual hierarchical audio filters are now wired to the MP4 export
entry point. Live preview, child text/sidecar rollup and insertion UI remain pending;
real codec/filter/decoded-output acceptance has not run.
This branch is not a complete nested feature and must not be merged as one yet.
Main retains the earlier plan.

## Source-model increment on the development branch

- `Clip` now has exclusive real media or sequence identity (`MediaClip`/`SequenceClip`).
  No file/media entry is generated for a sequence. Shared source metadata reads
  current active edits and caches metadata per immutable Project object; source
  dependency traversal collects actual descendant files with cycle/missing guards.
- Project JSON/save/open validation accepts references and checks active/inactive
  graphs. Native project validation is preserved; graph compilation only runs when
  references occur. Clone/split/move/trim/speed, source gaps, linked-audio detachment,
  ordinary persistence and actual store Undo/Redo retain reference identity.
- Creation/duplication/insertion operations exist, with names/count/range checks,
  target/linked-audio locks and direct/indirect cycle rejection. Duplicated native
  data is copied independently while sequence placements keep their child binding.
  Referenced source deletion fails with parent names; the picker displays the error.
- Timeline/inspector/preview handles use source dimensions/names/trim bounds.
  Batch preflight now sees the complete current graph even when exporting only
  selected parts. File-only tracking/reframe/beat/caption actions stay on native
  media; reference source captions are edited in their source sequence.
- Native main/proposed previews still call `requireMediaClip` and reject sequence
  placements. Replace these guards with recursive consumers; do not
  filter/drop reference clips to obtain a successful output. New insertion and
  creation UI is not exposed yet. Live preview audio and child text/sidecar rollup
  are still required; canvas captions and export audio are follow-ups below.
- Checks: 26 source/plan/sequence/batch/file tests passed in 1.08 s (five suites);
  10 native crossfade/tracking tests passed in 559 ms (two suites); 24 source/native
  plan/caption/detach tests passed in 924 ms (four suites). All used one active worker.
  Final source type-check passed. Overlapping suite counts are not additive. No
  real media, AI model, browser, render or production build was started.

Worktree: `C:/Users/Arenb/.codex/worktrees/nested-sequences/Videoeditor`.
Its ignored node_modules is a junction to the original checkout's installed
dependencies; no install/model download or extra dev server was started.

## Graph validation memory increment

- Save/open and insertion now call the shared `validateSequenceGraph` metadata
  check. They no longer build render interval indexes or deep-copy every sequence,
  including saved tracking/caption payloads, solely to detect invalid references.
  The same checks still cover all active/inactive nodes, source identities, clip
  IDs/tracks, reference properties, duration, missing sources, cycles and depth.
- Repeated placements share one graph edge. Insertion reads the authoritative live
  source/parent and snapshots only the changed parent once; inactive child data
  remains shared. Ordinary timeline snapshots and history are preserved.
- Actual `NestedSequencePlan` construction still takes independent full snapshots
  for stable frames. It now rejects an invalid whole graph before taking any of
  those snapshots. Edit-time render-plan caching/reuse remains future work; no
  real memory or playback speed measurement is claimed.
- 28 source/plan/sequence/batch/file tests passed in 1.05 s across five suites, with
  one active worker; source type-check passed. Includes clone-call checks on real
  import/insertion, shared cycle/depth rejection and stable old render snapshots.
  No media/model/render/browser/build workload was started.

## Recursive canvas composition increment

- `sequence-compositor.ts` draws the actual hierarchical plan with a source-frame
  provider that receives local/media clocks and the full instance path. Complete
  child frames retain their own fill, motion/tracking, visual effects, adjustment
  grades, translated/local captions and styling. Parent masks/chroma, frame fill,
  transforms/crop and group opacity run after child composition. Root grades and
  captions then run in their existing order. Audio-only/hidden branches do not
  decode visual frames; shortened children leave an empty interval.
- `renderCanvasVideo` now uses that compositor and actual original-file decoding.
  Export draws/seeks sequentially, so the existing per-file decoder can supply
  independent clocks for repeated placements without simultaneous seek conflicts.
  Native clips use the existing interval-index capture and avoid cloning unrelated
  inactive timelines or inheriting new nested duration restrictions. Caption
  drawing moved unchanged into `canvas-captions.ts`; the original export remains
  available, and a source comparison confirmed the function body is unchanged.
- One child canvas per depth is reused across placements/frames. Unused deeper
  backing sizes shrink to 1px; dispose/cancel releases retained child/effect/aspect
  resources. One effect renderer and one aspect surface are shared by sequential
  drawing. The child surface pool has a 64-megapixel / 16,384px-per-side explicit
  limit; this is not a total browser/GPU memory limit. Root, aspect, shader textures,
  decoders and encoded output have separate costs/device limits.
- Export retains at least the native child raster density and enough pixels for
  parent output/zoom. Preview mode uses projected viewport density. Resource-limit
  failures are explicit; export does not silently drop layers or lower resolution.
  Logical child dimensions control aspect placement, avoiding false blur from
  fractional raster rounding. Full nested plan snapshot costs still need review.
- 43 focused compositor/plan/fill/adjustment/tracking tests passed in 1.31 s across
  five suites with one active worker; final source type-check passed. Nine new
  compositor tests execute real drawing orchestration/caption/layout functions with
  recording canvas contexts and a fake shader/decoder boundary, covering native
  behavior, hierarchy/order, repeated clocks, grouping/styles, blur, gaps/visibility,
  raster budgets, cancellation/concurrency and cleanup. No actual video, shader/GPU,
  codec, AI, browser suite or production build ran; pixel/media QA is pending.
- That visual increment did not expose nested editing: main/proposed live preview still
  needs an instance-aware decoder/compositor driver with completed-frame publication.
  The audio follow-up below replaces the MP4 guard. Live audio and child text/sidecar
  rollup remain required before adding insertion UI. Do not export a silent approximation.

## Hierarchical audio export increment

- `sequence-audio.ts` compiles actual sequence buses: each child's native audio is
  trimmed, stretched, voice-processed, gained/ducked, faded and placed on its own
  local clock before mixing. Parent placements trim/speed/process the completed
  child mix; parent voice enhancement is not approximated as extra per-leaf gain.
  Shared reachable child buses split into independent placement branches rather
  than duplicating every native input for every ancestor placement. Mixer silence
  preserves empty/shortened child gaps and the explicit reference out point.
- Reference audio windows retain fixed source ends after a child is shortened;
  native media bounds remain unchanged. Pre-zero crossfade handles are processed
  before cutting the negative timeline portion. Stereo float/48kHz buses use sample
  delays; tempo changes stay chained within 0.5–2 per stage. Mute, detached video
  audio, linked A1 and audio-only placements retain their local routing semantics.
- `speechRanges` now maps actual audible child speech through trims/speeds, excludes
  child music/mutes/zero gain and unions exact child overlaps before the final parent
  pause merge. Known absent audio streams do not cause false music ducking. Existing
  native callers retain their default behavior; clip plans can accept real audio
  availability reports for the future live driver.
- MP4 references now route through real descendant file checks, mounted originals,
  checked ffprobe reports, the audio compiler and recursive visual renderer before
  final AAC/MP4 mixing. Files/mounts participate in cleanup/cancellation. Missing or
  malformed audio reports fail; absent audio is accepted only from a checked report.
  Native export keeps its existing path. The previous blanket MP4 media-source
  guard is replaced by this actual path; main/proposed previews still reject refs.
- Both export paths now omit disabled `afade` stages instead of sending `d=0`, which
  can retain FFmpeg's default sample fade. Enabled ramps preserve their bounds and
  tiny durations use the preview envelope's 0.1ms minimum. Filter options were checked
  against [FFmpeg documentation](https://ffmpeg.org/ffmpeg-filters.html) and the
  [upstream fade implementation](https://github.com/FFmpeg/FFmpeg/blob/n6.0/libavfilter/af_afade.c).
- 21 focused audio/compiler/window/ducking tests passed in 833 ms across four suites,
  one active worker; final source type-check passed. Seven new graph tests check
  real model clocks/filters/pad consumers, nonlinear group placement, reuse, gaps,
  roles/probe results, sample delays, rate chains, negative handles and graph errors;
  one additional test covers disabled/enabled/tiny fade emission. No source decode,
  audio playback, FFmpeg job, GPU, AI, browser suite or production build was run.
  Actual filter compatibility, perceived mix, timing and decoded MP4 QA are pending.
- Nested editing is still not exposed. Complete actual main/proposed preview video
  clocks/proxies and hierarchical Web Audio buses, child text/sidecars and insertion/
  navigation UI. Do not claim preview/export audio parity from string/metadata tests.

## Parts/Shorts source-context increment

- Fixed actual reference trim operations in `createShortSequences`: the derived
  timeline reads its original project's real child metadata without deep-cloning
  every saved sequence into every Short. Native operations retain their current
  source context; absent child sources still fail. The resulting Short rejoins
  the original complete graph and keeps live child IDs, including later edits.
- Shorts now bake preset keys on the original source clock before trim, keep-range
  and assembly, matching existing equal-part behavior. This preserves motion for
  both native clips and parent groups instead of restarting it at each cut.
  Explicit existing keys, clip controls and child local animation stay intact.
  Both portrait creation paths now store the correct 9:16 aspect metadata.
- Inspected `BatchExport.run`: it already uses `switchSequence(snapshot, id)` and
  retains the complete child graph. No replacement/fake batch renderer was added.
  Six new tiny integration checks use that same switch and the actual frame/audio
  plan compilers after save/open; they cover nested trim/source bounds, keep/assemble
  clocks and motion, independent placement bus splits, equal parts, child edit
  propagation, missing real-file preflight and shortened child visual/audio gaps.
- 18 tests passed across nested-parts/sequences/equal-parts/batch-plan in 900 ms,
  one active worker; final source type-check passed. No real video decode/playback,
  sound, MP4/batch/FFmpeg/GPU/AI/browser/build job was run. Actual exported parts and
  batch codec/pixel/mix acceptance remains open; these checks prove source/model/
  filter preparation, not decoded output or usable live nested editing.

## Live visual driver increment

- `sequence-preview-frames.ts` now drives the actual recursive compositor in
  preview mode. One controller compiles one stable edit-time graph, owns one
  scratch canvas and serializes asynchronous composition. It copies a completed
  scratch frame to the display canvas once; source loading/partial child drawing
  never becomes a displayed frame. Paused obsolete seeks are discarded; normal
  playback can publish completed frames while coalescing only the newest next tick.
- Each real visible media placement owns a muted decoder keyed by its complete
  instance path, so repeated child/file placements keep independent source times
  and ancestor speed products. The supplied resolver chooses an existing original
  or preview-proxy blob URL; the driver never creates files/proxies or starts a
  media-engine job. URL changes replace only the affected placement sources.
- Explicit epochs identify seeks, playback restarts and quality/source changes.
  Discontinuous requests abort pending media waits before processing the newest
  request; normal playback ticks avoid repeated pause/play and exact seeks unless
  drift exceeds the existing preview's 150ms correction threshold. Paused seeking
  uses the exact requested currentTime. Loaded durations/dimensions and seek results
  are checked; unsupported combined rates fail without silent clamping, while an
  explicit paused epoch can still scrub at any clip speed. This uses HTML media
  seeking/rate/play-promise behavior described in the
  [HTML Standard](https://html.spec.whatwg.org/multipage/media.html#dom-media-playbackrate).
- Inactive/hidden/out-of-child-range placements release decoder sources promptly.
  Dispose aborts current/queued work, pauses and unloads all owned videos, disposes
  compositor resources and shrinks scratch storage. Source/load/play failures stop
  retries on animation ticks; a new explicit epoch can retry. The driver does not
  own or revoke shared original/proxy URLs. Target viewport dimensions have explicit
  16,384px side/64M-pixel bounds; this is not a bound on total decoder/GPU memory.
- Twelve new tests use real graph/frame plans plus fake media/compositor interfaces
  to inspect source commands, independent clocks/rates, no repeated plan clones,
  continuous playback, seek coalescing/cancellation, atomic publication, proxies,
  inactive/gap cleanup, pending play/load/seek disposal, errors/timeouts and retry.
  27 tests across driver/compositor/nested-parts passed in 851 ms, one active worker;
  source type-check passed after the driver changes. No real video decode/playback,
  GPU, audio, model, FFmpeg, browser suite or production build was started.
- This driver is not yet mounted by main/proposed previews, and its videos are
  intentionally visual-only. Their current media-only guards remain until real
  hierarchical audio buses and UI ownership are connected. The owner must memoize
  the controller per edit/draft, observe media/quality revisions and viewport/fonts,
  increment epochs on discontinuities, handle failures/stop playback and dispose
  on replacement/unmount. Add actual audio-window indexes (crossfade handles exceed
  visual ranges), original-source audio/probe availability, independent audio clocks,
  local envelopes, nonlinear group voice processing and shared mute/real metering.
  Source currentTime checks do not prove encoded frame PTS/presentation accuracy;
  real decoder, timing, pixels, playback and memory acceptance remains pending.

## Implemented reference plan

- A `SequenceReferenceClip` has a real child sequence ID and editable parent
  source interval/position/speed/transforms. It has no media file ID or synthetic
  file. Source time maps to the child's timeline, not to a copied set of clips.
- The plan retains child settings, tracks, captions, adjustments and independent
  animation/effects. It preserves the hierarchy so the future compositor can
  complete the child before applying parent transforms/effects/opacity.
- Each layer carries its owning clock, source time, product of all ancestor speeds
  and full instance path. Multiple placements of one child can seek independently
  and have unique decoder/render identities. Nothing is flattened into baked edits.
- Native clips come from model-validated sequence data. New references have bounded
  timing/transform/keyframe/effect checks. The graph rejects missing IDs, duplicate
  IDs/tracks, self/indirect cycles and chains above eight sequence levels, including
  inactive sequences. All thirty project sequences can participate.
- Per-sequence interval indexes preserve the current clip order and half-open
  timing for arbitrary seeks. Visibility/audio flags compose local hidden/mute,
  linked A1 mute, audio-only placement and audio detachment through the hierarchy.
  These are routing flags, not a delivered audio mix or gain envelope.
- A reference keeps its explicit trim/out point. If a child edit becomes shorter,
  the remaining referenced time resolves to an empty child frame, leaving a gap.
  The parent does not silently ripple/trim or repeat the last child frame.
- A frame with more than 2,048 active nested/media layers fails explicitly before
  consumers receive it; no layer or output quality is silently dropped.
- Compile once from the current `sequenceViews(project)` after an edit. The
  current implementation snapshots sequence data, so existing plans remain stable.
  Recompilation reads the active timeline instead of its older stored snapshot.
  Evaluate/cache snapshot costs before enabling it on large tracked projects.

## Evidence

Eight focused tests passed in 434 ms with one active worker; source type-check
passed. Uses small real editor sequence fixtures and metadata, no pixels/decoders.
Checks trimmed/sped-up three-level mapping, independent placements, active-edit
propagation through new plans, stable old snapshots, settings preservation,
mute/hidden/audio-only routing, native ordering/endpoints, missing/cyclic/deep
graphs, reference validation and expansion bounds. No model, media render,
browser suite or production build was started.

## Required implementation before exposing nested references

1. Source model/persistence/edit operations are implemented on the development
   branch. Complete remaining direct media consumers with actual recursive source
   handling; preserve native paths and never create fake assets/files.
2. Finish integration/acceptance of lock/history/removal/source-gap behavior in UI.
   Actual parts/Shorts source operations and batch sequence switching now preserve
   real child context; focused frame/audio compiler checks cover their preparation.
   Verify references survive real decoded parts and batch outputs, beyond those
   metadata/filter tests. Live preview remains required before UI exposure.
   Review render-plan snapshot costs before enabling it on large tracked projects;
   render compilation still clones sequence data. Validation now skips those
   snapshots/indexes; insertion and duplication avoid unnecessary extra timeline
   clones. No real memory/performance measurement was made.
3. Add sequence creation/duplication and explicit insert/nest/navigation controls.
   Show the source sequence and editable range, retain independent placements and
   make child-edit propagation apparent. Do not label copied clips as nested.
4. Shared recursive canvas composition/export visual decoding are implemented.
   The actual independent source/atomic-publication visual driver now exists in
   sequence-preview-frames.ts. Connect main/proposed live previews with memoized
   controller ownership, draft edits, viewport/font/media/quality revisions and
   seek epochs once real hierarchical audio works. Preserve existing preview
   quality/controls and actual audio routing; do not expose silent nested playback.
5. Actual hierarchical export audio filters/routing are implemented. Connect live
   playback to real hierarchical buses, gains/fades/ducking and local clock rates,
   including source audio availability and nonlinear group processing. Define child
   caption text/sidecar rollup alongside visual compositing; do not drop child text.
6. Brief unit/type checks can continue now. Actual interaction, decoder timing,
   nested captions/audio/effects, playback and decoded MP4/parts/batch quality need
   later browser/media acceptance while heavier workloads are permitted.

Do not accept/expose persisted nested clips until all their production consumers
can handle them. Keep the full P2 scope in `P2-status.md`; no completion claim is
supported by this plan-only delivery.
