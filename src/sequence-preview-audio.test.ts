import { describe, expect, it, vi } from 'vitest';
import { addMedia, createProject, defaultProps, type Project, type SequenceClip } from './model';
import { requireMediaClip } from './clip-source';
import { sequenceSnapshot } from './sequences';
import { SourceAudioReports } from './source-audio-reports';
import { planSequencePreviewAudio, previewAudioWave, renderSequencePreviewAudio } from './sequence-preview-audio';

function fixture() {
  const p = addMedia(createProject('Prepared audio', 'YouTube'), { id: 'voice', name: 'voice.mp4', duration: 20,
    width: 1920, height: 1080, size: 1, type: 'video/mp4' });
  const child = sequenceSnapshot(p, 'child', 'Child');
  child.clips = [{ ...requireMediaClip(p.clips[0]), sourceStart: 2, sourceEnd: 12,
    properties: { ...defaultProps, volume: 0.8 }, voiceEnhance: true }];
  const parent: SequenceClip = { id: 'instance', sequenceId: 'child', trackId: 'V1', start: 0,
    sourceStart: 0, sourceEnd: 10, properties: { ...defaultProps, speed: 2, volume: 0.5 }, voiceEnhance: true };
  const root = sequenceSnapshot(p, 'root', 'Root'); root.clips = [parent];
  const project: Project = { ...p, ...root, id: p.id, name: p.name, activeSequenceId: 'root', sequences: [root, child] };
  return { project, parent, child };
}
function engine(pcm: Uint8Array) {
  return { exec: vi.fn(async (_args: string[]) => 0), ffprobe: vi.fn(async (_args: string[]) => 0),
    readFile: vi.fn(async (path: string, _encoding?: 'utf8'): Promise<Uint8Array | string> =>
      path.endsWith('.json') ? '{"streams":[{"codec_type":"audio"}]}' : pcm),
    deleteFile: vi.fn(async (_path: string) => {}) };
}
const inputs = () => new Map([['voice', new File(['metadata fixture only'], 'voice.mp4')]]);
function io() {
  return { mount: vi.fn(async (_file: File, directory: string) => `${directory}/media`),
    unmount: vi.fn(async (_directory: string) => {}), assertCurrent: vi.fn(() => {}) };
}

