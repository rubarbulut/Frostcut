# Nested sequences — implementation in progress

Existing Shorts/parts remain independent sequence copies. The new
`nested-sequence-plan.ts` implements an actual reference graph and hierarchical
time plan; it does not turn those copies into nested edits. References are not
exposed in the editor, accepted by the persisted Project model, or rendered yet.
This foundation does not deliver the P2 feature.

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

1. Extend the real Clip source model to distinguish media from sequence references.
   Replace direct media-ID assumptions with source helpers throughout timeline,
   inspector, operations, validation, import/export and relinking. Do not create
   placeholder files/assets to make existing media code accept a reference.
2. Persist and validate the entire graph, including active edits/inactive sequences.
   Insert/edit operations need lock/cycle checks, source duration/settings helpers,
   clone/split/move/trim/speed preservation, undo and referenced-sequence removal
   protection. References must survive parts and batch sequence selection.
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
