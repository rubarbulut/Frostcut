import { useState, useRef } from 'react';
import {
  Upload,
  FileVideo,
  Link2,
  Captions,
  Search,
  ArrowRightLeft,
  WandSparkles,
  MessageSquareText,
  Diamond,
  Volume2,
} from 'lucide-react';
import { useEditor, mediaUrls } from './store';
import {
  type Project,
  type ClipProps,
  timelineWords,
  timecode,
  deleteRange,
  isLocked,
} from './model';
import { Field, Range } from './components';
import { CaptionAppearance } from './CaptionAppearance';
export function MediaPanel({
  onImport,
  onRelink,
}: {
  onImport: () => void;
  onRelink: (id: string) => void;
}) {
  const { project: p, mediaRevision } = useEditor();
  void mediaRevision;
  return (
    <div className="media-panel">
      <div className="panel-title">
        <span>Project media</span>
        <span className="count">{p.media.length}</span>
      </div>
      <button className="import-zone" onClick={onImport}>
        <Upload size={22} />
        <b>Import footage</b>
        <span>or drop a video anywhere</span>
      </button>
      <div className="asset-list">
        {p.media.map((m) => (
          <div key={m.id} className="asset-card">
            <div className="asset-thumbnail">
              {mediaUrls.has(m.id) ? (
                <video src={mediaUrls.get(m.id)} preload="metadata" muted />
              ) : (
                <FileVideo size={28} />
              )}
              <span>{timecode(m.duration)}</span>
            </div>
            <b title={m.name}>{m.name}</b>
            <small>
              {m.width} × {m.height} · {(m.size / 1024 / 1024).toFixed(1)} MB
            </small>
            {!mediaUrls.has(m.id) && (
              <button className="relink" onClick={() => onRelink(m.id)}>
                <Link2 size={14} />
                Missing media · Relink
              </button>
            )}
            {m.demo && <small className="demo-label">Demo · illustrative captions</small>}
          </div>
        ))}
      </div>
      <div className="panel-note">
        Your source files stay untouched.
        <br />
        Every edit is reversible.
      </div>
    </div>
  );
}
export { TranscriptPanel } from './TranscriptPanel';
export function PropertiesPanel() {
  const { project: p, commit, selected } = useEditor(),
    [tab, setTab] = useState('Captions'),
    clip = p.clips.find((c) => selected.includes(c.id)),
    locked = clip ? isLocked(p, clip) : false;
  function captions(patch: Partial<Project['captions']>) {
    commit({ ...p, captions: { ...p.captions, ...patch } }, 'Caption style');
  }
  function props(patch: Partial<ClipProps>) {
    if (!clip || locked) return;
    const next = structuredClone(p);
    Object.assign(next.clips.find((c) => c.id === clip.id)!.properties, patch);
    commit(next, 'Clip properties');
  }
  return (
    <aside className="properties-panel">
      <div className="panel-tabs">
        {['Captions', 'Properties'].map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Captions' ? (
        <div className="properties-content">
          <div className="section-heading">
            <Captions size={16} />
            <b>Make your words stand out</b>
            <input
              aria-label="Enable captions"
              type="checkbox"
              checked={p.captions.enabled}
              onChange={(e) => captions({ enabled: e.target.checked })}
            />
          </div>
          <div className="caption-presets">
            {(['Clean', 'Bold', 'Brainrot'] as const).map((preset) => (
              <button
                className={`preset-card ${p.captions.preset === preset ? 'selected' : ''}`}
                key={preset}
                onClick={() => captions({ preset, appearance: undefined })}
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
              onChange={(intensity) => captions({ intensity })}
            />
          )}
          <Range
            label="Words per caption"
            value={p.captions.wordsPerCaption}
            min={1}
            max={8}
            onChange={(wordsPerCaption) => captions({ wordsPerCaption })}
          />
          <Field label="Position">
            <select
              value={p.captions.position}
              onChange={(e) =>
                captions({ position: e.target.value as Project['captions']['position'] })
              }
            >
              <option value="bottom">Bottom</option>
              <option value="center">Center</option>
              <option value="top">Top</option>
            </select>
          </Field>
          <label className="check-row">
            <input
              type="checkbox"
              checked={p.captions.safeArea}
              onChange={(e) => captions({ safeArea: e.target.checked })}
            />
            Show caption safe area
          </label>
          <CaptionAppearance />
          <div className="property-divider" />
          <div className="section-heading">
            <b>Speakers</b>
            <span className="subtle">Assign in transcript</span>
          </div>
          {p.speakers.map((s) => (
            <div className="speaker-row" key={s.id}>
              <input
                type="color"
                aria-label={`${s.name} color`}
                value={s.color}
                onChange={(e) => {
                  const next = structuredClone(p);
                  next.speakers.find((x) => x.id === s.id)!.color = e.target.value;
                  commit(next, 'Speaker color');
                }}
              />
              <input
                aria-label={`Rename ${s.name}`}
                value={s.name}
                onChange={(e) => {
                  const next = structuredClone(p);
                  next.speakers.find((x) => x.id === s.id)!.name = e.target.value;
                  commit(next, 'Rename speaker');
                }}
              />
            </div>
          ))}
          <div className="panel-note">
            <WandSparkles size={15} />
            Only important words get an accent. The story stays readable.
          </div>
        </div>
      ) : (
        <div className="properties-content">
          {clip ? (
            <>
              <div className="section-heading">
                <b>Transform</b>
                {locked && <span>Track locked</span>}
              </div>
              <fieldset disabled={locked}>
                <div className="number-grid">
                  {(['x', 'y', 'scale', 'rotation', 'opacity', 'crop', 'speed'] as const).map(
                    (key) => (
                      <Field
                        key={key}
                        label={
                          {
                            x: 'Position X',
                            y: 'Position Y',
                            scale: 'Scale',
                            rotation: 'Rotation °',
                            opacity: 'Opacity',
                            crop: 'Crop %',
                            speed: 'Speed ×',
                          }[key]
                        }
                      >
                        <input
                          type="number"
                          step={['scale', 'opacity', 'speed'].includes(key) ? 0.05 : 1}
                          min={
                            key === 'speed'
                              ? 0.25
                              : key === 'scale'
                                ? 0.1
                                : ['crop', 'opacity'].includes(key)
                                  ? 0
                                  : undefined
                          }
                          max={
                            key === 'speed'
                              ? 4
                              : key === 'scale'
                                ? 5
                                : key === 'opacity'
                                  ? 1
                                  : key === 'crop'
                                    ? 45
                                    : undefined
                          }
                          value={clip.properties[key]}
                          onChange={(e) => {
                            const n = +e.target.value;
                            if (!Number.isFinite(n)) return;
                            props({
                              [key]:
                                key === 'speed'
                                  ? Math.min(4, Math.max(0.25, n))
                                  : key === 'scale'
                                    ? Math.min(5, Math.max(0.1, n))
                                    : key === 'opacity'
                                      ? Math.min(1, Math.max(0, n))
                                      : key === 'crop'
                                        ? Math.min(45, Math.max(0, n))
                                        : n,
                            });
                          }}
                        />
                      </Field>
                    ),
                  )}
                </div>
                <div className="property-divider" />
                <div className="section-heading">
                  <Volume2 size={16} />
                  <b>Audio</b>
                </div>
                <Range
                  label="Volume"
                  value={Math.round(clip.properties.volume * 100)}
                  max={200}
                  suffix="%"
                  onChange={(v) => props({ volume: v / 100 })}
                />
                <div className="number-grid">
                  {(['fadeIn', 'fadeOut'] as const).map((k) => (
                    <Field label={k === 'fadeIn' ? 'Fade in (s)' : 'Fade out (s)'} key={k}>
                      <input
                        type="number"
                        min="0"
                        max="5"
                        step="0.05"
                        value={clip.properties[k]}
                        onChange={(e) => props({ [k]: Math.max(0, Math.min(5, +e.target.value)) })}
                      />
                    </Field>
                  ))}
                </div>
                <div className="property-divider" />
                <div className="section-heading">
                  <Diamond size={16} />
                  <b>Animation preview</b>
                </div>
                <Field label="Motion preset">
                  <select
                    value={clip.properties.animation}
                    onChange={(e) => props({ animation: e.target.value })}
                  >
                    {[
                      'None',
                      'Punch In',
                      'Punch Out',
                      'Smooth Zoom',
                      'Bounce',
                      'Slide Left',
                      'Slide Right',
                      'Shake',
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <small className="subtle">
                  Motion presets are preview-only in this first P0 build. Export uses your static
                  transform.
                </small>
                <div className="property-divider" />
                <div className="section-heading">
                  <b>Trim</b>
                </div>
                <div className="number-grid">
                  {(['sourceStart', 'sourceEnd', 'start'] as const).map((key) => (
                    <Field
                      key={key}
                      label={
                        key === 'sourceStart'
                          ? 'Source in (s)'
                          : key === 'sourceEnd'
                            ? 'Source out (s)'
                            : 'Timeline start'
                      }
                    >
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={Number(clip[key].toFixed(2))}
                        onChange={(e) => {
                          const n = +e.target.value,
                            m = p.media.find((m) => m.id === clip.mediaId)!;
                          if (
                            !Number.isFinite(n) ||
                            n < 0 ||
                            (key === 'sourceStart' && n >= clip.sourceEnd) ||
                            (key === 'sourceEnd' && (n <= clip.sourceStart || n > m.duration))
                          )
                            return;
                          const next = structuredClone(p);
                          next.clips.find((c) => c.id === clip.id)![key] = n;
                          commit(next, 'Trim or move clip');
                        }}
                      />
                    </Field>
                  ))}
                </div>
              </fieldset>
            </>
          ) : (
            <div className="empty-panel">
              <Diamond size={28} />
              <h3>The details make it yours.</h3>
              <p>Select a clip to adjust its transform, sound, and timing.</p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
