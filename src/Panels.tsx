import { useState, useRef, useMemo } from 'react';
import {
  Upload,
  FileVideo,
  Link2,
  Search,
  ArrowRightLeft,
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
  type MediaAsset,
  timecode,
  removeMedia,
  insertMediaClip,
  updateMediaAsset,
} from './model';
import { Field, Modal } from './components';
import { useShallow } from 'zustand/react/shallow';


function MediaHoverThumbnail({
  asset,
  url,
}: {
  asset: MediaAsset;
  url?: string;
}) {
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [scrubPct, setScrubPct] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!asset.duration || !url || asset.type.startsWith('audio/')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = ratio * asset.duration;
    setScrubPct(ratio * 100);
    setHoverTime(target);
    if (videoRef.current) {
      videoRef.current.currentTime = target;
    }
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
    setScrubPct(0);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <div
      className="asset-thumbnail"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {asset.type.startsWith('audio/') ? (
        <Volume2 size={28} />
      ) : url ? (
        <video ref={videoRef} src={url} preload="metadata" muted playsInline />
      ) : (
        <FileVideo size={28} />
      )}
      <span className={hoverTime !== null ? 'hovering' : ''}>
        {hoverTime !== null ? timecode(hoverTime) : timecode(asset.duration)}
      </span>
      {hoverTime !== null && (
        <div className="hover-scrub-indicator" style={{ width: `${scrubPct}%` }} />
      )}
      {asset.folder && (
        <span className="asset-folder-tag" title={`Folder: ${asset.folder}`}>
          📁 {asset.folder}
        </span>
      )}
    </div>
  );
}

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
              <MediaHoverThumbnail asset={m} url={mediaUrls.get(m.id)} />

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
export { SocialFormatPanel } from './SocialFormatPanel';
export { ThumbnailGrabber } from './ThumbnailGrabber';
export { SocialPostKit } from './SocialPostKit';
export { SocialCaptionsPanel } from './SocialCaptionsPanel';
export { AEInspector, AEInspector as PropertiesPanel } from './inspector/AEInspector';

