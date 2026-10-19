import { useState } from 'react';
import { Share2, FileVideo } from 'lucide-react';
import { useEditor } from './store';
import { PublishTools, type PublishPlatform } from './PublishTools';

const platforms: [PublishPlatform, string][] = [
  ['youtube', 'YouTube'],
  ['shorts', 'Shorts'],
  ['instagram', 'Reels'],
  ['tiktok', 'TikTok'],
];

export function SocialPostKit() {
  const p = useEditor((s) => s.project);
  const [platform, setPlatform] = useState<PublishPlatform>('youtube');
  return (
    <div className="social-post-kit-panel properties-content">
      <div className="section-heading">
        <Share2 size={16} />
        <b>Publishing draft</b>
      </div>
      <div className="platform-tab-row" aria-label="Publishing platform">
        {platforms.map(([key, name]) => (
          <button
            key={key}
            className={`platform-pill-btn ${key === platform ? 'active' : ''}`}
            aria-pressed={key === platform}
            onClick={() => setPlatform(key)}
          >
            {name}
          </button>
        ))}
      </div>
      {!p.clips.length ? (
        <div className="publishing-empty">
          <FileVideo size={26} />
          <b>Add your recording first</b>
          <p>
            Your title and description will belong to this edit. Import a video in Media to get
            started.
          </p>
        </div>
      ) : (
        <>
          <details className="draft-notice">
            <summary>Manual draft · review before posting</summary>
            <p>
              Platform tabs share this sequence’s saved draft. These local suggestions include no
              trend research. No publishing account is connected here.
            </p>
          </details>
          <PublishTools platform={platform} />
        </>
      )}
    </div>
  );
}
