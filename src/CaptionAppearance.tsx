import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Field, Range } from './components';
import { useEditor } from './store';
import {
  uid,
  type CaptionAppearance as Appearance,
  type CaptionStyle,
  type CaptionAnimation,
  type CaptionFont,
} from './model';
import { captionAppearance } from './caption-style';

export const CAPTION_PALETTES = [
  {
    id: 'frost-glacier',
    name: 'Glacier',
    icon: '🧊',
    color: '#ffffff',
    accent: '#38bdf8',
    outlineColor: '#0a141e',
    outline: 3,
    boxColor: '#08131d',
    boxOpacity: 0.65,
    animation: 'glow' as const,
  },
  {
    id: 'tiktok-viral',
    name: 'TikTok',
    icon: '⚡',
    color: '#ffffff',
    accent: '#facc15',
    outlineColor: '#000000',
    outline: 4,
    boxColor: '#000000',
    boxOpacity: 0.5,
    animation: 'pop' as const,
  },
  {
    id: 'neon-cyber',
    name: 'Cyber',
    icon: '🔮',
    color: '#38bdf8',
    accent: '#f43f5e',
    outlineColor: '#1e1b4b',
    outline: 3,
    boxColor: '#0f172a',
    boxOpacity: 0.7,
    animation: 'bounce' as const,
  },
  {
    id: 'warm-amber',
    name: 'Amber',
    icon: '🔥',
    color: '#fffbeb',
    accent: '#f59e0b',
    outlineColor: '#291804',
    outline: 3,
    boxColor: '#1a1005',
    boxOpacity: 0.6,
    animation: 'pop' as const,
  },
  {
    id: 'gothic-blood',
    name: 'Gothic',
    icon: '🦇',
    color: '#f8fafc',
    accent: '#ef4444',
    outlineColor: '#09090b',
    outline: 3.5,
    boxColor: '#140507',
    boxOpacity: 0.75,
    animation: 'bounce' as const,
  },
  {
    id: 'emerald-mint',
    name: 'Emerald',
    icon: '🌿',
    color: '#ffffff',
    accent: '#34d399',
    outlineColor: '#022c22',
    outline: 3,
    boxColor: '#031a14',
    boxOpacity: 0.65,
    animation: 'glow' as const,
  },
] as const;

export const CAPTION_ANIMATIONS = [
  { id: 'pop', label: 'Pop', desc: 'Punchy' },
  { id: 'bounce', label: 'Bounce', desc: 'Leap' },
  { id: 'glow', label: 'Glow', desc: 'Glacial' },
  { id: 'typewriter', label: 'Typewriter', desc: 'Snap' },
  { id: 'karaoke', label: 'Karaoke', desc: 'Fill' },
  { id: 'none', label: 'Static', desc: 'None' },
] as const;

export const CAPTION_FONTS = [
  { id: 'sans', name: 'Modern Sans', desc: 'Clean & versatile' },
  { id: 'impact', name: 'Impact Heavy', desc: 'Viral TikTok style' },
  { id: 'serif', name: 'Cinematic Serif', desc: 'Gothic & elegant' },
  { id: 'mono', name: 'Cyber Monospace', desc: 'Tech & terminal' },
] as const;

