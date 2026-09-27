import { useState } from 'react';
import {
  Scissors,
  Trash2,
  Copy,
  Zap,
  Volume2,
  FastForward,
  X,
  Sparkles,
} from 'lucide-react';
import { useEditor } from './store';
import { isLocked, clipEnd, uid, type Project, type Clip } from './model';
import { splitSelected, deleteSelected } from './Timeline';

export function FloatingActionBar() {
  const selected = useEditor((s) => s.selected);
  const select = useEditor((s) => s.select);
  const p = useEditor((s) => s.project);
  const commit = useEditor((s) => s.commit);

  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showVolumeMenu, setShowVolumeMenu] = useState(false);

  if (!selected.length) return null;

  const selectedClips = p.clips.filter((c) => selected.includes(c.id));
  const hasLocked = selectedClips.some((c) => isLocked(p, c));

  function handleSetSpeed(speed: number) {
    const next = structuredClone(p);
    for (const c of next.clips) {
      if (selected.includes(c.id) && !isLocked(p, c)) {
        c.properties.speed = speed;
      }
    }
    commit(next, `Speed: ${speed}×`);
    setShowSpeedMenu(false);
  }

  function handleSetVolume(vol: number) {
    const next = structuredClone(p);
    for (const c of next.clips) {
      if (selected.includes(c.id) && !isLocked(p, c)) {
        c.properties.volume = vol;
      }
    }
    commit(next, `Volume: ${Math.round(vol * 100)}%`);
    setShowVolumeMenu(false);
  }

  function handleDuplicate() {
    const next = structuredClone(p);
    const newIds: string[] = [];
    for (const c of p.clips.filter((c) => selected.includes(c.id) && !isLocked(p, c))) {
      const copy: Clip = {
        ...structuredClone(c),
        id: uid(),
        start: clipEnd(c) + 0.1,
      };
      next.clips.push(copy);
      newIds.push(copy.id);
    }
    commit(next, 'Duplicate selected clips');
    select(newIds);
  }

  return (
    <div className="floating-action-bar-container" role="toolbar" aria-label="Selected clip quick actions">
      <div className="floating-action-bar">
        <span className="floating-selection-count">
          {selected.length} {selected.length === 1 ? 'clip' : 'clips'}
        </span>

        <div className="floating-divider" />

        {/* Split */}
        <button
          type="button"
          className="floating-action-btn"
          disabled={hasLocked}
          onClick={() => splitSelected()}
          title="Split at playhead (Ctrl+K)"
          aria-label="Split at playhead"
        >
          <Scissors size={14} />
          <span>Split</span>
          <kbd className="floating-kbd">Ctrl+K</kbd>
        </button>

        {/* Speed Quick Selector */}
        <div className="floating-dropdown-wrapper">
          <button
            type="button"
            className={`floating-action-btn ${showSpeedMenu ? 'active' : ''}`}
            disabled={hasLocked}
            onClick={() => {
              setShowSpeedMenu(!showSpeedMenu);
              setShowVolumeMenu(false);
            }}
            title="Adjust playback speed"
            aria-label="Playback speed"
            aria-expanded={showSpeedMenu}
          >
            <Zap size={14} />
            <span>Speed</span>
          </button>
          {showSpeedMenu && (
            <div className="floating-dropdown-menu">
              {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((s) => (
                <button
                  key={s}
                  type="button"
                  className="floating-menu-item"
                  onClick={() => handleSetSpeed(s)}
                >
                  {s}×
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Volume Quick Selector */}
        <div className="floating-dropdown-wrapper">
          <button
            type="button"
            className={`floating-action-btn ${showVolumeMenu ? 'active' : ''}`}
            disabled={hasLocked}
            onClick={() => {
              setShowVolumeMenu(!showVolumeMenu);
              setShowSpeedMenu(false);
            }}
            title="Adjust volume"
            aria-label="Clip volume"
            aria-expanded={showVolumeMenu}
          >
            <Volume2 size={14} />
            <span>Volume</span>
          </button>
          {showVolumeMenu && (
            <div className="floating-dropdown-menu">
              {[
                { label: 'Mute (0%)', val: 0 },
                { label: '50%', val: 0.5 },
                { label: '100%', val: 1.0 },
                { label: '150% Boost', val: 1.5 },
                { label: '200% Max', val: 2.0 },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  className="floating-menu-item"
                  onClick={() => handleSetVolume(item.val)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Duplicate */}
        <button
          type="button"
          className="floating-action-btn"
          disabled={hasLocked}
          onClick={handleDuplicate}
          title="Duplicate clip"
          aria-label="Duplicate clip"
        >
          <Copy size={14} />
          <span>Duplicate</span>
        </button>

        {/* Ripple Delete */}
        <button
          type="button"
          className="floating-action-btn"
          disabled={hasLocked}
          onClick={() => deleteSelected(true)}
          title="Ripple delete (Shift+Del - closes gap)"
          aria-label="Ripple delete"
        >
          <FastForward size={14} />
          <span>Ripple Del</span>
        </button>

        {/* Delete */}
        <button
          type="button"
          className="floating-action-btn delete-btn"
          disabled={hasLocked}
          onClick={() => deleteSelected(false)}
          title="Delete clip (Del)"
          aria-label="Delete clip"
        >
          <Trash2 size={14} />
          <span>Delete</span>
        </button>

        <div className="floating-divider" />

        {/* Deselect */}
        <button
          type="button"
          className="floating-action-btn close-btn"
          onClick={() => select([])}
          title="Deselect (Esc)"
          aria-label="Deselect"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
