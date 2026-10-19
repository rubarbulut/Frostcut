import { useState } from 'react';
import {
  Layers,
  Smartphone,
  Tv,
  Square,
  Zap,
  Captions,
  Film,
  Volume2,
  CheckCircle2,
  Edit2,
  Check,
  Sparkles,
  Scissors,
  ArrowRight,
} from 'lucide-react';
import { type Project, isAudioClip, duration, timecode } from '../model';
import { useEditor } from '../store';
import { presetKeyframes, clampMotion, type AnimatedProperty } from '../motion';
import { AEGroup } from './AEGroup';
import { AEPropertyRow } from './AEPropertyRow';
import { AEScrubber } from './AEScrubber';

export function AECompositionInspector({ project: p }: { project: Project }) {
  const commit = useEditor((s) => s.commit);
  const playhead = useEditor((s) => s.playhead);
  const dur = duration(p);

  const [renaming, setRenaming] = useState(false);
  const [seqName, setSeqName] = useState<string>(String(p.settings.preset || 'Main Sequence'));

  const is916 =
    (p.settings.aspectRatio === '9:16' ||
      (p.settings.width === 1080 && p.settings.height === 1920)) &&
    !!p.captions.safeArea;

  const isAudioMastered = p.clips.some(
    (c) => c.voiceEnhance || c.autoDuck || (c.properties.volume && c.properties.volume > 1.0),
  );

  const isNoSpeech = !!p.settings.noSpeech;
  const isCaptionsActive = isNoSpeech || p.captions.enabled;

  const firstClip = [...p.clips].sort((a, b) => a.start - b.start)[0];
  const hasHook =
    firstClip &&
    firstClip.properties.animation &&
    firstClip.properties.animation !== 'None';

  const completedSteps = [is916, isAudioMastered, isCaptionsActive, hasHook].filter(Boolean).length;

  const currentRatio =
    p.settings.aspectRatio ||
    (p.settings.width > p.settings.height
      ? '16:9'
      : p.settings.width === p.settings.height
        ? '1:1'
        : p.settings.height === 1350
          ? '4:5'
          : '9:16');

  const setRatio = (ratio: '9:16' | '16:9' | '1:1' | '4:5') => {
    const dimMap = {
      '9:16': { width: 1080, height: 1920 },
      '16:9': { width: 1920, height: 1080 },
      '1:1': { width: 1080, height: 1080 },
      '4:5': { width: 1080, height: 1350 },
    };
    const next = structuredClone(p);
    next.settings.aspectRatio = ratio;
    next.settings.width = dimMap[ratio].width;
    next.settings.height = dimMap[ratio].height;
    commit(next, `Change sequence aspect ratio to ${ratio}`);
  };

  const handleApplyFormat = () => {
    setRatio('9:16');
    const next = structuredClone(useEditor.getState().project);
    next.captions.safeArea = true;
    commit(next, 'Format: 9:16 Reels/TikTok with safe margins');
  };

  const handleApplyMasterAudio = () => {
    const next = structuredClone(p);
    for (const c of next.clips) {
      if (!isAudioClip(next, c) || c.audioRole === 'voice') {
        c.voiceEnhance = true;
        if (c.properties.volume < 0.85) c.properties.volume = 1.1;
      }
      if (isAudioClip(next, c) && c.audioRole === 'music') {
        c.autoDuck = true;
        c.properties.volume = Math.min(0.35, c.properties.volume || 0.3);
      }
    }
    commit(next, 'Master audio: -14 LUFS speech leveling & auto-ducking');
  };

  const handleApplyCaptions = () => {
    const next = structuredClone(p);
    next.settings.noSpeech = false;
    next.captions.enabled = true;
    if (next.captions.preset === 'Clean') next.captions.preset = 'Bold';
    commit(next, 'Enable dynamic viral captions');
  };

  const handleApplyHook = () => {
    if (!firstClip) return;
    const next = structuredClone(p);
    const target = next.clips.find((c) => c.id === firstClip.id);
    if (!target) return;
    target.properties.animation = 'Punch In';
    target.keyframes = Object.fromEntries(
      Object.entries(
        presetKeyframes(target, 'Punch In', next.settings.width, next.settings.height),
      ).map(([key, frames]) => [
        key,
        frames.map((f) => ({
          ...f,
          value: clampMotion(key as AnimatedProperty, f.value),
        })),
      ]),
    );
    commit(next, 'Apply hook punch-in zoom');
  };

  const handleApplyAll = () => {
    const next = structuredClone(p);
    next.settings.aspectRatio = '9:16';
    next.settings.width = 1080;
    next.settings.height = 1920;
    next.captions.safeArea = true;
    for (const c of next.clips) {
      if (!isAudioClip(next, c) || c.audioRole === 'voice') {
        c.voiceEnhance = true;
        if (c.properties.volume < 0.85) c.properties.volume = 1.1;
      }
      if (isAudioClip(next, c) && c.audioRole === 'music') {
        c.autoDuck = true;
        c.properties.volume = Math.min(0.35, c.properties.volume || 0.3);
      }
    }
    if (!isNoSpeech) {
      next.captions.enabled = true;
      if (next.captions.preset === 'Clean') next.captions.preset = 'Bold';
    }
    const primary = [...next.clips].sort((a, b) => a.start - b.start)[0];
    if (primary) {
      primary.properties.animation = 'Punch In';
      primary.keyframes = Object.fromEntries(
        Object.entries(
          presetKeyframes(primary, 'Punch In', next.settings.width, next.settings.height),
        ).map(([key, frames]) => [
          key,
          frames.map((f) => ({
            ...f,
            value: clampMotion(key as AnimatedProperty, f.value),
          })),
        ]),
      );
    }
    commit(next, 'Apply full smart edit workflow polish');
  };

  const handleSaveName = () => {
    setRenaming(false);
    if (!seqName.trim()) return;
    const next = structuredClone(p);
    const validPresets = ['YouTube Shorts', 'TikTok', 'Instagram Reel', 'YouTube', 'Custom'] as const;
    const matched = validPresets.find((x) => x.toLowerCase() === seqName.trim().toLowerCase());
    next.settings.preset = matched ?? 'Custom';
    commit(next, 'Rename sequence');
  };

  const videoTracks = p.tracks.filter((t) => t.kind === 'video').length;
  const audioTracks = p.tracks.filter((t) => t.kind === 'audio').length;


  return (
    <div className="ae-composition-inspector">
      {/* Composition Header */}
      <div className="ae-comp-header">
        <div className="ae-comp-identity">
          <span className="ae-comp-icon">
            <Layers size={14} />
          </span>

          {renaming ? (
            <div className="ae-clip-rename-wrap">
              <input
                type="text"
                className="ae-clip-rename-input"
                value={seqName}
                autoFocus
                onChange={(e) => setSeqName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') setRenaming(false);
                }}
              />
              <button
                type="button"
                className="ae-clip-rename-ok"
                onClick={handleSaveName}
              >
                <Check size={11} />
              </button>
            </div>
          ) : (
            <div className="ae-clip-name-wrap">
              <b className="ae-comp-title">{p.settings.preset || 'Main Sequence'}</b>
              <button
                type="button"
                className="ae-clip-rename-btn"
                onClick={() => setRenaming(true)}
                title="Rename sequence"
              >
                <Edit2 size={10} />
              </button>
            </div>
          )}
        </div>

        <span className="ae-comp-badge">ACTIVE SEQUENCE</span>
      </div>

      <div className="ae-comp-meta-strip">
        <div className="ae-meta-pill">
          <span className="ae-meta-label">Duration:</span>
          <span className="ae-meta-val">{timecode(dur)}</span>
        </div>
        <div className="ae-meta-pill">
          <span className="ae-meta-label">Playhead:</span>
          <span className="ae-meta-val">{timecode(playhead)}</span>
        </div>
        <div className="ae-meta-pill">
          <span className="ae-meta-label">Clips:</span>
          <span className="ae-meta-val">{p.clips.length}</span>
        </div>
      </div>

      {/* Smart First Steps & Quick Polish */}
      {p.clips.length > 0 && (
        <AEGroup
          title="İlk Adım Önerileri & İş Akışı"
          icon={<Sparkles size={13} />}
          defaultOpen={true}
          badge={`${completedSteps}/4 Hazır`}
        >
          <div className="ae-comp-body">
            <div className="ae-comp-workflow-strip">
              <button
                type="button"
                className={`ae-step-pill ${isAudioMastered ? 'done' : ''}`}
                onClick={handleApplyMasterAudio}
                title="Sesi -14 LUFS standardına getir ve arka planı kıs"
              >
                <Volume2 size={12} />
                <span>{isAudioMastered ? '✓ Ses Dengelendi' : '1. Sesi Dengele'}</span>
              </button>

              <button
                type="button"
                className={`ae-step-pill ${isCaptionsActive ? 'done' : ''}`}
                onClick={handleApplyCaptions}
                title={isNoSpeech ? 'Videoda konuşma yok (Metinsiz Mod). Tıkla: Konuşma/altyazı moduna geç' : 'Altyazıları aç'}
              >
                <Captions size={12} />
                <span>{isNoSpeech ? '✓ Metinsiz Video' : isCaptionsActive ? '✓ Altyazı Aktif' : '2. Altyazı Ekle'}</span>
              </button>

              <button
                type="button"
                className={`ae-step-pill ${is916 ? 'done' : ''}`}
                onClick={handleApplyFormat}
                title="9:16 Dikey Formata ve Güvenli Alana Al"
              >
                <Smartphone size={12} />
                <span>{is916 ? '✓ 9:16 Dikey' : '3. 9:16 Uyarla'}</span>
              </button>

              <button
                type="button"
                className={`ae-step-pill ${hasHook ? 'done' : ''}`}
                onClick={handleApplyHook}
                title="İlk 3 saniyeye dikkat çeken punch-in zoom ekle"
              >
                <Zap size={12} />
                <span>{hasHook ? '✓ Hook Hazır' : '4. Hook Ekle'}</span>
              </button>
            </div>

            <button
              type="button"
              className="ae-workflow-all-btn"
              onClick={handleApplyAll}
            >
              <Zap size={12} />
              <span>✨ Tüm İlk Adımları Tek Tıkla Uygula</span>
            </button>
          </div>
        </AEGroup>
      )}

      {/* Frame Dimensions & Aspect Ratio Group */}
      <AEGroup
        title="Canvas & Aspect Ratio"
        icon={<Smartphone size={13} />}
        defaultOpen={true}
        badge={currentRatio}
      >
        <div className="ae-comp-body">
          {/* Ratio Quick Selector */}
          <div className="ae-ratio-buttons-grid">
            <button
              type="button"
              className={`ae-ratio-card ${currentRatio === '9:16' ? 'active' : ''}`}
              onClick={() => setRatio('9:16')}
            >
              <Smartphone size={16} />
              <div className="ae-ratio-info">
                <b>9:16 Vertical</b>
                <small>TikTok · Reels · Shorts</small>
              </div>
            </button>

            <button
              type="button"
              className={`ae-ratio-card ${currentRatio === '16:9' ? 'active' : ''}`}
              onClick={() => setRatio('16:9')}
            >
              <Tv size={16} />
              <div className="ae-ratio-info">
                <b>16:9 Widescreen</b>
                <small>YouTube · Landscape</small>
              </div>
            </button>

            <button
              type="button"
              className={`ae-ratio-card ${currentRatio === '1:1' ? 'active' : ''}`}
              onClick={() => setRatio('1:1')}
            >
              <Square size={16} />
              <div className="ae-ratio-info">
                <b>1:1 Square</b>
                <small>Instagram Feed</small>
              </div>
            </button>

            <button
              type="button"
              className={`ae-ratio-card ${currentRatio === '4:5' ? 'active' : ''}`}
              onClick={() => setRatio('4:5')}
            >
              <Smartphone size={16} />
              <div className="ae-ratio-info">
                <b>4:5 Portrait</b>
                <small>Feed Portrait</small>
              </div>
            </button>
          </div>

          {/* Width & Height Scrubbers */}
          <AEPropertyRow label="Dimensions">
            <div className="ae-dual-scrubbers">
              <AEScrubber
                prefix="W:"
                value={p.settings.width}
                min={320}
                max={7680}
                step={2}
                unit="px"
                decimals={0}
                onChange={(w) => {
                  const next = structuredClone(p);
                  next.settings.width = Math.round(w);
                  commit(next, 'Change canvas width');
                }}
              />
              <AEScrubber
                prefix="H:"
                value={p.settings.height}
                min={320}
                max={7680}
                step={2}
                unit="px"
                decimals={0}
                onChange={(h) => {
                  const next = structuredClone(p);
                  next.settings.height = Math.round(h);
                  commit(next, 'Change canvas height');
                }}
              />
            </div>
          </AEPropertyRow>

          {/* Frame Rate */}
          <AEPropertyRow label="Frame Rate (FPS)">
            <select
              className="ae-select"
              value={p.settings.fps}
              onChange={(e) => {
                const next = structuredClone(p);
                next.settings.fps = +e.target.value;
                commit(next, 'Change frame rate');
              }}
            >
              <option value={24}>24.00 fps (Cinematic)</option>
              <option value={25}>25.00 fps (PAL)</option>
              <option value={30}>30.00 fps (Standard Web / Social)</option>
              <option value={60}>60.00 fps (Smooth / High Frame)</option>
            </select>
          </AEPropertyRow>

          {/* Safe Margins Toggle */}
          <AEPropertyRow label="Safe Margins Overlay">
            <label className="ae-toggle-switch">
              <input
                type="checkbox"
                checked={!!p.captions.safeArea}
                onChange={(e) => {
                  const next = structuredClone(p);
                  next.captions.safeArea = e.target.checked;
                  commit(next, 'Toggle safe area');
                }}
              />
              <span className="ae-toggle-track" />
              <span className="ae-toggle-label">
                {p.captions.safeArea ? 'Visible (TikTok / Reels Margins)' : 'Hidden'}
              </span>
            </label>
          </AEPropertyRow>
        </div>
      </AEGroup>

      {/* Sequence Structure & Hardware Group */}
      <AEGroup
        title="Sequence Architecture & Engine"
        icon={<Layers size={13} />}
        defaultOpen={true}
      >
        <div className="ae-comp-body">
          <div className="ae-stats-matrix">
            <div className="ae-matrix-cell">
              <span className="cell-label">Video Tracks</span>
              <b className="cell-val">{videoTracks}</b>
              <small>V1 - V{videoTracks}</small>
            </div>

            <div className="ae-matrix-cell">
              <span className="cell-label">Audio Tracks</span>
              <b className="cell-val">{audioTracks}</b>
              <small>A1 - A{audioTracks}</small>
            </div>

            <div className="ae-matrix-cell">
              <span className="cell-label">Subtitles</span>
              <b
                className="cell-val"
                style={{ color: p.captions.enabled ? '#4ade80' : '#8b949e' }}
              >
                {p.captions.enabled ? 'Active ✓' : 'Disabled'}
              </b>
              <small>{p.captions.preset}</small>
            </div>

            <div className="ae-matrix-cell">
              <span className="cell-label">Render Engine</span>
              <b className="cell-val" style={{ color: '#38bdf8' }}>
                ⚡ Turbo GPU
              </b>
              <small>Hardware NVENC</small>
            </div>
          </div>
        </div>
      </AEGroup>
    </div>
  );
}
