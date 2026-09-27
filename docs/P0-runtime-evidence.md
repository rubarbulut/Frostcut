# P0 runtime evidence

Validated 2026-09-26 on Windows, Edge 154.0.4258.37. These are measured checks on one machine, not device-independent promises. See [closure audit](P0-closure.md).

## Final regression

- Production TypeScript/Vite build passed.
- 75 unit tests in 9 files passed.
- 23 Playwright browser tests passed, including existing P1 speech cleanup/style/SRT coverage.
- Browser/software H.264 animation exports and an injected browser-encoder failure all produced decodable moving video with AAC.
- MP4 caption/custom-position/emoji pixels, independent audio timing/energy, export cancellation/retry, failed/canceled speech replacement, saved Shorts/relink and AI preview/dismiss/undo/stale-proposal behavior passed.
- Desktop spoken-demo and mobile proxy screenshots were visually inspected.

## Ten-minute source → three Shorts → MP4

[scripts/benchmark-long-video.mjs](../scripts/benchmark-long-video.mjs), [report](qa/long-video-benchmark.json), [export screenshot](qa/long-video-export.png):

- Input: 600 seconds, 360×640 synthetic looping typography/tone and imported SRT. This measures processing, **not ASR accuracy or ten-minute speech recognition latency**.
- Import: 1.07 seconds; silence/highlight analysis: 3.18 seconds.
- Three independently editable Shorts and the preserved original (four saved sequences).
- Selected output: 36.9 seconds, 480×854, 30 fps, H.264/AAC. Export: 45.34 seconds. Browser metadata loaded successfully; no page errors.
- Native ffprobe confirmed both streams and matching 36.9-second durations. Decoded audio mean/peak levels were −60.6/−56.9 dBFS, consistent with this deliberately quiet synthetic tone, rather than an empty AAC track.
- JS heap at the end: 16.16 MB used / 78.81 MB allocated. This is neither a peak nor total process/GPU/decoder/WASM memory.
- Supersedes the earlier 44.43-second run recorded before the audio-probe correction.

The tests found and fixed two real defects: quiet footage could override known transcript speech during silence removal, and FFmpeg core 0.12.10 could return −1 with valid ffprobe JSON, causing audio to be incorrectly treated as absent. Speech intervals are now protected and probe JSON is validated; audio energy is checked rather than relying only on an AAC stream's presence.

## Long speech and early preview

[check-long-speech.mjs](../scripts/check-long-speech.mjs), [report](qa/long-speech.json):

- Original 148.335-second synthesized narration, with pauses and a repeated take; no imported transcript.
- Whisper Base on GPU: 65.4 seconds, 311 words, three candidate Shorts.
- Two analysis windows; word times continued across the 90-second boundary and reached 147.1 seconds.
- The first proposed clip was available and playable while later processing continued.
- This exercises long-input chunking and the user-visible pipeline; it is not a human-speech population accuracy benchmark.

## Seven-language speech QA

One fixed real spoken clip per language. WER ignores case/punctuation; numbers/apostrophes and incomplete references affect the metric. See [fixture sources/licenses](speech-fixtures.md), [Base report](qa/transcription.json) and [Small report](qa/transcription-detailed.json).

| Language / variant            | Balanced (Base) WER | Detailed (Small) WER |
| ----------------------------- | ------------------: | -------------------: |
| English                       |                  0% |                    — |
| Spanish                       |              71.4%* |                    — |
| Portuguese                    |               26.1% |                13.0% |
| French                        |               23.7% |                    — |
| German                        |               21.4% |                    — |
| Turkish                       |               47.8% |                 8.7% |
| Polish                        |               29.7% |                10.8% |
| Turkish with added pink noise |               60.9% |                26.1% |

*The Spanish model output includes material beyond the supplied MINDS reference. The literal WER is retained transparently; it is not a reliable standalone measure of Spanish recognition quality.

The clean Turkish reference has 23 words: 11 word errors with Base and 2 with Small. Small took 25.17 seconds for the 16.8-second clip. Turkish/Portuguese/Polish selection now suggests Detailed; manual choice remains available. These single examples do not establish general language accuracy. Caption review is still needed. No invalid timestamp bounds or page errors were reported.

## GPU/CPU and encoding fallback

[GPU failure report](qa/transcription-gpu-fallback.json): after an injected GPU adapter failure, Auto completed with Whisper Base on CPU, exact English reference, 10.10 seconds. Explicit CPU completed in 10.06 seconds. Model weights were cached; initial downloads take longer.

Motion tests also exercise unavailable WebCodecs and a runtime encoder exception. Both retry through the bounded software renderer and produce actual moving H.264 output.

## Proxies, mobile emulation and preview audio

[check-device-preview.mjs](../scripts/check-device-preview.mjs), [report](qa/device-preview.json), [mobile screenshot](qa/mobile-proxy.png):

- Actual 3840×2160 input → 960×540 proxy. Desktop test switches back to Full original and Quarter.
- 390×844 mobile viewport, touch emulation, 4× CPU throttling: proxy ready in 3.08 seconds, playback advanced, document width stayed 390 pixels, no page errors.
- JS heap snapshot: 7.52 MB used / 12.01 MB allocated. This excludes decoder/GPU/WASM/process memory and is not a physical-phone benchmark.
- Web Audio analyser measured nonzero preview audio, approximately 1.87× RMS after changing volume from 100% to 200%, and nonzero audio after pause/resume. Export and preview now both support gain above native media-element volume limits.
- Saved Short caption settings, original duration, reload and source relink passed separately.

## Reproduce

Run npm test, npm run test:e2e and npm run build. Start the production preview on port 4173, then run scripts/check-device-preview.mjs. Set FROSTCUT_QA_URL=http://127.0.0.1:4173 for scripts/benchmark-long-video.mjs, scripts/check-long-speech.mjs and scripts/check-languages.mjs. Language QA supports FROSTCUT_QA_QUALITY=detailed, a comma-separated FROSTCUT_QA_LANGUAGES filter and FROSTCUT_QA_GPU_FAILURE=1. Speech scripts need network access on the first model download. Do not rebuild the served production directory while these checks run.
