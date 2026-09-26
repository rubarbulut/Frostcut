import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import {
  Youtube,
  Music,
  Video,
  Upload,
  Link,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  X,
  ShieldCheck,
} from 'lucide-react';
import {
  extractYouTubeId,
  getYouTubeThumbnail,
  isValidMediaUrl,
  resolveRemoteMedia,
  downloadRemoteMedia,
} from './youtube-resolver';
import { isAudioOnlyFile, inspectAudioFile } from './audio-inspector';
import type { IngestJobProgress, IngestMediaType, RemoteMediaMeta } from './types';

interface MediaImporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMediaReady: (file: File) => void;
}

export function MediaImporterModal({
  isOpen,
  onClose,
  onMediaReady,
}: MediaImporterModalProps) {
  const [activeTab, setActiveTab] = useState<'youtube' | 'local'>('youtube');
  const [urlInput, setUrlInput] = useState('');
  const [targetType, setTargetType] = useState<IngestMediaType>('video');
  const [mediaMeta, setMediaMeta] = useState<RemoteMediaMeta | null>(null);
  const [resolving, setResolving] = useState(false);
  const [progress, setProgress] = useState<IngestJobProgress>({
    phase: 'idle',
    percent: 0,
    message: '',
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Handle URL change & instant preview
  const handleUrlChange = async (val: string) => {
    setUrlInput(val);
    setErrorMsg(null);
    const trimmed = val.trim();

    if (isValidMediaUrl(trimmed)) {
      setResolving(true);
      try {
        const meta = await resolveRemoteMedia(trimmed, targetType);
        setMediaMeta(meta);
      } catch (err) {
        setMediaMeta(null);
      } finally {
        setResolving(false);
      }
    } else {
      setMediaMeta(null);
    }
  };

  // Trigger remote import
  const handleStartImport = async () => {
    if (!mediaMeta) return;
    setErrorMsg(null);
    try {
      const file = await downloadRemoteMedia(mediaMeta, targetType, (prog) => {
        setProgress(prog);
      });
      setProgress({ phase: 'ready', percent: 100, message: 'Media ready!' });
      setTimeout(() => {
        onMediaReady(file);
        onClose();
      }, 700);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Import failed. Check network or URL.';
      setErrorMsg(msg);
      setProgress({ phase: 'error', percent: 0, message: msg });
    }
  };

  // Local File Drop / Pick Handler
  const handleLocalFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setErrorMsg(null);

    if (isAudioOnlyFile(file)) {
      try {
        setProgress({ phase: 'processing', percent: 50, message: 'Analyzing audio spectrum & waveform…' });
        await inspectAudioFile(file);
        setProgress({ phase: 'ready', percent: 100, message: 'Audio ready for timeline!' });
        setTimeout(() => {
          onMediaReady(file);
          onClose();
        }, 500);
      } catch (err) {
        setErrorMsg('Could not process audio file.');
      }
    } else {
      // Standard video file
      onMediaReady(file);
      onClose();
    }
  };

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleLocalFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="importer-backdrop" onClick={onClose}>
      <div
        className="importer-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="importer-header">
          <div className="importer-title-wrap">
            <span className="importer-badge">MEDIA INGEST ENGINE</span>
            <h2>Import Video & Audio</h2>
          </div>
          <button className="importer-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="importer-tabs">
          <button
            className={`importer-tab-btn ${activeTab === 'youtube' ? 'active' : ''}`}
            onClick={() => setActiveTab('youtube')}
          >
            <Youtube size={16} /> YouTube / Remote URL
          </button>
          <button
            className={`importer-tab-btn ${activeTab === 'local' ? 'active' : ''}`}
            onClick={() => setActiveTab('local')}
          >
            <Upload size={16} /> Local File (MP4, MP3, WAV)
          </button>
        </div>

        {/* Tab 1: YouTube / URL */}
        {activeTab === 'youtube' && (
          <div className="importer-content-section">
            <div className="importer-input-group">
              <label htmlFor="remote-url-input">Paste YouTube, Shorts, or Direct Stream Link</label>
              <div className="importer-input-row">
                <div className="input-icon-wrap">
                  <Link size={16} />
                </div>
                <input
                  id="remote-url-input"
                  type="text"
                  placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                  value={urlInput}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            {/* Target Media Type Selector */}
            <div className="importer-format-toggle">
              <span className="toggle-label">Extract as:</span>
              <button
                type="button"
                className={`format-chip ${targetType === 'video' ? 'selected' : ''}`}
                onClick={() => setTargetType('video')}
              >
                <Video size={14} /> Full Video (MP4)
              </button>
              <button
                type="button"
                className={`format-chip ${targetType === 'audio' ? 'selected' : ''}`}
                onClick={() => setTargetType('audio')}
              >
                <Music size={14} /> Audio Track (MP3)
              </button>
            </div>

            {/* Video Preview Card */}
            {mediaMeta && (
              <div className="importer-preview-card">
                {mediaMeta.thumbnailUrl && (
                  <div className="preview-thumb-box">
                    <img src={mediaMeta.thumbnailUrl} alt={mediaMeta.title} />
                    <span className="preview-type-tag">
                      {targetType === 'audio' ? 'AUDIO' : 'VIDEO'}
                    </span>
                  </div>
                )}
                <div className="preview-details">
                  <h4>{mediaMeta.title}</h4>
                  <p className="preview-source-sub">
                    Source: {mediaMeta.source === 'youtube' ? 'YouTube' : 'Direct Stream'} · Ready for timeline
                  </p>
                  <div className="preview-security-note">
                    <ShieldCheck size={13} />
                    <span>Processed 100% locally in browser memory</span>
                  </div>
                </div>
              </div>
            )}

            {/* Progress Bar */}
            {progress.phase !== 'idle' && progress.phase !== 'error' && (
              <div className="importer-progress-box">
                <div className="progress-label-row">
                  <span>{progress.message}</span>
                  <b>{progress.percent}%</b>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error notice */}
            {errorMsg && (
              <div className="importer-error-box">
                <AlertCircle size={15} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Action Bar */}
            <div className="importer-actions">
              <button className="importer-ghost-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                className="importer-primary-btn"
                disabled={!mediaMeta || progress.phase === 'downloading' || progress.phase === 'processing'}
                onClick={handleStartImport}
              >
                {progress.phase === 'downloading' || progress.phase === 'processing' ? (
                  <>
                    <LoaderCircle className="spin-icon" size={16} /> Ingesting…
                  </>
                ) : (
                  <>
                    <Sparkles size={16} /> Import to FrostCut
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Local File Dropzone */}
        {activeTab === 'local' && (
          <div className="importer-content-section">
            <div
              className={`importer-dropzone ${dragActive ? 'drag-over' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,audio/mp3,audio/mpeg,audio/wav,audio/m4a,audio/aac,audio/ogg"
                style={{ display: 'none' }}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleLocalFiles(e.target.files)}
              />

              <div className="dropzone-icon-orbit">
                <Upload size={28} />
              </div>
              <h3>Drop your video or audio file here</h3>
              <p>Supports MP4, WebM, MOV, plus MP3, WAV, and M4A audio tracks</p>

              <div className="dropzone-badges">
                <span className="badge-chip">🎬 MP4 / WebM</span>
                <span className="badge-chip">🎵 MP3 / WAV</span>
                <span className="badge-chip">🔒 100% Local</span>
              </div>
            </div>

            {errorMsg && (
              <div className="importer-error-box">
                <AlertCircle size={15} />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
