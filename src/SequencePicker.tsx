import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Layers, Trash2 } from 'lucide-react';
import { useEditor } from './store';
import { removeSequence, switchSequence } from './sequences';
import { Modal } from './components';

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
  const [remove, setRemove] = useState(false);
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
          commit(switchSequence(p, e.target.value), 'Switch sequence');
          reset();
        }}
      >
        {p.sequences.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input
        aria-label="Rename sequence"
        value={current.name}
        maxLength={80}
        onChange={(e) => {
          if (!e.target.value.trim()) return;
          commit(
            {
              ...p,
              sequences: p.sequences!.map((s) =>
                s.id === current.id ? { ...s, name: e.target.value } : s,
              ),
            },
            'Rename sequence',
          );
        }}
      />
      <span>{p.sequences.length} sequences</span>
      <button
        className="icon"
        aria-label="Remove current sequence"
        disabled={p.sequences.length < 2}
        onClick={() => setRemove(true)}
      >
        <Trash2 size={14} />
      </button>
      {remove && (
        <Modal title="Remove this sequence?" onClose={() => setRemove(false)}>
          <p className="modal-intro">
            “{current.name}” will be removed from this project. You can undo this edit.
          </p>
          <div className="modal-footer">
            <button className="text-button" onClick={() => setRemove(false)}>
              Keep sequence
            </button>
            <button
              className="danger"
              onClick={() => {
                commit(removeSequence(p, current.id), 'Remove sequence');
                reset();
                setRemove(false);
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
