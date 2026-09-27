# Batch cancellation

Batch export runs in the editor's browser tab. Closing that browser tab ends its
render; it is not a background server job. Closing Creator tools or switching away
from its Batch export tab also aborts the batch through component cleanup.

The cancel button now shows **Stopping batch…** until the export promise finishes
cleanup. Progress callbacks cannot overwrite this state. After cancellation the
existing **Batch cancelled. No partial ZIP was created.** message appears, and
export is available again. Unmounting detaches the controller before aborting it,
so a finishing job cannot update a closed panel. Duplicate starts are guarded.

FFmpeg already terminates its worker on abort. The canvas renderer now also closes
its browser video encoder immediately, rejecting pending encoder flushes, and
releases its source video elements. Cancellation during font or codec setup is
checked before frame processing; cancellation does not trigger a software retry.
The software path checks cancellation after an in-flight PNG conversion, which
the browser cannot interrupt, before sending any further frame to FFmpeg.
Resolution, bitrate, frame rate and export quality settings are unchanged.

## Verification deferred

Only source inspection, a syntax-only parse and Git whitespace checks were used.
No build, type check, automated tests or renders were run, to leave CPU/GPU
resources available while the user games. Runtime behavior remains unverified.

When rendering is convenient again:

1. Start a small batch and cancel during rendering. Confirm the stopping/cancelled
   states, no ZIP download, and the export button becoming available again.
2. Repeat with animated captions or clips (browser encoder), then cancel while
   packing the ZIP. Ensure neither case reports successful completion.
3. Start a batch and close Creator tools or switch to another tool. Reopen the
   batch panel and confirm a new small export can finish normally.
4. Existing `tests/publishing.spec.ts` covers cancel/retry and independent MP4s;
   `tests/motion-export.spec.ts` covers browser/software rendering. Run them later,
   not while gaming. They have not been rerun for this change.