export function CaptionAppearance() {
  const { project: p, commit } = useEditor(useShallow((s) => ({ project: s.project, commit: s.commit }))),
    a = captionAppearance(p.captions);
  const [name, setName] = useState(''),
    [error, setError] = useState('');

  function change(patch: Partial<Appearance>) {
    commit(
      { ...p, captions: { ...p.captions, appearance: { ...a, ...patch } } },
      'Customize caption style',
    );
  }

  function applyPalette(palette: (typeof CAPTION_PALETTES)[number]) {
    commit(
      {
        ...p,
        captions: {
          ...p.captions,
          appearance: {
            ...a,
            color: palette.color,
            accent: palette.accent,
            outlineColor: palette.outlineColor,
            outline: palette.outline,
            boxColor: palette.boxColor,
            boxOpacity: palette.boxOpacity,
            animation: palette.animation,
          },
        },
      },
      `Apply palette: ${palette.name}`,
    );
  }

  function save() {
    const clean = name.trim(),
      saved = p.captions.savedStyles ?? [];
    if (!clean) return setError('Give this style a name.');
    if (saved.some((s) => s.name.toLowerCase() === clean.toLowerCase()))
      return setError('Choose a different style name.');
    if (saved.length >= 20) return setError('Remove a saved style before adding another.');
    const { preset, intensity, wordsPerCaption, position, customPosition, emoji } = p.captions;
    const style: CaptionStyle = {
      preset,
      intensity,
      wordsPerCaption,
      position,
      customPosition,
      emoji,
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

      {/* 1-Click Aesthetic Color Palettes */}
      <div className="caption-section-title">Color Palettes</div>
      <div className="caption-palettes-grid">
        {CAPTION_PALETTES.map((pal) => (
          <button
            key={pal.id}
            type="button"
            className="caption-palette-chip"
            onClick={() => applyPalette(pal)}
            title={`Apply ${pal.name} Palette`}
          >
            <span className="palette-chip-icon">{pal.icon}</span>
            <div className="palette-swatch-duo">
              <span className="swatch" style={{ background: pal.color }} />
              <span className="swatch" style={{ background: pal.accent }} />
            </div>
            <span className="palette-chip-name">{pal.name}</span>
          </button>
        ))}
      </div>

      {/* Subtitle Word Animation Selector */}
      <div className="caption-section-title">Word Animation</div>
      <div className="caption-animations-selector">
        {CAPTION_ANIMATIONS.map((anim) => {
          const isSelected = (a.animation ?? 'pop') === anim.id;
          return (
            <button
              key={anim.id}
              type="button"
              className={`caption-anim-btn ${isSelected ? 'active' : ''}`}
              onClick={() => change({ animation: anim.id as CaptionAnimation })}
              title={anim.desc}
            >
              <b>{anim.label}</b>
              <small>{anim.desc}</small>
            </button>
          );
        })}
      </div>

      {/* Typography / Font Style */}
      <div className="caption-section-title">Typography</div>
      <div className="caption-fonts-grid">
        {CAPTION_FONTS.map((font) => {
          const isSelected = (a.fontFamily ?? 'sans') === font.id;
          return (
            <button
              key={font.id}
              type="button"
              className={`caption-font-btn ${isSelected ? 'active' : ''}`}
              onClick={() => change({ fontFamily: font.id as CaptionFont })}
              title={font.desc}
            >
              <b>{font.name}</b>
              <small>{font.desc}</small>
            </button>
          );
        })}
      </div>

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

      {/* Colors */}
      <div className="caption-section-title">Colors & Contrast</div>
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

      {/* Background Box Customization */}
      <div className="caption-section-title">Background Box</div>
      <div className="caption-colors">
        <Field label="Box color">
          <input
            type="color"
            value={a.boxColor ?? '#000000'}
            onChange={(e) => change({ boxColor: e.target.value })}
          />
        </Field>
      </div>

      <Range
        label="Box opacity"
        value={Math.round((a.boxOpacity ?? 0) * 100)}
        min={0}
        max={100}
        step={5}
        suffix="%"
        onChange={(val) => change({ boxOpacity: val / 100 })}
      />

      {(a.boxOpacity ?? 0) > 0 && (
        <>
          <Range
            label="Corner radius"
            value={a.boxRadius ?? 8}
            min={0}
            max={24}
            step={2}
            suffix="px"
            onChange={(boxRadius) => change({ boxRadius })}
          />
          <Range
            label="Box padding"
            value={a.boxPadding ?? 4}
            min={0}
            max={16}
            step={2}
            suffix="px"
            onChange={(boxPadding) => change({ boxPadding })}
          />
        </>
      )}

      <label className="check-row">
        <input
          type="checkbox"
          checked={a.shadow ?? true}
          onChange={(e) => change({ shadow: e.target.checked })}
        />
        Drop shadow for contrast
      </label>

      {['top', 'bottom'].includes(p.captions.position) && (
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
