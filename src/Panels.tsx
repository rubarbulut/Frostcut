import { useState, useRef, useMemo } from 'react';
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
  Trash2,
  Plus,
  Star,
  Folder,
  FolderPlus,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useEditor, mediaUrls, unregisterMedia } from './store';
import {
  type Project,
  type ClipProps,
  type MediaAsset,
  timelineWords,
  timecode,
  deleteRange,
  isLocked,
  isAudioClip,
  detachAudio,
  removeMedia,
  insertMediaClip,
  updateMediaAsset,
} from './model';
import { Field, Range, Modal } from './components';
import { CaptionAppearance } from './CaptionAppearance';
import { TransformControls } from './TransformControls';
import { AudioTools } from './AudioTools';
import { CaptionLanguage } from './SubtitleTools';
import { useShallow } from 'zustand/react/shallow';

export function MediaPanel({
  onImport,
  onRelink,
  onOpenImporter,
}: {
  onImport: () => void;
  onRelink: (id: string) => void;
  onOpenImporter?: () => void;
}) {
  const { project: p, mediaRevision, commit } = useEditor(useShallow((s) => ({
    project: s.project, mediaRevision: s.mediaRevision, commit: s.commit,
  })));
  void mediaRevision;

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'video' | 'audio' | 'starred' | string>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string; clipCount: number } | null>(null);
  const [folderModalAsset, setFolderModalAsset] = useState<MediaAsset | null>(null);
  const [customFolderInput, setCustomFolderInput] = useState('');

  // Extract distinct folders from media assets
  const availableFolders = useMemo(() => {
    const set = new Set<string>();
    p.media.forEach((m) => {
      if (m.folder && m.folder.trim()) set.add(m.folder.trim());
    });
    return Array.from(set).sort();
  }, [p.media]);

  const filteredMedia = useMemo(() => {
    return p.media.filter((m) => {
      // Search text
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesName = m.name.toLowerCase().includes(query);
        const matchesFolder = m.folder?.toLowerCase().includes(query);
        if (!matchesName && !matchesFolder) return false;
      }
      // Category / Folder filter
      if (filter === 'video') return !m.type.startsWith('audio/');
      if (filter === 'audio') return m.type.startsWith('audio/');
      if (filter === 'starred') return !!m.starred;
      if (filter !== 'all') return m.folder === filter;
      return true;
    });
  }, [p.media, search, filter]);

  function handleDeleteRequest(asset: MediaAsset) {
    const clipCount = p.clips.filter((c) => c.mediaId === asset.id).length;
    if (clipCount > 0) {
      setDeleteConfirm({ id: asset.id, name: asset.name, clipCount });
    } else {
      commit(removeMedia(p, asset.id), `Delete media ${asset.name}`);
      unregisterMedia(asset.id);
    }
  }

  function confirmDelete() {
    if (!deleteConfirm) return;
    commit(removeMedia(p, deleteConfirm.id), `Delete media ${deleteConfirm.name}`);
    unregisterMedia(deleteConfirm.id);
    setDeleteConfirm(null);
  }

  function handleAddToTimeline(assetId: string) {
    const asset = p.media.find((m) => m.id === assetId);
    if (!asset) return;
    commit(insertMediaClip(p, assetId, useEditor.getState().playhead), `Add ${asset.name} to timeline`);
  }

  function handleToggleStar(assetId: string) {
    const asset = p.media.find((m) => m.id === assetId);
    if (!asset) return;
    commit(
      updateMediaAsset(p, assetId, { starred: !asset.starred }),
      `${asset.starred ? 'Unstar' : 'Star'} ${asset.name}`,
    );
  }

  function handleAssignFolder(folder: string | undefined) {
    if (!folderModalAsset) return;
    commit(
      updateMediaAsset(p, folderModalAsset.id, { folder: folder?.trim() || undefined }),
      `Organize ${folderModalAsset.name} into folder`,
    );
    setFolderModalAsset(null);
    setCustomFolderInput('');
  }

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

      {/* Media Search & Filter Bar */}
      {p.media.length > 0 && (
        <div className="media-organizer-bar">
          <div className="media-search-input">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search media..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Filter media by name"
            />
            {search && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="media-filter-chips" role="tablist" aria-label="Media category filter">
            <button
              type="button"
              className={`filter-chip ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All ({p.media.length})
            </button>
            <button
              type="button"
              className={`filter-chip ${filter === 'video' ? 'active' : ''}`}
              onClick={() => setFilter('video')}
            >
              Videos ({p.media.filter((m) => !m.type.startsWith('audio/')).length})
            </button>
            <button
              type="button"
              className={`filter-chip ${filter === 'audio' ? 'active' : ''}`}
              onClick={() => setFilter('audio')}
            >
              Audio ({p.media.filter((m) => m.type.startsWith('audio/')).length})
            </button>
            {p.media.some((m) => m.starred) && (
              <button
                type="button"
                className={`filter-chip ${filter === 'starred' ? 'active' : ''}`}
                onClick={() => setFilter('starred')}
              >
                ⭐ Starred ({p.media.filter((m) => m.starred).length})
              </button>
            )}
            {availableFolders.map((f) => (
              <button
                key={f}
                type="button"
                className={`filter-chip ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                📁 {f} ({p.media.filter((m) => m.folder === f).length})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Asset List */}
      <div className="asset-list">
        {filteredMedia.length === 0 && p.media.length > 0 && (
          <div className="no-media-match">
            <p>No media matching &ldquo;{search}&rdquo;</p>
            <button className="text-button" onClick={() => { setSearch(''); setFilter('all'); }}>
              Reset filters
            </button>
          </div>
        )}
        {filteredMedia.map((m) => {
          const usedClipCount = p.clips.filter((c) => c.mediaId === m.id).length;
          return (
            <div
              key={m.id}
              className={`asset-card ${m.starred ? 'is-starred' : ''}`}
              onDoubleClick={() => handleAddToTimeline(m.id)}
              title={`${m.name} · Double-click to insert at playhead`}
            >
              <div className="asset-thumbnail">
                {m.type.startsWith('audio/') ? (
                  <Volume2 size={28} />
                ) : mediaUrls.has(m.id) ? (
                  <video src={mediaUrls.get(m.id)} preload="metadata" muted />
                ) : (
                  <FileVideo size={28} />
                )}
                <span>{timecode(m.duration)}</span>
                {m.folder && (
                  <span className="asset-folder-tag" title={`Folder: ${m.folder}`}>
                    📁 {m.folder}
                  </span>
                )}
              </div>

              <div className="asset-card-header">
                <b title={m.name}>{m.name}</b>
                <div className="asset-card-actions">
                  <button
                    type="button"
                    className={`asset-btn star ${m.starred ? 'active' : ''}`}
                    onClick={() => handleToggleStar(m.id)}
                    title={m.starred ? 'Unstar asset' : 'Star asset'}
                    aria-label={`Star ${m.name}`}
                  >
                    <Star size={13} fill={m.starred ? '#facc15' : 'none'} color={m.starred ? '#facc15' : 'currentColor'} />
                  </button>
                  <button
                    type="button"
                    className="asset-btn folder"
                    onClick={() => {
                      setFolderModalAsset(m);
                      setCustomFolderInput(m.folder || '');
                    }}
                    title="Assign folder/category"
                    aria-label={`Set folder for ${m.name}`}
                  >
                    <Folder size={13} />
                  </button>
                  <button
                    type="button"
                    className="asset-btn add"
                    onClick={() => handleAddToTimeline(m.id)}
                    title="Add to timeline at playhead"
                    aria-label={`Add ${m.name} to timeline`}
                  >
                    <Plus size={13} />
                  </button>
                  <button
                    type="button"
                    className="asset-btn delete"
                    onClick={() => handleDeleteRequest(m)}
                    title="Delete media from project"
                    aria-label={`Delete ${m.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <small>
                {m.type.startsWith('audio/') ? 'Audio' : `${m.width} × ${m.height}`} ·{' '}
                {(m.size / 1024 / 1024).toFixed(1)} MB
                {usedClipCount > 0 && ` · ${usedClipCount} clip${usedClipCount > 1 ? 's' : ''} on timeline`}
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
          );
        })}
      </div>

      <div className="panel-note">
        Your source files stay untouched.
        <br />
        Every edit is reversible.
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <Modal title="Delete media asset?" onClose={() => setDeleteConfirm(null)}>
          <div className="media-delete-dialog">
            <div className="media-delete-warning">
              <AlertTriangle size={24} color="#f87171" />
              <div>
                <b>{deleteConfirm.name}</b>
                <p>
                  This media asset is currently used in{' '}
                  <strong>
                    {deleteConfirm.clipCount} timeline clip{deleteConfirm.clipCount > 1 ? 's' : ''}
                  </strong>
                  . Deleting it will also remove those clips and associated captions from the timeline.
                </p>
              </div>
            </div>
            <div className="modal-actions-row">
              <button
                type="button"
                className="secondary"
                onClick={() => setDeleteConfirm(null)}
              >
                Keep asset
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={confirmDelete}
              >
                Delete asset & clips
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Folder Assignment Modal */}
      {folderModalAsset && (
        <Modal
          title={`Organize "${folderModalAsset.name}"`}
          onClose={() => setFolderModalAsset(null)}
        >
          <div className="folder-assign-dialog">
            <p className="modal-intro">
              Assign this media to a folder to keep your project organized.
            </p>

            {availableFolders.length > 0 && (
              <div className="existing-folders-list">
                <span className="subtle">Existing folders:</span>
                <div className="folder-pill-choices">
                  {availableFolders.map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`folder-choice-btn ${folderModalAsset.folder === f ? 'selected' : ''}`}
                      onClick={() => handleAssignFolder(f)}
                    >
                      📁 {f}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Field label="Custom folder name">
              <div className="custom-folder-input-row">
                <input
                  type="text"
                  placeholder="e.g. B-Roll, Sound Effects, Music"
                  maxLength={40}
                  value={customFolderInput}
                  onChange={(e) => setCustomFolderInput(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  className="primary small"
                  onClick={() => handleAssignFolder(customFolderInput)}
                >
                  Save
                </button>
              </div>
            </Field>

            {folderModalAsset.folder && (
              <button
                type="button"
                className="text-button remove-folder-btn"
                onClick={() => handleAssignFolder(undefined)}
              >
                Remove from folder
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
export { TranscriptPanel } from './TranscriptPanel';
export function PropertiesPanel() {
  const { project: p, commit, selected } = useEditor(useShallow((s) => ({
    project: s.project, commit: s.commit, selected: s.selected,
  }))),
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
          <CaptionAppearance />
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
