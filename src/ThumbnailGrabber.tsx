import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditor, mediaUrls } from './store';
import { Camera, Download, Copy, Check, Sparkles, Image, Type } from 'lucide-react';
import { timecode } from './model';

const HOOK_PRESETS = [
  'WAIT TILL THE END 😱',
  'NOBODY TALKS ABOUT THIS 🤫',
  'POV: WHEN YOU FIND OUT…',
  'STOP SCROLLING 🚨',
  'PART 1 🎬',
  'THE SECRET TRICK 💡',
];

export function ThumbnailGrabber() {
  const p = useEditor((s) => s.project);
  const playhead = useEditor((s) => s.playhead);

  const [hookText, setHookText] = useState('WAIT TILL THE END 😱');
  const [showHook, setShowHook] = useState(true);
  const [badgeColor, setBadgeColor] = useState('#facc15'); // Yellow
  const [textColor, setTextColor] = useState('#000000');
  const [hookPos, setHookPos] = useState<'top' | 'center' | 'bottom'>('top');
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw current frame onto canvas with optional hook text
  const drawThumbnail = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = 1080;
    const h = p.settings.height && p.settings.width
      ? Math.round((1080 * p.settings.height) / p.settings.width)
      : 1920;

    canvas.width = w;
    canvas.height = h;

    // Draw background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    // Try finding the main preview video or first active clip video
    const previewVideo = document.querySelector('.preview-screen video') as HTMLVideoElement | null;
    if (previewVideo && previewVideo.videoWidth > 0) {
      try {
        ctx.drawImage(previewVideo, 0, 0, w, h);
      } catch {}
    } else {
      // Fallback placeholder pattern
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Frame at ${timecode(playhead)}`, w / 2, h / 2);
    }

    // Draw hook banner if enabled
    if (showHook && hookText.trim().length > 0) {
      ctx.save();
      const fontSize = Math.round(w * 0.055);
      ctx.font = `900 ${fontSize}px "Plus Jakarta Sans", Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const textMetrics = ctx.measureText(hookText);
      const textW = textMetrics.width;
      const padX = fontSize * 0.7;
      const padY = fontSize * 0.4;
      const boxW = textW + padX * 2;
      const boxH = fontSize * 1.5;

      const yPos = hookPos === 'top' ? h * 0.18 : hookPos === 'center' ? h * 0.5 : h * 0.82;
      const xPos = w / 2;

      // Drop shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 6;

      // Badge pill background
      ctx.fillStyle = badgeColor;
      const radius = 16;
      ctx.beginPath();
      ctx.roundRect(xPos - boxW / 2, yPos - boxH / 2, boxW, boxH, radius);
      ctx.fill();

      // Reset shadow for text
      ctx.shadowColor = 'transparent';

      // Badge text
      ctx.fillStyle = textColor;
      ctx.fillText(hookText, xPos, yPos);
      ctx.restore();
    }
  }, [p.settings, playhead, showHook, hookText, badgeColor, textColor, hookPos]);

  useEffect(() => {
    drawThumbnail();
  }, [drawThumbnail]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDownloading(true);
    canvas.toBlob((blob) => {
      setDownloading(false);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${p.name.replace(/\s+/g, '_')}_cover.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const handleCopy = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !navigator.clipboard?.write) return;
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }, 'image/png');
    } catch {}
  };

  return (
    <div className="thumbnail-grabber-panel properties-content">
      <div className="section-heading">
        <Camera size={16} />
        <b>Thumbnail & Cover Studio</b>
      </div>
      <p className="panel-subtext">
        Scrub to the best frame on the timeline to create high-converting TikTok, Reels & Shorts covers.
      </p>

      {/* Live Canvas Preview */}
      <div className="thumbnail-preview-box">
        <canvas ref={canvasRef} className="thumbnail-canvas" />
        <div className="thumbnail-timestamp-chip">
          <Camera size={12} /> {timecode(playhead)}
        </div>
      </div>

      <div className="button-row" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
        <button type="button" className="secondary" onClick={drawThumbnail}>
          <Camera size={14} /> Refresh Frame
        </button>
        <button
          type="button"
          className="secondary"
          onClick={handleCopy}
          disabled={copied}
        >
          {copied ? <Check size={14} style={{ color: '#4ade80' }} /> : <Copy size={14} />}
          {copied ? 'Copied!' : 'Copy Cover'}
        </button>
      </div>

      <div className="property-divider" />

      {/* Hook Banner Controls */}
      <div className="section-heading">
        <Type size={16} />
        <b>Cover Hook Banner</b>
        <input
          type="checkbox"
          checked={showHook}
          onChange={(e) => setShowHook(e.target.checked)}
          aria-label="Toggle hook text"
        />
      </div>

      {showHook && (
        <div className="hook-controls-group">
          <label className="field-label">Hook Text</label>
          <input
            type="text"
            className="hook-text-input"
            value={hookText}
            onChange={(e) => setHookText(e.target.value)}
            placeholder="Enter catchy headline…"
          />

          {/* Quick Presets */}
          <div className="hook-presets-row">
            {HOOK_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className="hook-preset-chip"
                onClick={() => setHookText(preset)}
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="number-grid" style={{ marginTop: '0.75rem' }}>
            <div>
              <label className="field-label">Banner Color</label>
              <div className="color-picker-row">
                {['#facc15', '#f43f5e', '#38bdf8', '#22c55e', '#ffffff', '#000000'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`swatch-btn ${badgeColor === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => {
                      setBadgeColor(c);
                      setTextColor(c === '#ffffff' || c === '#facc15' || c === '#38bdf8' ? '#000000' : '#ffffff');
                    }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="field-label">Position</label>
              <div className="position-toggle-row">
                {(['top', 'center', 'bottom'] as const).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    className={`pos-chip ${hookPos === pos ? 'selected' : ''}`}
                    onClick={() => setHookPos(pos)}
                  >
                    {pos.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="property-divider" />

      {/* Main Download Button */}
      <button
        type="button"
        className="primary full-width-btn"
        onClick={handleDownload}
        disabled={downloading}
      >
        <Download size={15} />
        Download HD Cover Image (.PNG)
      </button>
    </div>
  );
}
