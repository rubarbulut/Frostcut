# FrostCut

A local-first video editor built from the FrostCut master spec, with P0 and P1 workflows implemented. React, TypeScript, Vite, Zustand, IndexedDB, Transformers.js, MediaPipe, and FFmpeg.wasm. Core editing, transcription, translation and export run on the device, without an account or a media upload endpoint. Public stock and topic searches are explicit network actions.

## Run locally

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite. Node 22+ is recommended. The install script copies FFmpeg and MediaPipe runtimes into `public/runtime`. The first transcription downloads Whisper model weights from Hugging Face; inference runs in a Web Worker on the device. Subtitle translation downloads M2M100 weights separately (about 640 MB). Browser caches retain weights subject to storage availability. Internet is needed for first model downloads. The small face detector is bundled.

`npm run build` creates `dist`. `npm run preview` serves that production build. Keep the COOP/COEP headers in `vite.config.ts` when serving the build elsewhere. WebAssembly and model assets are relatively large; they are loaded only when processing is requested.

## Try the workflow

1. Choose **Try a spoken demo**, or **Start editing** and import an MP4, MOV, or WebM your browser can decode.
2. Split with **Ctrl K**, trim clip edges, drag clips, or edit precise source times in Properties. **Middle mouse drag** pans the timeline; the **Hand** tool pans with left drag. **Ctrl + wheel** zooms around the cursor; **Shift + wheel** scrolls horizontally. **Space** toggles playback; **Ctrl Z** undoes. The preview speed selector offers **0.5×–4×** without changing clip/export speed.
3. Click **Transcribe**, select a language and Fast / Balanced / Detailed model, then start local recognition. Balanced (Whisper Base) is the general default; Turkish, Portuguese and Polish suggest Detailed (Whisper Small). Auto uses WebGPU when available and falls back to CPU. Existing corrections stay until replacement succeeds, and replacement is undoable. SRT import is available. No transcription starts on upload.
4. Open **Auto Cut**, choose count, pacing and length, then review highlights/pauses/repeats in the proposed-edit player. Apply a suggestion or select several highlights and **Create Shorts**. Switch saved sequences to edit/export each Short; the original remains available. Dismiss and undo are supported.
5. Click a transcript time range to edit its text, speaker, and exact start/end times. **Add caption** writes a missing line by hand. On desktop, drag the **C1** blocks to move captions or their edges to resize them; click a block to open the same editor. These edits do not cut the video. Switch between Clean/Bold/Brainrot captions and set speaker colors.
6. **Save project** downloads metadata. Media files are deliberately omitted. Reopening after a refresh prompts you to **Relink** originals.
7. Export a real H.264 MP4 with AAC audio, burned-in captions and motion/keyframes. Use Quick preview resolution for a fast first check. Advanced settings expose resolution, frame rate and video/audio bitrate.

The spoken demo contains 148 seconds of original synthesized narration, pauses and a repeated take. Its supplied SRT has estimated word timing and a clearly labeled practice typo. **Try a sample project** remains a shorter typography/tone example with an illustrative transcript. Import spoken footage or retranscribe the spoken demo to exercise recognition.

Preview automatically creates lower-resolution proxies for heavy media; exports use originals. Auto/Full/Half/Quarter controls show preview and export dimensions. Clip properties include preview handles, keyframes, seven motion presets and independently detachable audio. Captions support custom positioning and emoji frequency in preview and export.

### P1 tools

In **Transcript → Clean up speech**, listen to fillers or compare repeated takes, select the passages to remove, and apply them as one undoable edit. Optional phrases can carry meaning and start unselected. Cuts close gaps across the timeline. The detector uses the current transcript, so correct inaccurate words/timing before applying a cut.

In **Captions → Customize & save style**, adjust appearance and save named presets within the project. Preview and MP4 use the same style settings. **Transcript → Export SRT** downloads the current caption language as UTF-8.

