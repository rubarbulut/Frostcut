# P0 implementation status

## Working first slice

- Winter landing with Start Editing, sample project, and resume from autosave.
- Shorts, TikTok, Reel, YouTube, and custom project presets.
- Local video import and playback; missing-media relink.
- Serializable source-aware multi-track timeline with split, trim, move, delete, ripple delete, duplicate, snapping, grouping, lock/hide/mute, zoom, and track-height controls.
- Snapshot undo/redo, AI apply/cancel, and restoration to the state before AI edits. AI restoration explicitly includes later manual edits.
- IndexedDB autosave after changes, validated metadata-only project save/open.
- Local speech-model worker, manual language selection and auto-detection, progress/cancel/error states. No upload-triggered transcription.
- Transcript word seeking, range selection, text correction, find/replace, and timeline deletion. SRT import fallback.
- Editable caption start/end times, full phrase text, and manual caption insertion. C1 timeline blocks move/resize with collision and clip-bound checks. Caption-only deletion leaves the footage intact. Per-clip overrides are undoable and included in save/open/export.
- Fast (Tiny), Balanced (Base, default), and Detailed (Small) local transcription options; source/language selection; explicit undoable retranscription. Balanced was smoke-tested with a spoken fixture. Broader language/noise accuracy comparisons remain outstanding.
- Clean/Bold/Brainrot captions; keyword accents, grouping, position, safe area, editable speaker labels/colors, manual speaker assignment.
- Transcript-scored highlights, sentence boundaries, RMS silence removal, review-only repeated-take suggestions, composite assembly, optional strongest-first ordering, undoable AI edits.
- Floating local command assistant for speed changes, captions, and guided Auto Cut. It is a bounded command parser, not a general-purpose LLM.
- Real MP4 export: H.264, AAC, trim/speed/static transforms, multi-track composition, captions, progress, cancellation, download, and playback of the result.
- Mobile upload/edit/clips/trim/reorder/transcript/caption/export workflow, without the desktop timeline.

## Still needed before full master-spec P0 sign-off

- Automatic preview proxies and dropped-frame adaptive quality.
- General keyframe editing, preview resize handles, draggable numeric values, and motion preset rendering in export. Current motion presets are explicitly preview-only.
- True short overlapping audio crossfades. Current cuts have short per-clip fade-in/out ramps.
- Emoji-frequency styling and custom caption position.
- Independent audio clip editing. A1 represents linked source audio; A2 is reserved. Music remains outside P0.
- Multiple independent highlight outputs in one project and selecting multiple candidate shorts at once. Current suggestions create a single edited sequence; composite mode assembles moments into one sequence.
- Model confidence calibration and automated speaker separation. Labels/colors and manual speaker assignment work; model confidence is not invented.
- WebGPU acceleration and long/high-resolution/mobile memory benchmarking. The initial recognizer uses CPU WASM for compatibility.
- Wider multilingual transcription QA and noisy/long creator footage QA. The initial English fixture is only a smoke test.

## Practical behavior

Source files are never modified. Refreshing retains project metadata but requires media relinking. There is one autosaved project on the device; manually save a project file before creating another if you want to retain both. Processing errors preserve the current project and allow retry. Source files over 1.5 GB are rejected in this first browser build. Exports and decoded audio use browser memory, so large inputs may need shorter cuts or lower export resolution.
