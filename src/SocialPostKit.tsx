import { useState, useMemo } from 'react';
import { useEditor } from './store';
import {
  Share2,
  Copy,
  Check,
  Sparkles,
  Hash,
  MessageSquare,
  Smartphone,
  Flame,
  Lightbulb,
  Briefcase,
  Video,
  Smile,
  RefreshCw,
} from 'lucide-react';
import { timelineWords } from './model';

type Platform = 'tiktok' | 'instagram' | 'shorts';

interface PlatformMeta {
  name: string;
  maxChars: number;
  badge: string;
  tip: string;
}

const PLATFORMS: Record<Platform, PlatformMeta> = {
  tiktok: {
    name: 'TikTok',
    maxChars: 2200,
    badge: 'TikTok SEO',
    tip: 'Keep captions concise, front-load keywords, and use 3-5 high-relevance hashtags.',
  },
  instagram: {
    name: 'Instagram Reels',
    maxChars: 2200,
    badge: 'Reels Reach',
    tip: 'Add a strong hook in line 1, call to action in the body, and 5-10 targeted tags.',
  },
  shorts: {
    name: 'YouTube Shorts',
    maxChars: 100, // title limit
    badge: 'Shorts Title',
    tip: 'Title must be under 100 characters. Put extra details and tags in the description.',
  },
};

const VIRAL_HOOK_PATTERNS = [
  'Wait until you see how this ends… 😱',
  'Stop doing this if you want results 🛑',
  'Nobody talks about this simple trick 🤫',
  'POV: You finally figured it out ✨',
  '3 secrets most people don’t know 💡',
  'Save this video before you forget! 📌',
  'The biggest mistake you are making ❌',
  'Why did nobody tell me this earlier?! 🤯',
  'I tested this for 30 days and… 👀',
  'Here is the exact step-by-step breakdown 👇',
];

const HASHTAG_CATEGORIES = [
  {
    name: 'Trending',
    icon: Flame,
    tags: ['#viral', '#fyp', '#trending', '#foryou', '#reels', '#explore'],
  },
  {
    name: 'Hacks & Tips',
    icon: Lightbulb,
    tags: ['#lifehack', '#protips', '#howto', '#didyouknow', '#productivity', '#learning'],
  },
  {
    name: 'Creator & Biz',
    icon: Briefcase,
    tags: ['#contentcreator', '#entrepreneur', '#marketing', '#socialmediamanager', '#growth'],
  },
  {
    name: 'Editing & Video',
    icon: Video,
    tags: ['#videoediting', '#behindthescenes', '#capcut', '#aesthetic', '#videography'],
  },
  {
    name: 'Fun & Relatable',
    icon: Smile,
    tags: ['#relatable', '#funny', '#pov', '#humor', '#meme'],
  },
];

