import { useState, useMemo } from 'react';
import { MessageSquareText, Check, ShieldCheck, Film, Scissors, Layers, VolumeX } from 'lucide-react';
import { Modal, Field } from './components';
import { useEditor } from './store';
import { languages, timecode } from './model';
import {
  resolveQuality,
  recommendedQuality,
  transcriptionModels,
  type TranscriptionQuality,
} from './transcription-config';

export type TranscriptionTargetOptions = {
  scope: 'timeline' | 'selected' | 'all';
  mediaId?: string;
  clipIds?: string[];
};

export default function TranscriptionSetup({
  onClose,
  onStart,
}: {
  onClose: () => void;
  onStart: (options?: TranscriptionTargetOptions | string) => void;
}) {
  const { project: p, selected, commit } = useEditor();
  const [language, setLanguage] = useState(p.settings.language);
  const [device, setDevice] = useState<'auto' | 'cpu'>(p.settings.transcriptionDevice ?? 'auto');
  const [quality, setQuality] = useState<TranscriptionQuality>(
    resolveQuality(p.settings.transcriptionQuality),
  );
  const [qualityChosen, setQualityChosen] = useState(false);

  const inUse = p.media.filter((m) => p.clips.some((c) => c.mediaId === m.id));

  // Determine timeline & selected duration calculations
  const selectedClips = useMemo(
    () => p.clips.filter((c) => selected.includes(c.id)),
    [p.clips, selected],
  );
  const hasSelected = selectedClips.length > 0;

  const timelineDuration = useMemo(
    () => p.clips.reduce((acc, c) => acc + (c.sourceEnd - c.sourceStart), 0),
    [p.clips],
  );

  const selectedDuration = useMemo(
    () => selectedClips.reduce((acc, c) => acc + (c.sourceEnd - c.sourceStart), 0),
    [selectedClips],
  );

  const rawMediaDuration = useMemo(
    () => inUse.reduce((acc, m) => acc + m.duration, 0),
    [inUse],
  );

  // Default to 'selected' if user has a clip selected, otherwise 'timeline' (what's on screen!)
  const [scope, setScope] = useState<'timeline' | 'selected' | 'all'>(
    hasSelected ? 'selected' : 'timeline',
  );
  const [targetMedia, setTargetMedia] = useState('all');

  const selectedClipName = useMemo(() => {
    if (!hasSelected) return '';
    const firstMedia = p.media.find((m) => m.id === selectedClips[0].mediaId);
    return firstMedia?.name ?? 'Selected clip';
  }, [hasSelected, p.media, selectedClips]);

  const replacing =
    p.transcripts.some((t) => targetMedia === 'all' || t.mediaId === targetMedia) ||
    p.clips.some((c) => (targetMedia === 'all' || c.mediaId === targetMedia) && c.captionWords !== undefined);

  return (
    <Modal title="Transcribe Speech to Subtitles" onClose={onClose}>
      <p className="modal-intro">
        Extract synchronized words for instant viral subtitles. Processing runs locally on your device.
      </p>

      {/* Quick Option: Non-Speech / Instrumental */}
      <div
        className="no-speech-selector-box"
        style={{
          margin: '0.5rem 0 0.85rem 0',
          padding: '8px 12px',
          borderRadius: '8px',
          background: p.settings.noSpeech ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255, 255, 255, 0.04)',
          border: p.settings.noSpeech ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <VolumeX size={17} style={{ color: p.settings.noSpeech ? '#fbbf24' : '#94a3b8', flexShrink: 0 }} />
          <div>
            <b style={{ fontSize: '12px', display: 'block', color: p.settings.noSpeech ? '#fbbf24' : '#f1f5f9' }}>
              Videoda metin / konuşma yok mu?
            </b>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Müzik, sessiz B-Roll veya montajlar için deşifreyi atla, görsel/tempo moduna geç.
            </span>
          </div>
        </div>
        <button
          type="button"
          className="secondary"
          style={{ whiteSpace: 'nowrap', fontSize: '11px', padding: '4px 9px', flexShrink: 0 }}
          onClick={() => {
            commit(
              {
                ...p,
                settings: {
                  ...p.settings,
                  noSpeech: true,
                },
              },
              'Set video as no-speech mode',
            );
            onClose();
          }}
        >
          {p.settings.noSpeech ? '✓ Metinsiz Mod Aktif' : '🔇 Deşifreyi Atla (Metin Yok)'}
        </button>
      </div>

      {/* Transcription Scope Selector */}
      <div className="section-heading" style={{ marginTop: '0.25rem', marginBottom: '0.5rem' }}>
        <Film size={15} />
        <b>Transcription Scope (Deşifre Kapsamı)</b>
      </div>

      <div className="transcription-scope-grid">
        {/* Option 1: Selected Clip Only (if selected) */}
        {hasSelected && (
          <button
            type="button"
            className={`scope-card ${scope === 'selected' ? 'active' : ''}`}
            onClick={() => setScope('selected')}
          >
            <div className="scope-card-top">
              <span className="scope-icon-wrap">
                <Scissors size={15} />
              </span>
              <span className="scope-badge fast">Super Fast</span>
            </div>
            <b className="scope-title">Selected Clip Only</b>
            <span className="scope-desc">
              Only transcribe “{selectedClipName}” ({timecode(selectedDuration)})
            </span>
          </button>
        )}

        {/* Option 2: Visible Timeline Clips Only (What's on screen) */}
        <button
          type="button"
          className={`scope-card ${scope === 'timeline' ? 'active' : ''}`}
          onClick={() => setScope('timeline')}
        >
          <div className="scope-card-top">
            <span className="scope-icon-wrap">
              <Film size={15} />
            </span>
            <span className="scope-badge rec">Recommended</span>
          </div>
          <b className="scope-title">Visible Timeline Clips</b>
          <span className="scope-desc">
            Only what's on screen ({timecode(timelineDuration)} total · skips trimmed footage)
          </span>
        </button>

        {/* Option 3: Entire Raw Media File */}
        <button
          type="button"
          className={`scope-card ${scope === 'all' ? 'active' : ''}`}
          onClick={() => setScope('all')}
        >
          <div className="scope-card-top">
            <span className="scope-icon-wrap">
              <Layers size={15} />
            </span>
            <span className="scope-badge">Full Video</span>
          </div>
          <b className="scope-title">Entire Raw Source</b>
          <span className="scope-desc">
            Transcribe all uncut footage ({timecode(rawMediaDuration)})
          </span>
        </button>
      </div>

      {scope === 'all' && inUse.length > 1 && (
        <Field label="Target File">
          <select value={targetMedia} onChange={(e) => setTargetMedia(e.target.value)}>
            <option value="all">All media files in project</option>
            {inUse.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({timecode(m.duration)})
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="property-divider" style={{ margin: '1rem 0' }} />

      <Field label="Spoken language">
        <select
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value);
            if (!qualityChosen && resolveQuality(p.settings.transcriptionQuality) === 'balanced')
              setQuality(recommendedQuality(e.target.value));
          }}
        >
          {languages.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </Field>

      <div className="transcription-models" role="group" aria-label="Transcription quality">
        {Object.entries(transcriptionModels).map(([key, model]) => (
          <button
            key={key}
            type="button"
            className={quality === key ? 'selected' : ''}
            aria-pressed={quality === key}
            onClick={() => {
              setQuality(key as TranscriptionQuality);
              setQualityChosen(true);
            }}
          >
            <div>
              <b>{model.label}</b>
              <span>{model.name}</span>
              {quality === key && <Check size={15} />}
            </div>
            <p>{model.description}</p>
            {key === recommendedQuality(language) && (
              <small>
                Recommended for{' '}
                {language === 'Auto Detect' ? 'automatic language detection' : language}
              </small>
            )}
          </button>
        ))}
      </div>

      <Field label="Speech processing device">
        <select value={device} onChange={(e) => setDevice(e.target.value as 'auto' | 'cpu')}>
          <option value="auto">Auto · hardware acceleration when available</option>
          <option value="cpu">CPU · compatibility mode</option>
        </select>
      </Field>

      {replacing && (
        <p className="warning" style={{ fontSize: '11px', marginTop: '0.5rem' }}>
          This will refresh the transcript for the selected footage. You can undo this edit at any time.
        </p>
      )}

      <div className="modal-footer">
        <span>
          <ShieldCheck size={14} />
          Speech stays 100% on this device.
        </span>
        <button
          className="primary"
          disabled={!inUse.length}
          onClick={() => {
            commit(
              {
                ...p,
                settings: {
                  ...p.settings,
                  language,
                  transcriptionQuality: quality,
                  transcriptionDevice: device,
                },
              },
              'Transcription settings',
            );
            onStart({
              scope,
              mediaId: targetMedia === 'all' ? undefined : targetMedia,
              clipIds: scope === 'selected' ? selected : undefined,
            });
          }}
        >
          <MessageSquareText size={15} />
          Start Transcription
        </button>
      </div>
    </Modal>
  );
}
