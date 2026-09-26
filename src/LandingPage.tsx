import { useEffect, useRef, useState, type MouseEvent } from 'react';
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
  MessageSquareText,
  Zap,
  Lock,
  Type,
  Heart,
  Volume2,
} from 'lucide-react';
import type { Project } from './model';
import './landing-gothic.css';

interface LandingPageProps {
  onStartEditing: () => void;
  onOpenProject: () => void;
  onTryDemo: () => void;
  onResumeProject?: (project: Project) => void;
  resumeProject?: Project;
}

// ❄️ Interactive Canvas: Procedural Snow & Rolling Cold Mist
function GothicSnowCanvas() {
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
    window.addEventListener('resize', onResize);

    // Particle definition
    interface Flake {
      x: number;
      y: number;
      radius: number;
      speedY: number;
      speedX: number;
      alpha: number;
      phase: number;
    }

    const flakesCount = Math.min(90, Math.floor(window.innerWidth / 15));
    const flakes: Flake[] = [];

    for (let i = 0; i < flakesCount; i++) {
      flakes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 2.2 + 0.6,
        speedY: Math.random() * 0.7 + 0.35,
        speedX: Math.random() * 0.4 - 0.2,
        alpha: Math.random() * 0.6 + 0.25,
        phase: Math.random() * Math.PI * 2,
      });
    }

    let mouseX = -1000;
    let mouseY = -1000;
    const onMouseMove = (e: globalThis.MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener('mousemove', onMouseMove);

    let frame = 0;
    const render = () => {
      frame++;
      ctx.clearRect(0, 0, width, height);

      // 1. Rolling Cold Mist Layers along bottom & edges
      const mistX1 = ((frame * 0.35) % (width + 600)) - 300;
      const grad1 = ctx.createRadialGradient(
        mistX1,
        height - 60,
        40,
        mistX1,
        height - 60,
        Math.min(550, width * 0.6),
      );
      grad1.addColorStop(0, 'rgba(14, 116, 144, 0.09)');
      grad1.addColorStop(0.6, 'rgba(6, 78, 110, 0.03)');
      grad1.addColorStop(1, 'transparent');
      ctx.fillStyle = grad1;
      ctx.fillRect(0, height - 380, width, 380);

      const mistX2 = ((frame * 0.2 + 500) % (width + 700)) - 350;
      const grad2 = ctx.createRadialGradient(
        width - mistX2,
        height - 120,
        60,
        width - mistX2,
        height - 120,
        Math.min(600, width * 0.7),
      );
      grad2.addColorStop(0, 'rgba(56, 189, 248, 0.06)');
      grad2.addColorStop(0.7, 'rgba(15, 23, 42, 0.02)');
      grad2.addColorStop(1, 'transparent');
      ctx.fillStyle = grad2;
      ctx.fillRect(0, height - 420, width, 420);

      // 2. Snow & Ice Crystals
      for (let i = 0; i < flakes.length; i++) {
        const f = flakes[i];
        f.y += f.speedY;
        f.x += f.speedX + Math.sin(frame * 0.015 + f.phase) * 0.25;

        // Subtle mouse deflection (snow parts around cursor)
        const dx = f.x - mouseX;
        const dy = f.y - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 90) {
          const force = (1 - dist / 90) * 1.5;
          f.x += (dx / (dist || 1)) * force;
          f.y += (dy / (dist || 1)) * force;
        }

        if (f.y > height + 5) {
          f.y = -5;
          f.x = Math.random() * width;
        }
        if (f.x > width + 5) f.x = -5;
        if (f.x < -5) f.x = width + 5;

        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(186, 230, 253, ${f.alpha})`;
        ctx.shadowColor = '#7dd3fc';
        ctx.shadowBlur = f.radius > 1.8 ? 8 : 0;
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(animId);
    };
  }, []);

  return <canvas ref={canvasRef} className="gothic-snow-canvas" aria-hidden="true" />;
}

// 🐱 Interactive Winter Cat Mascot with Eye Tracking & Purr Burst
function WinterCatFamiliar() {
  const catRef = useRef<HTMLDivElement>(null);
  const [pupilOffset, setPupilOffset] = useState({ x: 0, y: 0 });
  const [purring, setPurring] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [burstCount, setBurstCount] = useState(0);

  const tips = [
    'Your footage stays 100% on your device. Zero cloud uploads, zero privacy leaks.',
    'Auto Cut finds hooks and cuts awkward silences in seconds.',
    'Dynamic subtitles with semantic keyword styling boost viewer retention.',
    'Render and export directly from your local browser with WebCodecs.',
  ];

  // Mouse tracking eyes
  useEffect(() => {
    const handleMove = (e: globalThis.MouseEvent) => {
      if (!catRef.current) return;
      const rect = catRef.current.getBoundingClientRect();
      const catCenterX = rect.left + rect.width / 2;
      const catCenterY = rect.top + rect.height / 2;

      const dx = e.clientX - catCenterX;
      const dy = e.clientY - catCenterY;
      const angle = Math.atan2(dy, dx);
      const dist = Math.min(3.5, Math.hypot(dx, dy) / 40);

      setPupilOffset({
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
      });
    };

    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  const handleCatClick = () => {
    setPurring(true);
    setBurstCount((c) => c + 1);
    setTipIndex((prev) => (prev + 1) % tips.length);
    setTimeout(() => setPurring(false), 900);
  };

  return (
    <div className="cat-interactive-card" onClick={handleCatClick} role="button" tabIndex={0}>
      <div className="cat-visual-stage" ref={catRef}>
        {/* Ambient Glow behind Cat */}
        <div className={`cat-aura-glow ${purring ? 'purr-active' : ''}`} />

        {/* SVG Cat Character with Eye Tracking */}
        <svg
          className={`winter-cat-svg ${purring ? 'cat-bounce' : ''}`}
          viewBox="0 0 120 120"
          width="90"
          height="90"
        >
          {/* Ears */}
          <polygon points="26,45 14,14 48,30" fill="#f8fafc" stroke="#38bdf8" strokeWidth="1.5" />
          <polygon points="26,42 19,20 42,32" fill="#fda4af" opacity="0.75" />
          <polygon points="94,45 106,14 72,30" fill="#f8fafc" stroke="#38bdf8" strokeWidth="1.5" />
          <polygon points="94,42 101,20 78,32" fill="#fda4af" opacity="0.75" />

          {/* Earmuffs band (Winter accessory) */}
          <path
            d="M 22,40 Q 60,18 98,40"
            fill="none"
            stroke="#0284c7"
            strokeWidth="3.5"
            strokeLinecap="round"
          />

          {/* Earmuff fluff */}
          <circle cx="20" cy="44" r="10" fill="#38bdf8" />
          <circle cx="20" cy="44" r="7" fill="#e0f2fe" />
          <circle cx="100" cy="44" r="10" fill="#38bdf8" />
          <circle cx="100" cy="44" r="7" fill="#e0f2fe" />

          {/* Chubby Head / Body */}
          <ellipse cx="60" cy="65" rx="42" ry="38" fill="#f8fafc" />
          {/* Soft body contour / shadow */}
          <ellipse cx="60" cy="74" rx="36" ry="26" fill="#e2e8f0" opacity="0.4" />

          {/* Eyes (Left & Right) */}
          <g transform="translate(42, 58)">
            <ellipse cx="0" cy="0" rx="7.5" ry="9" fill="#0c1829" />
            <circle
              cx={pupilOffset.x}
              cy={pupilOffset.y}
              r="4.2"
              fill="#38bdf8"
              filter="drop-shadow(0 0 3px #67e8f9)"
            />
            <circle cx={pupilOffset.x + 1.2} cy={pupilOffset.y - 1.2} r="1.5" fill="#ffffff" />
          </g>

          <g transform="translate(78, 58)">
            <ellipse cx="0" cy="0" rx="7.5" ry="9" fill="#0c1829" />
            <circle
              cx={pupilOffset.x}
              cy={pupilOffset.y}
              r="4.2"
              fill="#38bdf8"
              filter="drop-shadow(0 0 3px #67e8f9)"
            />
            <circle cx={pupilOffset.x + 1.2} cy={pupilOffset.y - 1.2} r="1.5" fill="#ffffff" />
          </g>

          {/* Cute Nose */}
          <polygon points="60,69 56,65 64,65" fill="#f43f5e" />

          {/* Mouth */}
          <path
            d="M 54,71 Q 60,75 60,71 Q 60,75 66,71"
            fill="none"
            stroke="#475569"
            strokeWidth="1.8"
            strokeLinecap="round"
          />

          {/* Whiskers */}
          <line
            x1="24"
            y1="66"
            x2="40"
            y2="68"
            stroke="#94a3b8"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <line
            x1="22"
            y1="73"
            x2="40"
            y2="71"
            stroke="#94a3b8"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <line
            x1="96"
            y1="66"
            x2="80"
            y2="68"
            stroke="#94a3b8"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <line
            x1="98"
            y1="73"
            x2="80"
            y2="71"
            stroke="#94a3b8"
            strokeWidth="1.2"
            strokeLinecap="round"
          />

          {/* Paws resting at bottom */}
          <ellipse cx="44" cy="98" rx="8" ry="5" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1" />
          <ellipse cx="76" cy="98" rx="8" ry="5" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1" />
        </svg>

        {/* Floating Heart / Snowflakes on Click */}
        {purring && (
          <div className="purr-hearts" key={burstCount}>
            <span className="burst-item i1">❄️</span>
            <span className="burst-item i2">💙</span>
            <span className="burst-item i3">✨</span>
          </div>
        )}
      </div>

      <div className="cat-dialog-wrap">
        <div className="cat-status-line">
          <span className="cat-dot" />
          <b>FROSTCUT MASCOT</b>
          <span className="cat-sub-hint">Click me for tips</span>
        </div>
        <p className="cat-quote">{tips[tipIndex]}</p>
      </div>
    </div>
  );
}

export default function LandingPage({
  onStartEditing,
  onOpenProject,
  onTryDemo,
  onResumeProject,
  resumeProject,
}: LandingPageProps) {
  // 3D Monolith Tilt
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const handleMonolithMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: y * -9, y: x * 9 });
  };
  const handleMonolithLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  // Subtitle Preview Preset
  const [captionPreset, setCaptionPreset] = useState<'clean' | 'glacial' | 'bold'>('glacial');

  return (
    <main className="landing gothic-landing">
      {/* Background Interactive Snow & Cold Mist Canvas */}
      <GothicSnowCanvas />
      <div className="gothic-ambient-veil" />

      <div className="gothic-content-wrap">
        {/* Navigation */}
        <nav className="landing-nav gothic-nav">
          <a className="brand gothic-brand" href="#" aria-label="FrostCut Home">
            <div className="gothic-brand-crest">
              <Snowflake className="gothic-crest-icon" size={19} />
            </div>
            <div className="gothic-brand-text">
              frostcut
              <span className="beta-tag gothic-beta-tag">EARLY ACCESS</span>
            </div>
          </a>

          <div className="gothic-nav-actions">
            <button className="text-button gothic-nav-btn-ghost" onClick={onOpenProject}>
              Open project
            </button>
            <button className="dark-button gothic-nav-btn-primary" onClick={onStartEditing}>
              Start editing <ArrowUpRight size={16} />
            </button>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="hero gothic-hero">
          {/* Left Column: Copy & Actions */}
          <div className="hero-copy gothic-hero-copy">
            <div className="eyebrow gothic-eyebrow">
              <span className="gothic-eyebrow-rune">✦</span>A LITTLE LESS WORK. A LOT MORE YOU.
            </div>

            <h1>
              10 minutes
              <br />
              of footage.
              <br />
              <span className="gothic-frost-gradient">Seconds of work.</span>
            </h1>

            <p className="gothic-hero-lead">
              Find the hook. Cut the silence. Caption the moment.
              <br />
              Your fastest first cut, with room to make it yours.
            </p>

            <div className="hero-actions gothic-hero-actions">
              <button
                className="dark-button large gothic-cta-primary"
                onClick={onStartEditing}
                aria-label="Start editing"
              >
                Start editing <ArrowRight size={19} />
              </button>

              <button className="demo-button gothic-cta-demo" onClick={onTryDemo}>
                <span className="gothic-demo-icon-ring">
                  <Play size={13} fill="currentColor" />
                </span>
                Try a sample project
              </button>
            </div>

            <div className="privacy-line gothic-privacy-badge">
              <ShieldCheck size={16} />
              Your footage stays on your device. Always your story.
            </div>

            {resumeProject && (
              <button
                className="resume-button gothic-resume-banner"
                onClick={() => onResumeProject?.(resumeProject)}
              >
                Continue “{resumeProject.name}” <ArrowRight size={15} />
              </button>
            )}
          </div>

          {/* Right Column: The Obsidian Monolith (3D Editor Showcase) */}
          <div className="hero-product gothic-monolith-wrapper">
            <div
              className="gothic-monolith"
              onMouseMove={handleMonolithMove}
              onMouseLeave={handleMonolithLeave}
              style={{
                transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
              }}
            >
              {/* Monolith Header */}
              <div className="product-top monolith-header">
                <span className="monolith-brand-tag">
                  <Snowflake size={15} /> frostcut
                </span>
                <span className="monolith-project-pill">
                  A better story <ChevronDown size={12} />
                </span>
                <div className="monolith-status-dot" title="Local Engine Active" />
              </div>

              {/* Monolith Split Body */}
              <div className="product-preview monolith-body">
                {/* Left: Transcript Card */}
                <div className="mock-transcript monolith-transcript-card">
                  <div>
                    <span className="monolith-card-tag">THE GOOD PARTS</span>
                    <p className="monolith-transcript-text">
                      The secret to a<br />
                      <mark>better video</mark>
                      <br />
                      is a better story.
                    </p>
                  </div>
                  <div className="monolith-silence-alert">
                    <Check size={13} /> Silence removed
                  </div>
                </div>

                {/* Right: 9:16 Glacial Mobile Poster */}
                <div className="story-poster monolith-screen-mock">
                  <span className="screen-eyebrow">MAKE ROOM FOR</span>
                  <strong className="screen-headline">
                    the
                    <br />
                    <em>good</em>
                    <br />
                    parts.
                  </strong>
                  <div className="poster-caption screen-caption-bubble">
                    A <mark>better</mark> story.
                  </div>
                </div>
              </div>

              {/* Toolbar & Icicle Waveform */}
              <div className="mock-toolbar monolith-toolbar">
                <Scissors size={14} style={{ color: 'var(--ice-400)' }} />

                <div className="monolith-icicle-waveform" title="Glacial Audio Spectral Analysis">
                  <span className="icicle-bar" style={{ height: '14px', animationDelay: '0.1s' }} />
                  <span className="icicle-bar" style={{ height: '22px', animationDelay: '0.4s' }} />
                  <span className="icicle-bar" style={{ height: '9px', animationDelay: '0.2s' }} />
                  <span className="icicle-bar" style={{ height: '18px', animationDelay: '0.5s' }} />
                  <span className="icicle-bar" style={{ height: '24px', animationDelay: '0.3s' }} />
                  <span className="icicle-bar" style={{ height: '12px', animationDelay: '0.6s' }} />
                  <span
                    className="icicle-bar"
                    style={{ height: '20px', animationDelay: '0.15s' }}
                  />
                </div>

                <span className="monolith-timecode">
                  00:04 <em>/ 00:24</em>
                </span>
                <Play size={12} fill="currentColor" style={{ color: 'var(--ice-cyan)' }} />
              </div>

              {/* Timeline Track */}
              <div className="mock-timeline monolith-timeline">
                <span className="timeline-track-label">V1</span>
                <div className="timeline-clip-blocks">
                  <div className="clip-block" />
                  <div className="clip-block highlight" />
                  <div className="clip-block" />
                  <div className="clip-block highlight" />
                </div>
                <div className="mock-playhead timeline-playhead" />
              </div>

              {/* Floating Discovery Talisman */}
              <div className="floating-discovery gothic-floating-talisman">
                <span className="discovery-icon talisman-spark">
                  <Sparkles size={20} />
                </span>
                <div className="talisman-info">
                  <b>The good parts, found.</b>
                  <span>3 moments worth sharing</span>
                </div>
                <Check className="talisman-check" size={17} />
              </div>
            </div>
          </div>
        </section>

        {/* Feature Grid: Clean, creator-focused core benefits */}
        <section className="gothic-features-section">
          <div className="gothic-section-header">
            <h2>Engineered for Short-Form Creators</h2>
            <p>
              Auto Cut finds the hooks and removes awkward pauses. Dynamic captions style your words
              automatically. Everything runs privately on your device.
            </p>
          </div>

          <div className="gothic-pillars-grid">
            {/* Pillar 1 */}
            <div className="gothic-pillar-card">
              <div className="pillar-icon-box">
                <Scissors size={26} />
              </div>
              <h3>Silence & Pause Removal</h3>
              <p>
                Detect dead air, repeated takes, and silent gaps automatically. Keep your pacing
                tight, energetic, and natural with zero manual timeline scrubbing.
              </p>
              <div className="pillar-micro-tag">
                <Zap size={13} /> INSTANT AUDIO ANALYSIS
              </div>
            </div>

            {/* Pillar 2 */}
            <div className="gothic-pillar-card">
              <div className="pillar-icon-box">
                <Type size={26} />
              </div>
              <h3>Dynamic Kinetic Subtitles</h3>
              <p>
                Auto-generate word-by-word animated captions with keyword emphasis and custom color
                presets. Formatted for YouTube Shorts, Reels, and TikTok safe areas.
              </p>
              <div className="pillar-micro-tag">
                <Sparkles size={13} /> HIGH-RETENTION STYLES
              </div>
            </div>

            {/* Pillar 3 */}
            <div className="gothic-pillar-card">
              <div className="pillar-icon-box">
                <ShieldCheck size={26} />
              </div>
              <h3>100% Local-First & Private</h3>
              <p>
                Your raw footage never uploads to any server. Transcription, timeline editing, and
                MP4 export run directly inside your browser via WebCodecs and WebAssembly.
              </p>
              <div className="pillar-micro-tag">
                <Lock size={13} /> ZERO CLOUD STORAGE
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Subtitle Style Playground */}
        <section className="gothic-caption-forge">
          <div className="forge-card">
            <div className="forge-left">
              <h3>Dynamic Subtitle Styles</h3>
              <p>
                See how FrostCut animates and highlights critical keywords to stop the scroll and
                maximize watch time.
              </p>
              <div className="forge-preset-selector">
                <button
                  className={`preset-chip ${captionPreset === 'clean' ? 'active' : ''}`}
                  onClick={() => setCaptionPreset('clean')}
                >
                  Clean White
                </button>
                <button
                  className={`preset-chip ${captionPreset === 'glacial' ? 'active' : ''}`}
                  onClick={() => setCaptionPreset('glacial')}
                >
                  Glacial Cyan
                </button>
                <button
                  className={`preset-chip ${captionPreset === 'bold' ? 'active' : ''}`}
                  onClick={() => setCaptionPreset('bold')}
                >
                  Brainrot Pop
                </button>
              </div>
            </div>

            <div className="forge-stage">
              <div className={`forge-caption-display style-${captionPreset}`}>
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
        </section>

        {/* Featured Winter Mascot Interactive Card */}
        <section className="gothic-familiar-section">
          <WinterCatFamiliar />
        </section>

        {/* Footer */}
        <footer className="landing-footer gothic-footer">
          <div className="footer-inner">
            <span className="footer-motto">Less editing. More creating.</span>
            <div className="footer-badges">
              <span className="footer-badge-item">
                <Scissors size={16} />
                Thoughtful cuts
              </span>
              <span className="footer-badge-item">
                <MessageSquareText size={16} />
                Words with personality
              </span>
              <span className="footer-badge-item">
                <ShieldCheck size={16} />
                Local by design
              </span>
            </div>
            <span className="footer-tagline">MADE FOR YOUR NEXT IDEA ↗</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