export function SocialPostKit() {
  const p = useEditor((s) => s.project);

  const [platform, setPlatform] = useState<Platform>('tiktok');
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedHook, setCopiedHook] = useState(false);
  const [hookSeed, setHookSeed] = useState(0);

  // Derive initial title / topic from project name or transcript keywords
  const transcriptKeywords = useMemo(() => {
    const words = timelineWords(p);
    if (!words.length) return [];
    // Filter common stopwords and pick top long words
    const common = new Set(['the', 'and', 'that', 'this', 'with', 'from', 'have', 'were', 'what']);
    const freqs: Record<string, number> = {};
    for (const w of words) {
      const clean = w.text.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (clean.length > 3 && !common.has(clean)) {
        freqs[clean] = (freqs[clean] || 0) + 1;
      }
    }
    return Object.entries(freqs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([w]) => w);
  }, [p]);

  // Dynamic hook suggestions
  const hookSuggestions = useMemo(() => {
    const baseHooks = [...VIRAL_HOOK_PATTERNS];
    // Rotate with seed
    const rotated = baseHooks.slice(hookSeed % baseHooks.length).concat(baseHooks.slice(0, hookSeed % baseHooks.length));
    
    // If project has a specific name or keywords, customize first suggestion
    const projName = p.name && p.name !== 'Untitled' ? p.name : '';
    if (projName) {
      rotated.unshift(`Everything you need to know about ${projName} 👇`);
    } else if (transcriptKeywords.length > 0) {
      const topWord = transcriptKeywords[0];
      rotated.unshift(`The real truth about ${topWord} nobody tells you 🤫`);
    }
    return rotated.slice(0, 5);
  }, [hookSeed, p.name, transcriptKeywords]);

  const [selectedHook, setSelectedHook] = useState(hookSuggestions[0] || VIRAL_HOOK_PATTERNS[0]);
  const [captionBody, setCaptionBody] = useState(
    'Drop a comment if you found this helpful! Don’t forget to save & share with a friend who needs this. 🔥'
  );
  const [hashtags, setHashtags] = useState<string[]>(['#viral', '#fyp', '#trending', '#contentcreator']);

  const currentMeta = PLATFORMS[platform];

  // Full formatted post
  const fullPostText = useMemo(() => {
    if (platform === 'shorts') {
      // Shorts title format: Hook + 2-3 hashtags
      const shortTags = hashtags.slice(0, 3).join(' ');
      return `${selectedHook} ${shortTags}`.trim();
    }
    const tagsString = hashtags.join(' ');
    return `${selectedHook}\n\n${captionBody}\n\n${tagsString}`.trim();
  }, [platform, selectedHook, captionBody, hashtags]);

  const charCount = fullPostText.length;
  const isOverLimit = charCount > currentMeta.maxChars;

  const handleAddHashtag = (tag: string) => {
    if (hashtags.includes(tag)) {
      setHashtags(hashtags.filter((t) => t !== tag));
    } else {
      setHashtags([...hashtags, tag]);
    }
  };

  const handleCopyAll = async () => {
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(fullPostText);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {}
  };

  const handleCopyHook = async () => {
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(selectedHook);
      setCopiedHook(true);
      setTimeout(() => setCopiedHook(false), 2000);
    } catch {}
  };

  const handleAddCTA = () => {
    const cta = '\n\n👉 Follow for daily creator tips & updates! Which part surprised you the most? Let me know below! 👇';
    if (!captionBody.includes('Follow for daily')) {
      setCaptionBody((prev) => (prev.trim() + cta).trim());
    }
  };

  return (
    <div className="social-post-kit-panel properties-content">
      <div className="section-heading">
        <Share2 size={16} />
        <b>Social Post & Metadata Kit</b>
      </div>
      <p className="panel-subtext">
        Generate viral hooks, captions, and trending hashtags ready to copy-paste directly into your uploads.
      </p>

      {/* Target Platform Switcher */}
      <div className="platform-tab-row">
        {(Object.keys(PLATFORMS) as Platform[]).map((key) => {
          const m = PLATFORMS[key];
          const isSelected = platform === key;
          return (
            <button
              key={key}
              type="button"
              className={`platform-pill-btn ${isSelected ? 'active' : ''}`}
              onClick={() => setPlatform(key)}
            >
              <Smartphone size={13} />
              <span>{m.name}</span>
            </button>
          );
        })}
      </div>

      <div className="platform-tip-card">
        <span className="platform-badge">{currentMeta.badge}</span>
        <small>{currentMeta.tip}</small>
      </div>

      <div className="property-divider" />

      {/* Hook Headline Picker */}
      <div className="section-heading-with-action">
        <div className="section-heading" style={{ margin: 0 }}>
          <Sparkles size={16} />
          <b>Viral Hook Headline</b>
        </div>
        <button
          type="button"
          className="icon-subtle-btn"
          title="Shuffle hooks"
          onClick={() => setHookSeed((s) => s + 1)}
        >
          <RefreshCw size={13} />
          <span>Shuffle</span>
        </button>
      </div>

      <div className="hook-picker-list">
        {hookSuggestions.map((h) => {
          const isSelected = selectedHook === h;
          return (
            <button
              key={h}
              type="button"
              className={`hook-item-btn ${isSelected ? 'selected' : ''}`}
              onClick={() => setSelectedHook(h)}
            >
              <span className="hook-bullet">{isSelected ? '✓' : '•'}</span>
              <span className="hook-text">{h}</span>
            </button>
          );
        })}
      </div>

      {/* Editable Hook Input */}
      <div className="custom-hook-input-row">
        <input
          type="text"
          className="custom-hook-input"
          value={selectedHook}
          onChange={(e) => setSelectedHook(e.target.value)}
          placeholder="Custom hook or headline…"
        />
        <button
          type="button"
          className="copy-hook-btn secondary"
          onClick={handleCopyHook}
          title="Copy Hook Only"
        >
          {copiedHook ? <Check size={13} style={{ color: '#4ade80' }} /> : <Copy size={13} />}
        </button>
      </div>

      {platform !== 'shorts' && (
        <>
          <div className="property-divider" />

          {/* Caption Body */}
          <div className="section-heading-with-action">
            <div className="section-heading" style={{ margin: 0 }}>
              <MessageSquare size={16} />
              <b>Post Description / Body</b>
            </div>
            <button type="button" className="text-cta-btn" onClick={handleAddCTA}>
              + Add Viral CTA
            </button>
          </div>

          <textarea
            className="caption-textarea"
            rows={4}
            value={captionBody}
            onChange={(e) => setCaptionBody(e.target.value)}
            placeholder="Write your video description or story…"
          />
        </>
      )}

      <div className="property-divider" />

      {/* Trending Hashtags */}
      <div className="section-heading">
        <Hash size={16} />
        <b>Trending Hashtags</b>
        <span className="tag-count-badge">{hashtags.length} selected</span>
      </div>

      <div className="hashtags-container">
        {HASHTAG_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          return (
            <div key={cat.name} className="hashtag-cat-group">
              <div className="cat-header">
                <Icon size={12} />
                <span>{cat.name}</span>
              </div>
              <div className="hashtag-chips-flow">
                {cat.tags.map((tag) => {
                  const active = hashtags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`hashtag-chip ${active ? 'active' : ''}`}
                      onClick={() => handleAddHashtag(tag)}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="property-divider" />

      {/* Final Post Output & Character Counter */}
      <div className="final-post-preview">
        <div className="post-preview-header">
          <b>Ready-to-Post Output ({currentMeta.name})</b>
          <span className={`char-counter ${isOverLimit ? 'over-limit' : ''}`}>
            {charCount} / {currentMeta.maxChars} chars
          </span>
        </div>
        <pre className="post-preview-text">{fullPostText}</pre>
      </div>

      <button
        type="button"
        className={`primary full-width-btn ${copiedAll ? 'copied-success' : ''}`}
        onClick={handleCopyAll}
      >
        {copiedAll ? <Check size={16} /> : <Copy size={16} />}
        {copiedAll ? 'Copied to Clipboard!' : 'Copy Full Post & Hashtags'}
      </button>
    </div>
  );
}
