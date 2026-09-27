# P1 implementation status

## First package: speech cleanup and captions

- **Filler review/removal:** Transcript → Clean up speech finds English/Turkish hesitations. Optional ambiguous phrases (“you know”, “I mean”, “şey”, “yani”) require manual selection. Each candidate includes context and a bounded source-video playback preview. Estimated timing is labeled. Applying selected cuts ripple-deletes the matching audio/video intervals across the timeline in one undoable edit. Overlapping selected ranges are merged; locked tracks prevent the entire operation.
- **Improved repeated-take detection:** ordered token edit distance compares nearby sentences within the same clip/speaker, including nonadjacent takes. Different numeric tokens and common negations are rejected. Earlier/later playback is available for comparison. The same detector is used by Auto Cut. This is a conservative transcript heuristic, not an acoustic confidence or semantic-equivalence model.
- **Caption preset customization:** text size, bold weight, text/accent/outline colors, speaker-color accents, outline width and vertical margin. Up to 20 named styles can be saved, applied and deleted in each project. Settings survive save/open and undo, and are shared by preview and MP4 subtitle rendering. Built-in presets reset appearance; saved custom styles remain available.
- **SRT export foundation:** UTF-8 download from the current edited timeline, including per-clip caption corrections, speed/trim/ripple timing and Unicode text. Caption display can be disabled without disabling SRT export. The output keeps the transcript's existing language; translation and simultaneous language tracks are not implemented.
- Desktop and mobile access to the new controls.

## Remaining P1 items

- Auto Reframe.
- Voice enhancement.
- Music import, beat detection/markers, beat snapping, auto ducking.
- B-roll suggestions with source/license information.
- Subtitle translation and multilingual output variants.
- YouTube title, description and hashtag suggestions.
- Custom animation presets with export rendering.
- Discover screen with current topics and ideas.
- Batch export of saved Shorts as a ZIP. Individual MP4 exports are available in P0.

P0 was closed separately after its implementation and runtime checks; see [P0 closure](P0-closure.md). This first package does not complete the remaining P1 scope above.

## Validation

Unit coverage includes filler ambiguity, nearby repeats, changed order/negation/numbers, different speakers, source/speed mapping, duplicate source instances, overlapping selected cuts, locked/stale edits, Unicode SRT timing, legacy project compatibility, custom-style validation and ASS output. Browser coverage includes review/listen/apply/undo, SRT download, preset save/open, a real customized MP4 render and mobile layout.
