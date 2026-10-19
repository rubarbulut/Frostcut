import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import {
  Snowflake,
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
  Scissors,
  Sparkles,
  Play,
  Check,
  ChevronDown,
  Zap,
  Lock,
  Type,
  Flame,
  Youtube,
  Cpu,
  Layers,
  Sliders,
  Volume2,
} from 'lucide-react';
import type { Project } from './model';
import { MediaImporterModal } from './importer/MediaImporterModal';
import './landing-gothic.css';
import './importer/importer.css';

interface LandingPageProps {
  onStartEditing: () => void;
  onOpenProject: () => void;
  onTryDemo: () => void;
  onTrySpeechDemo?: () => void;
  onResumeProject?: (project: Project) => void;
  resumeProject?: Project;
  onImportFile?: (file: File) => void;
}

// 🌌 Ambient Glacial Canvas: Precision Aurora Ribbon & Drifting Micro-Crystals
function GlacialAuroraCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize, { passive: true });

    // Micro-frost motes
    const particleCount = Math.min(45, Math.floor(window.innerWidth / 30));
    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.4 + 0.4,
      vy: Math.random() * 0.4 + 0.2,
      vx: (Math.random() - 0.5) * 0.2,
      alpha: Math.random() * 0.5 + 0.2,
    }));

    let frame = 0;
    let isVisible = true;
    const onVisibility = () => {
      isVisible = !document.hidden;
      if (isVisible) animId = requestAnimationFrame(render);
    };
    document.addEventListener('visibilitychange', onVisibility);

    const render = () => {
      if (!isVisible) return;
      frame++;
      ctx.clearRect(0, 0, width, height);

      // 1. Subtle, ethereal High-Latitude Aurora
      const wave = Math.sin(frame * 0.006) * 30;
      const wave2 = Math.cos(frame * 0.008) * 40;

      const grad = ctx.createLinearGradient(0, 0, width, height * 0.4);
      grad.addColorStop(0, 'rgba(14, 165, 233, 0.06)');
      grad.addColorStop(0.5, 'rgba(56, 189, 248, 0.03)');
      grad.addColorStop(1, 'transparent');

      ctx.beginPath();
      ctx.moveTo(0, height * 0.05 + wave);
      ctx.bezierCurveTo(width * 0.35, height * 0.18 + wave2, width * 0.65, height * 0.02 + wave, width, height * 0.15 + wave2);
      ctx.lineTo(width, height * 0.35);
      ctx.bezierCurveTo(width * 0.65, height * 0.25 + wave, width * 0.35, height * 0.38 + wave2, 0, height * 0.2 + wave);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // 2. Micro-frost dust
      ctx.fillStyle = '#bae6fd';
      for (const p of particles) {
        p.y += p.vy;
        p.x += p.vx + Math.sin(frame * 0.01) * 0.1;
        if (p.y > height) {
          p.y = -5;
          p.x = Math.random() * width;
        }
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(animId);
    };
  }, []);

  return <canvas ref={canvasRef} className="glacial-aurora-canvas" aria-hidden="true" />;
}

// 🧊 High-End Spotlight Card: Dynamic 1px specular lighting following cursor
interface PrecisionCardProps {
  className?: string;
  children: ReactNode;
}

function PrecisionCard({ className = '', children }: PrecisionCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    card.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
  };

  return (
    <div
      ref={cardRef}
      className={`precision-card ${className}`}
      onMouseMove={handleMouseMove}
    >
      <div className="card-spotlight-border" aria-hidden="true" />
      <div className="card-inner-surface">{children}</div>
    </div>
  );
}

