import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Layers, Trash2 } from 'lucide-react';
import { useEditor } from './store';
import { removeSequence, switchSequence } from './sequences';
import { Modal } from './components';

function SequenceName({ id, name }: { id: string; name: string }) {
  const [draft, setDraft] = useState(name);
  const cancelled = useRef(false);
  useEffect(() => setDraft(name), [name]);
  function save(override?: string) {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const clean = (override ?? draft).trim();
    if (!clean) {
      setDraft(name);
      return;
    }
    const { project, commit } = useEditor.getState();
    if (!project.sequences?.some((s) => s.id === id) || clean === name) return;
    commit(
      {
        ...project,
        sequences: project.sequences.map((s) => (s.id === id ? { ...s, name: clean } : s)),
      },
      'Rename sequence',
    );
    setDraft(clean);
  }
  return (
    <input
      aria-label="Rename sequence"
      value={draft}
      maxLength={80}
      title="Enter saves; Escape cancels this edit."
      onChange={(e) => {
        const val = e.target.value;
        setDraft(val);
        const clean = val.trim();
        if (clean && clean !== name) {
          const { project, commit } = useEditor.getState();
          if (project.sequences?.some((s) => s.id === id)) {
            commit(
              {
                ...project,
                sequences: project.sequences.map((s) => (s.id === id ? { ...s, name: clean } : s)),
              },
              'Rename sequence',
            );
          }
        }
      }}
      onBlur={() => save()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancelled.current = true;
          setDraft(name);
          e.currentTarget.blur();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          save();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function SequencePicker() {
  const {
    project: p,
    commit,
    seek,
    setPlaying,
    select,
    selectCaption,
  } = useEditor(
    useShallow((s) => ({
      project: s.project,
      commit: s.commit,
      seek: s.seek,
      setPlaying: s.setPlaying,
      select: s.select,
      selectCaption: s.selectCaption,
    })),
  );
  const [remove, setRemove] = useState(false), [error, setError] = useState('');
  if (!p.sequences?.length) return null;
  const current = p.sequences.find((s) => s.id === p.activeSequenceId)!;
  function reset() {
    setPlaying(false);
    seek(0);
    select([]);
    selectCaption(null);
  }
  return (
    <div className="sequence-picker">
      <Layers size={15} />
      <select
        aria-label="Current sequence"
        value={p.activeSequenceId}
        onChange={(e) => {
          const cur = useEditor.getState().project;
          commit(switchSequence(cur, e.target.value), 'Switch sequence');
          reset();
        }}
      >
        {p.sequences.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <SequenceName key={current.id} id={current.id} name={current.name} />
      <span>{p.sequences.length} sequences</span>
      <button
        className="icon"
        aria-label="Remove current sequence"
        disabled={p.sequences.length < 2}
        onClick={() => { setError(''); setRemove(true); }}
      >
        <Trash2 size={14} />
      </button>
      {remove && (
        <Modal title="Remove this sequence?" onClose={() => setRemove(false)}>
          <p className="modal-intro">
            “{current.name}” will be removed from this project. You can undo this edit.
          </p>
          {error && <p role="alert" className="tracking-error">{error}</p>}
          <div className="modal-footer">
            <button className="text-button" onClick={() => setRemove(false)}>
              Keep sequence
            </button>
            <button
              className="danger"
              onClick={() => {
                try {
                  commit(removeSequence(p, current.id), 'Remove sequence');
                  reset(); setRemove(false);
                } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove this sequence.'); }
              }}
            >
              Remove sequence
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
