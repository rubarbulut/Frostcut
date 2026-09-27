import { useState } from 'react';
import { useEditor } from './store';
import { type Clip, isLocked } from './model';
import { captureAnimation, applyAnimation } from './animation-presets';

export function SavedAnimations({ clip }: { clip: Clip }) {
  const { project: p, commit } = useEditor();
  const [name, setName] = useState(''),
    [status, setStatus] = useState('');
  const presets = p.animationPresets ?? [];
  return (
    <details className="saved-animations">
      <summary>Save & reuse animation</summary>
      <input
        aria-label="Animation preset name"
        placeholder="My smooth zoom"
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        className="secondary small"
        disabled={!name.trim() || isLocked(p, clip) || presets.length >= 20}
        onClick={() => {
          try {
            const next = captureAnimation(p, clip, name);
            commit({ ...p, animationPresets: [...presets, next] }, 'Save animation preset');
            setName('');
            setStatus('Animation saved. It adapts to the target clip duration and canvas.');
          } catch (e) {
            setStatus((e as Error).message);
          }
        }}
      >
        Save animation
      </button>
      {presets.map((preset) => (
        <div className="button-row" key={preset.id}>
          <button
            className="text-button"
            disabled={isLocked(p, clip)}
            onClick={() =>
              commit(
                {
                  ...p,
                  clips: p.clips.map((c) => (c.id === clip.id ? applyAnimation(p, c, preset) : c)),
                },
                'Apply saved animation',
              )
            }
          >
            {preset.name}
          </button>
          <button
            className="icon"
            aria-label={`Delete animation ${preset.name}`}
            onClick={() =>
              commit(
                { ...p, animationPresets: presets.filter((item) => item.id !== preset.id) },
                'Delete animation preset',
              )
            }
          >
            ×
          </button>
        </div>
      ))}
      <small className="subtle">
        Up to 20 presets. Keyframes are editable and included in MP4.
      </small>
      {status && (
        <p role="status" className="subtle">
          {status}
        </p>
      )}
    </details>
  );
}
