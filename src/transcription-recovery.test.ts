import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addMedia, createProject, detachAudio, timelineWords, validateProject,
  type MediaAsset, type Transcript,
} from './model';
import { editCaption } from './caption-editing';
import { createSrt } from './subtitles';

const speech = vi.hoisted(() => ({
  files: new Map<string, File>(), waveforms: new Map(),
  extract: vi.fn(), run: vi.fn(), dispose: vi.fn(), changed: vi.fn(),
}));
vi.mock('./media', () => ({ extractAudio: speech.extract }));
vi.mock('./transcription', () => ({
  createTranscriber: () => ({ run: speech.run, dispose: speech.dispose }),
}));
vi.mock('./store', () => ({
  mediaFiles: speech.files, audioWaveforms: speech.waveforms,
  useEditor: { getState: () => ({ mediaChanged: speech.changed }) },
}));
import { analyzeSource } from './analyze-source';

const asset: MediaAsset = {
  id: 'recording', name: 'recording.m4a', type: 'audio/mp4',
  width: 1280, height: 720, duration: 8, size: 10,
};
const transcript = (words = [{
  id: 'w', text: 'Merhaba', start: 2, end: 4, speakerId: 'speaker-1',
}]): Transcript => ({ mediaId: asset.id, language: 'Turkish', source: 'local', words });

beforeEach(() => {
  vi.clearAllMocks();
  speech.files.clear();
  speech.waveforms.clear();
  speech.files.set(asset.id, new File(['audio'], asset.name));
  speech.extract.mockResolvedValue(new Float32Array(16000).fill(0.1));
  speech.run.mockResolvedValue(transcript([{ id: 'new', text: 'Yeni', start: 0.1, end: 0.5, speakerId: 'speaker-1' }]));
});

describe('captions from an audio recording', () => {
  it('maps M4A transcript words through source trim, timeline position and speed into SRT', () => {
    const project = addMedia(createProject(), asset);
    Object.assign(project.clips[0], { start: 5, sourceStart: 2, sourceEnd: 4 });
    project.clips[0].properties.speed = 2;
    project.transcripts = [transcript()];
    const [word] = timelineWords(project);
    expect([word.text, word.timelineStart, word.timelineEnd]).toEqual(['Merhaba', 5, 6]);
    expect(createSrt(project)).toContain('00:00:05,000 --> 00:00:06,000');
  });

  it('keeps audio caption edits independent from the recognized source and persists them', () => {
    const project = addMedia(createProject(), asset);
    project.transcripts = [transcript()];
    const edited = editCaption(project, project.clips[0].id, ['w'], {
      text: 'Merhaba dünya', start: 1, end: 3, speakerId: 'speaker-1',
    });
    expect(timelineWords(validateProject(JSON.parse(JSON.stringify(edited)))).map(w => w.text))
      .toEqual(['Merhaba', 'dünya']);
    expect(project.transcripts[0].words[0].text).toBe('Merhaba');
  });

  it('does not duplicate video captions onto a detached audio track after a refresh', () => {
    const video = addMedia(createProject(), { ...asset, type: 'video/mp4', name: 'recording.mp4' });
    const detached = detachAudio(video, video.clips[0].id);
    detached.transcripts = [transcript()];
    delete detached.clips[1].captionWords;
    expect(timelineWords(detached)).toHaveLength(1);
  });
});

describe('source transcription failure and replacement boundaries', () => {
  const settings = createProject().settings;
  const analyze = (previous?: Transcript, ranges = [{ start: 0, end: 1 }], signal = new AbortController().signal) =>
    analyzeSource(asset, settings, true, 50, signal, () => {}, undefined, ranges, previous);

  it('rejects a silent selected range instead of reporting an empty success', async () => {
    speech.extract.mockResolvedValue(new Float32Array(16000));
    await expect(analyze()).rejects.toThrow(/No speech was recognized/);
    expect(speech.run).not.toHaveBeenCalled();
    expect(speech.dispose).toHaveBeenCalledOnce();
  });

  it('rejects an empty recognition even when old captions exist outside the selection', async () => {
    speech.run.mockResolvedValue(transcript([]));
    const previous = transcript();
    await expect(analyze(previous)).rejects.toThrow(/existing captions were kept/);
    expect(previous.words[0].text).toBe('Merhaba');
    expect(speech.changed).not.toHaveBeenCalled();
  });

  it('preserves captions outside the selected source range and merges recognized words', async () => {
    const result = await analyze(transcript());
    expect(result.transcript?.words.map(w => w.text)).toEqual(['Merhaba', 'Yeni']);
  });

  it('replaces a full-source transcript rather than retaining old words', async () => {
    const result = await analyzeSource(asset, settings, true, 50,
      new AbortController().signal, () => {}, undefined, undefined, transcript());
    expect(result.transcript?.words.map(w => w.text)).toEqual(['Yeni']);
  });

  it('rejects late ASR completion after cancellation without caching success', async () => {
    const controller = new AbortController();
    speech.run.mockImplementation(async () => {
      controller.abort();
      return transcript();
    });
    await expect(analyze(undefined, undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(speech.changed).not.toHaveBeenCalled();
    expect(speech.dispose).toHaveBeenCalledOnce();
  });
});
