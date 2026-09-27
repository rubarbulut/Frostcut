import { useEffect, useRef, useState } from 'react';
import { type Clip, isAudioClip, isLocked, timecode } from './model';
import { useEditor, mediaFiles, audioWaveforms } from './store';
import { extractAudio } from './media';
import { analysisWindows, rmsEnvelope } from './audio-analysis';
import { detectBeats } from './audio-tools';
import { Field } from './components';

export function AudioTools({ clip }: { clip: Clip }) {
  const { project: p, commit, seek, setPlaying } = useEditor();
  const [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);
  const audio = isAudioClip(p, clip),
    locked = isLocked(p, clip),
    beats = p.beats?.[clip.mediaId] ?? [];
  const patch = (changes: Partial<Clip>) =>
    commit(
      { ...p, clips: p.clips.map((c) => (c.id === clip.id ? { ...c, ...changes } : c)) },
      'Audio processing',
    );
  async function analyze() {
    const file = mediaFiles.get(clip.mediaId),
      asset = p.media.find((m) => m.id === clip.mediaId)!;
    if (!file) {
      setStatus('Relink this audio file first.');
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setPlaying(false);
    try {
      const windows = analysisWindows(asset.duration),
        result: number[] = [],
        waveform: number[] = [];
      for (const [index, window] of windows.entries()) {
        setStatus(`Listening for beats · ${index + 1}/${windows.length}`);
        const samples = await extractAudio(file, abort.signal, () => {}, {
          start: window.start,
          duration: window.duration,
        });
        result.push(
          ...detectBeats(samples)
            .map((t) => t + window.start)
            .filter((t) => t >= window.coreStart && t < window.coreEnd),
        );
        const rms = rmsEnvelope(samples);
        for (
          let at = Math.round((window.coreStart - window.start) / 0.02);
          at < Math.min(rms.length, (window.coreEnd - window.start) / 0.02);
          at += 5
        )
          waveform.push(Math.min(1, Math.max(...rms.subarray(at, at + 5)) * 5));
      }
      if (abort.signal.aborted) return;
      const latest = useEditor.getState().project;
      if (latest.id !== p.id || mediaFiles.get(asset.id) !== file)
        throw new Error('The source changed. Analyze this audio again.');
      audioWaveforms.set(asset.id, waveform);
      commit({ ...latest, beats: { ...latest.beats, [asset.id]: result } }, 'Detect music beats');
      useEditor.getState().mediaChanged();
      setStatus(
        result.length
          ? `${result.length} beat markers found. Review before snapping.`
          : 'No distinct beats found. Add markers manually or try more percussive music.',
      );
    } catch (error) {
      if (!abort.signal.aborted) setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset className="audio-tools" disabled={locked}>
      {audio && (
        <Field label="Audio role">
          <select
            value={clip.audioRole ?? 'voice'}
            onChange={(e) => patch({ audioRole: e.target.value as 'voice' | 'music' })}
          >
            <option value="voice">Voice / dialogue</option>
            <option value="music">Music / background</option>
          </select>
        </Field>
      )}
      <label className="check-row">
        <input
          type="checkbox"
          checked={!!clip.voiceEnhance}
          onChange={(e) => patch({ voiceEnhance: e.target.checked })}
        />
        Enhance voice
      </label>
      <small className="subtle">
        Reduce low rumble and high hiss; balance speech with gentle compression. Included in export.
      </small>
      {audio && clip.audioRole === 'music' && (
        <>
          <label className="check-row">
            <input
              type="checkbox"
              checked={!!clip.autoDuck}
              onChange={(e) => patch({ autoDuck: e.target.checked })}
            />
            Lower music during speech
          </label>
          <small className="subtle">
            Uses transcript timing when available, otherwise audible voice clips. Music returns
            between passages.
          </small>
          <div className="button-row">
            <button className="secondary small" disabled={busy} onClick={analyze}>
              Detect beats
            </button>
            {busy && (
              <button
                className="text-button"
                onClick={() => {
                  controller.current?.abort();
                  setStatus('Beat analysis canceled.');
                }}
              >
                Cancel beats
              </button>
            )}
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                const t =
                  clip.sourceStart +
                  (useEditor.getState().playhead - clip.start) * clip.properties.speed;
                if (t < clip.sourceStart || t > clip.sourceEnd) {
                  setStatus('Move the playhead inside this audio clip.');
                  return;
                }
                const markers = [...beats.filter((b) => Math.abs(b - t) > 0.03), t].sort(
                  (a, b) => a - b,
                );
                commit({ ...p, beats: { ...p.beats, [clip.mediaId]: markers } }, 'Add beat marker');
              }}
            >
              Add beat at playhead
            </button>
          </div>
          {beats.length > 0 && (
            <>
              <p className="subtle">{beats.length} beat markers · snapping uses these markers.</p>
              <div className="beat-list">
                {beats.slice(0, 40).map((t) => (
                  <button
                    className="text-button"
                    key={t}
                    onClick={() => {
                      setPlaying(false);
                      seek(clip.start + (t - clip.sourceStart) / clip.properties.speed);
                    }}
                  >
                    {timecode(t, true)}
                  </button>
                ))}
              </div>
              <button
                className="text-button"
                onClick={() =>
                  commit({ ...p, beats: { ...p.beats, [clip.mediaId]: [] } }, 'Clear beat markers')
                }
              >
                Clear beats
              </button>
            </>
          )}
        </>
      )}
      {status && (
        <p role="status" className="subtle">
          {status}
        </p>
      )}
    </fieldset>
  );
}
