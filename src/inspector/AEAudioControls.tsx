import { useState } from 'react';
import { Volume2, Wand2, Scissors, Music } from 'lucide-react';
import { type Clip, isAudioClip, isLocked, detachAudio } from '../model';
import { useEditor } from '../store';
import { AEGroup } from './AEGroup';
import { AEPropertyRow } from './AEPropertyRow';
import { AEScrubber } from './AEScrubber';
import { AudioTools } from '../AudioTools';

export function AEAudioControls({ clip }: { clip: Clip }) {
  const { project: p, commit } = useEditor();
  const locked = isLocked(p, clip);
  const isAudio = isAudioClip(p, clip);

  function saveProps(patch: Partial<Clip['properties']>, label: string) {
    if (locked) return;
    const next = structuredClone(p);
    const target = next.clips.find((c) => c.id === clip.id);
    if (!target) return;
    Object.assign(target.properties, patch);
    commit(next, label);
  }

  function handleResetAudio() {
    saveProps({ volume: 1.0, fadeIn: 0, fadeOut: 0 }, 'Reset audio levels');
  }

  const volPercent = Math.round(clip.properties.volume * 100);

  return (
    <AEGroup
      title="Audio & Levels"
      icon={<Volume2 size={13} />}
      defaultOpen={isAudio}
      onReset={handleResetAudio}
      badge={`${volPercent}%`}
    >
      <div className="ae-audio-body">
        {/* Track assignment */}
        {isAudio && (
          <AEPropertyRow label="Audio Track">
            <select
              className="ae-select"
              value={clip.trackId}
              disabled={locked}
              onChange={(e) => {
                const next = structuredClone(p);
                const target = next.clips.find((c) => c.id === clip.id);
                if (target) {
                  target.trackId = e.target.value;
                  commit(next, 'Change audio track');
                }
              }}
            >
              {p.tracks
                .filter((t) => t.kind === 'audio')
                .map((t) => (
                  <option key={t.id} value={t.id} disabled={t.locked}>
                    {t.name}
                  </option>
                ))}
            </select>
          </AEPropertyRow>
        )}

        {/* Master Volume */}
        <AEPropertyRow label="Volume Gain">
          <div className="ae-scrubber-with-slider">
            <AEScrubber
              value={volPercent}
              min={0}
              max={200}
              step={1}
              unit="%"
              decimals={0}
              defaultValue={100}
              disabled={locked}
              onChange={(v) => saveProps({ volume: v / 100 }, 'Adjust volume')}
            />
            <input
              type="range"
              className="ae-mini-slider"
              min="0"
              max="200"
              step="1"
              value={volPercent}
              disabled={locked}
              onChange={(e) => saveProps({ volume: +e.target.value / 100 }, 'Adjust volume')}
            />
          </div>
        </AEPropertyRow>

        {/* Fade In & Fade Out */}
        <div className="ae-dual-scrubbers-row">
          <AEPropertyRow label="Fade In">
            <AEScrubber
              value={clip.properties.fadeIn}
              min={0}
              max={5}
              step={0.05}
              unit="s"
              decimals={2}
              defaultValue={0}
              disabled={locked}
              onChange={(v) => saveProps({ fadeIn: v }, 'Adjust fade in')}
            />
          </AEPropertyRow>

          <AEPropertyRow label="Fade Out">
            <AEScrubber
              value={clip.properties.fadeOut}
              min={0}
              max={5}
              step={0.05}
              unit="s"
              decimals={2}
              defaultValue={0}
              disabled={locked}
              onChange={(v) => saveProps({ fadeOut: v }, 'Adjust fade out')}
            />
          </AEPropertyRow>
        </div>

        {/* Detach Audio Action for video clips */}
        {!isAudio && (
          <div className="ae-detach-action-row">
            <button
              type="button"
              className={`ae-detach-btn ${clip.audioDetached ? 'detached' : ''}`}
              disabled={clip.audioDetached || locked}
              onClick={() => commit(detachAudio(p, clip.id), 'Detach source audio')}
            >
              <Scissors size={12} />
              <span>
                {clip.audioDetached
                  ? '✓ Audio detached · editing on A1'
                  : 'Detach Audio to Independent Track'}
              </span>
            </button>
          </div>
        )}

        <div className="ae-divider" />

        {/* Pro Audio Tools (Auto-ducking, Voice enhance, Beat sync) */}
        <div className="ae-embedded-audio-tools">
          <AudioTools clip={clip} />
        </div>
      </div>
    </AEGroup>
  );
}
