import { useEditor } from './store';
import { type Project } from './model';
import { CaptionAppearance } from './CaptionAppearance';
import { CaptionLanguage } from './SubtitleTools';
import { Field, Range } from './components';
import { Captions, Sparkles, ShieldAlert } from 'lucide-react';

export function SocialCaptionsPanel() {
  const p = useEditor((s) => s.project);
  const commit = useEditor((s) => s.commit);

  function updateCaptions(patch: Partial<Project['captions']>) {
    const cur = useEditor.getState().project;
    commit({ ...cur, captions: { ...cur.captions, ...patch } }, 'Caption style');
  }

  return (
    <div className="social-captions-panel properties-content">
      <div className="section-heading">
        <Captions size={16} />
        <b>Viral Captions & Subtitles</b>
        <input
          aria-label="Enable captions"
          type="checkbox"
          checked={p.captions.enabled}
          onChange={(e) => updateCaptions({ enabled: e.target.checked })}
        />
      </div>
      <p className="panel-subtext">
        Auto-highlight words, add viral animated fonts, and position subtitles safely for mobile feeds.
      </p>

      <CaptionLanguage />

      <div className="property-divider" />

      {/* Caption Style Palettes & Presets */}
      <CaptionAppearance />

      <div className="section-heading" style={{ marginTop: '1rem' }}>
        <Sparkles size={16} />
        <b>Caption Style Presets</b>
      </div>
      <div className="caption-presets">
        {(['Clean', 'Bold', 'Brainrot'] as const).map((preset) => (
          <button
            type="button"
            className={`preset-card ${p.captions.preset === preset ? 'selected' : ''}`}
            key={preset}
            onClick={() => updateCaptions({ preset, appearance: undefined })}
          >
            <span className={`preset-example ${preset.toLowerCase()}`}>
              Your <em>story.</em>
            </span>
            <span>
              {preset}
              {p.captions.preset === preset && ' ✓'}
            </span>
          </button>
        ))}
      </div>

      {p.captions.preset === 'Brainrot' && (
        <Range
          label="Brainrot intensity"
          value={p.captions.intensity}
          onChange={(intensity) => updateCaptions({ intensity })}
        />
      )}

      <div className="property-divider" />

      <div className="section-heading">
        <b>Pacing & Display</b>
      </div>
      <Range
        label="Words per caption"
        value={p.captions.wordsPerCaption}
        min={1}
        max={8}
        onChange={(wordsPerCaption) => updateCaptions({ wordsPerCaption })}
      />

      <Field label="Screen Position">
        <select
          value={p.captions.position}
          onChange={(e) =>
            updateCaptions({ position: e.target.value as Project['captions']['position'] })
          }
        >
          <option value="bottom">Bottom (Feed Standard)</option>
          <option value="center">Center (High Impact)</option>
          <option value="top">Top</option>
          <option value="custom">Custom Position</option>
        </select>
      </Field>

      {p.captions.position === 'custom' && (
        <div className="number-grid">
          {(['x', 'y'] as const).map((key) => (
            <Field key={key} label={`Position ${key.toUpperCase()} (%)`}>
              <input
                type="number"
                min="5"
                max="95"
                value={p.captions.customPosition?.[key] ?? (key === 'x' ? 50 : 75)}
                onChange={(e) => {
                  const val = Math.max(5, Math.min(95, +e.target.value));
                  updateCaptions({
                    customPosition: {
                      x: key === 'x' ? val : (p.captions.customPosition?.x ?? 50),
                      y: key === 'y' ? val : (p.captions.customPosition?.y ?? 75),
                    },
                  });
                }}
              />
            </Field>
          ))}
        </div>
      )}

      <div className="property-divider" />

      <div className="section-heading">
        <ShieldAlert size={16} />
        <b>Feed Margins</b>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={!!p.captions.safeArea}
          onChange={(e) => updateCaptions({ safeArea: e.target.checked })}
        />
        <span>Avoid TikTok / Reels bottom UI obstruction</span>
      </label>
    </div>
  );
}
