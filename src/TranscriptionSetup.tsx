import { useState } from 'react';
import { MessageSquareText, Check, ShieldCheck } from 'lucide-react';
import { Modal, Field } from './components';
import { useEditor } from './store';
import { languages } from './model';
import {
  resolveQuality,
  transcriptionModels,
  type TranscriptionQuality,
} from './transcription-config';
export default function TranscriptionSetup({
  onClose,
  onStart,
}: {
  onClose: () => void;
  onStart: (mediaId?: string) => void;
}) {
  const { project: p, selected, commit } = useEditor();
  const [language, setLanguage] = useState(p.settings.language),
    [quality, setQuality] = useState<TranscriptionQuality>(
      resolveQuality(p.settings.transcriptionQuality),
    );
  const inUse = p.media.filter((m) => p.clips.some((c) => c.mediaId === m.id));
  const [target, setTarget] = useState(
    p.clips.find((c) => selected.includes(c.id))?.mediaId ??
      (inUse.length === 1 ? inUse[0].id : 'all'),
  );
  const replacing =
    p.transcripts.some((t) => target === 'all' || t.mediaId === target) ||
    p.clips.some((c) => (target === 'all' || c.mediaId === target) && c.captionWords !== undefined);
  return (
    <Modal title="Give every word a better start." onClose={onClose}>
      <p className="modal-intro">
        Choose the spoken language and the model that fits your footage. Processing stays on this
        device.
      </p>
      <Field label="Footage">
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="all">All footage in this project</option>
          {inUse.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Spoken language">
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          {languages.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </Field>
      <div className="transcription-models" role="group" aria-label="Transcription quality">
        {Object.entries(transcriptionModels).map(([key, model]) => (
          <button
            key={key}
            className={quality === key ? 'selected' : ''}
            aria-pressed={quality === key}
            onClick={() => setQuality(key as TranscriptionQuality)}
          >
            <div>
              <b>{model.label}</b>
              <span>{model.name}</span>
              {quality === key && <Check size={15} />}
            </div>
            <p>{model.description}</p>
          </button>
        ))}
      </div>
      <p className="transcription-tip">
        For Turkish or mixed accents, selecting the spoken language can help. Detailed uses a larger
        download and can take considerably longer on the CPU.
      </p>
      {replacing && (
        <p className="warning">
          This replaces the existing transcript and caption corrections for the selected footage.
          The current version stays in place until processing succeeds. You can undo the
          replacement.
        </p>
      )}
      <div className="modal-footer">
        <span>
          <ShieldCheck size={14} />
          Models download on first use.
        </span>
        <button
          className="primary"
          disabled={!inUse.length}
          onClick={() => {
            commit(
              { ...p, settings: { ...p.settings, language, transcriptionQuality: quality } },
              'Transcription settings',
            );
            onStart(target === 'all' ? undefined : target);
          }}
        >
          <MessageSquareText size={15} />
          {replacing ? 'Retranscribe' : 'Start transcription'}
        </button>
      </div>
    </Modal>
  );
}
