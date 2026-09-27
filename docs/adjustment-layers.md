# Timeline adjustment layers

Use **Adjustments** in the right properties panel, or the **FX +** timeline button.
A new neutral layer starts at the playhead and covers up to five seconds. Layers
grade the entire video composite below captions; they are independent of source
media and do not extend the exported duration.

## Editing

- Exposure: -4 to +4 EV, converted to an sRGB brightness multiplier. This is a
  display-referred brightness control, not RAW/scene-linear exposure recovery.
- Contrast: 0–200%; saturation: 0–300%; hue: -180° to +180°. Defaults preserve
  the image. Reset changes color values while keeping the layer's timing.
- Drag a timeline block to move it or drag its edges to trim it. Snap uses the
  playhead, footage boundaries and other adjustment edges. Keyboard arrows nudge
  one frame; Shift+arrow nudges ten. Numeric start/end fields are also available.
- Select a layer to open its inspector. Layers can be renamed, enabled/disabled,
  locked, duplicated, removed and reordered. Later layers in stored order act on
  earlier results; higher timeline rows are applied later.
- The razor and split-at-playhead command can split a selected adjustment.
- Slider drags preview without persisting every pointer movement. Release commits
  one edit; Escape/cancel discards the draft. Timeline drags also cancel when
  another edit or sequence switch replaces their source project.
- Locks prevent movement, trimming, grading, deletion and reordering across the
  locked layer. Unlock explicitly to edit it. A duplicate can be made as a new
  unlocked layer without changing its source.

All saved changes participate in the editor's normal Undo/Redo and project
save/open. Old project files without adjustment data remain valid.

## Timing and sequences

Layers use half-open timeline intervals: start included, end excluded. Active
grading does not change clip geometry, audio timing, captions or source footage.
Moving/deleting an individual clip without ripple keeps absolute layer times.

Ripple deletion removes the same time interval from adjustments. This includes
the timeline toolbar path as well as model/AI range edits. Locked adjustments
prevent ripple edits that would change their timing. Assembly/reordering maps
only overlapping portions into the resulting timeline and preserves layer order.
Adjacent pieces from the same grade are merged when their output times meet.

Range speed edits map grade endpoints with the same time factor as the footage.
The common factor is bounded by every affected clip's supported 0.25–4× source
speed, preserving relative timing instead of independently clipping each rate.
Individual clip-speed edits leave absolute adjustment placement unchanged.

Each sequence stores its own layers. Switching to an older sequence with no
layers clears the active layers. Equal parts receive clipped, offset copies;
the original edit is retained. Separate AI Shorts require locked adjustments to
be unlocked first, then inherit the mapped result of their actual cut operations.
There is a limit of 128 layer fragments per sequence. Excessive assembly fragmentation
raises an actionable error rather than silently dropping effects.

## Rendering and resource use

Main and proposed-edit previews share a video-composite wrapper. Export applies
the same ordered numeric filter list to the completed video canvas before captions
are drawn. Safe-area/transform UI stays outside the preview grade. The matte color
is the same `#090d10` in both paths. Disabled and neutral grades bypass filtering;
export selects the visual renderer only for effective layers overlapping the video.

The implementation uses the [W3C filter-function model](https://www.w3.org/TR/filter-effects-1/)
and the [HTML Canvas filter/self-drawing model](https://html.spec.whatwg.org/multipage/canvas.html).
Export does not retain a second full-size canvas for the grading pass. Unsupported
Canvas filters produce an error instead of an export missing its grading.

Dragging finds the nearest snap point in one pass rather than sorting all timeline
points on every pointer event. These code choices have not been benchmarked yet.

## Evidence and remaining checks

- 11 dedicated tests passed, including real project operations, editor Undo/Redo,
  toolbar ripple deletion and sequence/part save validation.
- Together with existing model, sequence and equal-parts tests: 36 tests across
  four files passed in 1.42 seconds with one worker active at a time.
- Source type-check passed. Tests verify exact generated filter order and canvas
  context restoration, not pixel color accuracy or browser interactions.
- No model, browser suite or actual media render was started while the user was gaming.

Still required: actual preview/export pixels for overlapping non-neutral grades;
caption exclusion; boundary frames; slider/drag/cancel/lock and keyboard behavior;
reload/part/batch playback; unsupported-filter handling and production build.

An existing aspect-fill mismatch was found by source inspection: the preview's
blurred background is not synchronized/rendered by the export path. Resolve that
shared compositing issue before claiming complete preview/export parity. Existing
chroma/mask final regressions from `P2-status.md` also remain open.
