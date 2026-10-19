import { useEditor } from './store';
import { changeAspectRatio, type AspectRatio, type AspectFillMode } from './model';
import { Smartphone, Monitor, Square, Layers, Sparkles, ShieldAlert } from 'lucide-react';

interface FormatOption {
  ratio: AspectRatio;
  label: string;
  sub: string;
  dims: string;
  icon: typeof Smartphone;
  recommendedFor: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    ratio: '9:16',
    label: 'TikTok / Reels / Shorts',
    sub: 'Vertical Video',
    dims: '1080 × 1920',
    icon: Smartphone,
    recommendedFor: 'TikTok, Instagram Reels, YouTube Shorts',
  },
  {
    ratio: '1:1',
    label: 'Square Post',
    sub: 'Feed & Carousel',
    dims: '1080 × 1080',
    icon: Square,
    recommendedFor: 'Instagram Feed, Facebook, LinkedIn',
  },
  {
    ratio: '16:9',
    label: 'YouTube Landscape',
    sub: 'Standard Widescreen',
    dims: '1920 × 1080',
    icon: Monitor,
    recommendedFor: 'YouTube, Web, TV',
  },
  {
    ratio: '4:5',
    label: 'Portrait Feed',
    sub: 'Instagram Portrait',
    dims: '1080 × 1350',
    icon: Smartphone,
    recommendedFor: 'Instagram Feed, Facebook Posts',
  },
];

export function SocialFormatPanel() {
  const p = useEditor((s) => s.project);
  const commit = useEditor((s) => s.commit);

  const currentRatio: AspectRatio = p.settings.aspectRatio || (
    p.settings.width > p.settings.height
      ? '16:9'
      : p.settings.width === p.settings.height
        ? '1:1'
        : p.settings.height === 1350
          ? '4:5'
          : '9:16'
  );

  const currentFillMode: AspectFillMode = p.settings.fillMode || 'blur-background';

  const handleSelectRatio = (ratio: AspectRatio) => {
    const next = changeAspectRatio(p, ratio, currentFillMode);
    commit(next, `Switch aspect ratio to ${ratio}`);
  };

  const handleSelectFillMode = (fillMode: AspectFillMode) => {
    const next = changeAspectRatio(p, currentRatio, fillMode);
    commit(next, `Change fill mode to ${fillMode}`);
  };

  const handleToggleSafeArea = (enabled: boolean) => {
    const next = structuredClone(p);
    next.captions.safeArea = enabled;
    commit(next, 'Toggle social safe area');
  };

  return (
    <div className="social-format-panel properties-content">
      <div className="section-heading">
        <Smartphone size={16} />
        <b>Canvas & Aspect Ratio</b>
      </div>
      <p className="panel-subtext">
        Instantly adapt your video for any social media platform with automatic canvas reformatting.
      </p>

      {/* Format Selector Grid */}
      <div className="social-format-grid">
        {FORMAT_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = currentRatio === opt.ratio;
          return (
            <button
              key={opt.ratio}
              type="button"
              className={`social-format-card ${isSelected ? 'active' : ''}`}
              onClick={() => handleSelectRatio(opt.ratio)}
            >
              <div className="format-card-top">
                <Icon size={18} />
                <span className="format-ratio-badge">{opt.ratio}</span>
              </div>
              <div className="format-card-title">{opt.label}</div>
              <div className="format-card-dims">{opt.dims}</div>
              <div className="format-card-rec">{opt.recommendedFor}</div>
            </button>
          );
        })}
      </div>

      <div className="property-divider" />

      {/* Background Fill Mode */}
      <div className="section-heading">
        <Layers size={16} />
        <b>Background Fill (Reframe)</b>
      </div>
      <p className="panel-subtext">
        Choose how non-matching video dimensions are styled inside the canvas:
      </p>

      <div className="fill-mode-selector">
        <button
          type="button"
          className={`fill-chip ${currentFillMode === 'blur-background' ? 'selected' : ''}`}
          onClick={() => handleSelectFillMode('blur-background')}
        >
          <Sparkles size={14} />
          <div>
            <b>Blur Backdrop</b>
            <small>Trendy blurred video behind</small>
          </div>
        </button>
        <button
          type="button"
          className={`fill-chip ${currentFillMode === 'fit' ? 'selected' : ''}`}
          onClick={() => handleSelectFillMode('fit')}
        >
          <Square size={14} />
          <div>
            <b>Fit (Black Bars)</b>
            <small>Preserve whole frame</small>
          </div>
        </button>
        <button
          type="button"
          className={`fill-chip ${currentFillMode === 'crop' ? 'selected' : ''}`}
          onClick={() => handleSelectFillMode('crop')}
        >
          <Smartphone size={14} />
          <div>
            <b>Zoom & Fill</b>
            <small>Crop edges to fill canvas</small>
          </div>
        </button>
      </div>

      <div className="property-divider" />

      {/* Safe Area Guides */}
      <div className="section-heading">
        <ShieldAlert size={16} />
        <b>Social Media Safe Zones</b>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={!!p.captions.safeArea}
          onChange={(e) => handleToggleSafeArea(e.target.checked)}
        />
        <span>Show TikTok & Reels UI Overlay Margins</span>
      </label>
      <small className="subtle">
        Keeps captions and text out of the way of likes, comments, and profile avatars.
      </small>
    </div>
  );
}
