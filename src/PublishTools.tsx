import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, downloadBlob } from './store';
import { metadataDrafts, mediaCredits, type PublishingMetadata } from './publishing';
import { Field } from './components';
import { safeFilename } from './zip';
import { appendChapters, publishingChaptersStale } from './chapters';
import type { Project } from './model';

export type PublishPlatform = 'youtube' | 'shorts' | 'instagram' | 'tiktok';

const platformNames: Record<PublishPlatform, string> = {
  youtube: 'YouTube',
  shorts: 'YouTube Shorts',
  instagram: 'Instagram Reels',
  tiktok: 'TikTok',
};

export interface PublishToolsProps {
  platform?: PublishPlatform;
  project?: Project;
  onCommit?: (nextProject: Project, message?: string) => void;
}

export function PublishTools({
  platform = 'youtube',
  project: propProject,
  onCommit: propCommit,
}: PublishToolsProps) {
  const storeProject = useEditor((s) => s.project);
  const p = propProject ?? (typeof window === 'undefined' ? useEditor.getState().project : storeProject);

  return (
    <PublishingForm
      key={`${p.id}:${p.activeSequenceId ?? ''}`}
      platform={platform}
      project={p}
      onCommit={propCommit}
    />
  );
}

function PublishingForm({
  platform,
  project: propProject,
  onCommit: propCommit,
}: {
  platform: PublishPlatform;
  project?: Project;
  onCommit?: (nextProject: Project, message?: string) => void;
}) {
  const storeProject = useEditor((s) => s.project);
  const storeCommit = useEditor((s) => s.commit);

  const p = propProject ?? (typeof window === 'undefined' ? useEditor.getState().project : storeProject);
  const commit = propCommit ?? storeCommit;

  const sequenceKey = `${p.id}:${p.activeSequenceId ?? ''}`;
  const activeSeqRef = useRef(sequenceKey);
  activeSeqRef.current = sequenceKey;

  const generated = useMemo(() => metadataDrafts(p), [p]);

  const savedDraft: PublishingMetadata = useMemo(() => {
    return (
      p.publishing ?? {
        title: generated.titles[0] ?? '',
        description: generated.description,
        hashtags: generated.hashtags,
      }
    );
  }, [p.publishing, generated]);

  // Local draft buffer to eliminate per-keystroke store thrashing & undo history bloat
  const [draft, setLocalDraft] = useState<PublishingMetadata>(savedDraft);
  const [status, setStatus] = useState('');

  // Keep local draft in sync if external project/publishing changes
  useEffect(() => {
    setLocalDraft(savedDraft);
  }, [savedDraft]);

  // Safe commit helper: verifies current sequence has not changed during transit
  const commitDraft = useCallback(
    (nextDraft: PublishingMetadata, message = 'Edit publishing draft') => {
      const currentP = propProject ?? useEditor.getState().project;
      const currentKey = `${currentP.id}:${currentP.activeSequenceId ?? ''}`;
      // Guard against race condition: never write to an outdated sequence
      if (currentKey !== activeSeqRef.current) return;

      commit({ ...currentP, publishing: nextDraft }, message);
    },
    [commit, propProject],
  );

  // Debounced background sync (600ms) with sequence-race protection
  useEffect(() => {
    // Only commit if local draft actually differs from what is in store
    const isDirty =
      draft.title !== (p.publishing?.title ?? '') ||
      draft.description !== (p.publishing?.description ?? '') ||
      draft.hashtags !== (p.publishing?.hashtags ?? '');

    if (!isDirty) return;

    const timer = setTimeout(() => {
      if (activeSeqRef.current === sequenceKey) {
        commitDraft(draft, 'Auto-save publishing draft');
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [draft, sequenceKey, commitDraft, p.publishing]);

  // Flush on blur
  const handleBlur = () => {
    commitDraft(draft, 'Edit publishing draft');
  };

  const youtube = platform === 'youtube' || platform === 'shorts';
  const descriptionLimit = youtube ? 5000 : 2200;
  const descriptionChars = (
    youtube ? [draft.description, draft.hashtags] : [draft.title, draft.description, draft.hashtags]
  )
    .filter(Boolean)
    .join('\n\n').length;

  const descriptionTooLong = descriptionChars > descriptionLimit;
  const titleEmpty = !draft.title.trim();
  const text = () => [draft.title, draft.description, draft.hashtags].filter(Boolean).join('\n\n');
  const credits = mediaCredits(p);
  const staleChapters = publishingChaptersStale(p, draft);

  return (
    <div className="creator-section">
      <p>
        {platformNames[platform]} · Taslak bu sequence ile kaydedilir. Paylaşmadan önce dışa aktarılan
        videoyu inceleyin.
      </p>

      {/* Draft Suggestions Notice */}
      <details className="draft-suggestions">
        <summary>
          {p.transcripts.some((t) => t.words.length)
            ? 'Yerel taslak önerileri (Trend araştırması yapılmadı · not-researched)'
            : 'Proje adı taslak önerileri (Trend araştırması yapılmadı · not-researched)'}
        </summary>
        <div className="draft-titles">
          {generated.titles.map((title) => (
            <button
              className="secondary"
              key={title}
              onClick={() => {
                const next = { ...draft, title };
                setLocalDraft(next);
                commitDraft(next, 'Select suggested title');
              }}
            >
              {title}
            </button>
          ))}
        </div>
      </details>

      {/* Title Field */}
      <Field label={youtube ? 'YouTube Başlığı (Title)' : 'Açılış Cümlesi / Başlık'}>
        <input
          maxLength={100}
          aria-label={youtube ? 'YouTube Başlığı (Title)' : 'Açılış Cümlesi / Başlık'}
          value={draft.title}
          onChange={(e) => setLocalDraft({ ...draft, title: e.target.value })}
          onBlur={handleBlur}
          placeholder="Video başlığını girin..."
        />
      </Field>
      <div className="field-meta-row">
        <small>{draft.title.length}/100 karakter</small>
        {titleEmpty && <small className="text-danger">Başlık boş bırakılamaz.</small>}
      </div>

      {/* Description Field */}
      <Field label={youtube ? 'YouTube Açıklaması (Description)' : 'Gönderi Açıklaması'}>
        <textarea
          rows={7}
          maxLength={5000}
          aria-label={youtube ? 'YouTube Açıklaması (Description)' : 'Gönderi Açıklaması'}
          value={draft.description}
          onChange={(e) => setLocalDraft({ ...draft, description: e.target.value })}
          onBlur={handleBlur}
          placeholder="Açıklama ve detaylar..."
        />
      </Field>
      <small role={descriptionTooLong ? 'alert' : undefined} className={descriptionTooLong ? 'text-danger' : ''}>
        {descriptionChars}/{descriptionLimit} karakter (hashtag'ler dahil)
        {descriptionTooLong ? ' · bu platform için metni kısaltın' : ''}
      </small>

      {/* Hashtags Field (Decoupled from YouTube tags) */}
      <Field label="Hashtags (başlık ve açıklamada listelenecek etiketler)">
        <input
          maxLength={1000}
          value={draft.hashtags}
          onChange={(e) => setLocalDraft({ ...draft, hashtags: e.target.value })}
          onBlur={handleBlur}
          placeholder="#oyun #video #rehber"
        />
      </Field>
      <small className="field-hint">
        Hashtag'ler doğrudan video metninde listelenir; YouTube tags alanı ile karıştırılmaz.
      </small>

      {/* Chapter Append Button */}
      {p.chapters && (
        <button
          className="secondary"
          onClick={() => {
            try {
              const updated = appendChapters(p, draft);
              setLocalDraft(updated);
              commitDraft(updated, 'Append chapters to description');
              setStatus(
                'Bölümler güncellendi ve açıklamaya eklendi. Paylaşmadan önce zaman damgalarını inceleyin.',
              );
            } catch (e) {
              setStatus((e as Error).message);
            }
          }}
        >
          Kayıtlı bölümleri açıklamaya ekle
        </button>
      )}

      {/* Stale Chapters Warning */}
      {staleChapters && (
        <p role="alert" className="text-danger">
          Eklenen bölümler değişti veya zaman çizelgesi güncel değil. Açıklamayı kaydetmeden önce bölümleri
          yeniden kaydedin veya güncelleyin.
        </p>
      )}

      {draft.chapterAttachment && (
        <button
          className="text-button"
          onClick={() => {
            const updated = { ...draft, chapterAttachment: undefined };
            setLocalDraft(updated);
            commitDraft(updated, 'Keep description as manual text');
            setStatus(
              'Açıklama manuel metin olarak korundu. Bölüm saatleri artık otomatik denetlenmeyecek.',
            );
          }}
        >
          Açıklamayı manuel metin olarak sakla
        </button>
      )}

      {/* Action Buttons */}
      <div className="button-row">
        <button
          className="primary"
          disabled={staleChapters || descriptionTooLong || !p.clips.length || titleEmpty}
          onClick={() => {
            commitDraft(draft, 'Save publishing metadata');
            setStatus('Taslak bu sequence için kaydedildi.');
          }}
        >
          Taslağı Kaydet
        </button>
        <button
          className="secondary"
          disabled={staleChapters || descriptionTooLong || !p.clips.length || titleEmpty}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text());
              setStatus('Kopyalandı.');
            } catch {
              setStatus('Pano kullanılamıyor. Metni indirmeyi deneyin.');
            }
          }}
        >
          Metni Kopyala
        </button>
        <button
          className="secondary"
          disabled={staleChapters || descriptionTooLong || !p.clips.length || titleEmpty}
          onClick={() =>
            downloadBlob(
              new Blob([text()], { type: 'text/plain;charset=utf-8' }),
              `${safeFilename(p.name)}-${platform}.txt`,
            )
          }
        >
          Metni İndir
        </button>
      </div>

      {/* Footage Attribution Details */}
      {credits && (
        <details>
          <summary>Kullanılan medya atıfları (Footage attribution)</summary>
          <pre className="wrap-text">{credits}</pre>
          <button
            className="text-button"
            onClick={() => {
              const updated = {
                ...draft,
                description: `${draft.description}\n\nFootage credits\n${credits}`.slice(0, 5000),
              };
              setLocalDraft(updated);
              commitDraft(updated, 'Append credits to description');
            }}
          >
            Atıfları açıklamaya ekle
          </button>
        </details>
      )}

      {status && <p role="status">{status}</p>}
    </div>
  );
}
