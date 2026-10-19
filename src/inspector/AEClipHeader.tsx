import { useState } from 'react';
import { Film, Volume2, RotateCcw, Lock, Edit2, Check } from 'lucide-react';
import { type Clip, type Project, isAudioClip, timecode, clipDuration, defaultProps } from '../model';
import { useEditor } from '../store';

export function AEClipHeader({
  project,
  clip,
  locked,
}: {
  project: Project;
  clip: Clip;
  locked: boolean;
}) {
  const commit = useEditor((s) => s.commit);
  const mediaAsset = project.media.find((m) => m.id === clip.mediaId);
  const isAudio = isAudioClip(project, clip);
  const dur = clipDuration(clip);

  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(mediaAsset?.name || 'Untitled Clip');

  const handleResetAll = () => {
    if (locked) return;
    const next = structuredClone(project);
    const target = next.clips.find((c) => c.id === clip.id);
    if (!target) return;
    target.properties = { ...defaultProps };
    target.keyframes = undefined;
    target.effects = undefined;
    commit(next, 'Reset all clip properties');
  };

  const handleSaveName = () => {
    setRenaming(false);
    if (!nameDraft.trim() || !mediaAsset) return;
    const next = structuredClone(project);
    const targetAsset = next.media.find((m) => m.id === clip.mediaId);
    if (targetAsset && targetAsset.name !== nameDraft.trim()) {
      targetAsset.name = nameDraft.trim();
      commit(next, 'Rename clip asset');
    }
  };

  return (
    <div className="ae-clip-header">
      <div className="ae-clip-header-top">
        <div className="ae-clip-identity">
          <span className={`ae-track-tag ${isAudio ? 'audio-track' : 'video-track'}`}>
            {clip.trackId || (isAudio ? 'A1' : 'V1')}
          </span>

          <span className="ae-clip-icon">
            {isAudio ? <Volume2 size={13} /> : <Film size={13} />}
          </span>

          {renaming ? (
            <div className="ae-clip-rename-wrap">
              <input
                type="text"
                className="ae-clip-rename-input"
                value={nameDraft}
                autoFocus
                onChange={(e) => setNameDraft(e.target.value)}
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
                title="Save"
              >
                <Check size={11} />
              </button>
            </div>
          ) : (
            <div
              className="ae-clip-name-wrap"
              title="Click pencil to rename asset"
            >
              <b className="ae-clip-name">{mediaAsset?.name || 'Clip'}</b>
              <button
                type="button"
                className="ae-clip-rename-btn"
                onClick={() => {
                  setNameDraft(mediaAsset?.name || 'Clip');
                  setRenaming(true);
                }}
                title="Rename clip"
              >
                <Edit2 size={10} />
              </button>
            </div>
          )}
        </div>

        <div className="ae-clip-header-actions">
          {locked && (
            <span className="ae-locked-badge" title="Track is locked">
              <Lock size={10} /> Locked
            </span>
          )}

          {!locked && (
            <button
              type="button"
              className="ae-reset-all-btn"
              title="Reset all transform, effect and keyframe properties"
              onClick={handleResetAll}
            >
              <RotateCcw size={11} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      <div className="ae-clip-header-meta">
        <div className="ae-meta-pill">
          <span className="ae-meta-label">Duration:</span>
          <span className="ae-meta-val">{timecode(dur)}</span>
        </div>

        <div className="ae-meta-pill">
          <span className="ae-meta-label">In:</span>
          <span className="ae-meta-val">{timecode(clip.start)}</span>
        </div>

        <div className="ae-meta-pill">
          <span className="ae-meta-label">Out:</span>
          <span className="ae-meta-val">{timecode(clip.start + dur)}</span>
        </div>

        {clip.properties.speed !== 1 && (
          <div className="ae-meta-pill speed-pill">
            <span className="ae-meta-val">{clip.properties.speed.toFixed(2)}×</span>
          </div>
        )}
      </div>
    </div>
  );
}
