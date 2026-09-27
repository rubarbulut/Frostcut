# P1 implementation status

**P1 completed and validated on 2026-09-27.** See the [closure audit](P1-closure.md): 83 unit and 32 browser tests passed, including real model/network/output checks.

## First package: speech cleanup and captions

- **Filler review/removal:** Transcript → Clean up speech finds English/Turkish hesitations. Optional ambiguous phrases (“you know”, “I mean”, “şey”, “yani”) require manual selection. Each candidate includes context and a bounded source-video playback preview. Estimated timing is labeled. Applying selected cuts ripple-deletes the matching audio/video intervals across the timeline in one undoable edit. Overlapping selected ranges are merged; locked tracks prevent the entire operation.
- **Improved repeated-take detection:** ordered token edit distance compares nearby sentences within the same clip/speaker, including nonadjacent takes. Different numeric tokens and common negations are rejected. Earlier/later playback is available for comparison. The same detector is used by Auto Cut. This is a conservative transcript heuristic, not an acoustic confidence or semantic-equivalence model.
- **Caption preset customization:** text size, bold weight, text/accent/outline colors, speaker-color accents, outline width and vertical margin. Up to 20 named styles can be saved, applied and deleted in each project. Settings survive save/open and undo, and are shared by preview and MP4 subtitle rendering. Built-in presets reset appearance; saved custom styles remain available.
- **SRT export foundation:** UTF-8 download from the current edited timeline, including per-clip caption corrections, speed/trim/ripple timing and Unicode text. Caption display can be disabled without disabling SRT export. P1 now adds the selectable translated variants and multilingual bundle described below.
- Desktop and mobile access to the new controls.

## Additional P1 packages

- **Auto Reframe:** Local MediaPipe face detection, bounded frame sampling, crop smoothing, isolated review, editable source-time position keyframes, undo and MP4 rendering. No-face coverage is explicit.
- **Voice enhancement:** High/low-pass EQ and compression in preview and export; an optional speech enhancement, not neural audio restoration.
- **Music:** Audio import onto A2, source-time percussion markers, manual marker addition, move/trim snapping, waveform generation and transcript-timed ducking. Muted/zero-volume speech does not duck music; without a transcript, audible voice clip ranges are used.
- **B-roll:** Transcript-based passage/query suggestions, live Commons search, explicit source/license/creator details, selected-file download and insertion on V2, saved attribution and publishing credits. Occupied or locked V2 ranges are rejected.
- **Translation:** Local M2M100 between seven exposed languages, review/edit/save, per-sequence variants, preview/MP4 language selection and individual or ZIP SRT downloads. Translations become stale on source timing/text changes. Word timing is estimated within each phrase.
- **Publishing:** Editable transcript-based title/description/hashtag drafts, saved per sequence, copy/text download and stock credits. No publishing/upload action is performed.
- **Animations:** Up to 20 saved custom animation presets, normalized clip times/canvas positions, editable keyframes, save/open and export.
- **Discover:** Current Hacker News ranking, publication/fetch times, scores and source links; downloadable research outlines. Technology/science-focused, not a YouTube analytics feed.
- **Batch export:** Sequential rendering of selected saved Shorts with their own export settings, one ZIP download, cancellation/retry, active timeline unchanged.
- **Requested navigation extras:** Middle-mouse/Hand-tool panning, cursor-anchored wheel zoom, Shift-wheel horizontal scrolling, and independent 0.5×–4× preview playback speed.

P0 was closed separately; see [P0 closure](P0-closure.md). The packages above implement the remaining P1 scope. Final sign-off and reproducible checks are recorded in [P1 closure](P1-closure.md).

## Validation

Unit coverage includes speech cleanup, source/speed mapping, lock/stale-edit protection, Unicode SRT, project validation, beats/ducking, normalized presets, reframing bounds, per-sequence translation invalidation, stock insertion and ZIP CRC. Browser checks exercise actual face detection, local English→Turkish translation, real MP4/PCM outputs, live Commons/Hacker News, saved attribution, ZIP extraction/decoding, cancellation/retry, navigation and mobile layout. See the closure audit for results and model/network opt-in commands.
