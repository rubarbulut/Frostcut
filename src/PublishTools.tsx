import { useState } from 'react';
import { useEditor, downloadBlob } from './store';
import { metadataDrafts, mediaCredits, type PublishingMetadata } from './publishing';
import { Field } from './components';
import { safeFilename } from './zip';
export function PublishTools() {
  const { project: p, commit } = useEditor();
  const generated = metadataDrafts(p);
  const [draft, setDraft] = useState<PublishingMetadata>(
    p.publishing ?? {
      title: generated.titles[0],
      description: generated.description,
      hashtags: generated.hashtags,
    },
  );
  const [status, setStatus] = useState('');
  const text = () => `${draft.title}\n\n${draft.description}\n\n${draft.hashtags}`;
  const credits = mediaCredits(p);
  return (
    <div className="creator-section">
      <p>
        Editable YouTube drafts drawn from your actual transcript. These are local text suggestions;
        review the title and description before publishing.
      </p>
      <b>Title suggestions</b>
      <div className="draft-titles">
        {generated.titles.map((title) => (
          <button className="secondary" key={title} onClick={() => setDraft({ ...draft, title })}>
            {title}
          </button>
        ))}
      </div>
      <Field label="YouTube title">
        <input
          maxLength={100}
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </Field>
      <Field label="YouTube description">
        <textarea
          rows={7}
          maxLength={5000}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </Field>
      <Field label="Hashtags">
        <input
          maxLength={1000}
          value={draft.hashtags}
          onChange={(e) => setDraft({ ...draft, hashtags: e.target.value })}
        />
      </Field>
      <div className="button-row">
        <button
          className="primary"
          onClick={() => {
            commit({ ...p, publishing: draft }, 'Save publishing metadata');
            setStatus('Saved with this sequence.');
          }}
        >
          Save publishing draft
        </button>
        <button
          className="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text());
              setStatus('Copied.');
            } catch {
              setStatus('Clipboard unavailable. Download the text instead.');
            }
          }}
        >
          Copy metadata
        </button>
        <button
          className="secondary"
          onClick={() =>
            downloadBlob(
              new Blob([text()], { type: 'text/plain;charset=utf-8' }),
              `${safeFilename(p.name)}-youtube.txt`,
            )
          }
        >
          Download metadata
        </button>
      </div>
      {credits && (
        <details>
          <summary>Footage attribution</summary>
          <pre className="wrap-text">{credits}</pre>
          <button
            className="text-button"
            onClick={() =>
              setDraft({
                ...draft,
                description: `${draft.description}\n\nFootage credits\n${credits}`.slice(0, 5000),
              })
            }
          >
            Append credits to description
          </button>
        </details>
      )}
      {status && <p role="status">{status}</p>}
    </div>
  );
}
