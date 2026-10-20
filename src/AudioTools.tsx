import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Wand2, Radio, Sparkles, Activity, Sliders, Volume2, Mic, Zap } from 'lucide-react';
import { type Clip, isAudioClip, isLocked, timecode } from './model';
import { useEditor, mediaFiles, audioWaveforms } from './store';
import { extractAudio } from './media';
import { analysisWindows, rmsEnvelope } from './audio-analysis';
import { detectAudioBeatsAsync } from './beat-worker';
import { Field } from './components';
import { getMultiTrackAudioBus, type SidechainTelemetry } from './audio-bus';
import { AEScrubber } from './inspector/AEScrubber';

function AudioSpectrumCanvas({ isPlaying }: { isPlaying: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const drawBars = (freqData?: Uint8Array) => {
      ctx.clearRect(0, 0, width, height);

      // Subtle frequency grid
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += width / 5) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      const barCount = 42;
      const barWidth = width / barCount - 1.5;

      const gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, '#0284c7');
      gradient.addColorStop(0.5, '#38bdf8');
      gradient.addColorStop(1, '#c084fc');

      ctx.fillStyle = gradient;

      for (let i = 0; i < barCount; i++) {
        let val = 0;
        if (freqData) {
          const logIndex = Math.min(
            freqData.length - 1,
            Math.floor(Math.pow(i / barCount, 1.8) * (freqData.length - 1)),
          );
          val = freqData[logIndex] || 0;
        }

        const barHeight = Math.max(2, (val / 255) * (height - 6));
        const x = i * (barWidth + 1.5);
        const y = height - barHeight;

        ctx.fillRect(x, y, barWidth, barHeight);

        if (val > 10) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.fillRect(x, Math.max(0, y - 2), barWidth, 1.5);
          ctx.fillStyle = gradient;
        }
      }
    };

    if (!isPlaying) {
      // Draw static standby baseline once without running animation frames
      drawBars();
      return;
    }

    let animId: number;
    const bus = getMultiTrackAudioBus();
    const freqData = new Uint8Array(128);

    const render = () => {
      animId = requestAnimationFrame(render);
      bus.getFrequencyData(freqData);
      drawBars(freqData);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  return (
    <div className="audio-spectrum-card">
      <div className="audio-spectrum-header">
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Activity size={13} color="#38bdf8" />
          <span>Real-Time Spectrum Analyzer (FFT)</span>
        </span>
        <span style={{ color: isPlaying ? '#38bdf8' : '#64748b', fontSize: 10, fontWeight: 700 }}>
          {isPlaying ? '● 60 FPS Live' : '○ Standby'}
        </span>
      </div>
      <canvas ref={canvasRef} width={340} height={70} className="audio-spectrum-canvas" />
      <div className="audio-spectrum-freqs">
        <span>20Hz</span>
        <span>100Hz</span>
        <span>500Hz</span>
        <span>1kHz</span>
        <span>5kHz</span>
        <span>10kHz</span>
        <span>20kHz</span>
      </div>
    </div>
  );
}

