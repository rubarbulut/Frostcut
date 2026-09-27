# Continuation checkpoint — 2026-09-27

The user requested a save/checkpoint because credits may run out, then continued
work. Full P2 remains the active goal; do not mark it complete. The latest manual
constraint is still lightweight work while gaming: no media rendering, model
downloads/inference or long browser suites. Short unit/type checks are allowed.
Commit and push are authorized. Antigravity also works in this repository: inspect
status and preserve unrelated edits; do not stage the entire worktree blindly.

## Completed recent commits

- `cf82af6`: optional local accepted-edit preference memory, linked to actual
  undo/redo history. Ten focused tests and type-check passed; browser review pending.
- `c0c1d10`: actual CSV analytics import, explicit published-edit links, traceable
  comparisons and JSON persistence. Nine focused tests (333 ms), type-check passed;
  real report and browser review pending.
- `856a0ec`: Antigravity's editing/UX work. It also captured early versions of
  analytics.ts and analytics-csv.ts while they were being developed here. Preserve it.
- `785abe8`: requested checkpoint of adjustment data/export foundation and this note.
- The latest completed delivery is available through `git log` / `origin/main` at
  github.com/rubarbulut/Frostcut. Keep saving incremental progress there.

## In-progress delivery: adjustment layers

Data/export foundation and editor controls are now implemented; actual visual
verification is still pending:

- `src/adjustments.ts`: optional per-sequence layers with stable IDs, name, enabled,
  lock, bounded start/end; exposure/contrast/saturation/hue; validation; ordered CSS
  filter list; ripple-delete, range-assembly and speed remapping helpers.
- `src/adjustment-renderer.ts`: applies that filter list to the completed video
  canvas before captions. No extra retained full-resolution canvas. Unsupported
  filters fail visibly rather than exporting without the effect.
- `src/model.ts`: optional project/sequence field, validation (including inactive
  sequences), timeline operation integration and lock checks.
- `src/sequences.ts`: snapshot/view/switch preservation and Short creation guard.
- `src/equal-parts.ts`: clips/remaps layers into each new part, preserving the original.
- `src/media.ts` / `src/visual-renderer.ts`: active non-neutral layers route to the
  visual renderer and grade the video before caption drawing.

The follow-up adds `AdjustmentComposite.tsx`, `AdjustmentControls.tsx`,
`AdjustmentLane.tsx`, `adjustments.css` and `adjustments.test.ts`; wires both
previews, the properties panel, timeline, editor draft/selection/history and AI
error handling. Toolbar ripple deletion is integrated. Speed-range factors are
bounded consistently across affected clips. See `docs/adjustment-layers.md`.

36 adjustment/model/sequence/equal-parts tests passed in 1.42 seconds with one
worker active at a time. Source type-check passed. Actual pixel/export fidelity
and browser interactions are not yet verified; do not close this feature or P2.

### Next work

1. Resolve the inspected shared aspect-fill backdrop mismatch described below;
   this can start with low-resource code work while gaming.
2. When heavier checks are permitted, perform adjustment pixel/export and timeline
   interaction QA, including cancellation, locks, overlap order, caption exclusion,
   exact boundary frames, sequence/part/batch rendering and unsupported filters.
3. Complete the pending chroma/mask export regressions, chapters real-model review,
   and branding/memory/analytics browser flows recorded in `docs/P2-status.md`.
4. Continue remaining full P2 features: background removal, motion tracking,
   stabilization, nested sequences, real B-roll generation, YouTube upload,
   collaboration and cloud rendering. External integrations need real configured
   services/accounts; do not substitute mocks or silently enable costs/uploads.

### Rendering notes

- Layers grade the entire video composite, bottom-to-top in stored order, below
  captions; these are not per-track-selective adjustment clips.
- Export filters and preview CSS use the same generated numeric list. The
  [W3C filter spec](https://www.w3.org/TR/filter-effects-1/) specifies sRGB filter
  functions applied to the composited descendant group. The
  [HTML Canvas spec](https://html.spec.whatwg.org/multipage/canvas.html) permits
  filter lists and requires self-drawing to snapshot the source first.
- Existing Antigravity aspect-fill preview includes a blurred video background
  that is not currently synchronized/rendered by the export pipeline. This is
  existing inspected code, not verified parity; do not overlook it in final visual QA.

Full milestone scope and outstanding integrations: see `docs/P2-status.md`.
Do not substitute placeholder cloud/render/upload services for actual integrations.
