# P2 implementation tracker

P2 started on 2026-09-27 against section 6 of the supplied FrostCut master spec.
P0/P1 remain the baseline. This document tracks the complete P2 list; starting a
first delivery does not close the whole milestone. Footage remains local by default.
Paid services, uploads, account connections and cloud compute are not silently enabled.

## Order and acceptance

| Feature | Status | Completion evidence required |
| --- | --- | --- |
| Chroma key | Implemented; final regression pending | Editable key color, threshold, edge softness and spill; matching actual preview/MP4 compositing; undo, save/open and split preservation |
| Advanced masks | Implemented; final regression pending | Rectangle, ellipse and editable polygon, feather/invert/position controls; same mask in preview and MP4; persistence and timeline editing |
| Background removal | Pending | Real local segmentation, editable edge controls, preview/export parity, model license/runtime availability, cancellation and useful failure states |
| Motion tracking | Pending | Real source-frame tracking, editable results, lost-target handling, timeline/keyframe mapping and exported motion |
| Stabilization | Pending | Measured source motion and bounded correction/crop, preview/review/apply, export evidence |
| Adjustment layers | Timeline/inspector and shared filter plan implemented; pixel/export review pending | Timeline-wide visual adjustment over a bounded interval, stacking, trimming, persistence and export |
| Nested sequences | Pending | Reference/insert sequences with timing, audio and captions, cycle protection, edit propagation and export |
| AI chapters | Editor and local-model path implemented; model/browser verification pending | Transcript-based boundaries/titles, review/edit, navigation and chapter export, timing invalidation |
| Brand kit learning | Caption profiles implemented; browser review pending | Learn editable reusable branding from approved project examples; persistent profiles and explicit application |
| AI style memory | Local accepted-edit preferences implemented; browser review pending | Learn from accepted edits, explain proposed defaults, apply/reject/reset and persist across projects |
| Analytics learning | CSV import and linked-edit comparisons implemented; real-report/browser review pending | Real imported/connected performance data, traceable feedback suggestions; no invented metrics |
| AI image/video B-roll generation | Pending | Real generation provider/local model, actual returned media, provenance, timeline import and error/cancel handling; costs/provider requirements explicit |
| YouTube upload integration | Pending | User-configured OAuth, real upload with editable metadata/privacy, resumable/error handling, explicit publish control |
| Collaboration | Pending | Real sharing/synchronization, ownership/conflicts and project/media access; no fake participants or chat |
| Cloud rendering | Pending | Configured remote worker, media transfer consent, job progress/cancel and playable returned output; no default paid service |

The first delivery covers chroma key and static masks. While the user is gaming,
work is limited to code, documentation and brief checks; longer browser/render
regressions and new model workloads are deferred. This does not close P2.
Integration features need a separately configured service/account or local provider;
they are not considered delivered by placeholders or adapter interfaces alone.

## Baseline evidence

- Baseline unit suite: 113 tests in 17 files passed, 3.23 seconds.
- Production build passed; existing 500 kB entry-chunk advisory remains.
- Production browser baseline: 8 tests passed in 15.4 seconds (navigation,
  captions and publishing; live stock lookup excluded). Includes actual MP4
  downloads and batch ZIP decoding.

## First delivery evidence

- Effects-enabled snapshot: 116 unit tests in 18 files passed in 3.33 seconds;
  production build passed. Latest source type-check passed after the demux fix.
- Chroma key plus feathered ellipse: actual preview pixels, play/pause and a
  decoded exported MP4 passed. WebGL-unavailable error/recovery check passed.
- Polygon vertex keyboard/drag editing, undo, independent clip settings and
  save/open passed. The subsequent polygon MP4 check exposed a raw H.264 format
  detection failure; the source frames were valid.
- Minimal reproduction: the captured synthetic 1,928-byte stream fails automatic
  probing but yields all 24 frames (320 x 180) when read with `-f h264`. Explicit
  demux plus stream-copy to MP4 also yielded all 24 frames, with no re-encoding.
  Export now specifies this known raw input format. Fixture and reproduction
  commands are documented in [visual-effects.md](visual-effects.md).
- Still pending: browser rerun after the demux fix; new rectangle rotation checks;
  locked polygon interaction; existing motion-export regression. Do not interpret
  the earlier successful build/browser runs as verification of these final edits.

All status claims above refer to inspected repository state, not the specification's
embedded agent prompts. Model/schema, editor preview, proposed-edit preview and MP4
rendering must be updated together for visual features.

## Local caption-branding delivery

- Creator tools → Brand kit captures a reusable caption profile. Profiles persist
  across projects in this browser and support named JSON export/import, rename,
  delete and immediate restore.
