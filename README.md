# FrostCut

A local-first video editor built from the FrostCut master spec, with the initial P0 editor and the first P1 speech/caption package. React, TypeScript, Vite, Zustand, IndexedDB, Transformers.js, and FFmpeg.wasm. No server account or media upload endpoint.

## Run locally

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite. Node 22+ is recommended. The install script copies the FFmpeg runtime into `public/runtime`. The first transcription downloads Whisper model weights from Hugging Face; inference runs in a Web Worker on the device. Browser caches retain those weights subject to storage availability. Internet is needed for the first model download.

`npm run build` creates `dist`. `npm run preview` serves that production build. Keep the COOP/COEP headers in `vite.config.ts` when serving the build elsewhere. WebAssembly and model assets are relatively large; they are loaded only when processing is requested.

## Try the workflow

1. Choose **Try a sample project**, or **Start editing** and import an MP4, MOV, or WebM your browser can decode.
2. Split with **Ctrl K**, trim clip edges, drag clips, or edit precise source times in Properties. **Space** toggles playback; **Ctrl Z** undoes.
3. Click **Transcribe**, select a language and Fast / Balanced / Detailed model, then start local speech recognition. Balanced (Whisper Base) is the default. Retranscribe selected footage when needed; existing corrections stay in place until the replacement succeeds, and replacement is undoable. SRT import is also available. No transcription starts on upload.
4. Open **Auto Cut**, choose pacing and clip length, review highlights/pauses/repeats, and apply a suggestion.
5. Click a transcript time range to edit its text, speaker, and exact start/end times. **Add caption** writes a missing line by hand. On desktop, drag the **C1** blocks to move captions or their edges to resize them; click a block to open the same editor. These edits do not cut the video. Switch between Clean/Bold/Brainrot captions and set speaker colors.
6. **Save project** downloads metadata. Media files are deliberately omitted. Reopening after a refresh prompts you to **Relink** originals.
7. Export a real H.264 MP4 with AAC audio and burned-in captions. Use Quick preview resolution for a fast first check.

The bundled sample is original typography with a quiet synthetic tone. Its sample transcript is explicitly illustrative. It does not demonstrate speech recognition quality; import spoken footage to test the real model.

### P1 speech and caption tools

In **Transcript → Clean up speech**, listen to fillers or compare repeated takes, select the passages to remove, and apply them as one undoable edit. Optional phrases can carry meaning and start unselected. Cuts close gaps across the timeline. The detector uses the current transcript, so correct inaccurate words/timing before applying a cut.

In **Captions → Customize & save style**, adjust appearance and save named presets within the project. Preview and MP4 use the same style settings. **Transcript → Export SRT** downloads the edited timeline's captions as UTF-8 in their existing language; automatic translation is still planned.

## Architecture

- `src/model.ts`: serializable project, validation, source/timeline mapping, pure timeline operations.
- `src/store.ts`: bounded snapshot undo/redo, operation-triggered IndexedDB autosave, transient media handles.
- `src/ai.ts`: transcript scoring, RMS silence detection, conservative repeat suggestions, bounded natural-language commands. Suggestions produce operations for explicit apply/cancel.
- `src/transcription.worker.ts`: local, multilingual Whisper Tiny/Base/Small with word timestamps; WASM CPU execution. `src/speech-result.ts` validates and repairs missing timestamp bounds; estimated timing is marked instead of inventing confidence scores.
- `src/caption-editing.ts`, `src/CaptionEditor.tsx`, `src/CaptionLane.tsx`: source-aware per-clip text/timing overrides, manual captions, and the C1 subtitle lane. Overrides survive split/trim/move/speed changes, autosave, project files, and MP4 export without changing other uses of the same source media.
- `src/media.ts`: audio extraction and FFmpeg render graph. Composites video tracks, mixes audio, applies speed/transform/fades, burns captions with libass, encodes MP4.
- `src/Preview.tsx`, `src/Timeline.tsx`, `src/Panels.tsx`: editing views; the timeline UI is not the source of truth.
- `src/App.tsx`: landing, project setup, jobs, guided AI, import/export, and simplified mobile workflow.

Media object URLs and source bytes are held in memory, never serialized. Project files are validated before loading, and imported suggestion operations are discarded. Transcript timing is stored against source media and mapped onto each timeline instance after edits. Imported SRT has estimated within-caption word timing.

## Validation

```sh
npm test
npm run test:e2e
npm run build
```

Browser tests use installed Microsoft Edge on this Windows environment. Change `channel` in `playwright.config.ts` for another supported browser. The tests exercise desktop and mobile UI, save/relink, and a real captioned MP4 download. `scripts/check-transcription.mjs` is an optional network/model smoke test using the included synthesized speech fixture.

See [P0 status](docs/P0-status.md) and [P1 status](docs/P1-status.md) for delivered functionality and remaining spec items. Neither phase is declared fully complete.

## Assets and dependencies

`public/fonts/NotoSans.ttf` is Google Fonts' Noto Sans, bundled with its SIL Open Font License in `public/fonts/OFL.txt`. The demo video was generated for this project. The short speech QA fixture was synthesized locally. Third-party packages and Whisper weights retain their respective licenses. FFmpeg's libx264-enabled runtime has GPL licensing implications for redistribution; see the upstream FFmpeg.wasm and x264 licenses before distributing a binary package.
