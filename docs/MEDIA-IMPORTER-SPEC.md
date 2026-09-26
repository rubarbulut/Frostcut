# Media & Remote Importer Extension Specification (MP3/Audio + MP4 + YouTube)

> **Architectural Note for Codex & Core Editor Team:**  
> This specification defines the non-breaking media importer extension. It lives under `src/importer/` and is designed to feed standard browser `File` / `Blob` instances into the existing `inspectMedia` / `registerMedia` / `useEditor` pipeline. It introduces **zero merge conflicts** with existing P0 timeline/playback contracts and respects all P0 closure gates.

---

## 1. Problem Statement & Motivation

1. **Current P0 Limitation on Audio Ingest:**  
   `src/media.ts#inspectMedia` currently validates `video.videoWidth > 0`. When a creator uploads background music, voiceover, or SFX (`.mp3`, `.wav`, `.m4a`, `.aac`), the promise rejects with `"Choose a playable video file"`, despite the fact that `model.ts` already defines audio tracks (`kind: 'audio'`) and detached audio clips.
2. **Remote Ingest Demand:**  
   Creators frequently start video edits from YouTube long-form videos, podcasts, or Shorts. Bringing remote media directly into the browser without leaving the app significantly reduces friction.
3. **Local-First Privacy Guardrail:**  
   All remote media fetched is immediately stored locally in browser memory / IndexedDB (`mediaFiles.set(id, file)`). The server never retains user timeline states or persistent video archives.

---

## 2. Ingest Architecture & Contract

```
┌─────────────────────────────────────────────────────────────────┐
│                        Ingest Sources                           │
│  1. Local Video (MP4, WebM, MOV)                                │
│  2. Local Audio (MP3, WAV, AAC, M4A)                            │
│  3. Remote Stream (YouTube, Shorts, Direct MP4/MP3 URL)         │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│               src/importer/media-importer.ts                    │
│                                                                 │
│  • youtube-resolver.ts: Parses video ID, fetches stream metadata│
│    (supports Cobalt API, direct streams, offline fallback).     │
│  • audio-inspector.ts: Web Audio API AudioContext decoding for   │
│    instant duration, sampleRate, and waveform calculation.      │
│  • audio-video-wrapper.ts: Generates compliant 1080p canvas     │
│    poster/waveform stream if video container is required.       │
└───────────────────────────────┬─────────────────────────────────┘
                                │ Produces standard browser `File`
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│            Existing Core Editor Pipeline (Unchanged)            │
│  • inspectMedia(file: File)                                     │
│  • registerMedia(asset, file)                                   │
│  • commit(addMedia(project, asset), 'Import media')             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Interface Definitions (`src/importer/types.ts`)

```typescript
export type IngestMediaType = 'video' | 'audio';

export interface RemoteMediaMeta {
  url: string;
  source: 'youtube' | 'direct';
  id?: string;
  title: string;
  thumbnailUrl?: string;
  duration?: number;
  availableFormats: Array<{
    formatId: string;
    type: IngestMediaType;
    quality: string;
    ext: 'mp4' | 'mp3';
    url: string;
  }>;
}

export interface IngestJobProgress {
  phase: 'parsing' | 'resolving' | 'downloading' | 'processing' | 'ready';
  percent: number;
  message: string;
}
```

---

## 4. YouTube Resolution Strategy

To honor the local-first ethos while bypassing browser CORS:
* **Primary (Direct / Open API):** Queries configurable media proxy endpoints (e.g. Cobalt instance `/api/json`) which streams the raw video/audio chunks directly to the client as an `ArrayBuffer`.
* **Client Packaging:** The `ArrayBuffer` is wrapped into `new File([buffer], `${sanitizedTitle}.${ext}`, { type: mimeType })`.
* **Zero Core Modifications:** The resulting `File` object is handed to the same import handler used for drag-and-drop files.

---

## 5. Timeline Placement Rules (P0 & P1 Alignment)

* **MP4 / Video Ingest:** Added to Track `V1` with paired audio `A1` (standard P0 behavior).
* **MP3 / Audio-Only Ingest:**
  * When dropped onto the timeline, it is placed into Track `A2` (Music/SFX) or `A1` without blocking video tracks.
  * Audio waveforms are computed directly using `AudioContext.decodeAudioData`, matching `audio-analysis.ts#rmsEnvelope`.

---

## 6. Verification & Test Gates

1. **Unit Tests (`src/importer/importer.test.ts`):**
   * YouTube URL parsing for standard, short, and Shorts URLs.
   * Remote stream error handling and fallback mechanism.
   * MP3 duration and waveform calculation via Web Audio mock.
2. **Regression Check:**
   * Existing 57 unit tests in `vitest run` must remain completely green.
   * Playwright suite `tests/editor.spec.ts` must pass without regressions.
