import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEditor, downloadBlob } from './store';
import { Field } from './components';
import {
  subtitleLanguages,
  sourceCues,
  subtitleFingerprint,
  translateCues,
  cuesSrt,
  type SubtitleLanguage,
  type SubtitleVariant,
} from './translations';
import { createSrt } from './subtitles';
import { zipFiles, safeFilename } from './zip';
export function CaptionLanguage() {
  const { project: p, commit } = useEditor(
    useShallow((s) => ({ project: s.project, commit: s.commit })),
  );
  const fingerprint = subtitleFingerprint(p);
  const stale =
    !!p.captions.language &&
    !p.subtitleVariants?.some(
      (v) => v.language === p.captions.language && v.sourceFingerprint === fingerprint,
    );
  if (!p.subtitleVariants?.length) return null;
  return (
    <div>
      <Field label="Caption language">
        <select
          value={p.captions.language ?? ''}
          onChange={(e) =>
            commit(
              {
                ...p,
                captions: {
                  ...p.captions,
                  language: (e.target.value || undefined) as SubtitleLanguage | undefined,
                },
              },
              'Change caption language',
            )
          }
        >
          <option value="">Original transcript</option>
          {p.subtitleVariants.map((v) => (
            <option
              key={v.language}
              value={v.language}
              disabled={v.sourceFingerprint !== fingerprint}
            >
              {subtitleLanguages[v.language]}
              {v.sourceFingerprint !== fingerprint ? ' · needs refresh' : ''}
            </option>
          ))}
        </select>
      </Field>
      {stale && (
        <p role="status">
          Translation needs refreshing after timeline changes. Showing the original transcript.
        </p>
      )}
    </div>
  );
}
export function SubtitleTools() {
  const { project: p, commit } = useEditor(
    useShallow((s) => ({ project: s.project, commit: s.commit })),
  );
  const languageName = p.transcripts[0]?.language ?? p.settings.language;
  const [source, setSource] = useState<SubtitleLanguage>(
    (Object.entries(subtitleLanguages).find(
      ([, name]) => name.toLowerCase() === languageName.toLowerCase(),
    )?.[0] ?? 'en') as SubtitleLanguage,
  );
  const [target, setTarget] = useState<SubtitleLanguage>('tr'),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState('');
  const [draft, setDraft] = useState<SubtitleVariant>();
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const cues = sourceCues(p),
    fingerprint = subtitleFingerprint(p);
  async function run() {
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError('');
    setDraft(undefined);
    try {
      const translated = await translateCues(cues, source, target, controller.signal, setStatus);
      setDraft({ language: target, sourceFingerprint: fingerprint, cues: translated });
      setStatus('Review and correct the translation before saving.');
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
      else setStatus('Cancelled. Your captions are unchanged.');
    } finally {
      setBusy(false);
    }
  }
  async function bundle() {
    setError('');
    try {
      const files = [
        {
          name: 'original.srt',
          blob: new Blob([createSrt({ ...p, captions: { ...p.captions, language: undefined } })]),
        },
        ...(p.subtitleVariants ?? [])
          .filter((v) => v.sourceFingerprint === fingerprint)
          .map((v) => ({ name: `${v.language}.srt`, blob: new Blob([cuesSrt(v.cues)]) })),
      ];
      downloadBlob(await zipFiles(files), `${safeFilename(p.name)}-subtitles.zip`);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="creator-section">
      <p>
        Translate the edited transcript locally. The first run downloads about 640 MB of model
        files; later runs use your browser cache. Your transcript stays on this device.
      </p>
      <div className="creator-grid">
        <Field label="Spoken language">
          <select
            value={source}
            disabled={busy}
            onChange={(e) => setSource(e.target.value as SubtitleLanguage)}
          >
            {Object.entries(subtitleLanguages).map(([code, name]) => (
              <option value={code} key={code}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Translate into">
          <select
            value={target}
            disabled={busy}
            onChange={(e) => setTarget(e.target.value as SubtitleLanguage)}
          >
            {Object.entries(subtitleLanguages).map(([code, name]) => (
              <option value={code} key={code}>
                {name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <button
        className="primary"
        disabled={busy || !cues.length || source === target}
        onClick={run}
      >
        Translate captions
      </button>
      {!cues.length && <p>Transcribe or import an SRT first.</p>}
      {busy && (
        <button className="secondary" onClick={() => abort.current?.abort()}>
          Cancel translation
        </button>
      )}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      {draft && (
        <>
          <p>
            Translated word timing is estimated within each original phrase. Review names, meaning
            and line length.
          </p>
          <div className="translation-cues">
            {draft.cues.map((cue, i) => (
              <Field
                key={i}
                label={`Cue ${i + 1} · ${cue.start.toFixed(2)}–${cue.end.toFixed(2)}s`}
              >
                <textarea
                  value={cue.text}
                  maxLength={2000}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      cues: draft.cues.map((c, j) =>
                        j === i ? { ...c, text: e.target.value } : c,
                      ),
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <button
            className="primary"
            disabled={
              draft.sourceFingerprint !== fingerprint || draft.cues.some((c) => !c.text.trim())
            }
            onClick={() => {
              commit(
                {
                  ...p,
                  subtitleVariants: [
                    ...(p.subtitleVariants ?? []).filter((v) => v.language !== draft.language),
                    draft,
                  ],
                  captions: { ...p.captions, language: draft.language },
                },
                'Save translated subtitles',
              );
              setDraft(undefined);
              setStatus(
                'Language saved and active in preview and MP4. The timeline transcript remains editable in its original language.',
              );
            }}
          >
            Save translation
          </button>
          {draft.sourceFingerprint !== fingerprint && (
            <p role="alert">The source captions changed. Translate again.</p>
          )}
        </>
      )}
      <CaptionLanguage />
      {(p.subtitleVariants ?? []).map((variant) => (
        <div className="button-row" key={variant.language}>
          <b>{subtitleLanguages[variant.language]}</b>
          {variant.sourceFingerprint !== fingerprint && <span>Needs refresh</span>}
          <button
            className="text-button"
            disabled={variant.sourceFingerprint !== fingerprint}
            onClick={() => setDraft(structuredClone(variant))}
          >
            Edit {variant.language}
          </button>
          <button
            className="text-button"
            disabled={variant.sourceFingerprint !== fingerprint}
            onClick={() =>
              downloadBlob(
                new Blob([cuesSrt(variant.cues)], { type: 'text/plain;charset=utf-8' }),
                `${safeFilename(p.name)}-${variant.language}.srt`,
              )
            }
          >
            Download {variant.language} SRT
          </button>
          <button
            className="text-button"
            onClick={() =>
              commit(
                {
                  ...p,
                  subtitleVariants: p.subtitleVariants!.filter((v) => v !== variant),
                  captions: {
                    ...p.captions,
                    language:
                      p.captions.language === variant.language ? undefined : p.captions.language,
                  },
                },
                'Delete translated subtitles',
              )
            }
          >
            Delete {variant.language}
          </button>
        </div>
      ))}
      <button className="secondary" disabled={!cues.length} onClick={bundle}>
        Download all current SRT languages (.zip)
      </button>
    </div>
  );
}
