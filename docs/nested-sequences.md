# Nested sequences — implementation in progress

Existing Shorts/parts remain independent sequence copies. The new
`nested-sequence-plan.ts` implements an actual reference graph and hierarchical
time plan; it does not turn those copies into nested edits. The development branch
`codex/nested-sequences` now adds the canonical source model, persistence and edit
operations. Recursive visual/audio consumption and insertion UI remain pending.
Native decoders still reject references explicitly. This branch is not a complete
nested feature and must not be merged as one yet. Main retains the earlier plan.

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
- Native preview/export entry points currently call `requireMediaClip` and reject
  sequence placements. Replace these guards with recursive consumers; do not
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
   Review graph snapshot costs before enabling it on large tracked projects;
   compilation still clones sequence data. Duplicate creation avoids a second
   unnecessary clip clone, but no real memory/performance measurement was made.
3. Add sequence creation/duplication and explicit insert/nest/navigation controls.
   Show the source sequence and editable range, retain independent placements and
   make child-edit propagation apparent. Do not label copied clips as nested.
4. Implement shared recursive child composition in main/proposed preview and canvas
   export, with bounded reusable canvases. Preserve child fill/filters/captions and
   group the result before parent transforms, masks/chroma, opacity and fill.
   Each branch needs instance-specific source decoding/proxy time.
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
