import { useState } from 'react';
import { Field, Range } from './components';
import { useEditor } from './store';
import { uid, type CaptionAppearance as Appearance, type CaptionStyle } from './model';
import { captionAppearance } from './caption-style';

export function CaptionAppearance() {
  const { project: p, commit } = useEditor(),
    a = captionAppearance(p.captions);
  const [name, setName] = useState(''),
    [error, setError] = useState('');
  function change(patch: Partial<Appearance>) {
    commit(
      { ...p, captions: { ...p.captions, appearance: { ...a, ...patch } } },
      'Customize caption style',
    );
  }
  function save() {
    const clean = name.trim(),
      saved = p.captions.savedStyles ?? [];
    if (!clean) return setError('Give this style a name.');
    if (saved.some((s) => s.name.toLowerCase() === clean.toLowerCase()))
      return setError('Choose a different style name.');
    if (saved.length >= 20) return setError('Remove a saved style before adding another.');
    const { preset, intensity, wordsPerCaption, position } = p.captions;
    const style: CaptionStyle = {
      preset,
      intensity,
      wordsPerCaption,
      position,
      appearance: { ...a },
    };
    commit(
      {
        ...p,
        captions: { ...p.captions, savedStyles: [...saved, { id: uid(), name: clean, style }] },
      },
      'Save caption preset',
    );
    setName('');
    setError('');
  }
  return (
    <details className="caption-customization">
      <summary>Customize & save style</summary>
      <Range
        label="Caption size"
        value={a.size}
        min={3}
        max={10}
        step={0.1}
        suffix="%"
        onChange={(size) => change({ size })}
      />
      <label className="check-row">
        <input
          type="checkbox"
          checked={a.bold}
          onChange={(e) => change({ bold: e.target.checked })}
        />
        Bold text
      </label>
      <div className="caption-colors">
        <Field label="Text color">
          <input type="color" value={a.color} onChange={(e) => change({ color: e.target.value })} />
        </Field>
        <Field label="Accent color">
          <input
            type="color"
            value={a.accent}
            disabled={a.speakerColors}
            onChange={(e) => change({ accent: e.target.value })}
          />
        </Field>
        <Field label="Outline color">
          <input
            type="color"
            value={a.outlineColor}
            onChange={(e) => change({ outlineColor: e.target.value })}
          />
        </Field>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={a.speakerColors}
          onChange={(e) => change({ speakerColors: e.target.checked })}
        />
        Use speaker colors for accents
      </label>
      <Range
        label="Outline width"
        value={a.outline}
        min={0}
        max={8}
        step={0.5}
        onChange={(outline) => change({ outline })}
      />
      {p.captions.position !== 'center' && (
        <Range
          label="Vertical margin"
          value={a.margin}
          min={5}
          max={35}
          suffix="%"
          onChange={(margin) => change({ margin })}
        />
      )}
      <button
        className="text-button"
        onClick={() =>
          commit(
            { ...p, captions: { ...p.captions, appearance: undefined } },
            'Reset caption appearance',
          )
        }
      >
        Reset appearance
      </button>
      <div className="save-caption-style">
        <input
          aria-label="New caption style name"
          placeholder="Name this style"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="primary small" onClick={save}>
          Save style
        </button>
      </div>
      {error && (
        <p className="caption-error" role="alert">
          {error}
        </p>
      )}
      {(p.captions.savedStyles ?? []).map((saved) => (
        <div className="saved-caption-style" key={saved.id}>
          <button
            className="text-button"
            onClick={() =>
              commit(
                { ...p, captions: { ...p.captions, ...structuredClone(saved.style) } },
                `Apply caption style: ${saved.name}`,
              )
            }
          >
            {saved.name}
          </button>
          <button
            className="text-button"
            aria-label={`Delete style ${saved.name}`}
            onClick={() =>
              commit(
                {
                  ...p,
                  captions: {
                    ...p.captions,
                    savedStyles: p.captions.savedStyles!.filter((s) => s.id !== saved.id),
                  },
                },
                'Delete saved caption style',
              )
            }
          >
            ×
          </button>
        </div>
      ))}
      <small className="subtle">
        Saved with this project. Appearance is included in MP4 export.
      </small>
    </details>
  );
}
