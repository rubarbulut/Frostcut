import { useState } from 'react';
import { Zap, Activity, Clock } from 'lucide-react';
import { type Clip, type ClipProps } from './model';
import { Range } from './components';

export const SPEED_RAMP_PRESETS = [
  {
    id: 'steady',
    name: 'Steady',
    desc: '1.0× Linear',
    speed: 1.0,
    svgPath: 'M 5 25 L 95 25',
  },
  {
    id: 'hero',
    name: 'Hero Moment',
    desc: '0.5× Slow ➔ 1.5× Fast',
    speed: 0.75,
    svgPath: 'M 5 25 C 25 40, 50 45, 70 12 L 95 10',
  },
  {
    id: 'bullet',
    name: 'Bullet Time',
    desc: '2.0× ➔ 0.35× ➔ 1.0×',
    speed: 0.6,
    svgPath: 'M 5 10 C 25 10, 40 45, 65 45 C 80 45, 88 25, 95 25',
  },
  {
    id: 'flash',
    name: 'Flash Forward',
    desc: '1.0× ➔ 2.5× Rush',
    speed: 1.75,
    svgPath: 'M 5 35 C 35 35, 55 10, 95 8',
  },
] as const;

export function SpeedRampingControls({
  clip,
  onChange,
}: {
  clip: Clip;
  onChange: (props: Partial<ClipProps>) => void;
}) {
  const currentSpeed = clip.properties.speed;
  const [activeCurve, setActiveCurve] = useState<string>(
    currentSpeed === 1 ? 'steady' : 'custom',
  );

  const matchedPreset = SPEED_RAMP_PRESETS.find((p) => p.id === activeCurve);

  function applyPreset(presetId: (typeof SPEED_RAMP_PRESETS)[number]['id']) {
    const p = SPEED_RAMP_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    setActiveCurve(p.id);
    onChange({ speed: p.speed });
  }

  return (
    <div className="speed-ramping-controls">
      <div className="speed-ramp-header">
        <div className="section-subtitle">
          <Activity size={14} className="text-sky-400" />
          <b>Speed & Velocity Ramping</b>
        </div>
        <span className="speed-badge">{currentSpeed.toFixed(2)}×</span>
      </div>

      {/* Speed Slider */}
      <Range
        label="Playback speed"
        value={Math.round(currentSpeed * 100)}
        min={25}
        max={400}
        step={5}
        suffix="%"
        onChange={(val) => {
          setActiveCurve('custom');
          onChange({ speed: val / 100 });
        }}
      />

      {/* 4 Interactive Curve Presets */}
      <div className="speed-curves-grid" role="group" aria-label="Speed ramp presets">
        {SPEED_RAMP_PRESETS.map((p) => {
          const isSelected = activeCurve === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className={`speed-curve-card ${isSelected ? 'active' : ''}`}
              onClick={() => applyPreset(p.id)}
              title={`${p.name} · ${p.desc}`}
            >
              <div className="speed-curve-graph">
                <svg viewBox="0 0 100 50" preserveAspectRatio="none">
                  {/* Grid lines */}
                  <line x1="0" y1="25" x2="100" y2="25" stroke="rgba(255,255,255,0.08)" strokeDasharray="2,2" />
                  {/* Dynamic velocity curve */}
                  <path
                    d={p.svgPath}
                    fill="none"
                    stroke={isSelected ? '#38bdf8' : '#64748b'}
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div className="speed-curve-info">
                <b>{p.name}</b>
                <small>{p.desc}</small>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
