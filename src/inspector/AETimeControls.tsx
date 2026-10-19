import { useState } from 'react';
import { Clock, Zap, Activity } from 'lucide-react';
import { type Clip, isLocked, timecode, clipDuration } from '../model';
import { useEditor } from '../store';
import { AEGroup } from './AEGroup';
import { AEPropertyRow } from './AEPropertyRow';
import { AEScrubber } from './AEScrubber';
import { SPEED_RAMP_PRESETS } from '../SpeedRampingControls';

export function AETimeControls({ clip }: { clip: Clip }) {
  const { project: p, commit } = useEditor();
  const locked = isLocked(p, clip);
  const mediaAsset = p.media.find((m) => m.id === clip.mediaId);
  const totalMediaDur = mediaAsset?.duration || 1000;

  const currentSpeed = clip.properties.speed;
  const [activeCurve, setActiveCurve] = useState<string>(
    currentSpeed === 1 ? 'steady' : 'custom',
  );

  function saveClip(patch: Partial<Clip>, label: string) {
    if (locked) return;
    const next = structuredClone(p);
    const target = next.clips.find((c) => c.id === clip.id);
    if (!target) return;
    Object.assign(target, patch);
    commit(next, label);
  }

  function saveProps(patch: Partial<Clip['properties']>, label: string) {
    if (locked) return;
    const next = structuredClone(p);
    const target = next.clips.find((c) => c.id === clip.id);
    if (!target) return;
    Object.assign(target.properties, patch);
    commit(next, label);
  }

  function applyCurvePreset(presetId: (typeof SPEED_RAMP_PRESETS)[number]['id']) {
    const preset = SPEED_RAMP_PRESETS.find((x) => x.id === presetId);
    if (!preset) return;
    setActiveCurve(preset.id);
    saveProps({ speed: preset.speed }, `Speed ramp: ${preset.name}`);
  }

  const handleResetSpeed = () => {
    saveProps({ speed: 1.0 }, 'Reset speed');
    setActiveCurve('steady');
  };

  const dur = clipDuration(clip);

  return (
    <AEGroup
      title="Time Remapping & Speed"
      icon={<Clock size={13} />}
      defaultOpen={false}
      onReset={handleResetSpeed}
      badge={`${currentSpeed.toFixed(2)}×`}
    >
      <div className="ae-time-body">
        {/* Speed Scrubber */}
        <AEPropertyRow label="Speed Ratio">
          <div className="ae-scrubber-with-slider">
            <AEScrubber
              value={currentSpeed}
              min={0.25}
              max={4.0}
              step={0.05}
              unit="×"
              decimals={2}
              defaultValue={1.0}
              disabled={locked}
              onChange={(s) => {
                setActiveCurve('custom');
                saveProps({ speed: s }, 'Change clip speed');
              }}
            />
            <input
              type="range"
              className="ae-mini-slider"
              min="0.25"
              max="4.0"
              step="0.05"
              value={currentSpeed}
              disabled={locked}
              onChange={(e) => {
                setActiveCurve('custom');
                saveProps({ speed: +e.target.value }, 'Change clip speed');
              }}
            />
          </div>
        </AEPropertyRow>

        {/* Speed multiplier pills */}
        <div className="ae-quick-preset-bar">
          {[0.25, 0.5, 1.0, 1.5, 2.0, 4.0].map((s) => (
            <button
              key={s}
              type="button"
              className={`ae-quick-pill ${Math.abs(currentSpeed - s) < 0.01 ? 'active' : ''}`}
              disabled={locked}
              onClick={() => {
                setActiveCurve(s === 1 ? 'steady' : 'custom');
                saveProps({ speed: s }, `Speed ${s}x`);
              }}
            >
              {s}×
            </button>
          ))}
        </div>

        {/* Speed Ramping Curves (AE Velocity Graph) */}
        <div className="ae-subhead-row">
          <Activity size={12} />
          <span className="ae-subhead">Velocity Ramping Curves</span>
        </div>

        <div className="ae-ramp-grid">
          {SPEED_RAMP_PRESETS.map((curve) => (
            <button
              key={curve.id}
              type="button"
              className={`ae-ramp-card ${activeCurve === curve.id ? 'selected' : ''}`}
              disabled={locked}
              onClick={() => applyCurvePreset(curve.id)}
            >
              <svg className="ae-ramp-svg" viewBox="0 0 100 40">
                <line x1="5" y1="20" x2="95" y2="20" stroke="#333f48" strokeDasharray="2,2" strokeWidth="1" />
                <path
                  d={curve.svgPath}
                  fill="none"
                  stroke={activeCurve === curve.id ? '#38bdf8' : '#8da4b4'}
                  strokeWidth="2.5"
                />
              </svg>
              <div className="ae-ramp-info">
                <b>{curve.name}</b>
                <small>{curve.desc}</small>
              </div>
            </button>
          ))}
        </div>

        <div className="ae-divider" />

        {/* Source In / Out & Timeline Start */}
        <div className="ae-subhead-row">
          <span className="ae-subhead">Clip Boundaries & Trim</span>
          <span className="ae-subhead-meta">Duration: {timecode(dur)}</span>
        </div>

        <div className="ae-boundaries-grid">
          <AEPropertyRow label="Source In">
            <AEScrubber
              value={clip.sourceStart}
              min={0}
              max={clip.sourceEnd - 0.1}
              step={0.1}
              unit="s"
              decimals={2}
              disabled={locked}
              onChange={(n) => {
                if (n >= 0 && n < clip.sourceEnd) {
                  saveClip({ sourceStart: n }, 'Trim Source In');
                }
              }}
            />
          </AEPropertyRow>

          <AEPropertyRow label="Source Out">
            <AEScrubber
              value={clip.sourceEnd}
              min={clip.sourceStart + 0.1}
              max={totalMediaDur}
              step={0.1}
              unit="s"
              decimals={2}
              disabled={locked}
              onChange={(n) => {
                if (n > clip.sourceStart && n <= totalMediaDur) {
                  saveClip({ sourceEnd: n }, 'Trim Source Out');
                }
              }}
            />
          </AEPropertyRow>

          <AEPropertyRow label="Timeline Start">
            <AEScrubber
              value={clip.start}
              min={0}
              max={10000}
              step={0.1}
              unit="s"
              decimals={2}
              disabled={locked}
              onChange={(n) => {
                if (n >= 0) {
                  saveClip({ start: n }, 'Move Timeline Start');
                }
              }}
            />
          </AEPropertyRow>
        </div>
      </div>
    </AEGroup>
  );
}
