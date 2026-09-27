# Equal parts and subtitle typography

Open **Auto Cut → Equal parts**, or **Creator tools → Split**.

- Choose an equal number of parts (e.g. ten minutes → five parts of two minutes), or
  seconds per part (e.g. 125 seconds → 60 + 60 + 5).
- Review the original timeline ranges before creating parts. Count-based boundaries snap
  to the nearest project frame, so lengths can differ by one frame. The final endpoint
  keeps the source tail. No ASR or video encoding runs while creating sequences.
- Keep the current dimensions by default, or select vertical 1080×1920 Shorts. Audio,
  source caption corrections, motion and usable translated subtitle timings follow each
  range. The original edit remains a separate sequence; creation is one undoable edit.
- Rename/select parts with the sequence picker, then export individually or through
  **Batch export**. Existing 30-sequence and locked-track protections apply. A boundary
  ending in empty timeline space is rejected rather than silently making a shorter part.

**Captions → Text editor** now exposes font family, numeric size in project pixels, relative
size, bold/italic/underline/strikethrough, left/center/right/justified alignment, text/accent/
outline colors, letter spacing, word spacing and line height. Numeric fields apply on blur
or Enter. Spacing is in `em` so it scales with text size and export resolution. These are
sequence-wide settings; words and cue times remain editable through the transcript editor.
Existing palettes, animations, background/outline options, reset and saved styles remain
under **Customize & save style**. Presets and new settings survive project save/open.

The normal and proposed-edit previews use the same typography helpers. Export uses the
canvas renderer when the ASS path cannot represent the chosen typography. The current
browser's [canvas letter-spacing API](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/letterSpacing)
keeps tracking in text measurement and drawing. Browsers lacking it report an explicit
export error for nonzero tracking, instead of silently dropping that setting.

## Manual verification

At the user's request, automated tests, video exports and production builds were not run
for this change, to leave CPU/GPU resources available for gaming. Regression cases were
added in `src/equal-parts.test.ts` for a later run; they are not claimed as passing.
A lightweight syntax-only parse of the changed TypeScript files reported no syntax errors;
this does not replace TypeScript type checking or browser/export validation.

1. Split a timeline by count, then by seconds; compare the last part, audio and source
   start/end points. Switch back to the original and undo creation.
2. In a part, adjust size, color, italic, spacing, line height and alignment. Try a wrapped
   caption and reset/apply a saved style. Edit the caption text and timestamps as usual.
3. Save/open the project, switch parts and confirm styles remain independent.
4. Export a short sample with the new typography, then a batch of parts. Compare the
   subtitle layout, translated words crossing a cut, source timing and audio manually.