describe('explicit lossless sequence audio preparation', () => {
  it('budgets one sample-aligned window without capping the whole project or dropping silent gaps', () => {
    const { project: p } = fixture();
    p.clips[0].sourceEnd = 1000;
    const plan = planSequencePreviewAudio(p, { start: 250, end: 250.01 });
    expect([plan.startFrame, plan.endFrame, plan.frames, plan.pcmBytes]).toEqual([12000000, 12000480, 480, 3840]);
    expect(plan.sourceIds).toEqual(['voice']);
    expect(() => planSequencePreviewAudio(p, { start: 0, end: 200 })).toThrow('shorter range');
    for (const range of [{ start: -1, end: 1 }, { start: 1, end: Infinity }, { start: 1, end: 1 },
      { start: 0, end: 600 }, { start: 0, end: 1e-9 }])
      expect(() => planSequencePreviewAudio(p, range)).toThrow();
  });

  it('reads active source routing, rejects inactive cycles and omits muted-file requirements', () => {
    const { project: p, parent } = fixture();
    const unused = sequenceSnapshot(p, 'unused', 'Unused'); unused.clips = [{ ...parent, sequenceId: 'unused' }];
    expect(() => planSequencePreviewAudio({ ...p, sequences: [...p.sequences!, unused] }, { start: 0, end: 1 })).toThrow('cycle');
    p.clips = [{ ...parent, audioDetached: true }];
    expect(planSequencePreviewAudio(p, { start: 0, end: 1 }).sourceIds).toEqual([]);
    p.clips[0].trackId = 'A2';
    expect(planSequencePreviewAudio(p, { start: 0, end: 1 }).sourceIds).toEqual(['voice']);
  });

  it('wraps exact float samples in a stereo 48kHz WAVE header without clipping or quantization', async () => {
    const { project } = fixture(), plan = planSequencePreviewAudio(project, { start: 0, end: 2 / 48000 });
    const storage = new Uint8Array(24), data = new DataView(storage.buffer);
    [1.25, -1.25, 0.0001, -0.0001].forEach((value, i) => data.setFloat32(4 + i * 4, value, true));
    const pcm = storage.subarray(4, 20), blob = previewAudioWave(pcm, plan);
    const bytes = new Uint8Array(await blob.arrayBuffer()), wave = new DataView(bytes.buffer);
    expect(blob.type).toBe('audio/wav'); expect(blob.size).toBe(96);
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('RIFF');
    expect(wave.getUint32(4, true)).toBe(88);
    expect(new TextDecoder().decode(bytes.subarray(8, 16))).toBe('WAVEfmt ');
    expect(wave.getUint16(20, true)).toBe(0xfffe); expect(wave.getUint16(22, true)).toBe(2);
    expect(wave.getUint32(24, true)).toBe(48000); expect(wave.getUint32(28, true)).toBe(384000);
    expect(wave.getUint16(32, true)).toBe(8); expect(wave.getUint16(34, true)).toBe(32);
    expect(wave.getUint16(36, true)).toBe(22); expect(wave.getUint16(38, true)).toBe(32);
    expect(wave.getUint32(40, true)).toBe(3); expect(wave.getUint32(44, true)).toBe(3);
    expect(new TextDecoder().decode(bytes.subarray(60, 64))).toBe('fact');
    expect(wave.getUint32(68, true)).toBe(2); expect(wave.getUint32(76, true)).toBe(16);
    expect(bytes.subarray(80)).toEqual(pcm);
    expect(() => previewAudioWave(pcm.subarray(0, 8), plan)).toThrow('sample count');
    expect(() => previewAudioWave(pcm, { ...plan, frames: 3 })).toThrow('sample count');
  });

  it('executes the actual hierarchical graph before trimming the completed root bus and cleans owned files', async () => {
    const { project } = fixture(), range = { start: 1, end: 1.01 }, plan = planSequencePreviewAudio(project, range);
    const pcm = new Uint8Array(plan.pcmBytes), ff = engine(pcm), ports = io(), files = inputs();
    const result = await renderSequencePreviewAudio(project, range, files, ff, ports, new SourceAudioReports(),
      new AbortController().signal, () => {});
    expect(result.frames).toBe(480); expect(result.blob.size).toBe(plan.pcmBytes + 80);
    expect(ports.mount).toHaveBeenCalledWith(files.get('voice'), '/sequence-preview0');
    const args = ff.exec.mock.calls[0][0], graph = args[args.indexOf('-filter_complex') + 1];
    expect(args.slice(0, 6)).toEqual(['-ss', '2', '-t', '10', '-i', '/sequence-preview0/media']);
    expect(graph).toContain('[0:a]'); expect(graph.match(/acompressor=/g)).toHaveLength(2);
    expect(graph.indexOf('seqaudio1_mix')).toBeLessThan(graph.indexOf('atempo=2'));
    expect(graph.endsWith('[seqaudio0_out0]atrim=start_sample=48000:end_sample=48480,asetpts=PTS-STARTPTS[preview_audio]')).toBe(true);
    expect(args.slice(args.indexOf('-map'))).toEqual(['-map', '[preview_audio]', '-vn', '-ar', '48000', '-ac', '2',
      '-c:a', 'pcm_f32le', '-f', 'f32le', 'sequence-preview.f32']);
    expect(ff.deleteFile.mock.calls.map(([path]) => path)).toEqual(['preview-probe0.json', 'sequence-preview.f32']);
    expect(ports.unmount).toHaveBeenCalledWith('/sequence-preview0');
  });

  it('requires original files before mounting and never treats a malformed report as silence', async () => {
    const { project } = fixture(), range = { start: 0, end: 0.01 }, ff = engine(new Uint8Array(3840)), ports = io();
    const run = (sources: ReadonlyMap<string, File>) => renderSequencePreviewAudio(project, range, sources, ff, ports,
      new SourceAudioReports(), new AbortController().signal, () => {});
    await expect(run(new Map())).rejects.toThrow('Relink'); expect(ports.mount).not.toHaveBeenCalled();
    ff.readFile.mockResolvedValue('{}');
    await expect(run(inputs())).rejects.toThrow('incomplete'); expect(ff.exec).not.toHaveBeenCalled();
    expect(ports.unmount).toHaveBeenCalledTimes(1);
  });

  it('uses verified no-audio reports to render genuine gap silence without fictitious media inputs', async () => {
    const { project } = fixture(), ff = engine(new Uint8Array(3840));
    ff.readFile.mockImplementation(async (path) => path.endsWith('.json') ? '{"streams":[]}' : new Uint8Array(3840));
    const result = await renderSequencePreviewAudio(project, { start: 0, end: 0.01 }, inputs(), ff, io(),
      new SourceAudioReports(), new AbortController().signal, () => {});
    expect(result.frames).toBe(480);
    const args = ff.exec.mock.calls[0][0]; expect(args).not.toContain('-i');
    expect(args[args.indexOf('-filter_complex') + 1]).toContain('anullsrc=r=48000:cl=stereo');
  });

  it('discards cancelled and relinked work at asynchronous boundaries while releasing owned resources', async () => {
    for (const phase of ['before', 'mount', 'probe', 'exec', 'read']) {
      const { project } = fixture(), ff = engine(new Uint8Array(3840)), ports = io(), cancel = new AbortController();
      if (phase === 'before') cancel.abort();
      if (phase === 'mount') ports.mount.mockImplementationOnce(async () => { cancel.abort(); return '/mounted'; });
      if (phase === 'probe') ff.ffprobe.mockImplementationOnce(async () => { cancel.abort(); return 0; });
      if (phase === 'exec') ff.exec.mockImplementationOnce(async () => { cancel.abort(); return 0; });
      if (phase === 'read') ff.readFile.mockImplementation(async (path) => {
        if (path.endsWith('.json')) return '{"streams":[{"codec_type":"audio"}]}';
        cancel.abort(); return new Uint8Array(3840);
      });
      await expect(renderSequencePreviewAudio(project, { start: 0, end: 0.01 }, inputs(), ff, ports,
        new SourceAudioReports(), cancel.signal, () => {})).rejects.toMatchObject({ name: 'AbortError' });
      expect(ports.unmount).toHaveBeenCalledTimes(phase === 'before' ? 0 : 1);
    }
    const { project } = fixture(), ff = engine(new Uint8Array(3840)), ports = io(); let current = true;
    ports.assertCurrent.mockImplementation(() => { if (!current) throw new Error('Source media changed'); });
    ff.exec.mockImplementation(async () => { current = false; return 0; });
    await expect(renderSequencePreviewAudio(project, { start: 0, end: 0.01 }, inputs(), ff, ports,
      new SourceAudioReports(), new AbortController().signal, () => {})).rejects.toThrow('Source media changed');
    expect(ff.readFile.mock.calls.every(([path]) => path.endsWith('.json'))).toBe(true);
    expect(ports.unmount).toHaveBeenCalledTimes(1);
  });

  it('rejects encoder failures and wrong-length output instead of padding or publishing fake sound', async () => {
    for (const mode of ['failed', 'short', 'binary-missing']) {
      const { project } = fixture(), ff = engine(new Uint8Array(3832)), ports = io();
      if (mode === 'failed') ff.exec.mockResolvedValue(2);
      if (mode === 'binary-missing') ff.readFile.mockImplementation(async (path) =>
        path.endsWith('.json') ? '{"streams":[{"codec_type":"audio"}]}' : '');
      await expect(renderSequencePreviewAudio(project, { start: 0, end: 0.01 }, inputs(), ff, ports,
        new SourceAudioReports(), new AbortController().signal, () => {})).rejects.toThrow();
      expect(ff.deleteFile.mock.calls.map(([path]) => path)).toContain('sequence-preview.f32');
      expect(ports.unmount).toHaveBeenCalledTimes(1);
    }
  });
});
