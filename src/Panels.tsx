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
  Youtube,
} from 'lucide-react';
import { useEditor, mediaUrls } from './store';
import {
  type Project,
  type ClipProps,
  timelineWords,
  timecode,
  deleteRange,
  isLocked,
  isAudioClip,
  detachAudio,
} from './model';
import { Field, Range } from './components';
import { CaptionAppearance } from './CaptionAppearance';
import { TransformControls } from './TransformControls';
import { AudioTools } from './AudioTools';
import { CaptionLanguage } from './SubtitleTools';
export function MediaPanel({
  onImport,
  onRelink,
  onOpenImporter,
}: {
  onImport: () => void;
  onRelink: (id: string) => void;
  onOpenImporter?: () => void;
}) {
  const { project: p, mediaRevision } = useEditor();
  void mediaRevision;
  return (
    <div className="media-panel">
      <div className="panel-title">
        <span>Project media</span>
        <div className="panel-title-actions">
          <span className="count">{p.media.length}</span>
          {onOpenImporter && (
            <button
              className="mini-yt-btn"
              onClick={onOpenImporter}
              title="Import YouTube or Audio"
              aria-label="Import from YouTube"
            >
              <Youtube size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="media-import-actions">
        <button className="import-zone" onClick={onImport}>
          <Upload size={20} />
          <b>Import footage</b>
          <span>or drop a video anywhere</span>
        </button>
        {onOpenImporter && (
          <button className="import-zone remote-import-zone" onClick={onOpenImporter}>
            <Youtube size={20} />
            <b>YouTube / Audio</b>
            <span>URL, MP3, WAV, MP4</span>
          </button>
        )}
      </div>
      <div className="asset-list">
        {p.media.map((m) => (
          <div key={m.id} className="asset-card">
            <div className="asset-thumbnail">
              {m.type.startsWith('audio/') ? (
                <Volume2 size={28} />
              ) : mediaUrls.has(m.id) ? (
                <video src={mediaUrls.get(m.id)} preload="metadata" muted />
              ) : (
                <FileVideo size={28} />
              )}
              <span>{timecode(m.duration)}</span>
            </div>
            <b title={m.name}>{m.name}</b>
            <small>
              {m.type.startsWith('audio/') ? 'Audio' : `${m.width} × ${m.height}`} ·{' '}
              {(m.size / 1024 / 1024).toFixed(1)} MB
            </small>
            {!mediaUrls.has(m.id) && (
              <button className="relink" onClick={() => onRelink(m.id)}>
                <Link2 size={14} />
                Missing media · Relink
              </button>
            )}
            {m.demo && <small className="demo-label">Demo · illustrative captions</small>}
            {m.attribution && (
              <small>
                <a href={m.attribution.url} target="_blank" rel="noreferrer">
                  Source: {m.attribution.creator}
                </a>{' '}
                ·{' '}
                <a href={m.attribution.licenseUrl} target="_blank" rel="noreferrer">
                  {m.attribution.license}
                </a>
              </small>
            )}
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
          <CaptionLanguage />
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
              <option value="custom">Custom</option>
            </select>
          </Field>
          {p.captions.position === 'custom' && (
            <div className="number-grid">
              {(['x', 'y'] as const).map((key) => (
                <Field key={key} label={`Caption ${key.toUpperCase()} (%)`}>
                  <input
                    type="number"
                    min="5"
                    max="95"
                    value={p.captions.customPosition?.[key] ?? (key === 'x' ? 50 : 75)}
                    onChange={(e) => {
                      if (e.target.value !== '')
                        captions({
                          customPosition: {
                            x: 50,
                            y: 75,
                            ...p.captions.customPosition,
                            [key]: Math.max(5, Math.min(95, +e.target.value)),
                          },
                        });
                    }}
                  />
                </Field>
              ))}
            </div>
          )}
          <Field label="Emoji frequency">
            <select
              value={p.captions.emoji}
              onChange={(e) => captions({ emoji: e.target.value as Project['captions']['emoji'] })}
            >
              {['None', 'Low', 'Medium', 'High'].map((value) => (
                <option key={value}>{value}</option>
              ))}
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
                <b>{isAudioClip(p, clip) ? 'Source audio' : 'Transform'}</b>
                {locked && <span>Track locked</span>}
              </div>
              <fieldset disabled={locked}>
                {!isAudioClip(p, clip) && <TransformControls clip={clip} />}
                {isAudioClip(p, clip) && (
                  <Field label="Audio track">
                    <select
                      value={clip.trackId}
                      onChange={(e) =>
                        commit(
                          {
                            ...p,
                            clips: p.clips.map((c) =>
                              c.id === clip.id ? { ...c, trackId: e.target.value } : c,
                            ),
                          },
                          'Move audio track',
                        )
                      }
                    >
                      {p.tracks
                        .filter((t) => t.kind === 'audio')
                        .map((t) => (
                          <option key={t.id} value={t.id} disabled={t.locked}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
                <AudioTools key={clip.id} clip={clip} />
                <div className="property-divider" />
                <div className="section-heading">
                  <Volume2 size={16} />
                  <b>Audio</b>
                </div>
                {!isAudioClip(p, clip) && (
                  <button
                    className="text-button"
                    disabled={clip.audioDetached}
                    onClick={() => commit(detachAudio(p, clip.id), 'Detach source audio')}
                  >
                    {clip.audioDetached
                      ? 'Audio detached · edit it on the audio track'
                      : 'Detach audio for independent editing'}
                  </button>
                )}
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
