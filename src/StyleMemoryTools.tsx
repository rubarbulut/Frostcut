import { useRef, useState } from 'react';
import type { CutOptions } from './ai';
import { useEditor, downloadBlob } from './store';
import { brandStyle } from './brand-kits';
import { captionAppearance } from './caption-style';
import { captionFontFamily } from './caption-typography';
import {
  memoryFormat,
  mergeStyleMemory,
  rememberedCaptionStyle,
  rememberedCutOptions,
} from './style-memory';
import { rememberAcceptedEdit, useStyleMemory } from './style-memory-store';
import './style-memory.css';

function cutSummary(o: CutOptions) {
  return `${o.count || 'Auto'} clips · ${o.length ? `${o.length}s target` : 'Auto length'} · ${o.pacing} pacing · sensitivity ${o.sensitivity} · ${o.reorder ? 'reorder allowed' : 'original order'} · ${o.composite ? 'combined edit' : 'separate moments'}`;
}
export function StyleMemoryCutSuggestion({
  options,
  onApply,
}: {
  options: CutOptions;
  onApply: (options: CutOptions) => void;
}) {
  const state = useStyleMemory(),
    p = useEditor((s) => s.project);
  const suggestion = rememberedCutOptions(state.memory, p, options.goal);
  return (
    <aside className="style-memory-card" aria-label="Remembered Auto Cut choices">
      <b>Style memory</b>
      {state.error && <p role="alert">{state.error}</p>}
      {suggestion && !suggestion.dismissed ? (
        <>
          <p>{cutSummary(suggestion.value)}</p>
          <small>
            Matches {suggestion.examples.length} of {suggestion.total} accepted project/sequence
            choices for {options.goal.toLowerCase()} in {memoryFormat(p)} video.
          </small>
          <div className="button-row">
            <button
              className="secondary"
              disabled={(Object.keys(suggestion.value) as (keyof CutOptions)[]).every(
                (key) => options[key] === suggestion.value[key],
              )}
              onClick={() => onApply(suggestion.value)}
            >
              Use remembered choices
            </button>
            <button
              className="text-button"
              onClick={() =>
                state.change((m) => ({
                  ...m,
                  dismissed: [...new Set([...m.dismissed, suggestion.id])].slice(-100),
                }))
              }
            >
              Dismiss remembered choices
            </button>
          </div>
        </>
      ) : (
        <p className="subtle">
          {suggestion?.dismissed
            ? 'This suggestion is dismissed. Manage suggestions in Creator tools → Style memory.'
            : state.memory.enabled
              ? 'Accept matching Auto Cut choices in at least two projects/sequences to get a suggestion for this format and goal.'
              : 'Enable learning in Creator tools → Style memory to remember accepted edits.'}
        </p>
      )}
      {!state.memory.enabled && state.memory.examples.length > 0 && (
        <small>Learning is off. Existing preferences are kept until you forget them.</small>
      )}
    </aside>
  );
}

