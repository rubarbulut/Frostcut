import { useEffect, useMemo, useRef, useState } from 'react';
import './brand-kits.css';
import { useEditor, downloadBlob } from './store';
import { Field, Range } from './components';
import { CaptionTextControls, NumberField } from './CaptionTextControls';
import { captionAppearance } from './caption-style';
import { captionTypography, captionDecoration } from './caption-typography';
import { type CaptionStyle } from './model';
import { safeFilename } from './zip';
import {
  BRAND_KITS_KEY,
  addBrandExample,
  applyBrandKit,
  createBrandKit,
  importBrandKit,
  learnedBrandStyle,
  readBrandKits,
  saveBrandKits,
  type BrandKit,
} from './brand-kits';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
function initialLibrary() {
  try {
    return { kits: readBrandKits(), error: '' };
  } catch (e) {
    return { kits: [] as BrandKit[], error: `Could not read saved brand kits: ${message(e)}` };
  }
}
export function BrandKitTools() {
  const [initial] = useState(initialLibrary);
  const [kits, setKits] = useState(initial.kits);
  const [error, setError] = useState(initial.error);
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [deleted, setDeleted] = useState<BrandKit>();
  const fileInput = useRef<HTMLInputElement>(null);
  const kit = kits.find((k) => k.id === selected) ?? kits[0];
  useEffect(() => {
    const reload = (e: StorageEvent) => {
      if (e.key !== BRAND_KITS_KEY && e.key !== null) return;
      const next = initialLibrary();
      setKits(next.kits);
      setError(next.error);
    };
    window.addEventListener('storage', reload);
    return () => window.removeEventListener('storage', reload);
  }, []);
  function mutate(change: (current: BrandKit[]) => BrandKit[]) {
    try {
      // Read first to preserve kits saved by another tab. Failed writes leave this view intact.
      const saved = saveBrandKits(change(readBrandKits()));
      setKits(saved);
      setError('');
      return true;
    } catch (e) {
      setStatus('');
      setError(message(e));
      return false;
    }
  }
  function update(change: (current: BrandKit) => BrandKit, notice = 'Brand kit saved locally.') {
    if (!kit) return;
    if (
      mutate((current) => {
        const target = current.find((k) => k.id === kit.id);
        if (!target)
          throw new Error('This kit was removed in another tab. Select a different kit.');
        return current.map((k) => (k.id === target.id ? change(k) : k));
      })
    )
      setStatus(notice);
  }
  return (
    <div className="creator-section">
      <p>
        Save your caption branding across projects. Learn a preferred style from examples you
        approve, then edit it and apply it to the current sequence. Everything stays in this
        browser.
      </p>
      <div className="brand-kit-create">
        <Field label="New brand kit name">
          <input
            value={name}
            maxLength={60}
            placeholder="My channel"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <button
          className="primary"
          disabled={!name.trim() || kits.length >= 20}
          onClick={() => {
            let created: BrandKit | undefined;
            if (
              mutate((current) => {
                created = createBrandKit(name, useEditor.getState().project);
                return [...current, created];
              })
            ) {
              setSelected(created!.id);
              setName('');
              setStatus('Created from the current sequence’s caption style.');
            }
          }}
        >
          Create from current style
        </button>
      </div>
      <div className="button-row">
        <button
          className="secondary"
          disabled={kits.length >= 20}
          onClick={() => fileInput.current?.click()}
        >
          Import kit
        </button>
        <small className="subtle">
          {kits.length}/20 kits · Export a kit to back it up or use it in another browser.
        </small>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        aria-label="Import brand kit"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            if (file.size > 100_000)
              throw new Error('Choose a brand kit JSON file smaller than 100 KB.');
            const content = await file.text();
            let imported: BrandKit | undefined;
            if (
              mutate((current) => {
                imported = importBrandKit(content, current);
                return [...current, imported];
              })
            ) {
              setSelected(imported!.id);
              setStatus('Imported as a new kit. Existing kits were preserved.');
            }
          } catch (e) {
            setStatus('');
            setError(message(e));
          }
        }}
      />
      {kit && (
        <>
          <Field label="Brand kit">
            <select
              value={kit.id}
              onChange={(e) => {
                setSelected(e.target.value);
                setStatus('');
              }}
            >
              {kits.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </Field>
          <BrandKitEditor key={kit.id} kit={kit} update={update} />
          <div className="button-row">
            <button
              className="primary"
              onClick={() => {
                const state = useEditor.getState();
                state.commit(applyBrandKit(state.project, kit), `Apply brand kit: ${kit.name}`);
                setStatus(
                  `Applied to the current sequence. Undo restores the previous style.${state.project.captions.enabled ? '' : ' Captions are currently off; enable them in the Captions panel to see this style.'}`,
                );
              }}
            >
              Apply to current sequence
            </button>
            <button
              className="secondary"
              onClick={() =>
                downloadBlob(
                  new Blob([JSON.stringify(kit, null, 2)], { type: 'application/json' }),
                  `${safeFilename(kit.name)}.frostcut-brand.json`,
                )
              }
            >
              Export kit
            </button>
            <button
              className="text-button"
              onClick={() => {
                let removed: BrandKit | undefined;
                if (
                  mutate((current) => {
                    removed = current.find((k) => k.id === kit.id);
                    return current.filter((k) => k.id !== kit.id);
                  })
                ) {
                  setDeleted(removed);
                  setStatus('Kit removed. Applied project styles are unchanged.');
                }
              }}
            >
              Delete kit
            </button>
          </div>
        </>
      )}
      {deleted && (
        <button
          className="secondary"
          onClick={() => {
            if (mutate((current) => [...current, deleted])) {
              setSelected(deleted.id);
              setDeleted(undefined);
              setStatus('Kit restored.');
            }
          }}
        >
          Restore deleted kit: {deleted.name}
        </button>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
    </div>
  );
}

function BrandKitEditor({
  kit,
  update,
}: {
  kit: BrandKit;
  update: (change: (kit: BrandKit) => BrandKit, notice?: string) => void;
}) {
  const p = useEditor((s) => s.project);
  const [name, setName] = useState(kit.name);
  useEffect(() => setName(kit.name), [kit.name]);
  const a = captionAppearance(kit.style);
  const learned = useMemo(() => learnedBrandStyle(kit), [kit]);
  const style = (patch: Partial<CaptionStyle>) =>
    update((k) => ({ ...k, style: { ...k.style, ...patch } }));
  const appearance = (patch: Partial<typeof a>) =>
    update((k) => ({
      ...k,
      style: { ...k.style, appearance: { ...captionAppearance(k.style), ...patch } },
    }));
  return (
    <>
      <div className="brand-kit-create">
        <Field label="Kit name">
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
        <button
          className="secondary"
          disabled={!name.trim() || name === kit.name}
          onClick={() => update((k) => ({ ...k, name }))}
        >
          Rename kit
        </button>
      </div>
      <div className="brand-kit-preview" aria-label="Brand kit text sample">
        <span
          style={{
            ...captionTypography(a),
            fontSize: `${a.size}cqw`,
            fontWeight: a.bold ? 700 : 400,
            color: a.color,
            textDecoration: captionDecoration(a),
            WebkitTextStroke: `${a.outline / 10.8}cqw ${a.outlineColor}`,
            paintOrder: 'stroke',
          }}
        >
          Your next <span style={{ color: a.accent }}>story</span> starts here.
        </span>
      </div>
      <details className="brand-kit-details">
        <summary>Edit kit style</summary>
        <CaptionTextControls
          appearance={a}
          width={p.settings.width}
          onChange={appearance}
          description="These edits stay in the kit until you apply it. Pixel sizes use the current sequence width; the saved style scales with each project."
        />
        <div className="number-grid">
          <Field label="Kit caption position">
            <select
              value={kit.style.position}
              onChange={(e) =>
                style({
                  position: e.target.value as CaptionStyle['position'],
                  customPosition: kit.style.customPosition ?? { x: 50, y: 80 },
                })
              }
            >
              <option value="bottom">Bottom</option>
              <option value="center">Center</option>
              <option value="top">Top</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
          <NumberField
            label="Kit words per caption"
            value={kit.style.wordsPerCaption}
            min={1}
            max={8}
            step={1}
            onChange={(words) => style({ wordsPerCaption: Math.round(words) })}
          />
          {kit.style.position === 'custom' &&
            (['x', 'y'] as const).map((axis) => (
              <NumberField
                key={axis}
                label={`Kit caption ${axis.toUpperCase()} (%)`}
                min={5}
                max={95}
                step={1}
                value={kit.style.customPosition?.[axis] ?? (axis === 'x' ? 50 : 80)}
                onChange={(v) =>
                  style({
                    customPosition: { x: 50, y: 80, ...kit.style.customPosition, [axis]: v },
                  })
                }
              />
            ))}
          <NumberField
            label="Kit outline width"
            value={a.outline}
            min={0}
            max={8}
            step={0.5}
            onChange={(outline) => appearance({ outline })}
          />
          <NumberField
            label="Kit caption margin (%)"
            value={a.margin}
            min={5}
            max={35}
            step={1}
            onChange={(margin) => appearance({ margin })}
          />
        </div>
        <Range
          label="Kit background opacity"
          value={a.boxOpacity ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(boxOpacity) => appearance({ boxOpacity })}
        />
        <Field label="Kit background color">
          <input
            type="color"
            value={a.boxColor ?? '#000000'}
            onChange={(e) => appearance({ boxColor: e.target.value })}
          />
        </Field>
        <small className="subtle">
          Animation and other saved style settings come from your approved example. Use the main
          caption controls to create a new example with those settings.
        </small>
      </details>
      <details className="brand-kit-details" open>
        <summary>Learn from approved examples ({kit.examples.length}/20)</summary>
        <p>
          The most common complete style wins; ties use the latest approved example. Adding an
          example does not change the kit or your project.
        </p>
        <button
          className="secondary"
          onClick={() =>
            update(
              (k) => addBrandExample(k, useEditor.getState().project),
              'Example approved. Re-approving the same sequence updates its existing example.',
            )
          }
        >
          Approve current sequence as example
        </button>
        {learned ? (
          <>
            <p>
              Suggested style matches {learned.labels.length} of {kit.examples.length} approved
              examples: {learned.labels.join(', ')}.
            </p>
            <button
              className="secondary"
              onClick={() =>
                update((k) => {
                  const suggestion = learnedBrandStyle(k);
                  if (!suggestion) throw new Error('Approve an example first.');
                  return { ...k, style: suggestion.style };
                }, 'Learned style copied into the kit. Apply it when ready.')
              }
            >
              Use learned style in kit
            </button>
          </>
        ) : (
          <p>Approve a sequence to make a style suggestion.</p>
        )}
        <ul className="brand-kit-examples">
          {kit.examples.map((example) => (
            <li key={example.key}>
              <span>{example.label}</span>
              <button
                className="text-button"
                aria-label={`Remove example: ${example.label}`}
                onClick={() =>
                  update((k) => ({
                    ...k,
                    examples: k.examples.filter((e) => e.key !== example.key),
                  }))
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
