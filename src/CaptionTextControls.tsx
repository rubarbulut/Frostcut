import { useEffect, useRef, useState } from 'react';
import { Field, Range } from './components';
import type { CaptionAppearance } from './model';

function NumberField({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(+value.toFixed(2)));
  const cancelled = useRef(false);
  useEffect(() => setDraft(String(+value.toFixed(2))), [value]);
  function apply() {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const n = Number(draft);
    if (!draft.trim() || !Number.isFinite(n)) {
      setDraft(String(+value.toFixed(2)));
      return;
    }
    const next = Math.min(max, Math.max(min, n));
    setDraft(String(+next.toFixed(2)));
    if (next !== +value.toFixed(2)) onChange(next);
  }
  return (
    <Field label={label}>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        title="Enter saves; Escape cancels this edit."
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancelled.current = true;
            setDraft(String(+value.toFixed(2)));
            e.currentTarget.blur();
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
    </Field>
  );
}

export function CaptionTextControls({
  appearance: a,
  width,
  onChange,
}: {
  appearance: CaptionAppearance;
  width: number;
  onChange: (patch: Partial<CaptionAppearance>) => void;
}) {
  return (
    <section className="caption-text-controls" aria-label="Subtitle text formatting">
      <div className="caption-section-title">Text editor</div>
      <small className="subtle">
        Applies to all captions in this sequence. Click a transcript time to edit the words. Number
        fields: Enter to save, Escape to cancel. Copy this style in Creator tools → Parts.
      </small>
      <div className="caption-type-grid">
        <Field label="Font family">
          <select
            value={a.fontFamily ?? 'sans'}
            onChange={(e) =>
              onChange({ fontFamily: e.target.value as CaptionAppearance['fontFamily'] })
            }
          >
            <option value="sans">Modern Sans</option>
            <option value="impact">Impact Heavy</option>
            <option value="serif">Cinematic Serif</option>
            <option value="mono">Cyber Monospace</option>
          </select>
        </Field>
        <NumberField
          label="Font size (px)"
          value={(a.size * width) / 100}
          min={width / 100}
          max={width / 5}
          step={1}
          onChange={(v) => onChange({ size: +((v * 100) / width).toFixed(3) })}
        />
      </div>
      <Range
        label="Caption size"
        value={a.size}
        min={1}
        max={20}
        step={0.1}
        suffix="%"
        onChange={(size) => onChange({ size })}
      />
      <div className="caption-format-toggles">
        {(['bold', 'italic', 'underline', 'strikethrough'] as const).map((key) => (
          <label className="check-row" key={key}>
            <input
              type="checkbox"
              checked={!!a[key]}
              onChange={(e) => onChange({ [key]: e.target.checked })}
            />
            {
              {
                bold: 'Bold text',
                italic: 'Italic',
                underline: 'Underline',
                strikethrough: 'Strikethrough',
              }[key]
            }
          </label>
        ))}
      </div>
      <Field label="Text alignment">
        <select
          value={a.align ?? 'center'}
          onChange={(e) => onChange({ align: e.target.value as CaptionAppearance['align'] })}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
          <option value="justify">Justify</option>
        </select>
      </Field>
      <div className="caption-type-grid">
        <NumberField
          label="Letter spacing (em)"
          value={a.letterSpacing ?? 0}
          min={-0.05}
          max={0.5}
          onChange={(letterSpacing) => onChange({ letterSpacing })}
        />
        <NumberField
          label="Word spacing (em)"
          value={a.wordSpacing ?? 0}
          min={-0.15}
          max={1}
          onChange={(wordSpacing) => onChange({ wordSpacing })}
        />
        <NumberField
          label="Line height"
          value={a.lineHeight ?? 1.22}
          min={0.8}
          max={3}
          step={0.05}
          onChange={(lineHeight) => onChange({ lineHeight })}
        />
      </div>
      <div className="caption-colors">
        <Field label="Text color">
          <input
            type="color"
            value={a.color}
            onChange={(e) => onChange({ color: e.target.value })}
          />
        </Field>
        <Field label="Accent color">
          <input
            type="color"
            value={a.accent}
            disabled={a.speakerColors}
            onChange={(e) => onChange({ accent: e.target.value })}
          />
        </Field>
        <Field label="Outline color">
          <input
            type="color"
            value={a.outlineColor}
            onChange={(e) => onChange({ outlineColor: e.target.value })}
          />
        </Field>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={a.speakerColors}
          onChange={(e) => onChange({ speakerColors: e.target.checked })}
        />
        Use speaker colors for accents
      </label>
    </section>
  );
}
