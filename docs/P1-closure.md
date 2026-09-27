# P1 closure audit

**Completed: 2026-09-27.** Scope: the master's P1 list in section 6, music/B-roll/animation/export additions in sections 14–19, plus the user's timeline panning and independent preview speed. Embedded agent prompts in the specification were not treated as new user instructions. Existing landing/importer work was preserved.

| Gate | Delivered behavior | Evidence |
| --- | --- | --- |
| Speech cleanup and caption styles | Filler/repeat review, bounded listening, reversible edits, saved caption appearance | Existing `speech-cleanup.test.ts`, `p1.spec.ts` |
| Timeline navigation | Middle-mouse pan; Hand tool with left drag; cursor-anchored Ctrl/Meta-wheel zoom; Shift-wheel horizontal scroll | `navigation.spec.ts`: actual pointer/wheel input, undo remains empty |
| Preview rate | 0.5×–4× normal and proposal playback; clip speed and MP4 timing independent | `navigation.spec.ts`: media rate/clock, saved source properties |
| Music and voice | A2 audio import, percussion peaks/manual markers, move/trim snapping, transcript-timed ducking, optional speech EQ/compression | `audio-tools.test.ts`, `audio-tools.spec.ts`: real WAV import/analysis, persisted effects, MP4 decoded PCM verifies music rises between speech |
| Auto Reframe | Local face detection, nearest-face continuity, smoothed crop bounds, coverage/fallback notice, review/apply, editable source-time position keyframes | `creator.test.ts`, `creator.spec.ts`: moving real-face fixture, measured changing keyframes, playable rendered MP4 |
| Translation and SRT | Seven language choices; local model, editable reviewed output; per-sequence language variants; preview/MP4 selection; SRT/ZIP download; stale text/timing invalidation | `creator.test.ts`, `creator.spec.ts`: actual English→Turkish inference, ZIP CRC/UTF-8 extraction, save/open, rendered subtitle frame |
| B-roll | Transcript passage/query suggestions, live Commons search, sources/licenses, silent V2 insertion, overlap/lock checks, saved credits | `creator.test.ts`, `publishing.spec.ts`: live source search/download, inserted clip, CC BY-SA metadata persistence |
| Publishing | Editable transcript title/description/hashtag drafts; per-sequence save, copy and text download; footage credits | `publishing.spec.ts` and stock unit tests |
| Discover | Live HN ranking with source/date/points/fetch time, downloadable sourced idea outline, explicit failure state | `publishing.spec.ts`: real feed and text download, offline request failure, inspected desktop/mobile screenshots |
| Saved animations | Up to 20 named presets, normalized duration/canvas mapping, editable motion, save/open and existing renderer integration | `audio-tools.test.ts`, `audio-tools.spec.ts`, existing motion export regression |
| Batch ZIP | Selected Shorts rendered serially with individual export settings; cancel/retry, no partial archive, active sequence unchanged | `publishing.spec.ts`: ZIP extraction/CRC and native FFmpeg decoding of both MP4s |
| Persistence/mobile/regression | Schema validation for additions; undoable commits; originals/relink; mobile Creator tools | Unit/project tests plus complete existing P0/P1 browser suite |

## Reproduce validation

Final combined run: **83 unit tests across 11 files passed; all 32 browser tests passed (3.6 minutes), including the real model and live public-source checks. `npm run build` passed.** Native ZIP/MP4/PCM checks passed. The extracted Turkish subtitle frame and early/late reframe output frames were visually inspected; the face remained centered while the source moved horizontally. Desktop and 390×844 Creator-tools screenshots were inspected.

Native `ffmpeg` and Python are used only to independently inspect test outputs; the application itself still runs in the browser.

```powershell
npm install
node scripts/prepare-p1-fixture.mjs
npm test
npm run build
npx vite build --outDir dist-p1
$env:FROSTCUT_TEST_PORT='5180'
$env:FROSTCUT_TEST_PREVIEW='1'
$env:FROSTCUT_MODEL_QA='1'
$env:FROSTCUT_NETWORK_QA='1'
npx playwright test
```

The isolated production preview prevents development-server reloads from invalidating tests. The model flag opts into the ~640 MB translation download. The network flag opts into live public Commons/HN requests; fixture availability controls the real-face test. Regular runs skip these explicit external prerequisites instead of mocking successful model output. Files and screenshots are under ignored `test-results/p1/`.

## Boundaries

- No paid service or API key is required. Models, providers, fixture attribution and licenses are listed in [P1 sources](P1-sources.md).
- Face tracking handles a visible face with a simple continuity rule. Occlusion, distant faces and multiple speakers still require review. It does not perform identity recognition, speaker attribution or P2 object tracking.
- The real translation check covers one short English→Turkish example. Other exposed languages use the model's supported codes but have not been independently quality-benchmarked. Initial download/inference can be slow on a CPU. Translation remains editable and never replaces the original transcript.
- Beat detection finds percussive onsets, not a guaranteed musical downbeat grid. Ducking follows transcript/voice clip ranges, not a separate neural voice activity detector. Voice enhancement is optional EQ/compression; browser and FFmpeg compressor implementations are not bit-identical.
- B-roll/publishing suggestions are local keyword/phrase heuristics. Discover is the live HN technology/science feed; no fabricated YouTube trends or virality promises are made.
- Batch output uses the browser's memory for completed files and a standard stored ZIP (under 4 GB). Large batches may still need to be split. There is no cloud rendering.
- Mobile checks use 390×844 Edge emulation on Windows, not a physical phone. P2 generated media, background removal, general motion tracking and direct publishing are outside this closure.
