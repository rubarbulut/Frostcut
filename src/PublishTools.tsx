import { useMemo, useState } from 'react';
import { useEditor, downloadBlob } from './store';
import { metadataDrafts, mediaCredits, type PublishingMetadata } from './publishing';
import { Field } from './components';
import { safeFilename } from './zip';
import { appendChapters, publishingChaptersStale } from './chapters';
export type PublishPlatform = 'youtube' | 'shorts' | 'instagram' | 'tiktok';
const platformNames = {
  youtube: 'YouTube',
  shorts: 'YouTube Shorts',
  instagram: 'Instagram Reels',
  tiktok: 'TikTok',
};
export function PublishTools({ platform = 'youtube' }: { platform?: PublishPlatform }) {
  const p = useEditor((s) => s.project);
  return <PublishingForm key={`${p.id}:${p.activeSequenceId ?? ''}`} platform={platform} />;
}
function PublishingForm({ platform }: { platform: PublishPlatform }) {
  const p = useEditor((s) => s.project);
  const commit = useEditor((s) => s.commit);
  const generated = useMemo(() => metadataDrafts(p), [p]);
  const draft: PublishingMetadata = p.publishing ?? {
    title: generated.titles[0] ?? '',
    description: generated.description,
    hashtags: generated.hashtags,
  };
  const setDraft = (next: PublishingMetadata) => {
    commit({ ...useEditor.getState().project, publishing: next }, 'Edit publishing draft');
  };
  const youtube = platform === 'youtube' || platform === 'shorts';
  const descriptionLimit = youtube ? 5000 : 2200;
  const descriptionChars = (
    youtube ? [draft.description, draft.hashtags] : [draft.title, draft.description, draft.hashtags]
  )
    .filter(Boolean)
    .join('\n\n').length;
  const descriptionTooLong = descriptionChars > descriptionLimit;
  const [status, setStatus] = useState('');
  const text = () => [draft.title, draft.description, draft.hashtags].filter(Boolean).join('\n\n');
  const credits = mediaCredits(p);
  const staleChapters = publishingChaptersStale(p, draft);
  return (
    <div className="creator-section">
      <p>
        {platformNames[platform]} · edits save with this sequence. Review the exported video before
        posting.
      </p>
      <details className="draft-suggestions">
        <summary>
          {p.transcripts.some((t) => t.words.length)
            ? 'Use a transcript excerpt'
            : 'Use the project name'}
        </summary>
        <div className="draft-titles">
          {generated.titles.map((title) => (
            <button className="secondary" key={title} onClick={() => setDraft({ ...draft, title })}>
              {title}
            </button>
          ))}
        </div>
      </details>
      <Field label={youtube ? 'YouTube title' : 'Opening line'}>
        <input
          maxLength={100}
          aria-label={youtube ? 'YouTube title' : 'Opening line'}
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </Field>
      <small>{draft.title.length}/100 characters</small>
      <Field label={youtube ? 'YouTube description' : 'Post description'}>
        <textarea
          rows={7}
          maxLength={5000}
          aria-label={youtube ? 'YouTube description' : 'Post description'}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </Field>
      <small role={descriptionTooLong ? 'alert' : undefined}>
        {descriptionChars}/{descriptionLimit} characters including hashtags
        {descriptionTooLong ? ' · shorten the draft for this platform' : ''}
      </small>
      <Field label="Hashtags">
        <input
          maxLength={1000}
          value={draft.hashtags}
          onChange={(e) => setDraft({ ...draft, hashtags: e.target.value })}
        />
      </Field>
      {p.chapters && (
        <button
          className="secondary"
          onClick={() => {
            try {
              setDraft(appendChapters(p, draft));
              setStatus(
                'Chapters updated and saved in the description. Review the timestamps before posting.',
              );
            } catch (e) {
              setStatus((e as Error).message);
            }
          }}
        >
          Append saved chapters to description
        </button>
      )}
      {staleChapters && (
        <p role="alert">
          The appended chapters changed or their timeline is outdated. Review/save the chapters and
          append them again before saving or exporting this description.
        </p>
      )}
      {draft.chapterAttachment && (
        <button
          className="text-button"
          onClick={() => {
            setDraft({ ...draft, chapterAttachment: undefined });
            setStatus(
              'Description kept as manual text. Chapter times will no longer be checked automatically.',
            );
          }}
        >
          Keep description as manual text
        </button>
      )}
      <div className="button-row">
        <button
          className="primary"
          disabled={staleChapters || descriptionTooLong || !p.clips.length || !draft.title.trim()}
          onClick={() => {
            commit({ ...p, publishing: draft }, 'Save publishing metadata');
            setStatus('Saved with this sequence.');
          }}
        >
          Save publishing draft
        </button>
        <button
          className="secondary"
          disabled={staleChapters || descriptionTooLong || !p.clips.length || !draft.title.trim()}
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
          disabled={staleChapters || descriptionTooLong || !p.clips.length || !draft.title.trim()}
          onClick={() =>
            downloadBlob(
              new Blob([text()], { type: 'text/plain;charset=utf-8' }),
              `${safeFilename(p.name)}-${platform}.txt`,
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
