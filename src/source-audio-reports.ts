type AudioProbeEngine = {
  ffprobe: (args: string[]) => Promise<number>;
  readFile: (path: string, encoding: 'utf8') => Promise<string | Uint8Array>;
};
export type MountedAudioSource = { file: File; path: string };

/** Only a checked audio-only ffprobe report can establish true absence. */
export function readSourceAudioReport(code: number, text: string): boolean {
  if (code !== 0 && code !== -1) throw new Error('Could not inspect source audio. Relink the video and retry.');
  let report: { streams?: { codec_type?: unknown }[]; error?: unknown } | null;
  try { report = JSON.parse(text); }
  catch { throw new Error('The source audio report is incomplete. Relink and retry.'); }
  if (!report || report.error !== undefined || !Array.isArray(report.streams) ||
    report.streams.some((stream) => !stream || stream.codec_type !== 'audio'))
    throw new Error('The source audio report is incomplete. Relink and retry.');
  return report.streams.length > 0;
}

/** File objects are immutable; relinking to a different File must never reuse its old report. */
export class SourceAudioReports {
  private readonly reports = new WeakMap<File, boolean>();
  cached(sources: ReadonlyMap<string, File>) {
    const result = new Map<string, boolean>();
    for (const [id, file] of sources) if (this.reports.has(file)) result.set(id, this.reports.get(file)!);
    return result;
  }
  async probe(engine: AudioProbeEngine, sources: ReadonlyMap<string, MountedAudioSource>,
    files: string[], signal: AbortSignal, prefix: 'export' | 'nested' | 'preview') {
    signal.throwIfAborted();
    const result = new Map<string, boolean>();
    for (const [i, [id, source]] of [...sources].entries()) {
      signal.throwIfAborted();
      if (!source.path) throw new Error('The source audio mount is missing. Relink and retry.');
      if (this.reports.has(source.file)) { result.set(id, this.reports.get(source.file)!); continue; }
      const reportFile = `${prefix}-probe${i}.json`;
      files.push(reportFile);
      const code = await engine.ffprobe(['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type',
        '-of', 'json', source.path, '-o', reportFile]);
      signal.throwIfAborted();
      const text = await engine.readFile(reportFile, 'utf8');
      signal.throwIfAborted();
      if (typeof text !== 'string') throw new Error('The source audio report is incomplete. Relink and retry.');
      // The bundled core can return -1 with a valid report; errors/malformed data never become silence.
      const hasAudio = readSourceAudioReport(code, text);
      this.reports.set(source.file, hasAudio); result.set(id, hasAudio);
    }
    return result;
  }
}