export function StyleMemoryTools() {
  const state = useStyleMemory(),
    p = useEditor((s) => s.project);
  const [status, setStatus] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const caption = rememberedCaptionStyle(state.memory, p);
  const a = caption && captionAppearance(caption.value);
  const active = state.memory.examples.filter((e) => e.state === 'accepted').length;
  return (
    <div className="creator-section">
      <p>
        Remember accepted Auto Cut choices and approved caption styles in this browser.
        Recommendations are based on your own edits and show their supporting examples. Nothing is
        applied automatically.
      </p>
      <label className="check-row">
        <input
          type="checkbox"
          checked={state.memory.enabled}
          disabled={state.unreadable}
          onChange={(e) => {
            if (state.change((m) => ({ ...m, enabled: e.target.checked })))
              setStatus(
                e.target.checked
                  ? 'Learning enabled for future accepted edits.'
                  : 'Learning stopped. Existing preferences are retained.',
              );
          }}
        />
        Learn from accepted edits
      </label>
      <small className="subtle">
        Undo removes an edit’s vote; Redo restores it. Ordinary manual edits are not recorded
        automatically. No video analysis or model download is needed.
      </small>
      {state.error && (
        <div role="alert">
          <p>{state.error}</p>
          {!state.unreadable && (
            <button
              className="secondary"
              onClick={() => {
                if (state.retry()) setStatus('Memory saved locally.');
              }}
            >
              Retry saving memory
            </button>
          )}
        </div>
      )}
      <div className="button-row">
        <button
          className="secondary"
          disabled={!state.memory.enabled || state.unreadable}
          onClick={() => {
            const current = useEditor.getState().project;
            const id = rememberAcceptedEdit(current, current, undefined, true);
            if (id)
              setStatus(
                useStyleMemory.getState().error
                  ? 'Style approved for this session; local saving needs attention.'
                  : 'Current caption style approved as a memory example.',
              );
          }}
        >
          Approve current caption style
        </button>
        <button
          className="secondary"
          disabled={!state.memory.examples.length}
          onClick={() =>
            downloadBlob(
              new Blob([JSON.stringify(state.memory, null, 2)], { type: 'application/json' }),
              'frostcut-style-memory.json',
            )
          }
        >
          Export memory
        </button>
        <button
          className="secondary"
          disabled={state.unreadable}
          onClick={() => file.current?.click()}
        >
          Import memory
        </button>
      </div>
      <input
        ref={file}
        hidden
        type="file"
        accept=".json,application/json"
        aria-label="Import style memory"
        onChange={async (e) => {
          const chosen = e.target.files?.[0];
          e.target.value = '';
          if (!chosen) return;
          if (chosen.size > 1_000_000)
            return setStatus('Choose a style memory JSON file smaller than 1 MB.');
          try {
            const text = await chosen.text();
            if (state.change((m) => mergeStyleMemory(m, text)))
              setStatus('Memory merged. Your learning switch was preserved.');
          } catch (error) {
            setStatus((error as Error).message);
          }
        }}
      />
      {caption && !caption.dismissed && a ? (
        <section className="style-memory-card" aria-label="Remembered caption style">
          <b>Suggested caption style for {memoryFormat(p)} video</b>
          <p
            style={{
              fontFamily: captionFontFamily(a.fontFamily),
              color: a.color,
              fontWeight: a.bold ? 700 : 400,
              fontStyle: a.italic ? 'italic' : 'normal',
            }}
          >
            Your next story
          </p>
          <p>
            {a.fontFamily} · {a.size}% size · {caption.value.position} placement ·{' '}
            {caption.value.wordsPerCaption} words per caption
          </p>
          <small>
            Matches {caption.examples.length} of {caption.total} active project/sequence choices:{' '}
            {[...new Set(caption.examples.map((e) => e.projectName))].join(', ')}.
          </small>
          <div className="button-row">
            <button
              className="primary"
              onClick={() => {
                const editor = useEditor.getState();
                editor.commit(
                  {
                    ...editor.project,
                    captions: { ...editor.project.captions, ...brandStyle(caption.value) },
                  },
                  'Apply remembered caption style',
                );
                setStatus(
                  'Caption style applied to this sequence. Undo restores its previous style.',
                );
              }}
            >
              Apply remembered caption style
            </button>
            <button
              className="text-button"
              onClick={() =>
                state.change((m) => ({
                  ...m,
                  dismissed: [...new Set([...m.dismissed, caption.id])].slice(-100),
                }))
              }
            >
              Dismiss caption suggestion
            </button>
          </div>
        </section>
      ) : (
        <p className="subtle">
          {caption?.dismissed
            ? 'The caption suggestion is dismissed.'
            : 'Approve matching caption styles in two projects/sequences of this video format to get a caption suggestion.'}
        </p>
      )}
      <p>
        <b>{active}</b> active observations · {state.memory.examples.length - active} undone · up to
        100 recent observations. Repeated approvals in one project/sequence count as one vote for
        each preference.
      </p>
      <details>
        <summary>Review stored observations</summary>
        <ul className="style-memory-examples">
          {[...state.memory.examples].reverse().map((e) => (
            <li key={e.id}>
              <div>
                <b>{e.projectName}</b>
                <small>
                  {new Date(e.date).toLocaleString()} · {e.format} · {e.state}
                </small>
                {e.options && (
                  <p>
                    {e.options.goal}: {cutSummary(e.options)}
                  </p>
                )}
                {e.style && (
                  <small>
                    Caption style: {e.style.appearance?.fontFamily} · {e.style.appearance?.size}% ·{' '}
                    {e.style.position}
                  </small>
                )}
              </div>
              <button
                className="text-button"
                aria-label={`Forget observation from ${e.projectName}`}
                onClick={() => {
                  if (
                    state.change((m) => ({
                      ...m,
                      examples: m.examples.filter((item) => item.id !== e.id),
                    }))
                  )
                    setStatus('Observation forgotten. Undo/Redo will not recreate it.');
                }}
              >
                Forget
              </button>
            </li>
          ))}
        </ul>
        {!state.memory.examples.length && <p>No observations stored.</p>}
      </details>
      <div className="button-row">
        <button
          className="secondary"
          disabled={!state.memory.dismissed.length}
          onClick={() => {
            if (state.change((m) => ({ ...m, dismissed: [] })))
              setStatus('Dismissed suggestions are visible again.');
          }}
        >
          Show dismissed suggestions
        </button>
        <button
          className="text-button"
          onClick={() => {
            if (state.reset()) setStatus('Memory forgotten and learning turned off.');
          }}
        >
          Forget memory and turn learning off
        </button>
      </div>
      <small className="subtle">
        Stores settings, project names/identifiers and decision dates. It does not store media,
        transcript text or prompts. Export a backup before resetting memory or clearing browser
        data.
      </small>
      {status && <p role="status">{status}</p>}
    </div>
  );
}
