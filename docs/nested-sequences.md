# Nested sequences — implementation in progress

Existing Shorts/parts remain independent sequence copies. The new
`nested-sequence-plan.ts` implements an actual reference graph and hierarchical
time plan; it does not turn those copies into nested edits. The development branch
`codex/nested-sequences` now adds the canonical source model, persistence and edit
operations. Recursive canvas visual composition is now connected to the canvas
video renderer. Live preview, hierarchical audio and insertion UI remain pending;
the MP4 entry point still rejects references until their audio is implemented.
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
- Native main/proposed preview and the MP4 entry point still call `requireMediaClip`
  and reject sequence placements. Replace these guards with recursive consumers; do not
  filter/drop reference clips to obtain a successful output. New insertion and
  creation UI is not exposed yet. Child caption rendering/rollup and real audio
  envelopes/effects are still required.
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
- This increment does not expose nested editing: main/proposed live preview still
  needs an instance-aware decoder/compositor driver with completed-frame publication.
  Actual hierarchical audio and text/sidecar rollup remain required before removing
  the MP4 source guard or adding insertion UI. Do not export a silent approximation.

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
   Verify references survive parts and batch outputs, beyond metadata preflight.
   Review render-plan snapshot costs before enabling it on large tracked projects;
   render compilation still clones sequence data. Validation now skips those
   snapshots/indexes; insertion and duplication avoid unnecessary extra timeline
   clones. No real memory/performance measurement was made.
3. Add sequence creation/duplication and explicit insert/nest/navigation controls.
   Show the source sequence and editable range, retain independent placements and
   make child-edit propagation apparent. Do not label copied clips as nested.
4. Shared recursive canvas composition/export visual decoding are implemented.
   Connect main/proposed live previews to this compositor, with memoized edit-time
   plans, instance-specific source clocks/proxies and atomic publication of completed
   frames. Preserve existing preview quality/controls and actual audio routing.
5. Compile real audio windows/gains/fades/ducking/voice processing through parent
   envelopes and speeds, for both actual playback and export. Routing flags alone
   are insufficient. Define nested caption text/sidecar export alongside visual
   caption compositing; never drop child captions or audio silently.
6. Brief unit/type checks can continue now. Actual interaction, decoder timing,
   nested captions/audio/effects, playback and decoded MP4/parts/batch quality need
   later browser/media acceptance while heavier workloads are permitted.

Do not accept/expose persisted nested clips until all their production consumers
can handle them. Keep the full P2 scope in `P2-status.md`; no completion claim is
supported by this plan-only delivery.
