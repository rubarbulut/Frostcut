import { useMemo, useState } from 'react';
import { Field } from './components';
import { useEditor } from './store';
import { sequenceViews } from './sequences';
import { copyCaptionStyle, partNamePreview, renameParts } from './sequence-tools';

export function SequenceTools() {
  const p = useEditor((s) => s.project);
  const commit = useEditor((s) => s.commit);
  const parts = useMemo(() => sequenceViews(p), [p]);
  const [selected, setSelected] = useState(() => parts.slice(1).map((s) => s.id));
  const [prefix, setPrefix] = useState('Episode');
  const [start, setStart] = useState('1');
  const [digits, setDigits] = useState(2);
  const [source, setSource] = useState(p.activeSequenceId ?? '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const ids = useMemo(
    () => parts.filter((s) => selected.includes(s.id)).map((s) => s.id),
    [parts, selected],
  );
  const naming = { prefix, start: start.trim() ? Number(start) : NaN, digits };
  let preview: ReturnType<typeof partNamePreview> = [];
  let problem = '';
  try {
    preview = partNamePreview(p, ids, naming);
  } catch (e) {
    problem = (e as Error).message;
  }
  function apply(kind: 'names' | 'style') {
    try {
      const current = useEditor.getState().project;
      const next =
        kind === 'names'
          ? renameParts(current, ids, naming)
          : copyCaptionStyle(current, source, ids);
      const count = kind === 'names' ? ids.length : ids.filter((id) => id !== source).length;
      commit(
        next,
        kind === 'names' ? `Rename ${count} parts` : `Copy caption style to ${count} parts`,
      );
      setError('');
      setMessage(
        `${kind === 'names' ? 'Names updated' : 'Caption style copied'} for ${count} parts. Undo restores the previous settings.`,
      );
    } catch (e) {
      setError((e as Error).message);
      setMessage('');
    }
  }
  if (!parts.length) return <p>Create parts with Split or Auto Cut, then manage them here.</p>;
  return (
    <section className="creator-section part-tools">
      <p>Select the parts to rename or style. Changes can be undone together.</p>
      <div className="button-row">
        <button className="secondary" onClick={() => setSelected(parts.map((s) => s.id))}>
          Select all parts
        </button>
        <button className="secondary" onClick={() => setSelected(parts.slice(1).map((s) => s.id))}>
          Select after first
        </button>
        <button className="text-button" onClick={() => setSelected([])}>
          Clear selection
        </button>
      </div>
      <div className="batch-sequences part-selection" aria-label="Parts to change">
        {parts.map((s) => (
          <label key={s.id}>
            <input
              type="checkbox"
              checked={ids.includes(s.id)}
              onChange={(e) => {
                setSelected(e.target.checked ? [...ids, s.id] : ids.filter((id) => id !== s.id));
                setMessage('');
                setError('');
              }}
            />
            <span>
              {s.name}
              {s.id === p.activeSequenceId && <small>Current part</small>}
            </span>
          </label>
        ))}
      </div>
      <fieldset className="part-tool-box">
        <legend>Number & rename</legend>
        <div className="number-grid">
          <Field label="Series name / prefix">
            <input
              maxLength={75}
              value={prefix}
              placeholder="My series – Episode"
              onChange={(e) => {
                setPrefix(e.target.value);
                setMessage('');
              }}
            />
          </Field>
          <Field label="Start numbering at">
            <input
              type="number"
              min={0}
              max={9999}
              step={1}
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setMessage('');
              }}
            />
          </Field>
          <Field label="Number format">
            <select
              value={digits}
              onChange={(e) => {
                setDigits(Number(e.target.value));
                setMessage('');
              }}
            >
              <option value={1}>1, 2, 3</option>
              <option value={2}>01, 02, 03</option>
              <option value={3}>001, 002, 003</option>
              <option value={4}>0001, 0002, 0003</option>
            </select>
          </Field>
        </div>
        <p className="subtle">
          Numbering follows the sequence list, not the order you select parts.
        </p>
        {!!preview.length && (
          <div className="part-name-preview">
            <table>
              <thead>
                <tr>
                  <th>Current name</th>
                  <th>New name</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((item) => (
                  <tr key={item.id}>
                    <td>{item.previous}</td>
                    <td>{item.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {problem && <p className="subtle">{problem}</p>}
        <button className="primary" disabled={!!problem} onClick={() => apply('names')}>
          Rename {ids.length} parts
        </button>
      </fieldset>
      <fieldset className="part-tool-box">
        <legend>Copy subtitle style</legend>
        <Field label="Copy style from">
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setMessage('');
            }}
          >
            {parts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <p className="subtle">
          Copies font, colors, spacing, animation, layout and safe-area settings. Each part keeps
          its own subtitle text, language, timing and visibility. The source part is skipped.
        </p>
        <button
          className="primary"
          disabled={!parts.some((s) => s.id === source) || !ids.some((id) => id !== source)}
          onClick={() => apply('style')}
        >
          Apply style to {ids.filter((id) => id !== source).length} other parts
        </button>
      </fieldset>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