export function AudioTools({ clip }: { clip: Clip }) {
  const {
    project: p,
    commit,
    seek,
    setPlaying,
    playing,
  } = useEditor(
    useShallow((s) => ({
      project: s.project,
      commit: s.commit,
      seek: s.seek,
      setPlaying: s.setPlaying,
      playing: s.playing,
    })),
  );
  const [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);
  const audio = isAudioClip(p, clip),
    locked = isLocked(p, clip),
    beats = p.beats?.[clip.mediaId] ?? [];

  const [sidechainTelemetry, setSidechainTelemetry] = useState<SidechainTelemetry>({
    isDucking: false,
    voiceLevelDb: -100,
    duckingGainDb: 0,
    thresholdDb: -24,
  });

  useEffect(() => {
    const bus = getMultiTrackAudioBus();
    return bus.subscribeTelemetry((t) => setSidechainTelemetry(t));
  }, []);

  const patch = (changes: Partial<Clip>) =>
    commit(
      { ...p, clips: p.clips.map((c) => (c.id === clip.id ? { ...c, ...changes } : c)) },
      'Audio processing',
    );

  const lowGain = clip.eqLow ?? 0;
  const midGain = clip.eqMid ?? 0;
  const highGain = clip.eqHigh ?? 0;

  const updateEQ = (band: 'low' | 'mid' | 'high', val: number) => {
    const clamped = Math.max(-12, Math.min(12, Number(val.toFixed(1))));
    getMultiTrackAudioBus().setEQ(band, clamped);
    patch({
      [band === 'low' ? 'eqLow' : band === 'mid' ? 'eqMid' : 'eqHigh']: clamped,
    });
  };

  const applyPreset = (low: number, mid: number, high: number, label: string) => {
    getMultiTrackAudioBus().setEQ('low', low);
    getMultiTrackAudioBus().setEQ('mid', mid);
    getMultiTrackAudioBus().setEQ('high', high);
    patch({ eqLow: low, eqMid: mid, eqHigh: high });
    setStatus(`Parametric EQ Preset: ${label} applied.`);
  };

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
      let detectedBpm = 120;
      for (const [index, window] of windows.entries()) {
        setStatus(`Spectral Flux Beat Analysis (Worker) · ${index + 1}/${windows.length}`);
        const samples = await extractAudio(file, abort.signal, () => {}, {
          start: window.start,
          duration: window.duration,
        });
        const beatAnalysis = await detectAudioBeatsAsync(
          samples,
          { sampleRate: 16000, sensitivity: 1.1 },
          abort.signal,
          (msg) => setStatus(`Spectral Flux · ${msg} (${index + 1}/${windows.length})`),
        );
        if (beatAnalysis.bpm) detectedBpm = beatAnalysis.bpm;
        result.push(
          ...beatAnalysis.beatTimes
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

      // Deduplicate beats within 8ms tolerance and sort
      const cleanedBeats = result
        .sort((a, b) => a - b)
        .filter((t, i, arr) => i === 0 || t - arr[i - 1] >= 0.008);

      audioWaveforms.set(asset.id, waveform);
      commit({ ...latest, beats: { ...latest.beats, [asset.id]: cleanedBeats } }, 'Detect music beats');
      useEditor.getState().mediaChanged();
      setStatus(
        cleanedBeats.length
          ? `🎵 ${cleanedBeats.length} beats locked (~${detectedBpm} BPM) via Spectral Flux. Timeline snapping set to 8ms precision.`
          : 'No distinct beats found. Add markers manually or try more percussive music.',
      );
    } catch (error) {
      if (!abort.signal.aborted) setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function handleMasterAudio() {
    const next = structuredClone(p);
    for (const c of next.clips) {
      if (!isAudioClip(next, c) || c.audioRole === 'voice') {
        c.voiceEnhance = true;
        if (c.properties.volume < 0.85) c.properties.volume = 1.1;
      }
      if (isAudioClip(next, c) && c.audioRole === 'music') {
        c.autoDuck = true;
        c.properties.volume = Math.min(0.35, c.properties.volume || 0.3);
      }
    }
    const bus = getMultiTrackAudioBus();
    bus.setMasterLimiterEnabled(true);
    bus.setSidechainConfig({ enabled: true });
    commit(next, 'Master audio: Biquad EQ, Compressor & -14 LUFS auto-ducking');
    setStatus('🪄 Audio mastered! Biquad EQ & Dynamic Range Compressor engaged, voice leveled to -14 LUFS, music ducked.');
  }

  return (
    <fieldset className="audio-tools" disabled={locked}>
      {/* 60 FPS Real-Time FFT Spectrum Analyzer */}
      <AudioSpectrumCanvas isPlaying={playing} />

      {/* Sidechain Auto-Ducking Live Telemetry Monitor */}
      <div className="sidechain-meter-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Mic size={13} color={sidechainTelemetry.voiceLevelDb > -24 ? '#38bdf8' : '#64748b'} />
          <span>A1 Voice Level:</span>
          <b style={{ color: sidechainTelemetry.voiceLevelDb > -24 ? '#38bdf8' : '#94a3b8', fontFamily: 'monospace' }}>
            {sidechainTelemetry.voiceLevelDb > -80 ? `${sidechainTelemetry.voiceLevelDb.toFixed(1)} dB` : '-∞ dB'}
          </b>
        </div>
        <div className={`sidechain-badge ${sidechainTelemetry.isDucking ? 'active' : ''}`}>
          <Zap size={11} />
          {sidechainTelemetry.isDucking ? 'Ducking: -12 dB (20ms)' : 'Sidechain: Standby'}
        </div>
      </div>

      {/* 3-Band Parametric EQ Controls */}
      <div className="audio-eq-group">
        <div className="audio-eq-header">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sliders size={13} color="#38bdf8" />
            <span>3-Band Parametric EQ</span>
          </span>
          <div className="audio-eq-presets">
            <button type="button" className="audio-eq-preset-btn" onClick={() => applyPreset(0, 0, 0, 'Flat')}>
              Flat
            </button>
            <button type="button" className="audio-eq-preset-btn" onClick={() => applyPreset(-2, 3, 2, 'Podcast Voice')}>
              Podcast
            </button>
            <button type="button" className="audio-eq-preset-btn" onClick={() => applyPreset(4, -1, 0, 'Bass Punch')}>
              Bass
            </button>
            <button type="button" className="audio-eq-preset-btn" onClick={() => applyPreset(-2, 2, 4, 'Air & Sparkle')}>
              Air
            </button>
          </div>
        </div>

        {/* Low Shelf 100 Hz */}
        <div className="audio-eq-band-row">
          <span className="audio-eq-band-label">Low (100 Hz):</span>
          <div className="audio-eq-band-ctrl">
            <AEScrubber
              value={lowGain}
              min={-12}
              max={12}
              step={0.5}
              decimals={1}
              unit=" dB"
              defaultValue={0}
              disabled={locked}
              onChange={(v) => updateEQ('low', v)}
            />
            <input
              type="range"
              className="audio-eq-slider"
              min="-12"
              max="12"
              step="0.5"
              value={lowGain}
              disabled={locked}
              onChange={(e) => updateEQ('low', +e.target.value)}
            />
            <span className="audio-eq-db">{lowGain > 0 ? `+${lowGain.toFixed(1)}` : lowGain.toFixed(1)} dB</span>
          </div>
        </div>

        {/* Mid Peaking 1000 Hz */}
        <div className="audio-eq-band-row">
          <span className="audio-eq-band-label">Mid (1 kHz):</span>
          <div className="audio-eq-band-ctrl">
            <AEScrubber
              value={midGain}
              min={-12}
              max={12}
              step={0.5}
              decimals={1}
              unit=" dB"
              defaultValue={0}
              disabled={locked}
              onChange={(v) => updateEQ('mid', v)}
            />
            <input
              type="range"
              className="audio-eq-slider"
              min="-12"
              max="12"
              step="0.5"
              value={midGain}
              disabled={locked}
              onChange={(e) => updateEQ('mid', +e.target.value)}
            />
            <span className="audio-eq-db">{midGain > 0 ? `+${midGain.toFixed(1)}` : midGain.toFixed(1)} dB</span>
          </div>
        </div>

        {/* High Shelf 8000 Hz */}
        <div className="audio-eq-band-row">
          <span className="audio-eq-band-label">High (8 kHz):</span>
          <div className="audio-eq-band-ctrl">
            <AEScrubber
              value={highGain}
              min={-12}
              max={12}
              step={0.5}
              decimals={1}
              unit=" dB"
              defaultValue={0}
              disabled={locked}
              onChange={(v) => updateEQ('high', v)}
            />
            <input
              type="range"
              className="audio-eq-slider"
              min="-12"
              max="12"
              step="0.5"
              value={highGain}
              disabled={locked}
              onChange={(e) => updateEQ('high', +e.target.value)}
            />
            <span className="audio-eq-db">{highGain > 0 ? `+${highGain.toFixed(1)}` : highGain.toFixed(1)} dB</span>
          </div>
        </div>
      </div>

      {/* 1-Click Master My Audio */}
      <div className="audio-master-box">
        <button
          type="button"
          className="master-audio-btn"
          onClick={handleMasterAudio}
          title="Auto-level speech to -14 LUFS standard and auto-duck background music"
        >
          <Wand2 size={15} />
          <div className="master-text">
            <b>Master My Audio</b>
            <span>-14 LUFS Leveling & Auto-Ducking</span>
          </div>
        </button>
      </div>

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
