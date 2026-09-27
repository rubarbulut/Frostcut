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
- All above were pushed to `origin/main` at github.com/rubarbulut/Frostcut.

## In-progress delivery: adjustment layers

Data and export foundation is implemented but not yet exposed in the editor:

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

These changes have not yet received their focused tests or browser verification.
The source type-check passed at this checkpoint (about 4.6 seconds).
Do not describe the adjustment feature as complete or preview/export parity verified.

### Remaining implementation

1. Add shared `.adjustment-composite` wrapper around video layers in both
   `Preview.tsx` and `EditPreview.tsx`; give it the same `adjustmentFilter` string,
   full-frame `#090d10` background and size. Captions, safe-area and transform handles
   stay outside the filter. Preserve descendant video/canvas positioning currently
   defined by `.video-canvas > video` / `.effect-preview` CSS selectors.
2. Add `adjustmentSelection`, `previewAdjustment`, selection/draft actions to editor
   store. Clear drafts on commit/undo/redo/revert/load and when changing selection.
   Expose an Adjustments inspector tab in PropertiesPanel, selected by lane clicks.
3. Inspector: create, rename, enable/disable, lock, numeric start/end, four grade
   controls, reset, duplicate/delete, reorder. Sliders should preview during drag
   and commit once on release; Escape/pointer cancel restores original values.
4. Timeline: lane/label per adjustment above video and below captions, Add button,
   select, move/trim, snapping, frame keyboard nudges, lock protection. Use current
   project snapshots and cancel a drag if another edit or sequence switch intervenes.
5. Integrate ripple deletion from `Timeline.deleteSelected`, which bypasses
   `model.deleteRange`. Keep non-ripple removal at absolute adjustment times.
6. Handle remap overflow errors (128 fragment limit) in OperationsPreview and AI
   apply UI instead of allowing an unhandled exception. Review speed-range clamping
   semantics and minimum intervals before asserting preservation.
7. Focused tests: validation, stacking/order and neutral bypass, frame boundaries,
   ripple/assemble/speed remapping, locks, sequences/parts, undo/save/reopen, export
   route and canvas filter context restoration. Brief type-check. Defer actual
   browser pixel/export runs until user permits heavier work.
8. Update P2 tracker, document exact semantics and pending evidence, commit/push.

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
