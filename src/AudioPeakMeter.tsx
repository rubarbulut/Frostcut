import { useEffect, useState, useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { emptyMeter, meterPercent, peakDb, updateMeter } from './audio-meter';
import {
  previewAudioActiveSnapshot, previewMuteSnapshot, readPreviewPeaks, setPreviewMuted, subscribePreviewAudio,
} from './preview-audio-output';

export function AudioPeakMeter() {
  const playing = useSyncExternalStore(subscribePreviewAudio, previewAudioActiveSnapshot, previewAudioActiveSnapshot);
  const muted = useSyncExternalStore(subscribePreviewAudio, previewMuteSnapshot, previewMuteSnapshot);
  const [reading, setReading] = useState({ levels: emptyMeter(), available: false });

  useEffect(() => {
    setReading({ levels: emptyMeter(), available: false });
    if (!playing || muted) return;
    let frame = 0, last = performance.now() - 1000 / 30, levels = emptyMeter();
    const tick = (now: number) => {
      if (now - last >= 1000 / 30) {
        const samples = readPreviewPeaks();
        levels = samples ? updateMeter(levels, samples, (now - last) / 1000) : emptyMeter();
        last = now;
        setReading({ levels, available: samples !== null });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, muted]);

  const levels = !playing || muted ? emptyMeter() : reading.levels;
  const db = peakDb(Math.max(levels.left, levels.right));
  const unavailable = playing && !muted && !reading.available;
  const dbText = Number.isFinite(db) ? `${db.toFixed(1)} dBFS` : '-∞ dBFS';
  return (
    <div
      className={`audio-peak-meter ${levels.clipHold > 0 ? 'clipping' : ''} ${muted ? 'is-muted' : ''}`}
      role="group"
      aria-label="Preview audio output"
      title={muted ? 'Preview audio muted' : unavailable ? 'Meter unavailable. Preview audio can still play.' : `Stereo sample peak: ${dbText}`}
    >
      <button
        type="button"
        className="meter-icon-btn"
        aria-label={muted ? 'Unmute master preview' : 'Mute master preview'}
        aria-pressed={muted}
        onClick={() => setPreviewMuted(!muted)}
      >
        {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
      </button>
      <div className="meter-channels">
        {[
          { label: 'Left', level: levels.left, peak: levels.peakLeft },
          { label: 'Right', level: levels.right, peak: levels.peakRight },
        ].map((channel) => {
          const channelDb = peakDb(channel.level);
          return (
            <div
              key={channel.label}
              className="meter-track"
              role="meter"
              aria-label={`${channel.label} preview sample peak`}
              aria-valuemin={-60}
              aria-valuemax={0}
              aria-valuenow={Math.max(-60, Math.min(0, channelDb))}
              aria-valuetext={unavailable ? 'Meter unavailable' : Number.isFinite(channelDb) ? `${channelDb.toFixed(1)} dBFS` : 'Silence'}
            >
              <div className="meter-fill" style={{ width: `${meterPercent(channel.level)}%` }} />
              <div className="meter-peak-dot" style={{ left: `${meterPercent(channel.peak)}%` }} />
            </div>
          );
        })}
      </div>
      <span className="meter-db-label">
        {muted ? 'MUTED' : unavailable ? '—' : Number.isFinite(db) ? `${db.toFixed(1)} dB` : '-∞'}
      </span>
    </div>
  );
}