// 🖥️ The Precision Cockpit: Interactive High-Tech Video Editor Showcase
function PrecisionCockpit() {
  const [activeTab, setActiveTab] = useState<'timeline' | 'audio' | 'captions'>('timeline');

  return (
    <div className="hero-product-stage">
      <PrecisionCard className="cockpit-window-shell">
        <div className="cockpit-container">
          {/* Window Titlebar */}
          <div className="cockpit-titlebar">
            <div className="cockpit-window-controls">
              <span className="dot close" />
              <span className="dot minimize" />
              <span className="dot expand" />
            </div>
            <div className="cockpit-file-tag">
              <Snowflake size={13} className="text-sky-400" />
              <span>arctic_expedition_cut_01.mp4</span>
              <span className="badge-live">LOCAL WEBDSP</span>
            </div>
            <div className="cockpit-meta-stats">
              <span className="stat-pill">4K 60 FPS</span>
              <span className="stat-pill mono">00:00:14.24</span>
            </div>
          </div>

          {/* Cockpit Workspace Split */}
          <div className="cockpit-body">
            {/* Left: Transcript & Cut Logic */}
            <div className="cockpit-sub-card">
              <div className="card-eyebrow-row">
                <span className="chip-hook">HOOK DETECTED</span>
                <span className="chip-time">00:02 - 00:08</span>
              </div>
              <p className="cockpit-script-preview">
                “The secret to a <em>standout video</em> isn't more effects... it's cutting straight to the core story.”
              </p>
              <div className="cockpit-silence-badge">
                <Scissors size={12} />
                <span>3.4s dead air purged</span>
                <span className="pct-badge">-42%</span>
              </div>
            </div>

            {/* Right: 9:16 Kinetic Video Canvas Preview */}
            <div className="cockpit-canvas-preview">
              <div className="canvas-aspect-frame">
                <div className="canvas-header-meta">
                  <span>9:16 VERTICAL REFRAME</span>
                  <span className="rec-dot" />
                </div>
                <div className="canvas-content-art">
                  <div className="canvas-waveform-overlay">
                    <span className="sound-wave w1" />
                    <span className="sound-wave w2" />
                    <span className="sound-wave w3" />
                    <span className="sound-wave w4" />
                    <span className="sound-wave w5" />
                  </div>
                  <div className="canvas-caption-pill">
                    CUT TO THE <mark>CORE STORY</mark> ⚡
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Precision Timeline */}
          <div className="cockpit-timeline-strip">
            <div className="timeline-toolbar-mini">
              <div className="tool-icons">
                <button className="tool-btn active" title="Smart Razor"><Scissors size={13} /></button>
                <button className="tool-btn" title="Audio Waveform"><Volume2 size={13} /></button>
                <button className="tool-btn" title="Kinetic Captions"><Type size={13} /></button>
              </div>
              <div className="timeline-timecode-readout">
                <span className="cur">00:04.12</span>
                <span className="sep">/</span>
                <span className="tot">00:24.00</span>
              </div>
              <button className="mini-play-btn" title="Play / Pause">
                <Play size={12} fill="currentColor" />
              </button>
            </div>

            <div className="timeline-tracks-mock">
              {/* V1 Video Track */}
              <div className="track-row">
                <span className="track-id">V1</span>
                <div className="track-bar">
                  <span className="clip-segment c1">Hook Intro</span>
                  <span className="clip-segment c2 cut">Silence Cut</span>
                  <span className="clip-segment c3">Main Take</span>
                  <span className="clip-segment c4">Climax</span>
                </div>
              </div>

              {/* A1 Audio Waveform Track */}
              <div className="track-row">
                <span className="track-id">A1</span>
                <div className="track-bar audio-wave-bar">
                  <div className="wave-bars-pattern" />
                </div>
              </div>

              {/* Playhead Needle */}
              <div className="cockpit-playhead-line" />
            </div>
          </div>
        </div>
      </PrecisionCard>
    </div>
  );
}

// 🐱 Scottish Fold Tech Companion
function ScottishFoldCompanion() {
  const [tipIdx, setTipIdx] = useState(0);
  const [burst, setBurst] = useState(0);

  const tips = [
    'Zero cloud uploads: your raw 4K footage never leaves your physical browser memory.',
    'Smart Razor purges dead pauses, breathing gaps, and repeated takes in 1 click.',
    'Kinetic caption engine highlights semantic hook words automatically to boost watch-time.',
    'Hardware-accelerated WebCodecs render clean 60 FPS MP4 files right on your GPU.',
  ];

  const handleNext = () => {
    setBurst((b) => b + 1);
    setTipIdx((i) => (i + 1) % tips.length);
  };

  return (
    <div className="companion-glass-strip" onClick={handleNext} role="button" tabIndex={0}>
      <div className="companion-avatar-ring">
        <Snowflake size={16} className="text-sky-400" />
      </div>
      <div className="companion-text-block">
        <div className="companion-header-line">
          <span className="pulse-indicator" />
          <b>FROSTCUT ASSISTANT</b>
          <span className="companion-sub">Click for workflow insight</span>
        </div>
        <p className="companion-tip-text" key={burst}>{tips[tipIdx]}</p>
      </div>
      <div className="companion-action-pill">
        <span>Tip {tipIdx + 1}/{tips.length}</span>
        <ArrowRight size={13} />
      </div>
    </div>
  );
}

