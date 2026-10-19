import { useState } from 'react';
import { Captions, Type, Palette, AlignVerticalJustifyCenter, Users, Wand2 } from 'lucide-react';
import { type Project } from '../model';
import { useEditor } from '../store';
import { AEGroup } from './AEGroup';
import { AEPropertyRow } from './AEPropertyRow';
import { AEScrubber } from './AEScrubber';
import { CaptionAppearance } from '../CaptionAppearance';
import { CaptionLanguage } from '../SubtitleTools';

export function AECaptionsInspector() {
  const { project: p, commit } = useEditor();

  function captions(patch: Partial<Project['captions']>) {
    const cur = useEditor.getState().project;
    commit({ ...cur, captions: { ...cur.captions, ...patch } }, 'Caption style');
  }

  return (
    <div className="ae-captions-inspector">
      {/* Master Subtitle Header Bar */}
      <div className="ae-captions-master-bar">
        <div className="ae-captions-master-info">
          <Captions size={15} />
          <div>
            <b>Master Subtitles & Graphics</b>
            <small>Word-by-word viral animations</small>
          </div>
        </div>

        <label className="ae-toggle-switch">
          <input
            type="checkbox"
            checked={p.captions.enabled}
            onChange={(e) => captions({ enabled: e.target.checked })}
          />
          <span className="ae-toggle-track" />
          <span className="ae-toggle-label">{p.captions.enabled ? 'ACTIVE' : 'OFF'}</span>
        </label>
      </div>

      {/* Transcription Language */}
      <div className="ae-group-body" style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <CaptionLanguage />
      </div>

      {/* Styling & Typography Group */}
      <AEGroup
        title="Typography, Colors & Styling"
        icon={<Type size={13} />}
        defaultOpen={true}
        badge={p.captions.preset}
      >
        <div className="ae-group-body">
          <CaptionAppearance />
        </div>
      </AEGroup>

      {/* Timing & Layout Group */}
      <AEGroup
        title="Placement & Word Pacing"
        icon={<AlignVerticalJustifyCenter size={13} />}
        defaultOpen={true}
      >
        <div className="ae-group-body">
          {/* Words per caption */}
          <AEPropertyRow label="Words per Subtitle">
            <div className="ae-scrubber-with-slider">
              <AEScrubber
                value={p.captions.wordsPerCaption}
                min={1}
                max={8}
                step={1}
                unit=" words"
                decimals={0}
                defaultValue={3}
                onChange={(w) => captions({ wordsPerCaption: w })}
              />
              <input
                type="range"
                className="ae-mini-slider"
                min="1"
                max="8"
                step="1"
                value={p.captions.wordsPerCaption}
                onChange={(e) => captions({ wordsPerCaption: +e.target.value })}
              />
            </div>
          </AEPropertyRow>

          {/* Screen Position */}
          <AEPropertyRow label="Vertical Alignment">
            <select
              className="ae-select"
              value={p.captions.position}
              onChange={(e) =>
                captions({ position: e.target.value as Project['captions']['position'] })
              }
            >
              <option value="bottom">Bottom (Standard Reels/TikTok)</option>
              <option value="center">Center Focus</option>
              <option value="top">Top Header</option>
              <option value="custom">Custom Position (X / Y %)</option>
            </select>
          </AEPropertyRow>

          {p.captions.position === 'custom' && (
            <div className="ae-dual-scrubbers-row">
              <AEPropertyRow label="Pos X (%)">
                <AEScrubber
                  value={p.captions.customPosition?.x ?? 50}
                  min={5}
                  max={95}
                  step={1}
                  unit="%"
                  decimals={0}
                  defaultValue={50}
                  onChange={(x) =>
                    captions({
                      customPosition: {
                        x,
                        y: p.captions.customPosition?.y ?? 75,
                      },
                    })
                  }
                />
              </AEPropertyRow>

              <AEPropertyRow label="Pos Y (%)">
                <AEScrubber
                  value={p.captions.customPosition?.y ?? 75}
                  min={5}
                  max={95}
                  step={1}
                  unit="%"
                  decimals={0}
                  defaultValue={75}
                  onChange={(y) =>
                    captions({
                      customPosition: {
                        x: p.captions.customPosition?.x ?? 50,
                        y,
                      },
                    })
                  }
                />
              </AEPropertyRow>
            </div>
          )}

          {/* Emoji Frequency */}
          <AEPropertyRow label="Smart Emoji Insertion">
            <select
              className="ae-select"
              value={p.captions.emoji}
              onChange={(e) =>
                captions({ emoji: e.target.value as Project['captions']['emoji'] })
              }
            >
              {['None', 'Low', 'Medium', 'High'].map((value) => (
                <option key={value} value={value}>
                  {value} Frequency
                </option>
              ))}
            </select>
          </AEPropertyRow>

          {/* Safe Margins */}
          <AEPropertyRow label="Safe Area Margins">
            <label className="ae-toggle-switch">
              <input
                type="checkbox"
                checked={!!p.captions.safeArea}
                onChange={(e) => captions({ safeArea: e.target.checked })}
              />
              <span className="ae-toggle-track" />
              <span className="ae-toggle-label">
                {p.captions.safeArea ? 'Visible' : 'Hidden'}
              </span>
            </label>
          </AEPropertyRow>
        </div>
      </AEGroup>

      {/* Speakers Group */}
      <AEGroup
        title={`Speaker Voice Channels (${p.speakers.length})`}
        icon={<Users size={13} />}
        defaultOpen={p.speakers.length > 0}
      >
        <div className="ae-group-body">
          <div className="ae-speakers-list">
            {p.speakers.map((s) => (
              <div className="ae-speaker-row" key={s.id}>
                <input
                  type="color"
                  className="ae-speaker-color"
                  aria-label={`${s.name} color`}
                  value={s.color}
                  onChange={(e) => {
                    const next = structuredClone(p);
                    next.speakers.find((x) => x.id === s.id)!.color = e.target.value;
                    commit(next, 'Speaker color');
                  }}
                />
                <input
                  type="text"
                  className="ae-speaker-name-input"
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
          </div>
        </div>
      </AEGroup>
    </div>
  );
}
