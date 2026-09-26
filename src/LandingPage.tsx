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
  Cat,
  Zap,
  Lock,
  Layers,
  Sparkle,
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

// Interactive Snow & Cold Mist Canvas
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

    const flakesCount = Math.min(85, Math.floor(window.innerWidth / 16));
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
    setTilt({ x: y * -10, y: x * 10 });
  };
  const handleMonolithLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  // Caption Forge Demo Preset
  const [captionPreset, setCaptionPreset] = useState<'glacial' | 'gothic' | 'cyber'>('glacial');

  return (
    <main className="landing gothic-landing">
      {/* Background Interactive Snow Canvas */}
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

        {/* Feature Grimoire: 3 Pillars of Gothic Winter */}
        <section className="gothic-features-section">
          <div className="gothic-section-header">
            <h2>The Architecture of Cold Speed</h2>
            <p>
              Forged without compromise. Every heavy calculation happens directly inside your
              browser’s hardware sandbox.
            </p>
          </div>

          <div className="gothic-pillars-grid">
            {/* Pillar 1 */}
            <div className="gothic-pillar-card">
              <div className="pillar-icon-box">
                <Scissors size={26} />
              </div>
              <h3>The Blade of Silence</h3>
              <p>
                Surgical silence detection and cadence sculpting. AI isolates dead air, repeated
                takes, and weak hooks without human hesitation.
              </p>
              <div className="pillar-micro-tag">
                <Zap size={13} /> ZERO LATENCY DECISIONS
              </div>
            </div>

            {/* Pillar 2 */}
            <div className="gothic-pillar-card">
              <div className="pillar-icon-box">
                <Sparkle size={26} />
              </div>
              <h3>Living Runes</h3>
              <p>
                Dynamic subtitles with soul. Semantic word highlighting, kinetic physics, and
                streamer-ready styles designed for instant viral retention.
              </p>
              <div className="pillar-micro-tag">
                <Layers size={13} /> GPU ACCELERATED TEXT
              </div>
            </div>

            {/* Pillar 3 */}
            <div className="gothic-pillar-card">
              <div className="pillar-icon-box">
                <ShieldCheck size={26} />
              </div>
              <h3>The Obsidian Vault</h3>
              <p>
                No cloud uploads. No subscription servers peeking at your raw drafts. Your private
                footage stays locked on your local drive forever.
              </p>
              <div className="pillar-micro-tag">
                <Lock size={13} /> 100% AIR-GAPPED PRIVACY
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Caption Forge */}
        <section className="gothic-caption-forge">
          <div className="forge-card">
            <div className="forge-left">
              <h3>Interactive Rune Forge</h3>
              <p>
                Test our kinetic subtitle styling engine right now. Choose a tone to see how
                important words ignite attention.
              </p>
              <div className="forge-preset-selector">
                <button
                  className={`preset-chip ${captionPreset === 'glacial' ? 'active' : ''}`}
                  onClick={() => setCaptionPreset('glacial')}
                >
                  Glacial Bold
                </button>
                <button
                  className={`preset-chip ${captionPreset === 'gothic' ? 'active' : ''}`}
                  onClick={() => setCaptionPreset('gothic')}
                >
                  Gothic Monolith
                </button>
                <button
                  className={`preset-chip ${captionPreset === 'cyber' ? 'active' : ''}`}
                  onClick={() => setCaptionPreset('cyber')}
                >
                  Brainrot Pulse
                </button>
              </div>
            </div>

            <div className="forge-stage">
              <div className={`forge-caption-display style-${captionPreset}`}>
                {captionPreset === 'glacial' && (
                  <span>
                    EVERY <mark>STORY</mark> CARVED IN ICE.
                  </span>
                )}
                {captionPreset === 'gothic' && (
                  <span>
                    SILENCE <mark>SEVERED.</mark> CINEMA AWAKENS.
                  </span>
                )}
                {captionPreset === 'cyber' && (
                  <span>
                    WAIT FOR THE <mark>PLOT TWIST</mark> ⚡
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* The Winter Familiar: Cozy Cat Mascot */}
        <section className="gothic-familiar-section">
          <div className="familiar-card">
            <div className="familiar-left">
              <div className="familiar-cat-avatar">
                <div className="familiar-cat-glow" />
                <Cat size={42} style={{ color: '#bae6fd', position: 'relative', zIndex: 2 }} />
              </div>
              <div className="familiar-copy">
                <h4>Guarded by the Winter Familiar</h4>
                <p>
                  While you focus on the vision, our cozy background engine transcodes, slices, and
                  syncs your timeline in whisper-quiet harmony. No telemetry, no waiting queues.
                </p>
              </div>
            </div>
            <button className="familiar-cta-btn" onClick={onStartEditing}>
              Launch Sanctuary →
            </button>
          </div>
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
