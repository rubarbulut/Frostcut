# FrostCut — next 48 hours

Updated 2026-10-20. Rubar is proceeding directly with Codex; do not wait for an Antigravity handoff. Starting branch: `codex/transcription-recovery`, based on shared integration HEAD `46dc950`.

The release target is a reliable YouTube-first pilot: import a real recording, transcribe it, edit captions and timing, create/review long and short outputs, export the actual MP4 to a chosen destination and retain publishing metadata. Live publishing must accurately reflect account/helper availability. The complete product vision, perfect transcription and guaranteed SEO performance are not claims for this two-day release.

## Completed first: real Turkish transcription recovery

- Reproduced the reported zero-word result using the user's short M4A recording with Balanced/Turkish/CPU. The model recognized speech, but `timelineWords` discarded audio-track words.
- Audio-file clips now contribute timed transcript/caption words. Detached video audio still does not duplicate its parent captions; explicit audio caption overrides remain supported.
- Explicit Transcribe clears/overrides the no-speech preference. That preference continues to control automatic analysis.
- A selected/timeline range with no new recognized words now raises an actionable error and does not replace existing captions with a fake successful result. Full-source refresh replaces the old transcript instead of appending it. Late cancelled results cannot update the analysis cache.
- Audio-only projects support Add caption in both the transcript panel and timeline.
- Actual browser checks: first 6.4-second recording showed 11 words after the filter fix; second 43.86-second recording produced 88 visible words with Balanced/Turkish/CPU. The second run deliberately started with no-speech mode enabled, proving explicit transcription re-enables speech processing.
- Opened and saved an actual caption via its text/timing dialog, then used the real Export SRT button. The user's SRT is in Downloads, outside Git. Personal source recordings and transcript text are not checked into the repository.
- TypeScript passed. Three focused test files passed (20 tests, 1.14 s runner duration), including eight new regression tests. Real ASR was limited to these two short recordings, using one WASM CPU thread. No video render, long benchmark or larger speech model was run.
- Existing required editor/audio/candidate/recipe source dependencies are now tracked in commit `ef2ca50`. This preserves the team's existing implementation; it does not certify every B004 acceptance claim.

## Day 1 — close the editing and export path

1. Fix the first recipe Apply failure: preserve the canonical bound source identity; prove the exact App callback path.
2. Use one reviewed recipe/output. Keep the selected framing, current edited captions, metadata and output/source isolation across switches.
3. Make recipe Export deliver its returned Blob to the selected destination. Keep errors/retry visible and synchronize the current output before rendering.
4. Complete the render-affecting revision manifest and runtime File identity. Caption, adjustment, EQ or fill changes must invalidate a render; title/description-only changes must not.
5. Link prepare/render/upload cancellation and reject stale session completions. Keep one encode active and provide honest progress.

Use targeted controller/event tests with fake renderers first. Once these pass, perform one very short real MP4 smoke export of the actual supported edit path, not a long stress run.

## Day 2 — release evidence and remaining integrations

1. Verify audio/transcript behavior in video and audio-only projects, caption spacing/animation readability, source trim/speed mapping and save/reopen behavior.
2. Finish the explicit shared analysis/provider wiring and same-length signal cache invalidation. Show equal-parts honestly when no measured signal is available.
3. Connect YouTube capability/account/setup UI to the existing adapter, with method/origin protection and mock UI coverage. A real account setup/upload is a separately explicit manual action; missing credentials must not block editing/export.
4. Reduce UI friction in the main recording-to-export flow. Fix failures that prevent completion before adding decorative features or new platforms.
5. Verify a complete tracked checkout, run one final type/build check and appropriate existing cloud Quality/TestSprite checks on the actual pushed SHA. Record real PR/check links and preserve required protections.
6. Write a short manual QA/result sheet with passed, failed, not-run and external-blocked states. Only call the pilot ready when the core flow delivers a playable file with correct picture, speech and captions.

## Remaining cautions

The B004 static review at `docs/director-reports/batch-004/director-review.md` remains the detailed backlog; its Git-tracking finding is addressed above. Its other integration findings have not been silently marked resolved. Small Whisper models can still misrecognize Turkish wording; the recovery fixes missing output, not linguistic accuracy. Larger-model comparison is deferred until the core path is stable and resource use is appropriate.

Checkpoint evidence: `C:/Users/Arenb/.codex/visualizations/2026/10/20/transcription-recovery/verified.png`. The disposable browser verification used port 5174; the user's local server on port 5173 was not stopped or replaced.
