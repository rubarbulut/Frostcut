import { describe, expect, it, vi } from 'vitest';
import { SourceAudioReports, readSourceAudioReport } from './source-audio-reports';
import { addMedia, createProject } from './model';
import { audioEffectsFilter } from './audio-tools';

const file = () => new File(['tiny metadata fixture'], 'same-name.mp4', { type: 'video/mp4' });
const source = (value: File, id = 'source') => new Map([[id, { file: value, path: '/input/media' }]]);
const report = (audio: boolean) => JSON.stringify({ streams: audio ? [{ codec_type: 'audio' }] : [] });
const engine = (audio = true) => ({
  ffprobe: vi.fn(async (_args: string[]) => 0),
  readFile: vi.fn(async (_path: string, _encoding: 'utf8'): Promise<string | Uint8Array> => report(audio)),
});

describe('checked original-source audio reports', () => {
  it('accepts actual audio or empty stream lists, including the bundled core valid -1 report', () => {
    for (const code of [0, -1]) {
      expect(readSourceAudioReport(code, report(true))).toBe(true);
      expect(readSourceAudioReport(code, report(false))).toBe(false);
    }
    expect(() => readSourceAudioReport(1, report(false))).toThrow('Could not inspect');
    for (const invalid of ['{', 'null', '{}', '{"streams":null}', '{"streams":[null]}',
      '{"streams":[{}]}', '{"streams":[{"codec_type":"video"}]}', '{"streams":[],"error":null}'])
      expect(() => readSourceAudioReport(0, invalid)).toThrow('incomplete');
  });

  it('reuses both true and false for the same immutable File, across IDs and export paths', async () => {
    for (const audio of [true, false]) {
      const cache = new SourceAudioReports(), ff = engine(audio), value = file(), files: string[] = [];
      const signal = new AbortController().signal;
      expect(await cache.probe(ff, source(value), files, signal, 'export')).toEqual(new Map([['source', audio]]));
      expect(ff.ffprobe.mock.calls[0][0]).toEqual(['-v', 'error', '-select_streams', 'a', '-show_entries',
        'stream=codec_type', '-of', 'json', '/input/media', '-o', 'export-probe0.json']);
      expect(await cache.probe(ff, source(value, 'other-id'), files, signal, 'nested'))
        .toEqual(new Map([['other-id', audio]]));
      expect(cache.cached(new Map([['preview-id', value], ['unknown', file()]])))
        .toEqual(new Map([['preview-id', audio]]));
      expect(ff.ffprobe).toHaveBeenCalledTimes(1);
      expect(files).toEqual(['export-probe0.json']);
    }
  });

  it('rechecks relinked files with identical names, sizes and types instead of retaining stale sound', async () => {
    const cache = new SourceAudioReports(), ff = engine(), first = file(), replacement = file();
    const signal = new AbortController().signal;
    await cache.probe(ff, source(first), [], signal, 'export');
    ff.readFile.mockResolvedValue(report(false));
    expect(await cache.probe(ff, source(replacement), [], signal, 'export')).toEqual(new Map([['source', false]]));
    expect(ff.ffprobe).toHaveBeenCalledTimes(2);
    expect(cache.cached(new Map([['old', first], ['new', replacement]])))
      .toEqual(new Map([['old', true], ['new', false]]));
  });

  it('never caches failures/malformed or binary reports as silence and permits a checked retry', async () => {
    for (const mode of ['failed', 'malformed', 'binary', 'read-error']) {
      const cache = new SourceAudioReports(), ff = engine(), value = file(), files: string[] = [];
      if (mode === 'failed') ff.ffprobe.mockResolvedValueOnce(2);
      if (mode === 'malformed') ff.readFile.mockResolvedValueOnce('{}');
      if (mode === 'binary') ff.readFile.mockResolvedValueOnce(new Uint8Array());
      if (mode === 'read-error') ff.readFile.mockRejectedValueOnce(new Error('read failed'));
      const signal = new AbortController().signal;
      await expect(cache.probe(ff, source(value), files, signal, 'preview')).rejects.toThrow();
      expect(cache.cached(new Map([['source', value]]))).toEqual(new Map());
      expect(files).toEqual(['preview-probe0.json']);
      expect(await cache.probe(ff, source(value), [], signal, 'preview')).toEqual(new Map([['source', true]]));
      expect(ff.ffprobe).toHaveBeenCalledTimes(2);
    }
  });

  it('honors cancellation before a job and across both asynchronous probe/read boundaries', async () => {
    for (const phase of ['before', 'probe', 'read']) {
      const cache = new SourceAudioReports(), ff = engine(), value = file(), files: string[] = [];
      const controller = new AbortController();
      if (phase === 'before') controller.abort();
      if (phase === 'probe') ff.ffprobe.mockImplementationOnce(async () => { controller.abort(); return 0; });
      if (phase === 'read') ff.readFile.mockImplementationOnce(async () => { controller.abort(); return report(true); });
      await expect(cache.probe(ff, source(value), files, controller.signal, 'preview')).rejects.toMatchObject({ name: 'AbortError' });
      expect(cache.cached(new Map([['source', value]]))).toEqual(new Map());
      expect(files).toHaveLength(phase === 'before' ? 0 : 1);
      expect(ff.readFile).toHaveBeenCalledTimes(phase === 'read' ? 1 : 0);
    }
  });

  it('requires a real mount even for cached files and handles cancelled empty jobs', async () => {
    const cache = new SourceAudioReports(), ff = engine(), value = file(), controller = new AbortController();
    await cache.probe(ff, source(value), [], controller.signal, 'export');
    await expect(cache.probe(ff, new Map([['source', { file: value, path: '' }]]), [], controller.signal, 'export'))
      .rejects.toThrow('mount is missing');
    controller.abort();
    await expect(cache.probe(ff, new Map(), [], controller.signal, 'export')).rejects.toMatchObject({ name: 'AbortError' });
    expect(ff.ffprobe).toHaveBeenCalledTimes(1);
  });

  it('keeps native export music unducked by a source whose actual checked report proves no sound', () => {
    let p = addMedia(createProject(), { id: 'voice', name: 'voice.mp4', duration: 10, size: 1,
      width: 360, height: 640, type: 'video/mp4' });
    p = addMedia(p, { id: 'music', name: 'music.mp3', duration: 10, size: 1,
      width: 1, height: 1, type: 'audio/mpeg' });
    const music = p.clips[1]; music.autoDuck = true; music.audioRole = 'music';
    const reports = new Map([['voice', readSourceAudioReport(0, report(false))], ['music', true]]);
    expect(audioEffectsFilter(p, music, 0, reports)).toBe('volume=1');
    expect(audioEffectsFilter(p, music, 0, new Map([['voice', true], ['music', true]]))).toContain('eval=frame');
  });
});
