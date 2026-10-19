import { useState, useRef, useMemo, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Volume2,
  Play,
  Square,
  Plus,
  Search,
  Sparkles,
  Zap,
  Bell,
  Activity,
  Trash2,
  Clock,
} from 'lucide-react';
import { useEditor } from './store';
import { timecode } from './model';
import {
  SFX_PRESETS,
  playSfxPreview,
  addSfxToProject,
  autoAddWhooshesToCuts,
  autoAddPopsToCaptions,
  autoAddImpactToHook,
  clearSfxClips,
  type SfxCategory,
  type SfxPreset,
} from './sfx-library';
import './sfx.css';

export function SfxPanel({ onToast }: { onToast?: (msg: string) => void }) {
  const { project: p, playhead, commit, select, mediaChanged } = useEditor(
    useShallow((s) => ({
      project: s.project,
      playhead: s.playhead,
      commit: s.commit,
      select: s.select,
      mediaChanged: s.mediaChanged,
    })),
  );

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | SfxCategory>('all');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  // Clean up sound on unmount
  useEffect(() => {
    return () => {
      if (stopRef.current) stopRef.current();
    };
  }, []);

  const filteredPresets = useMemo(() => {
    return SFX_PRESETS.filter((preset) => {
      if (category !== 'all' && preset.category !== category) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = preset.name.toLowerCase().includes(q);
        const matchesDesc = preset.description.toLowerCase().includes(q);
        const matchesTag = preset.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchesName && !matchesDesc && !matchesTag) return false;
      }
      return true;
    });
  }, [search, category]);

  const sfxClipsCount = useMemo(() => {
    return p.clips.filter((c) => c.audioRole === 'sfx').length;
  }, [p.clips]);

  function handlePlayPreview(preset: SfxPreset) {
    if (playingId === preset.id) {
      if (stopRef.current) stopRef.current();
      setPlayingId(null);
      return;
    }

    if (stopRef.current) stopRef.current();
    setPlayingId(preset.id);

    const stop = playSfxPreview(preset.id, 0.9);
    stopRef.current = stop;

    // Timeout reset
    setTimeout(() => {
      setPlayingId((curr) => (curr === preset.id ? null : curr));
    }, preset.duration * 1000 + 100);
  }

  function handleAddPreset(preset: SfxPreset) {
    const { nextProject, clipId } = addSfxToProject(p, preset.id, playhead, 'A2');
    commit(nextProject, `Add SFX: ${preset.name}`);
    select([clipId]);
    mediaChanged();
    onToast?.(`Added "${preset.name}" at ${timecode(playhead, true)}`);
  }

  function handleAutoWhoosh() {
    const { nextProject, count } = autoAddWhooshesToCuts(p);
    if (!count) {
      onToast?.('Need at least 2 adjacent clips on track V1 to add cut whooshes.');
      return;
    }
    commit(nextProject, 'Auto-whoosh scene cuts');
    mediaChanged();
    onToast?.(`Added ${count} whoosh transitions across video cuts.`);
  }

  function handleAutoPop() {
    const { nextProject, count } = autoAddPopsToCaptions(p);
    if (!count) {
      onToast?.('No highlighted / keyword captions found. Mark words in the transcript first.');
      return;
    }
    commit(nextProject, 'Auto-pop keyword captions');
    mediaChanged();
    onToast?.(`Added ${count} bubble pops to highlighted captions.`);
  }

  function handleAutoImpact() {
    const { nextProject, added } = autoAddImpactToHook(p);
    if (!added) {
      onToast?.('An opening impact sound already exists at 00:00.');
      return;
    }
    commit(nextProject, 'Add hook 808 bass drop');
    mediaChanged();
    onToast?.('Added 808 Bass Drop to opening hook (00:00).');
  }

  function handleClearAllSfx() {
    if (!sfxClipsCount) return;
    const nextProject = clearSfxClips(p);
    commit(nextProject, 'Clear sound effects');
    mediaChanged();
    onToast?.('Removed all sound effects from timeline.');
  }

  return (
    <div className="sfx-panel">
      {/* Header */}
      <div className="sfx-header">
        <div className="sfx-title-wrap">
          <Volume2 size={16} className="text-sky-400" />
          <b>Sound Effects Studio</b>
        </div>
        <span className="sfx-count-pill">{sfxClipsCount} on timeline</span>
      </div>

      {/* Smart Production Assistant */}
      <div className="sfx-smart-section">
        <div className="sfx-smart-header">
          <span className="sfx-smart-header-title">
            <Sparkles size={12} />
            Smart Production FX
          </span>
          <span style={{ fontSize: '10px', color: '#94a3b8' }}>1-Click Magic</span>
        </div>

        <div className="sfx-smart-actions">
          <button
            type="button"
            className="sfx-smart-btn"
            onClick={handleAutoWhoosh}
            title="Automatically place whooshes at all video cuts on V1"
          >
            <Zap size={13} className="text-amber-400" />
            <span>Auto-Whoosh Cuts</span>
          </button>

          <button
            type="button"
            className="sfx-smart-btn"
            onClick={handleAutoPop}
            title="Automatically place pops at all highlighted keywords in captions"
          >
            <Bell size={13} className="text-pink-400" />
            <span>Auto-Pop Captions</span>
          </button>

          <button
            type="button"
            className="sfx-smart-btn"
            onClick={handleAutoImpact}
            title="Place a dramatic 808 sub-bass drop at 00:00 to hook the viewer"
          >
            <Activity size={13} className="text-emerald-400" />
            <span>Opening 808 Hook</span>
          </button>

          <button
            type="button"
            className="sfx-smart-btn clear"
            onClick={handleClearAllSfx}
            disabled={sfxClipsCount === 0}
            title="Remove all sound effect clips from the timeline"
          >
            <Trash2 size={11} />
            <span>Clear SFX ({sfxClipsCount})</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="sfx-search-bar">
        <Search size={13} className="text-slate-500" />
        <input
          type="text"
          placeholder="Search whoosh, pop, 808, ding, shutter…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Categories */}
      <div className="sfx-categories">
        {(
          [
            { id: 'all', label: 'All (18)' },
            { id: 'whoosh', label: 'Whooshes' },
            { id: 'impact', label: 'Impacts' },
            { id: 'pop', label: 'Pops & UI' },
            { id: 'riser', label: 'Risers' },
          ] as const
        ).map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`sfx-cat-pill ${category === cat.id ? 'active' : ''}`}
            onClick={() => setCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* SFX Cards List */}
      <div className="sfx-list">
        {filteredPresets.map((preset) => {
          const isPlaying = playingId === preset.id;
          return (
            <div key={preset.id} className="sfx-card">
              <div className="sfx-card-left">
                <button
                  type="button"
                  className={`sfx-play-btn ${isPlaying ? 'playing' : ''}`}
                  onClick={() => handlePlayPreview(preset)}
                  title={isPlaying ? 'Stop Preview' : `Listen to ${preset.name}`}
                  aria-label={isPlaying ? 'Stop' : 'Play'}
                >
                  {isPlaying ? <Square size={11} /> : <Play size={12} style={{ marginLeft: 2 }} />}
                </button>

                <div className="sfx-info">
                  <div className="sfx-name-row">
                    <span className="sfx-name">{preset.name}</span>
                    <span className="sfx-duration-tag">{preset.duration.toFixed(2)}s</span>
                  </div>
                  <span className="sfx-desc">{preset.description}</span>
                </div>
              </div>

              <button
                type="button"
                className="sfx-add-btn"
                onClick={() => handleAddPreset(preset)}
                title={`Insert ${preset.name} at playhead (${timecode(playhead, true)})`}
              >
                <Plus size={12} />
                <span>Add</span>
              </button>
            </div>
          );
        })}

        {filteredPresets.length === 0 && (
          <div className="sfx-empty-state">
            <span>No sound effects match "{search}"</span>
          </div>
        )}
      </div>
    </div>
  );
}
