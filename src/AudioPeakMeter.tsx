import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useEditor } from './store';
import { clipEnd, isAudioClip } from './model';

export function AudioPeakMeter() {
  const playing = useEditor((s) => s.playing);
  const playhead = useEditor((s) => s.playhead);
  const project = useEditor((s) => s.project);

  const [meterL, setMeterL] = useState(0);
  const [meterR, setMeterR] = useState(0);
  const [peakL, setPeakL] = useState(0);
  const [peakR, setPeakR] = useState(0);
  const [muted, setMuted] = useState(false);

  const rafRef = useRef<number>(0);
  const levelRef = useRef({ l: 0, r: 0, pL: 0, pR: 0 });

  useEffect(() => {
    let lastTime = performance.now();

    const updateMeter = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      if (!playing || muted) {
        // Smoothly decay to zero when stopped or muted
        levelRef.current.l = Math.max(0, levelRef.current.l - dt * 2.5);
        levelRef.current.r = Math.max(0, levelRef.current.r - dt * 2.5);
        levelRef.current.pL = Math.max(0, levelRef.current.pL - dt * 0.8);
        levelRef.current.pR = Math.max(0, levelRef.current.pR - dt * 0.8);
      } else {
        // Calculate active audio volume from timeline clips at playhead
        const activeClips = project.clips.filter(
          (c) => playhead >= c.start && playhead <= clipEnd(c),
        );

        let maxVolume = 0;
        let isMusicPlaying = false;
        let isVoicePlaying = false;

        for (const c of activeClips) {
          const track = project.tracks.find((t) => t.id === c.trackId);
          if (track && (track.muted || track.hidden)) continue;

          const vol = c.properties.volume ?? 1;
          if (c.audioRole === 'music') isMusicPlaying = true;
          if (c.audioRole === 'voice' || !isAudioClip(project, c)) isVoicePlaying = true;

          // Fade in / out factor
          const clipTime = playhead - c.start;
          const remainingTime = clipEnd(c) - playhead;
          let fadeFactor = 1;
          if (c.properties.fadeIn && clipTime < c.properties.fadeIn) {
            fadeFactor *= clipTime / c.properties.fadeIn;
          }
          if (c.properties.fadeOut && remainingTime < c.properties.fadeOut) {
            fadeFactor *= remainingTime / c.properties.fadeOut;
          }

          maxVolume = Math.max(maxVolume, vol * fadeFactor);
        }

        // Auto-ducking simulation
        if (isMusicPlaying && isVoicePlaying) {
          maxVolume = Math.min(1.2, maxVolume * 0.75);
        }

        // Realistic natural audio dynamics jitter
        const jitterL = Math.sin(now * 0.015) * 0.12 + Math.cos(now * 0.028) * 0.08;
        const jitterR = Math.cos(now * 0.018) * 0.12 + Math.sin(now * 0.025) * 0.08;

        const targetL = Math.max(0, Math.min(1, maxVolume * (0.7 + jitterL)));
        const targetR = Math.max(0, Math.min(1, maxVolume * (0.68 + jitterR)));

        // Fast attack, smooth decay
        levelRef.current.l += (targetL - levelRef.current.l) * (targetL > levelRef.current.l ? 0.6 : 0.25);
        levelRef.current.r += (targetR - levelRef.current.r) * (targetR > levelRef.current.r ? 0.6 : 0.25);

        // Peak hold
        levelRef.current.pL = Math.max(levelRef.current.l, levelRef.current.pL - dt * 0.4);
        levelRef.current.pR = Math.max(levelRef.current.r, levelRef.current.pR - dt * 0.4);
      }

      setMeterL(levelRef.current.l);
      setMeterR(levelRef.current.r);
      setPeakL(levelRef.current.pL);
      setPeakR(levelRef.current.pR);

      rafRef.current = requestAnimationFrame(updateMeter);
    };

    rafRef.current = requestAnimationFrame(updateMeter);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, playhead, project, muted]);

  const dbL = meterL > 0.01 ? (20 * Math.log10(meterL)).toFixed(1) : '-∞';
  const isClipping = meterL > 0.98 || meterR > 0.98;

  return (
    <div
      className={`audio-peak-meter ${isClipping ? 'clipping' : ''} ${muted ? 'is-muted' : ''}`}
      role="meter"
      aria-label="Master audio peak meter"
      title={`Master Audio: ${muted ? 'Muted' : `${dbL} dBFS`} · Click to ${muted ? 'unmute' : 'mute'}`}
      onClick={() => setMuted(!muted)}
    >
      <button
        type="button"
        className="meter-icon-btn"
        aria-label={muted ? 'Unmute master preview' : 'Mute master preview'}
      >
        {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
      </button>

      <div className="meter-channels">
        {/* Left Channel */}
        <div className="meter-track">
          <div
            className="meter-fill"
            style={{ width: `${Math.round(meterL * 100)}%` }}
          />
          <div
            className="meter-peak-dot"
            style={{ left: `${Math.round(peakL * 100)}%` }}
          />
        </div>

        {/* Right Channel */}
        <div className="meter-track">
          <div
            className="meter-fill"
            style={{ width: `${Math.round(meterR * 100)}%` }}
          />
          <div
            className="meter-peak-dot"
            style={{ left: `${Math.round(peakR * 100)}%` }}
          />
        </div>
      </div>

      <span className="meter-db-label">
        {muted ? 'MUTED' : meterL > 0.05 ? `${dbL} dB` : '-∞'}
      </span>
    </div>
  );
}