- **Audio:** Import MP3/WAV/M4A or other supported audio onto A2. In the clip's Properties, choose Music/Voice, detect and review beat markers, snap clip moves/trims to beats, enable ducking under dialogue, or apply voice EQ/compression. All effects are included in MP4.
- **Creator tools → Reframe:** Detect a face in the selected source clip and review a crop for the current canvas. Apply it as editable position keyframes. Missing detections and centered fallback are reported.
- **Creator tools → Subtitles:** Translate between the editor's seven languages, review/correct text, save variants, select a preview/MP4 language, and download individual SRTs or a multilingual ZIP. Source transcript edits remain available; translations become stale after timing/text changes.
- **Creator tools → B-roll:** Choose a transcript passage, search Wikimedia Commons, inspect the source/license, and insert a silent stock clip on V2. Credits persist with project media and are available in Publish.
- **Creator tools → Publish / Discover:** Edit transcript-based YouTube title/description/hashtag drafts. Browse the live Hacker News technology/science feed and turn a sourced topic into a downloadable planning outline. These local templates do not claim semantic reasoning or view predictions.
- **Properties → Save & reuse animation:** Save up to 20 motion presets. Their keyframes adapt to the target clip's duration and canvas; they persist in the project and render in MP4.
- **Export → Batch export saved Shorts:** Choose sequences and render their MP4s into one ZIP, using each sequence's export settings. Cancel/retry is supported without changing the active edit.

## Architecture

- `src/model.ts`: serializable project, validation, source/timeline mapping, pure timeline operations.
- `src/store.ts`, `src/sequences.ts`: bounded snapshot undo/redo, independent saved Shorts, applied-edit metadata, operation-triggered IndexedDB autosave and transient media handles.
- `src/ai.ts`: transcript scoring, RMS silence detection, conservative repeat suggestions, bounded natural-language commands. Suggestions produce operations for explicit apply/cancel.
- `src/analyze-source.ts`, `src/audio-analysis.ts`, `src/transcription.worker.ts`: bounded long-input analysis windows and local multilingual Whisper Tiny/Base/Small, with WebGPU and WASM CPU fallback. `src/speech-result.ts` validates/repairs timestamp bounds; estimated timing is marked instead of inventing confidence.
- `src/caption-editing.ts`, `src/CaptionEditor.tsx`, `src/CaptionLane.tsx`: source-aware per-clip text/timing overrides, manual captions, and the C1 subtitle lane. Overrides survive split/trim/move/speed changes, autosave, project files, and MP4 export without changing other uses of the same source media.
- `src/media.ts`, `src/media-runtime.ts`: serialized FFmpeg jobs, source-file mounts, bounded extraction, static video composition and audio mix/crossfades.
- `src/visual-renderer.ts`, `src/motion.ts`: shared animation transforms and frame rendering for keyframes, custom captions and emoji, with WebCodecs and bounded software encoding fallback.
- `src/proxies.ts`: automatic/adaptive preview quality with a bounded local proxy cache; originals stay available for export.
- `src/Preview.tsx`, `src/Timeline.tsx`, `src/Panels.tsx`: editing views; the timeline UI is not the source of truth.
- `src/App.tsx`: landing, project setup, jobs, guided AI, import/export, and simplified mobile workflow.

Media object URLs and source bytes are held in memory, never serialized. Project files are validated before loading, and imported suggestion operations are discarded. Transcript timing is stored against source media and mapped onto each timeline instance after edits. Imported SRT has estimated within-caption word timing.

## Validation

P1 closure passed **83 unit tests and all 32 browser tests**, including actual face detection, local Turkish translation, live stock/topic sources, real MP4/audio and multilingual/batch ZIP checks. See the P1 audit for opt-in model/network fixtures and the isolated test server command.

```sh
npm test
npm run test:e2e
npm run build
```

Browser tests use installed Microsoft Edge on this Windows environment. Change `channel` in `playwright.config.ts` for another supported browser. The final P0 run passed 75 unit and 23 browser tests, including desktop/mobile, save/relink, actual MP4 pixels/audio, motion encoder fallback and job cancellation. Additional scripts measure long-source performance, seven-language recognition, GPU fallback and CPU-throttled mobile emulation; see [runtime evidence](docs/P0-runtime-evidence.md) for commands and limits.

See [P0 closure](docs/P0-closure.md), [P1 closure and validation](docs/P1-closure.md), [P1 feature status](docs/P1-status.md) and [P1 sources/limitations](docs/P1-sources.md). Recognition, translation and framing need review. Speaker separation is manual. Files above 1.5 GB are rejected, and browser/device memory still limits large jobs. Benchmarks cover one Windows/Edge machine; mobile results are emulated rather than measured on physical phones.

## Assets and dependencies

`public/fonts/NotoSans.ttf` is Google Fonts' Noto Sans, bundled with its SIL Open Font License in `public/fonts/OFL.txt`. Demo footage and narration were generated for this project. Public multilingual QA clips are attributed in [speech fixtures](docs/speech-fixtures.md). Third-party packages and Whisper weights retain their respective licenses. FFmpeg's libx264-enabled runtime has GPL licensing implications for redistribution; see the upstream FFmpeg.wasm and x264 licenses before distributing a binary package.