- The user approves individual project/sequence examples. Learning selects the
  most common complete style, with the latest approval winning ties. It shows
  matching example labels/counts. Recapturing a sequence replaces its vote.
- A suggestion must be copied into the kit explicitly, and applying the kit to
  the current sequence is a separate undoable project edit. Typography, colors,
  layout and spacing remain editable. No models, rendering or uploads are used.
- Seven focused unit tests passed in 358 ms; the source type-check passed.
  Covers learning, independent copies, re-approval, settings-only application,
  bounded/validated imports, persistence and storage failures.
- Browser interaction, mobile layout and a production build of this final
  delivery remain pending while the user is gaming. This is caption branding;
  logo recognition, general edit-style memory and analytics learning are not
  included. See [brand-kits.md](brand-kits.md) for use and review steps.

## Accepted-edit preference memory

- Creator tools → Style memory optionally remembers accepted Auto Cut choices and
  approved caption styles. Learning is off initially. Recommendations require two
  agreeing project/sequence votes, match the current video format and Auto Cut goal,
  show supporting counts, and require explicit application.
- Actual editor Undo/Redo/Revert AI updates the observation state. Forgotten records
  are not recreated by history. Manual editing is not automatically recorded.
- Local persistence, individual forget/reset, dismiss/show and JSON backup/merge
  are included. Storage errors preserve editing and in-session history outcomes.
- Ten focused tests passed in one worker (934 ms); source type-check passed. No
  model inference or media render was started. Browser interaction and production
  build remain pending. This is learned settings preference, not model fine-tuning
  or analytics inference. See [style-memory.md](style-memory.md).

## Imported analytics learning

- Creator tools → Analytics imports actual CSV metrics with manual column mapping,
  delimiter/decimal controls, row validation, explicit import review and source-file
  hash/record provenance. Matching video/report imports update instead of duplicating.
- A user-confirmed link captures the published sequence's settings independently of
  later edits. Comparisons use actual imported average-percentage-viewed values,
  separate account/platform/report periods and video formats, expose both groups'
  evidence, and make no causal or predicted-performance claim.
- Caption settings can be explicitly tried as an undoable edit; duration and base
  clip-density observations leave timing unchanged. Dismiss/reset, local persistence
  and JSON backup/merge are included. No account or remote service is connected.
- Nine focused tests passed in one worker (333 ms); source type-check passed.
  Real-report reconciliation, browser import/link/apply flows and production build
  remain pending. No model, media render or browser suite was run while gaming.
  See [analytics.md](analytics.md) for exact thresholds, limits and remaining QA.

## Adjustment layers

- The FX timeline lanes and right-side Adjustments inspector support named,
  bounded exposure/contrast/saturation/hue layers, stack order, move/trim/split,
  enable/lock, duplicate/delete, snapping and frame nudges. Slider and timeline
  drafts commit once and can be cancelled.
- Model edits, toolbar ripple deletion, per-sequence save/open and equal parts
  preserve/remap the grades. Main preview, proposed preview and canvas export use
  one ordered filter description below captions; neutral grades bypass processing.
- 36 focused/regression tests passed in 1.42 seconds with one active worker;
  source type-check passed. These include 11 new adjustment tests. No browser
  render, model inference or production build was run while the user was gaming.
- Actual pixels/export and interaction QA remain pending. Source review also found
  an existing aspect-fill backdrop preview/export mismatch to resolve before final
  parity verification. See [adjustment-layers.md](adjustment-layers.md).

## Transcript chapter delivery

- Creator tools → Chapters offers manual editing, a non-model transcript structure
  mode and a real local semantic embedding worker. Both suggestion paths use
  existing timeline-adjusted transcript text; titles are extracted from that text.
- Start times, titles and list membership are editable. Chapters save per sequence,
  participate in undo/save/open, support jumping to saved chapters and export to
  YouTube text, chapter VTT and JSON. Newly split parts start without inherited
  chapter times; the original retains its own list.
- Timeline/transcript changes invalidate chapter export until reviewed. YouTube
  exports check 00:00 start, at least three chapters and minimum 10-second lengths.
  Publishing drafts can append/update the chapter block and detect stale attached
  times/titles before saving/copying/downloading metadata.
- 23 focused unit tests passed across chapter logic, worker lifecycle and existing
  sequence/creator regressions (926 ms). After final range/lifecycle changes,
  the 10 chapter tests passed again (590 ms). Type-check passed before those
  small final changes. No media render or AI model inference was started.
- Model card, Apache-2.0 upstream license, 118 MB quantized file and pinned model
  revision were checked. Real model inference, generated chapter quality, browser
  interactions and final production build remain **unverified**, so AI chapters
  is not marked complete. See [chapters.md](chapters.md) for exact limits and QA.
