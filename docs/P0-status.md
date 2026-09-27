# P0 implementation status

P0 implementation and acceptance checks completed on 2026-09-26. See the [closure audit](P0-closure.md) and measured [runtime evidence](P0-runtime-evidence.md). This is a local browser MVP; the practical limits below still apply.

## Delivered

- Landing, five project presets, local import/playback, metadata autosave, validated save/open and missing-media relink.
- Source-aware V3/V2/V1/A1/A2 timeline: split, trim, move, delete/ripple, duplicate, group, snapping, lock/mute/hide, zoom and height controls; bounded undo/redo.
- Independent source-audio clips on A1/A2, volume/fades and short overlapping audio crossfades where source handles exist.
- Local Whisper Tiny/Base/Small, Auto Detect/seven selectable languages, word timestamps, WebGPU acceleration and CPU fallback. Long sources use 90-second analysis windows with context, progress and an early proposed-edit preview. Transcription starts only on request; canceled/failed replacement preserves corrections.
- Transcript seeking, selection, text correction, scoped find/replace, deletion from video, basic manual speaker assignment/names/colors and SRT import.
- Exact caption start/end fields, phrase editing, insertion and draggable/resizable C1 blocks. Caption-only edits preserve video; per-clip overrides survive save/open and export.
- Clean/Bold/Brainrot, important-word accents, intensity, emoji frequency, word grouping, custom position and safe area. Estimated timing is labeled; model confidence is never invented.
- Guided Auto Cut with count/length/pacing controls, sentence-aware transcript scoring, speech-safe silence removal, repeat review, composite edits and optional strongest-first order. Select several highlights to create independent saved Shorts while retaining the original edit.
- Bounded local command assistant, isolated proposed-edit playback, explicit apply/dismiss/cancel, undo/redo, last/all-AI restoration, reason markers and bounded applied-edit metadata. Full chat text is not saved.
- Position/scale/rotation/opacity/crop/speed, draggable numeric controls, preview handles, editable keyframes and seven motion presets. Motion renders into exported video.
- Automatic heavy-input preview proxies, Auto/Full/Half/Quarter, dropped-frame adaptation, cached proxies and a preview/export resolution indicator.
- H.264/AAC MP4 with real audio, composition, captions and motion; platform sizing, quality/size estimate, advanced bitrate/resolution/FPS/audio settings, progress, cancellation and retry. Browser video encoding falls back to software encoding.
- Simplified mobile clips/trim/reorder/transcript/style/export flow and a spoken demonstration with a labeled correction exercise.

## Validation and practical limits

The production build, 75 unit tests and 23 browser tests passed. Runtime checks cover decoded MP4s, audio at edited times, motion/caption pixels, Shorts save/relink, 4K proxies, all seven speech languages, GPU failure fallback, long speech across analysis windows and mobile layout under CPU throttling. Reports distinguish synthetic performance fixtures from recognition-quality samples.

Recognition and highlight scoring need editorial review. Basic speakers are manually assigned, without automated diarization. Detailed is suggested for Turkish, Portuguese and Polish based on the small fixed QA samples. First use downloads the model; inference stays on the device.

Source files are never modified. Project files contain metadata, not media; refresh/open requires relinking. There is one autosaved project, at most 30 sequences and 80 in-session undo snapshots. Manually save before replacing a project. Source files above 1.5 GB are rejected. Model weights, decoders and exports still consume browser memory; software animation export can be slow. Measurements cover one Windows/Edge machine and mobile emulation, not physical phones or every codec/browser.

## P1 boundary

Filler cleanup, improved repeated-take review, saved caption styles and SRT export are available. Auto Reframe, voice enhancement, music/beat/ducking, B-roll, translation, publishing suggestions, custom animation preset saving, discovery and batch ZIP remain [P1 work](P1-status.md).
