import React, { useState } from 'react';
import { Share2, FileVideo } from 'lucide-react';
import { useEditor } from './store';
import { PublishTools, type PublishPlatform } from './PublishTools';
import type { Project } from './model';

const platforms: [PublishPlatform, string][] = [
  ['youtube', 'YouTube'],
  ['shorts', 'Shorts'],
  ['instagram', 'Reels'],
  ['tiktok', 'TikTok'],
];

export interface SocialPostKitProps {
  project?: Project;
  onCommit?: (nextProject: Project, message?: string) => void;
}

export function SocialPostKit(props: SocialPostKitProps = {}): React.ReactElement {
  const { project: propProject, onCommit: propCommit } = props;
  const storeProject = useEditor((s) => s.project);
  const p = propProject ?? (typeof window === 'undefined' ? useEditor.getState().project : storeProject);
  const [platform, setPlatform] = useState<PublishPlatform>('youtube');

  return (
    <div className="social-post-kit-panel properties-content">
      <div className="section-heading">
        <Share2 size={16} />
        <b>Yayın Taslağı (Publishing Draft)</b>
      </div>

      <div className="platform-tab-row" role="tablist" aria-label="Publishing platform">
        {platforms.map(([key, name]) => (
          <button
            key={key}
            role="tab"
            className={`platform-pill-btn ${key === platform ? 'active' : ''}`}
            aria-selected={key === platform}
            aria-pressed={key === platform}
            onClick={() => setPlatform(key)}
          >
            {name}
          </button>
        ))}
      </div>

      {!p.clips.length ? (
        <div className="publishing-empty" role="status">
          <FileVideo size={26} />
          <b>Önce kaydınızı ekleyin</b>
          <p>
            Başlık ve açıklama bu kurguya ait olacaktır. Başlamak için Medya panelinden bir video
            ekleyin.
          </p>
        </div>
      ) : (
        <>
          <details className="draft-notice">
            <summary>Manuel taslak · Paylaşmadan önce inceleyin</summary>
            <p>
              Platform sekmeleri bu kurgu sequence'inin kayıtlı taslağını ortak kullanır. Bu yerel
              öneriler trend araştırması veya SEO garantisi içermez (not-researched). Burada bağlı
              herhangi bir otomatik yayın hesabı bulunmamaktadır.
            </p>
          </details>
          <PublishTools platform={platform} project={p} onCommit={propCommit} />
        </>
      )}
    </div>
  );
}
