import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEditor } from './store';
import { duration, isLocked, timecode } from './model';
import {
  createEqualPartSequences,
  equalPartRanges,
  type PartOptions,
  type PartRange,
} from './equal-parts';
import { Field } from './components';

export function EqualParts({ onCreated }: { onCreated: () => void }) {
  const { project: p, commit } = useEditor(
    useShallow((s) => ({ project: s.project, commit: s.commit })),
  );
  const [mode, setMode] = useState<PartOptions['mode']>('count');
  const [count, setCount] = useState('3'),
    [seconds, setSeconds] = useState('60');
  const [format, setFormat] = useState<'current' | 'shorts'>('current');
  const [prefix, setPrefix] = useState('Part'),
    [error, setError] = useState('');
  const options: PartOptions = { mode, value: Number(mode === 'count' ? count : seconds) };
  let ranges: PartRange[] = [],
    problem = '';
  try {
    ranges = equalPartRanges(p, options);
  } catch (e) {
    problem = (e as Error).message;
  }
  if (p.clips.some((c) => isLocked(p, c)))
    problem = 'Unlock the timeline tracks before creating parts.';
  function create() {
    try {
      const next = createEqualPartSequences(useEditor.getState().project, options, format, prefix);
      commit(next, `Create ${ranges.length} sequential parts`);
      const s = useEditor.getState();
      s.setPlaying(false);
      s.seek(0);
      s.select([]);
      s.selectCaption(null);
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="equal-parts">
      <p className="modal-intro">
        Turn this {timecode(duration(p))} timeline into consecutive episodes. Your original edit,
        audio and captions stay available. No transcription needed.
      </p>
      <div className="number-grid">
        <Field label="Split method">
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as PartOptions['mode']);
              setError('');
            }}
          >
            <option value="count">Equal number of parts</option>
            <option value="seconds">Seconds per part</option>
          </select>
        </Field>
        {mode === 'count' ? (
          <Field label="Number of parts">
            <input
              type="number"
              min={2}
              max={29}
              step={1}
              value={count}
              onChange={(e) => {
                setCount(e.target.value);
                setError('');
              }}
            />
          </Field>
        ) : (
          <Field label="Seconds per part">
            <input
              type="number"
              min={1}
              step={1}
              value={seconds}
              onChange={(e) => {
                setSeconds(e.target.value);
                setError('');
              }}
            />
          </Field>
        )}
        <Field label="Part name prefix">
          <input maxLength={50} value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        </Field>
        <Field label="Part format">
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as 'current' | 'shorts')}
          >
            <option value="current">
              Keep current format ({p.settings.width} × {p.settings.height})
            </option>
            <option value="shorts">Vertical Shorts (1080 × 1920)</option>
          </select>
        </Field>
      </div>
      <p className="subtle">
        {mode === 'count'
          ? 'Parts are equal to the nearest video frame.'
          : 'The last part keeps the remaining footage and may be shorter.'}{' '}
        Cuts can fall mid-sentence. No footage is removed.
      </p>
      {ranges.length > 0 && (
        <div className="equal-parts-preview">
          <table>
            <thead>
              <tr>
                <th>Part</th>
                <th>Original timeline</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {ranges.map((r, i) => (
                <tr key={i}>
                  <td>
                    {prefix.trim() || 'Part'} {String(i + 1).padStart(2, '0')}
                  </td>
                  <td>
                    {timecode(r.start, true)} → {timecode(r.end, true)}
                  </td>
                  <td>{timecode(r.end - r.start, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(problem || error) && (
        <p className="caption-error" role="alert">
          {problem || error}
        </p>
      )}
      <div className="modal-footer">
        <span>Switch parts above the timeline. Export individually or in Batch export.</span>
        <button className="primary" disabled={!!problem || !ranges.length} onClick={create}>
          Create {ranges.length || ''} parts
        </button>
      </div>
    </section>
  );
}