export default function LandingPage({
  onStartEditing,
  onOpenProject,
  onTryDemo,
  onTrySpeechDemo,
  onResumeProject,
  resumeProject,
  onImportFile,
}: LandingPageProps) {
  const [captionPreset, setCaptionPreset] = useState<'clean' | 'glacial' | 'bold'>('glacial');
  const [importerOpen, setImporterOpen] = useState(false);

  const handleMediaReady = (file: File) => {
    if (onImportFile) {
      onImportFile(file);
    } else {
      onStartEditing();
    }
  };

  return (
    <main className="glacial-landing">
      {/* Background Ambient Canvas: Subdued Nordic Aurora & Frost Dust */}
      <GlacialAuroraCanvas />

      {/* Background Architectural Grid */}
      <div className="glacial-grid-mesh" aria-hidden="true" />

      <div className="glacial-content-container">
        {/* Navigation Bar */}
        <header className="glacial-nav">
          <a className="brand-lockup" href="#" aria-label="FrostCut Home">
            <div className="brand-crest-box">
              <Snowflake size={18} className="brand-snowflake" />
            </div>
            <div className="brand-typography">
              <span className="brand-name">frostcut</span>
              <span className="brand-version-chip">v2.0 PRO</span>
            </div>
          </a>

          <div className="nav-action-cluster">
            <button
              type="button"
              className="nav-btn-ghost"
              onClick={() => setImporterOpen(true)}
            >
              <Youtube size={14} />
              <span>Import URL</span>
            </button>
            <button
              type="button"
              className="nav-btn-ghost"
              onClick={onOpenProject}
            >
              <span>Open Project</span>
            </button>
            <button
              type="button"
              className="nav-btn-primary"
              onClick={onStartEditing}
            >
              <span>Start Editing</span>
              <ArrowUpRight size={15} />
            </button>
          </div>
        </header>

        {/* Hero Section */}
        <section className="glacial-hero-section">
          <div className="hero-tag-badge">
            <span className="tag-pulse" />
            <span className="tag-text">CRYOGENIC SPEED · ZERO CLOUD LATENCY · 100% PRIVATE</span>
          </div>

          <h1 className="hero-headline">
            10 minutes of footage.
            <br />
            <span className="gradient-ice-text">Seconds of precision.</span>
          </h1>

          <p className="hero-subline">
            Find the hook. Slice the silence. Caption the moment.
            <br />
            Your fastest first cut with sub-zero latency — powered locally by your browser.
          </p>

          <div className="hero-cta-group">
            <button
              type="button"
              className="cta-primary-glacial"
              onClick={onStartEditing}
            >
              <span>Start Editing Free</span>
              <ArrowRight size={17} />
            </button>

            <button
              type="button"
              className="cta-secondary-glass"
              onClick={onTryDemo}
            >
              <Play size={14} fill="currentColor" />
              <span>Try Interactive Demo</span>
            </button>

            {onTrySpeechDemo && (
              <button
                type="button"
                className="cta-secondary-glass"
                onClick={onTrySpeechDemo}
              >
                <span>Voice Sample</span>
              </button>
            )}

            <button
              type="button"
              className="cta-secondary-glass import-btn"
              onClick={() => setImporterOpen(true)}
            >
              <Youtube size={14} />
              <span>Remote / YouTube</span>
            </button>
          </div>

          <div className="hero-guarantee-line">
            <div className="guarantee-chip">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span>Zero server uploads · 100% private</span>
            </div>
            <div className="guarantee-chip">
              <Cpu size={14} className="text-sky-400" />
              <span>WebCodecs 60 FPS hardware accelerated</span>
            </div>
          </div>

          {resumeProject && (
            <button
              className="resume-project-banner"
              onClick={() => onResumeProject?.(resumeProject)}
            >
              <span>Continue editing “{resumeProject.name}”</span>
              <ArrowRight size={14} />
            </button>
          )}

          {/* Interactive Software Cockpit Showcase */}
          <PrecisionCockpit />
        </section>

        {/* Precision Metrics Banner */}
        <section className="precision-metrics-row">
          <div className="metric-cell">
            <b className="metric-number">0 ms</b>
            <span className="metric-label">Cloud Upload Latency</span>
          </div>
          <div className="metric-divider" />
          <div className="metric-cell">
            <b className="metric-number">60 FPS</b>
            <span className="metric-label">Realtime Local Timeline Scrub</span>
          </div>
          <div className="metric-divider" />
          <div className="metric-cell">
            <b className="metric-number">0 B</b>
            <span className="metric-label">Private Footage Transferred</span>
          </div>
          <div className="metric-divider" />
          <div className="metric-cell">
            <b className="metric-number">3.2x</b>
            <span className="metric-label">Faster First Rough Cut</span>
          </div>
        </section>

        {/* Feature Grid: Engineered Precision */}
        <section className="glacial-features-grid">
          <PrecisionCard className="feature-card">
            <div className="feature-chip-top">
              <div className="feature-icon-wrapper">
                <Scissors size={20} />
              </div>
              <span className="feature-code-badge">01 / AUTO-CUT</span>
            </div>
            <h3>Dead Air & Silence Purge</h3>
            <p>
              Analyze audio waveforms locally to automatically detect silent gaps, stutter takes, and awkward pauses. Keep rhythm energetic without timeline scrub fatigue.
            </p>
            <div className="feature-sub-detail">
              <Zap size={13} className="text-amber-400" />
              <span>Sub-second acoustic speech analysis</span>
            </div>
          </PrecisionCard>

          <PrecisionCard className="feature-card">
            <div className="feature-chip-top">
              <div className="feature-icon-wrapper">
                <Type size={20} />
              </div>
              <span className="feature-code-badge">02 / KINETIC TYPE</span>
            </div>
            <h3>High-Retention Captions</h3>
            <p>
              Automatic word-by-word transcription with semantic keyword accent pops. Formatted with safe-margin boundaries for TikTok, Reels, and YouTube Shorts.
            </p>
            <div className="feature-sub-detail">
              <Sparkles size={13} className="text-sky-400" />
              <span>Local Whisper transcription engine</span>
            </div>
          </PrecisionCard>

          <PrecisionCard className="feature-card">
            <div className="feature-chip-top">
              <div className="feature-icon-wrapper">
                <ShieldCheck size={20} />
              </div>
              <span className="feature-code-badge">03 / LOCAL FIRST</span>
            </div>
            <h3>Absolute Privacy by Design</h3>
            <p>
              Your unreleased video content never touches a third-party server. Timeline compositing, proxy generation, and final MP4 encoding execute strictly on your device.
            </p>
            <div className="feature-sub-detail">
              <Lock size={13} className="text-emerald-400" />
              <span>Zero telemetry, zero cloud leakage</span>
            </div>
          </PrecisionCard>
        </section>

        {/* Interactive Kinetic Subtitle Playground */}
        <section className="subtitle-forge-section">
          <PrecisionCard className="forge-window">
            <div className="forge-split">
              <div className="forge-controls">
                <div className="section-eyebrow">SUBTITLE ENGINE</div>
                <h2>Stop the scroll with kinetic typography</h2>
                <p>
                  Viewers retain 40% more context when key thoughts light up with precise temporal pacing.
                </p>

                <div className="preset-toggle-strip">
                  <button
                    className={`preset-pill ${captionPreset === 'clean' ? 'active' : ''}`}
                    onClick={() => setCaptionPreset('clean')}
                  >
                    Clean White
                  </button>
                  <button
                    className={`preset-pill ${captionPreset === 'glacial' ? 'active' : ''}`}
                    onClick={() => setCaptionPreset('glacial')}
                  >
                    Glacial Cyan
                  </button>
                  <button
                    className={`preset-pill ${captionPreset === 'bold' ? 'active' : ''}`}
                    onClick={() => setCaptionPreset('bold')}
                  >
                    Hormozi Pop
                  </button>
                </div>
              </div>

              <div className="forge-visual-display">
                <div className={`caption-stage-box style-${captionPreset}`}>
                  {captionPreset === 'clean' && (
                    <span>
                      FIND THE <mark>HOOK.</mark> CUT THE REST.
                    </span>
                  )}
                  {captionPreset === 'glacial' && (
                    <span>
                      10 MINUTES <mark>INTO SECONDS.</mark>
                    </span>
                  )}
                  {captionPreset === 'bold' && (
                    <span>
                      WAIT FOR THE <mark>PLOT TWIST</mark> 🔥
                    </span>
                  )}
                </div>
              </div>
            </div>
          </PrecisionCard>
        </section>

        {/* Tech Companion Assistant */}
        <section className="companion-section">
          <ScottishFoldCompanion />
        </section>

        {/* Clean Modern Footer */}
        <footer className="glacial-footer">
          <div className="footer-left">
            <div className="brand-crest-box small">
              <Snowflake size={14} className="text-sky-400" />
            </div>
            <span>FrostCut — The local-first video editor for short-form creators.</span>
          </div>
          <div className="footer-right">
            <span>WebCodecs & WebAssembly Powered</span>
            <span className="dot-sep">·</span>
            <span>Zero Cloud Storage</span>
          </div>
        </footer>
      </div>

      {/* Media & Remote YouTube Importer Modal */}
      <MediaImporterModal
        isOpen={importerOpen}
        onClose={() => setImporterOpen(false)}
        onMediaReady={handleMediaReady}
      />
    </main>
  );
}
