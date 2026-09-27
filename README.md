# FrostCut

A local-first video editor built from the FrostCut master spec, with P0 completed and the first P1 speech/caption package available. React, TypeScript, Vite, Zustand, IndexedDB, Transformers.js, and FFmpeg.wasm. Core editing, transcription and export run on the device, without an account or a media upload endpoint.

## Run locally

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite. Node 22+ is recommended. The install script copies the FFmpeg runtime into `public/runtime`. The first transcription downloads Whisper model weights from Hugging Face; inference runs in a Web Worker on the device. Browser caches retain those weights subject to storage availability. Internet is needed for the first model download.

`npm run build` creates `dist`. `npm run preview` serves that production build. Keep the COOP/COEP headers in `vite.config.ts` when serving the build elsewhere. WebAssembly and model assets are relatively large; they are loaded only when processing is requested.

## Try the workflow

1. Choose **Try a spoken demo**, or **Start editing** and import an MP4, MOV, or WebM your browser can decode.
2. Split with **Ctrl K**, trim clip edges, drag clips, or edit precise source times in Properties. **Space** toggles playback; **Ctrl Z** undoes.
3. Click **Transcribe**, select a language and Fast / Balanced / Detailed model, then start local recognition. Balanced (Whisper Base) is the general default; Turkish, Portuguese and Polish suggest Detailed (Whisper Small). Auto uses WebGPU when available and falls back to CPU. Existing corrections stay until replacement succeeds, and replacement is undoable. SRT import is available. No transcription starts on upload.
4. Open **Auto Cut**, choose count, pacing and length, then review highlights/pauses/repeats in the proposed-edit player. Apply a suggestion or select several highlights and **Create Shorts**. Switch saved sequences to edit/export each Short; the original remains available. Dismiss and undo are supported.
5. Click a transcript time range to edit its text, speaker, and exact start/end times. **Add caption** writes a missing line by hand. On desktop, drag the **C1** blocks to move captions or their edges to resize them; click a block to open the same editor. These edits do not cut the video. Switch between Clean/Bold/Brainrot captions and set speaker colors.
6. **Save project** downloads metadata. Media files are deliberately omitted. Reopening after a refresh prompts you to **Relink** originals.
7. Export a real H.264 MP4 with AAC audio, burned-in captions and motion/keyframes. Use Quick preview resolution for a fast first check. Advanced settings expose resolution, frame rate and video/audio bitrate.

The spoken demo contains 148 seconds of original synthesized narration, pauses and a repeated take. Its supplied SRT has estimated word timing and a clearly labeled practice typo. **Try a sample project** remains a shorter typography/tone example with an illustrative transcript. Import spoken footage or retranscribe the spoken demo to exercise recognition.

Preview automatically creates lower-resolution proxies for heavy media; exports use originals. Auto/Full/Half/Quarter controls show preview and export dimensions. Clip properties include preview handles, keyframes, seven motion presets and independently detachable audio. Captions support custom positioning and emoji frequency in preview and export.

### P1 speech and caption tools

In **Transcript → Clean up speech**, listen to fillers or compare repeated takes, select the passages to remove, and apply them as one undoable edit. Optional phrases can carry meaning and start unselected. Cuts close gaps across the timeline. The detector uses the current transcript, so correct inaccurate words/timing before applying a cut.

In **Captions → Customize & save style**, adjust appearance and save named presets within the project. Preview and MP4 use the same style settings. **Transcript → Export SRT** downloads the edited timeline's captions as UTF-8 in their existing language; automatic translation is still planned.

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

```sh
npm test
npm run test:e2e
npm run build
```

Browser tests use installed Microsoft Edge on this Windows environment. Change `channel` in `playwright.config.ts` for another supported browser. The final P0 run passed 75 unit and 23 browser tests, including desktop/mobile, save/relink, actual MP4 pixels/audio, motion encoder fallback and job cancellation. Additional scripts measure long-source performance, seven-language recognition, GPU fallback and CPU-throttled mobile emulation; see [runtime evidence](docs/P0-runtime-evidence.md) for commands and limits.

See [P0 closure](docs/P0-closure.md), [P0 status](docs/P0-status.md) and [remaining P1 work](docs/P1-status.md). Recognition/highlights need review. Speaker separation is manual. Files above 1.5 GB are rejected, and browser/device memory still limits large jobs. Benchmarks cover one Windows/Edge machine; mobile results are emulated rather than measured on physical phones.

## Assets and dependencies

`public/fonts/NotoSans.ttf` is Google Fonts' Noto Sans, bundled with its SIL Open Font License in `public/fonts/OFL.txt`. Demo footage and narration were generated for this project. Public multilingual QA clips are attributed in [speech fixtures](docs/speech-fixtures.md). Third-party packages and Whisper weights retain their respective licenses. FFmpeg's libx264-enabled runtime has GPL licensing implications for redistribution; see the upstream FFmpeg.wasm and x264 licenses before distributing a binary package.
