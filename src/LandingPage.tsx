import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import {
  Snowflake,
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
  Scissors,
  Sparkles,
  Play,
  Pause,
  Check,
  Zap,
  Lock,
  Type,
  Flame,
  Youtube,
  Cpu,
  Layers,
  Sliders,
  Volume2,
  VolumeX,
  RefreshCw,
  Wand2,
  Smartphone,
  Monitor,
  Square,
  Music,
  HelpCircle,
  Clock,
  ChevronRight,
} from 'lucide-react';
import type { Project } from './model';
import { MediaImporterModal } from './importer/MediaImporterModal';
import './landing-gothic.css';
import './importer/importer.css';

export type LandingTheme = 'cryo' | 'aurora' | 'solar' | 'studio';

interface LandingPageProps {
  onStartEditing: () => void;
  onOpenProject: () => void;
  onTryDemo: () => void;
  onTrySpeechDemo?: () => void;
  onResumeProject?: (project: Project) => void;
  resumeProject?: Project;
  onImportFile?: (file: File) => void;
}

// 🔊 Lightweight WebAudio Synthetic Sound Engine (Zero external files, 100% offline)
function playCryoTone(
  type: 'chime' | 'snip' | 'pop' | 'tick' | 'switch' | 'beat',
  enabled: boolean,
) {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.onended = () => { void ctx.close(); };

    if (type === 'chime') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.12);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'snip') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(280, now + 0.06);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
      osc.start(now);
      osc.stop(now + 0.07);
    } else if (type === 'pop') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(680, now + 0.07);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'switch') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(540, now);
      osc.frequency.setValueAtTime(780, now + 0.03);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'beat') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.09);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      gain.gain.setValueAtTime(0.02, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      osc.start(now);
      osc.stop(now + 0.03);
    }
  } catch {
    // AudioContext blocked by browser policy until gesture
  }
}

// 🌌 Ambient Glacial Canvas: Theme-Aware Aurora Ribbons & Mouse-Interactive Stardust
function GlacialAuroraCanvas({ theme }: { theme: LandingTheme }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mousePos = useRef({ x: -1000, y: -1000, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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

    // Interactive cursor comet trail
    const cometMotes: { x: number; y: number; vx: number; vy: number; r: number; alpha: number; decay: number }[] = [];

    const onMouseMove = (e: globalThis.MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY, active: true };
      if (Math.random() < 0.45 && cometMotes.length < 50) {
        cometMotes.push({
          x: e.clientX + (Math.random() - 0.5) * 16,
          y: e.clientY + (Math.random() - 0.5) * 16,
          vx: (Math.random() - 0.5) * 0.8,
          vy: (Math.random() - 0.5) * 0.8 - 0.3,
          r: Math.random() * 2 + 0.6,
          alpha: 0.85,
          decay: Math.random() * 0.015 + 0.012,
        });
      }
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    // Floating background micro-frost motes
    const particleCount = Math.min(50, Math.floor(window.innerWidth / 28));
    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.5 + 0.4,
      vy: Math.random() * 0.4 + 0.15,
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

      // Aurora Palette by theme
      let auroraColor1 = 'rgba(14, 165, 233, 0.07)';
      let auroraColor2 = 'rgba(56, 189, 248, 0.03)';
      let dustColor = '#bae6fd';
      let cometColor = '#38bdf8';

      if (theme === 'aurora') {
        auroraColor1 = 'rgba(52, 211, 153, 0.08)';
        auroraColor2 = 'rgba(168, 85, 247, 0.05)';
        dustColor = '#a7f3d0';
        cometColor = '#34d399';
      } else if (theme === 'solar') {
        auroraColor1 = 'rgba(245, 158, 11, 0.08)';
        auroraColor2 = 'rgba(244, 63, 94, 0.05)';
        dustColor = '#fed7aa';
        cometColor = '#fbbf24';
      } else if (theme === 'studio') {
        auroraColor1 = 'rgba(255, 255, 255, 0.06)';
        auroraColor2 = 'rgba(148, 163, 184, 0.03)';
        dustColor = '#ffffff';
        cometColor = '#ffffff';
      }

      // 1. High-Latitude Ethereal Aurora Waves
      const wave1 = Math.sin(frame * 0.007) * 34;
      const wave2 = Math.cos(frame * 0.009) * 44;

      const grad = ctx.createLinearGradient(0, 0, width, height * 0.45);
      grad.addColorStop(0, auroraColor1);
      grad.addColorStop(0.5, auroraColor2);
      grad.addColorStop(1, 'transparent');

      ctx.beginPath();
      ctx.moveTo(0, height * 0.06 + wave1);
      ctx.bezierCurveTo(
        width * 0.35,
        height * 0.18 + wave2,
        width * 0.65,
        height * 0.03 + wave1,
        width,
        height * 0.16 + wave2,
      );
      ctx.lineTo(width, height * 0.38);
      ctx.bezierCurveTo(
        width * 0.65,
        height * 0.26 + wave1,
        width * 0.35,
        height * 0.4 + wave2,
        0,
        height * 0.22 + wave1,
      );
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // 2. Micro-frost motes
      ctx.fillStyle = dustColor;
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

      // 3. Dynamic Cursor Comet Dust
      ctx.fillStyle = cometColor;
      for (let i = cometMotes.length - 1; i >= 0; i--) {
        const m = cometMotes[i];
        m.x += m.vx;
        m.y += m.vy;
        m.alpha -= m.decay;
        if (m.alpha <= 0) {
          cometMotes.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = m.alpha;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(animId);
    };
  }, [theme]);

  return <canvas ref={canvasRef} className="glacial-aurora-canvas" aria-hidden="true" />;
}

// 🧊 High-End Spotlight Card: Dynamic 1px specular lighting following cursor
interface PrecisionCardProps {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}

function PrecisionCard({ className = '', children, onClick }: PrecisionCardProps) {
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
      onClick={onClick}
    >
      <div className="card-spotlight-border" aria-hidden="true" />
      <div className="card-inner-surface">{children}</div>
    </div>
  );
}

// 🖥️ The Precision Cockpit 2.0: FULLY INTERACTIVE Real-Time Video Editor Simulation
function PrecisionCockpit({ soundEnabled }: { soundEnabled: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(4.12);
  const [activeTool, setActiveTool] = useState<'razor' | 'audio' | 'captions'>('razor');
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [sliceCount, setSliceCount] = useState(3);
  const [audioBoost, setAudioBoost] = useState(80);
  const [captionStyle, setCaptionStyle] = useState<'pop' | 'neon' | 'glow'>('glow');
  const [cutFlash, setCutFlash] = useState(false);

  // Playback timer loop
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setPlayhead((prev) => {
        const next = prev + 0.08;
        return next > 24 ? 0 : next;
      });
    }, 80);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const togglePlay = () => {
    setIsPlaying((p) => !p);
    playCryoTone(isPlaying ? 'switch' : 'pop', soundEnabled);
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = ratio * 24;
    setPlayhead(target);
    playCryoTone('tick', soundEnabled);
  };

  const handleRazorCut = () => {
    setSliceCount((c) => c + 1);
    setCutFlash(true);
    playCryoTone('snip', soundEnabled);
    setTimeout(() => setCutFlash(false), 350);
  };

  // Dynamic Scene Caption based on timeline playhead
  const currentScene =
    playhead < 7.5
      ? {
          hook: 'HOOK DETECTED',
          time: '00:00 - 00:07',
          script: '“The secret to a standout video isn\'t more effects... it\'s cutting straight to the core story.”',
          caption: 'STOP SCROLLING. WATCH THIS.',
          badge: 'SAMPLE OPENING',
        }
      : playhead < 16.0
        ? {
            hook: 'SILENCE PURGE',
            time: '00:07 - 00:15',
            script: '“FrostCut detects acoustic breath gaps and purges awkward hesitations with local audio analysis.”',
            caption: '3.4S DEAD AIR REMOVED ⚡',
            badge: `${sliceCount} CUTS APPLIED`,
          }
        : {
            hook: 'CLIMAX TAKE',
            time: '00:15 - 00:24',
            script: '“High-retention kinetic captions pop semantic keywords in sync with vocal speech cadence.”',
            caption: 'CUT STRAIGHT TO THE CORE 🔥',
            badge: 'SAMPLE ENDING',
          };

  return (
    <div className="hero-product-stage">
      <PrecisionCard className="cockpit-window-shell">
        <div className="cockpit-container">
          {/* Window Titlebar */}
          <div className="cockpit-titlebar">
            <div className="cockpit-window-controls">
              <span className="dot close" title="Simulated Close" />
              <span className="dot minimize" title="Simulated Minimize" />
              <span className="dot expand" title="Simulated Maximize" />
            </div>

            <div className="cockpit-file-tag">
              <Snowflake size={13} className="text-sky-400" />
              <span>arctic_expedition_cut_01.mp4</span>
              <span className="badge-live">ILLUSTRATIVE DEMO · SAMPLE VALUES</span>
            </div>

            {/* Interactive Aspect Reframe Toggle */}
            <div className="cockpit-meta-stats">
              <div className="ratio-reframe-strip">
                {(['9:16', '1:1', '16:9'] as const).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    className={`ratio-btn ${aspectRatio === ratio ? 'active' : ''}`}
                    onClick={() => {
                      setAspectRatio(ratio);
                      playCryoTone('switch', soundEnabled);
                    }}
                    title={`Reframe Canvas to ${ratio}`}
                  >
                    {ratio === '9:16' ? (
                      <Smartphone size={10} />
                    ) : ratio === '1:1' ? (
                      <Square size={10} />
                    ) : (
                      <Monitor size={10} />
                    )}
                    <span>{ratio}</span>
                  </button>
                ))}
              </div>
              <span className="stat-pill mono">SAMPLE PROJECT</span>
            </div>
          </div>

          {/* Cockpit Workspace Split */}
          <div className="cockpit-body">
            {/* Left: Interactive Transcript & Cut Intelligence */}
            <div className={`cockpit-sub-card ${cutFlash ? 'card-flash' : ''}`}>
              <div className="card-eyebrow-row">
                <span className="chip-hook">{currentScene.hook}</span>
                <span className="chip-time">{currentScene.time}</span>
              </div>

              <p className="cockpit-script-preview">{currentScene.script}</p>

              {/* Interactive Tool Actions within the cockpit */}
              <div className="cockpit-interactive-actions">
                <button
                  type="button"
                  className="interactive-cut-btn"
                  onClick={handleRazorCut}
                  title="Click to execute an instant smart razor split!"
                >
                  <Scissors size={13} />
                  <span>Split Playhead at {playhead.toFixed(2)}s</span>
                  <span className="kbd-pill">Ctrl+K</span>
                </button>

                <div className="cockpit-silence-badge">
                  <div className="badge-stat-group">
                    <Zap size={13} className="text-amber-400" />
                    <span>
                      <b>{(sliceCount * 1.1 + 1.2).toFixed(1)}s</b> dead air purged
                    </span>
                  </div>
                  <span className="pct-badge">{sliceCount} SAMPLE CUTS</span>
                </div>
              </div>
            </div>

            {/* Right: Fluid Morphing Aspect Video Canvas Preview */}
            <div className="cockpit-canvas-preview">
              <div className={`canvas-aspect-frame frame-${aspectRatio.replace(':', '-')}`}>
                <div className="canvas-header-meta">
                  <span>{aspectRatio} VERTICAL REFRAME</span>
                  <div className="canvas-live-badge">
                    <span className={`rec-dot ${isPlaying ? 'live' : ''}`} />
                    <small>{isPlaying ? 'REC 60' : 'PAUSED'}</small>
                  </div>
                </div>

                <div className="canvas-content-art">
                  {/* Dynamic Equalizer Waves reacting to playback */}
                  <div className="canvas-waveform-overlay">
                    {Array.from({ length: 9 }, (_, i) => (
                      <span
                        key={i}
                        className={`sound-wave wave-${i} ${isPlaying ? 'playing' : 'paused'}`}
                        style={{
                          height: isPlaying ? `${Math.sin(playhead * 3 + i) * 16 + 22}px` : '6px',
                        }}
                      />
                    ))}
                  </div>

                  {/* Kinetic Live Caption Overlay */}
                  <div className={`canvas-caption-pill style-${captionStyle}`}>
                    <span>{currentScene.caption}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Precision Timeline (Interactive Scrub & Play) */}
          <div className="cockpit-timeline-strip">
            <div className="timeline-toolbar-mini">
              <div className="tool-icons">
                <button
                  type="button"
                  className={`tool-btn ${activeTool === 'razor' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTool('razor');
                    playCryoTone('tick', soundEnabled);
                  }}
                  title="Smart Razor (Splits silences)"
                >
                  <Scissors size={13} />
                </button>
                <button
                  type="button"
                  className={`tool-btn ${activeTool === 'audio' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTool('audio');
                    setAudioBoost((b) => (b === 80 ? 120 : 80));
                    playCryoTone('pop', soundEnabled);
                  }}
                  title={`Audio Punch (${audioBoost}% Vocal Gain)`}
                >
                  <Volume2 size={13} />
                </button>
                <button
                  type="button"
                  className={`tool-btn ${activeTool === 'captions' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTool('captions');
                    setCaptionStyle((s) => (s === 'pop' ? 'neon' : s === 'neon' ? 'glow' : 'pop'));
                    playCryoTone('switch', soundEnabled);
                  }}
                  title={`Kinetic Caption Style: ${captionStyle.toUpperCase()}`}
                >
                  <Type size={13} />
                </button>
              </div>

              {/* Monospace Live Timecode */}
              <div className="timeline-timecode-readout">
                <span className="cur">
                  00:{playhead < 10 ? '0' : ''}
                  {playhead.toFixed(2)}
                </span>
                <span className="sep">/</span>
                <span className="tot">00:24.00</span>
              </div>

              {/* Glowing Interactive Play/Pause Button */}
              <button
                type="button"
                className="mini-play-btn"
                onClick={togglePlay}
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
              </button>
            </div>

            {/* Clickable Scrubbable Timeline Tracks */}
            <div
              className="timeline-tracks-mock"
              onClick={handleTimelineClick}
              title="Click anywhere to scrub playhead"
            >
              {/* V1 Video Track */}
              <div className="track-row">
                <span className="track-id">V1</span>
                <div className="track-bar">
                  <span className="clip-segment c1">Hook Take</span>
                  <span className="clip-segment c2 cut">Silence Purge</span>
                  <span className="clip-segment c3">Speech Take</span>
                  <span className="clip-segment c4">Climax</span>
                </div>
              </div>

              {/* A1 Audio Waveform Track */}
              <div className="track-row">
                <span className="track-id">A1</span>
                <div className="track-bar audio-wave-bar">
                  <div className={`wave-bars-pattern ${isPlaying ? 'animated' : ''}`} />
                </div>
              </div>

              {/* Real-Time Drifting Playhead Needle */}
              <div
                className="cockpit-playhead-line"
                style={{ left: `${(playhead / 24) * 100}%` }}
              >
                <span className="playhead-tag">{playhead.toFixed(1)}s</span>
              </div>
            </div>
          </div>
        </div>
      </PrecisionCard>
    </div>
  );
}

// 🎚️ Interactive "Silence Purge / Slicer" Compare Dial
function SilenceSlicerShowcase({ soundEnabled }: { soundEnabled: boolean }) {
  const [sensitivity, setSensitivity] = useState(65);
  const [isPlayingBeat, setIsPlayingBeat] = useState(false);

  const cutsDetected = Math.round(sensitivity * 0.35 + 8);
  const secondsPurged = (sensitivity * 0.42 + 12).toFixed(1);

  const handleTestBeat = () => {
    setIsPlayingBeat(true);
    playCryoTone('snip', soundEnabled);
    let count = 0;
    const interval = setInterval(() => {
      count++;
      playCryoTone('beat', soundEnabled);
      if (count >= 4) {
        clearInterval(interval);
        setIsPlayingBeat(false);
      }
    }, 180);
  };

  return (
    <section className="silence-slicer-section">
      <PrecisionCard className="slicer-card">
        <div className="slicer-container">
          <div className="slicer-header">
            <div>
              <div className="section-eyebrow">ILLUSTRATIVE EXAMPLE · NO FILE ANALYZED</div>
              <h2>Silence Purge: Slice Dead Air Locally</h2>
              <p>
                Explore a simulated before-and-after edit. Your actual cuts require analysis and review.
              </p>
            </div>

            <div className="slicer-metric-capsule">
              <div className="slicer-stat">
                <b>{cutsDetected}</b>
                <small>Sample cuts</small>
              </div>
              <div className="slicer-stat-divider" />
              <div className="slicer-stat">
                <b>{secondsPurged}s</b>
                <small>Sample duration</small>
              </div>
              <div className="slicer-stat-divider" />
              <div className="slicer-stat highlight">
                <b>Demo</b>
                <small>No retention measured</small>
              </div>
            </div>
          </div>

          {/* Interactive Dual-Track Comparison Visualizer */}
          <div className="slicer-comparison-tracks">
            {/* Before Track: Raw with Red Gaps */}
            <div className="slicer-track-wrap">
              <div className="slicer-track-label">
                <span className="badge-before">RAW TAKE (BEFORE)</span>
                <small>Awkward hesitation, repeated takes & dead pauses</small>
              </div>
              <div className="slicer-track-visual before-track">
                <div className="wave-segment active">"Hey guys..."</div>
                <div className="wave-segment silence">[ 2.4s silence ]</div>
                <div className="wave-segment active">"Wait let me restart..."</div>
                <div className="wave-segment silence">[ 3.1s hesitation ]</div>
                <div className="wave-segment active">"The secret to video is..."</div>
              </div>
            </div>

            {/* After Track: FrostCut Precision */}
            <div className="slicer-track-wrap">
              <div className="slicer-track-label">
                <span className="badge-after">FROSTCUT AI (AFTER)</span>
                <small>Seamless, punchy narrative with 0 awkward gaps</small>
              </div>
              <div className="slicer-track-visual after-track">
                <div className="wave-segment tight">"The secret to video is..."</div>
                <div className="wave-segment tight accent">"Finding your hook..."</div>
                <div className="wave-segment tight">"And cutting to the core."</div>
              </div>
            </div>
          </div>

          {/* Interactive Sensitivity Slider Bar */}
          <div className="slicer-control-footer">
            <div className="slider-control-group">
              <label htmlFor="sensitivity-range">
                <span>Silence Sensitivity: <b>{sensitivity}%</b></span>
                <small>Higher sensitivity catches micro-breaths and soft hesitations</small>
              </label>
              <input
                id="sensitivity-range"
                type="range"
                min="20"
                max="95"
                value={sensitivity}
                onChange={(e) => {
                  setSensitivity(+e.target.value);
                  playCryoTone('tick', soundEnabled);
                }}
              />
            </div>

            <button
              type="button"
              className={`test-beat-btn ${isPlayingBeat ? 'active' : ''}`}
              onClick={handleTestBeat}
              title="Listen to the synthesized punchy cadence"
            >
              <Music size={14} />
              <span>{isPlayingBeat ? 'Playing Pacing...' : 'Test Cadence Beat'}</span>
            </button>
          </div>
        </div>
      </PrecisionCard>
    </section>
  );
}

// ✍️ Interactive Kinetic Subtitle Forge (Custom User Input Headline!)
function InteractiveSubtitleForge({ soundEnabled }: { soundEnabled: boolean }) {
  const [userText, setUserText] = useState('FIND THE HOOK. CUT THE REST.');
  const [captionPreset, setCaptionPreset] = useState<'glacial' | 'bold' | 'neon' | 'minimal'>('glacial');
  const [wordsPerScreen, setWordsPerScreen] = useState(4);
  const [speed, setSpeed] = useState<'1.0x' | '1.5x' | '2.0x'>('1.5x');

  const viralTemplates = [
    'STOP SCROLLING. WATCH THIS.',
    '3 SECRETS NOBODY TELLS YOU.',
    'I TESTED THIS FOR 30 DAYS.',
    'WAIT FOR THE PLOT TWIST 🔥',
  ];

  return (
    <section className="subtitle-forge-section">
      <PrecisionCard className="forge-window">
        <div className="forge-split">
          {/* Controls */}
          <div className="forge-controls">
            <div className="section-eyebrow">LIVE SUBTITLE FORGE</div>
            <h2>Type Your Own Headline & See It Pop</h2>
            <p>
              Preview caption styles here. Readability depends on your footage, typography, and timing.
            </p>

            {/* Interactive Text Input */}
            <div className="forge-input-box">
              <input
                type="text"
                value={userText}
                maxLength={45}
                onChange={(e) => setUserText(e.target.value.toUpperCase())}
                placeholder="TYPE YOUR HEADLINE..."
                aria-label="Interactive subtitle preview text"
              />
              <button
                type="button"
                className="clear-forge-btn"
                onClick={() => setUserText('')}
                title="Clear input"
              >
                ✕
              </button>
            </div>

            {/* Quick Template Chips */}
            <div className="forge-template-chips">
              {viralTemplates.map((tmpl) => (
                <button
                  key={tmpl}
                  type="button"
                  className="tmpl-chip"
                  onClick={() => {
                    setUserText(tmpl);
                    playCryoTone('pop', soundEnabled);
                  }}
                >
                  {tmpl}
                </button>
              ))}
            </div>

            {/* Style Selector */}
            <div className="preset-toggle-strip">
              <button
                type="button"
                className={`preset-pill ${captionPreset === 'glacial' ? 'active' : ''}`}
                onClick={() => {
                  setCaptionPreset('glacial');
                  playCryoTone('switch', soundEnabled);
                }}
              >
                ⚡ Glacial Cyan
              </button>
              <button
                type="button"
                className={`preset-pill ${captionPreset === 'bold' ? 'active' : ''}`}
                onClick={() => {
                  setCaptionPreset('bold');
                  playCryoTone('switch', soundEnabled);
                }}
              >
                🔥 Hormozi Pop
              </button>
              <button
                type="button"
                className={`preset-pill ${captionPreset === 'neon' ? 'active' : ''}`}
                onClick={() => {
                  setCaptionPreset('neon');
                  playCryoTone('switch', soundEnabled);
                }}
              >
                💜 Cyber Neon
              </button>
              <button
                type="button"
                className={`preset-pill ${captionPreset === 'minimal' ? 'active' : ''}`}
                onClick={() => {
                  setCaptionPreset('minimal');
                  playCryoTone('switch', soundEnabled);
                }}
              >
                💎 Studio Type
              </button>
            </div>

            {/* Pacing Speed Stepper */}
            <div className="forge-settings-row">
              <div className="forge-setting-item">
                <span>Words per card:</span>
                <div className="stepper-group">
                  {[2, 4, 6].map((w) => (
                    <button
                      key={w}
                      type="button"
                      className={`step-btn ${wordsPerScreen === w ? 'active' : ''}`}
                      onClick={() => {
                        setWordsPerScreen(w);
                        playCryoTone('tick', soundEnabled);
                      }}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              <div className="forge-setting-item">
                <span>Pacing Cadence:</span>
                <div className="stepper-group">
                  {(['1.0x', '1.5x', '2.0x'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`step-btn ${speed === s ? 'active' : ''}`}
                      onClick={() => {
                        setSpeed(s);
                        playCryoTone('tick', soundEnabled);
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Live Stage Box */}
          <div className="forge-visual-display">
            <div className={`caption-stage-box style-${captionPreset}`}>
              <div className="kinetic-word-wrap">
                {userText.split(' ').map((word, i) => {
                  const isHighlighted = i === 1 || i === userText.split(' ').length - 1;
                  return (
                    <span
                      key={`${word}-${i}`}
                      className={`word-token ${isHighlighted ? 'active-highlight' : ''}`}
                      style={{ animationDelay: `${i * (speed === '2.0x' ? 0.08 : speed === '1.5x' ? 0.12 : 0.18)}s` }}
                    >
                      {isHighlighted ? <mark>{word}</mark> : word}{' '}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </PrecisionCard>
    </section>
  );
}

// ⌨️ Interactive Pro Command Deck (Tactile Keyboard Shortcuts Tester)
function InteractiveCommandDeck({ soundEnabled }: { soundEnabled: boolean }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const shortcuts = [
    { key: 'Space', label: 'Play / Pause', desc: 'Preview the keyboard feedback' },
    { key: 'Ctrl + K', label: 'Razor Split', desc: 'Slice clip at current playhead' },
    { key: 'Ctrl + Z', label: 'Instant Undo', desc: 'Step backwards with zero loss' },
    { key: 'Ctrl + S', label: 'Local Save', desc: 'Save project directly to device' },
    { key: 'M', label: 'Mute Audio', desc: 'Isolate or silence audio tracks' },
    { key: 'Shift + Z', label: 'Fit to Window', desc: 'Fit entire timeline into view' },
  ];

  // Listen to physical keyboard presses
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.code === 'Space') {
        setActiveKey('Space');
        playCryoTone('pop', soundEnabled);
        setTimeout(() => setActiveKey(null), 300);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        setActiveKey('Ctrl + K');
        playCryoTone('snip', soundEnabled);
        setTimeout(() => setActiveKey(null), 300);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        setActiveKey('Ctrl + Z');
        playCryoTone('switch', soundEnabled);
        setTimeout(() => setActiveKey(null), 300);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [soundEnabled]);

  const handleKeyClick = (key: string) => {
    setActiveKey(key);
    playCryoTone(key.includes('K') ? 'snip' : 'pop', soundEnabled);
    setTimeout(() => setActiveKey(null), 350);
  };

  return (
    <section className="command-deck-section">
      <div className="section-header-centered">
        <div className="section-eyebrow">KEYBOARD-FIRST FLUIDITY</div>
        <h2>Speed of Thought. Zero Friction.</h2>
        <p>
          Click any key below or press it on your physical keyboard to test the instantaneous feedback.
        </p>
      </div>

      <div className="command-deck-grid">
        {shortcuts.map((sc) => (
          <button
            key={sc.key}
            type="button"
            className={`command-keycap-card ${activeKey === sc.key ? 'key-active' : ''}`}
            onClick={() => handleKeyClick(sc.key)}
          >
            <div className="keycap-badge">{sc.key}</div>
            <div className="keycap-info">
              <b>{sc.label}</b>
              <small>{sc.desc}</small>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

// 🐱 Scottish Fold Tech Companion 2.0 (Interactive AI Guide)
function ScottishFoldCompanion({ soundEnabled }: { soundEnabled: boolean }) {
  const [selectedTopic, setSelectedTopic] = useState<number>(0);

  const topics = [
    {
      title: 'Local editing',
      badge: 'LOCAL FIRST',
      question: 'Where is my footage processed?',
      answer:
        'Local files are edited and transcribed on your device. Model files may be downloaded. URL imports use the local helper server; native export sends source files to that local helper when selected.',
    },
    {
      title: 'Smart Silence Purge',
      badge: 'AUDIO AI',
      question: 'How does Smart Razor detect dead air?',
      answer:
        'Our local acoustic DSP analyzer scans audio waveforms for quiet gaps. You can fine-tune sensitivity from 0 to 100% and purge dead time in 1 click.',
    },
    {
      title: 'Turbo GPU Engine',
      badge: 'DEVICE DEPENDENT',
      question: 'How fast is local export compared to cloud?',
      answer:
        'The browser renderer supports complex edits. The optional local FFmpeg engine handles compatible edits. Hardware support and rendering time depend on your device, source, and effects; availability is checked at export.',
    },
    {
      title: 'Social Creator Studio',
      badge: 'MULTIPLE FORMATS',
      question: 'Can I reframe for TikTok, Reels, and YouTube Shorts?',
      answer:
        'Yes! Switch aspect ratios between 9:16, 1:1, and 16:9 instantly with smart blur fill, visual TikTok safe-margin guidelines, and semantic kinetic captions formatted for mobile retention.',
    },
  ];

  return (
    <div className="companion-glass-strip">
      <div className="companion-left-profile">
        <div className="companion-avatar-ring">
          <Snowflake size={18} className="text-sky-400" />
        </div>
        <div className="companion-meta-id">
          <div className="companion-header-line">
            <span className="pulse-indicator" />
            <b>FROSTCUT COMPANION</b>
          </div>
          <span className="companion-sub">Interactive Architecture Guide</span>
        </div>
      </div>

      <div className="companion-topic-chips">
        {topics.map((t, idx) => (
          <button
            key={t.title}
            type="button"
            className={`topic-chip ${selectedTopic === idx ? 'active' : ''}`}
            onClick={() => {
              setSelectedTopic(idx);
              playCryoTone('pop', soundEnabled);
            }}
          >
            <span>{t.title}</span>
          </button>
        ))}
      </div>

      <div className="companion-answer-drawer">
        <div className="drawer-header">
          <span className="drawer-badge">{topics[selectedTopic].badge}</span>
          <b>{topics[selectedTopic].question}</b>
        </div>
        <p className="drawer-text">{topics[selectedTopic].answer}</p>
      </div>
    </div>
  );
}

// 🚀 Primary Landing Page Component
export default function LandingPage({
  onStartEditing,
  onOpenProject,
  onTryDemo,
  onTrySpeechDemo,
  onResumeProject,
  resumeProject,
  onImportFile,
}: LandingPageProps) {
  const [theme, setTheme] = useState<LandingTheme>('cryo');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [importerOpen, setImporterOpen] = useState(false);
  const recordingInput = useRef<HTMLInputElement>(null);

  const handleMediaReady = (file: File) => {
    if (onImportFile) {
      onImportFile(file);
    } else {
      onStartEditing();
    }
  };

  const cycleTheme = () => {
    const order: LandingTheme[] = ['cryo', 'aurora', 'solar', 'studio'];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
    playCryoTone('chime', soundEnabled);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) playCryoTone('pop', true);
  };

  return (
    <main className={`glacial-landing theme-${theme}`}>
      <input ref={recordingInput} type="file" hidden accept="video/*,.mp4,.mov,.webm"
        aria-label="Start with a recording" onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) handleMediaReady(file);
        }} />
      {/* Background Ambient Canvas: Theme-Aware Nordic Aurora & Interactive Stardust Trail */}
      <GlacialAuroraCanvas theme={theme} />

      {/* Background Architectural Grid */}
      <div className="glacial-grid-mesh" aria-hidden="true" />

      <div className="glacial-content-container">
        {/* Navigation Bar with Theme & Sound Controls */}
        <header className="glacial-nav">
          <a className="brand-lockup" href="#" aria-label="FrostCut Home">
            <div className="brand-crest-box">
              <Snowflake size={18} className="brand-snowflake" />
            </div>
            <div className="brand-typography">
              <span className="brand-name">frostcut</span>
              <span className="brand-version-chip">CREATOR STUDIO</span>
            </div>
          </a>

          <div className="nav-action-cluster">
            {/* Interactive Theme Switcher Pill */}
            <button
              type="button"
              className="nav-theme-toggle-btn"
              onClick={cycleTheme}
              title={`Switch Atmosphere Theme (Current: ${theme.toUpperCase()})`}
            >
              <span className={`theme-swatch ${theme}`} />
              <span className="theme-name">
                {theme === 'cryo'
                  ? 'Cryo Cyan'
                  : theme === 'aurora'
                    ? 'Boreal Emerald'
                    : theme === 'solar'
                      ? 'Solar Flare'
                      : 'Titanium'}
              </span>
            </button>

            {/* Interactive UI Sound Toggle */}
            <button
              type="button"
              className={`nav-sound-btn ${soundEnabled ? 'active' : ''}`}
              onClick={toggleSound}
              title={soundEnabled ? 'Mute Interactive Sound Effects' : 'Enable Interactive Sound Effects'}
            >
              {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              <span className="sound-text">{soundEnabled ? 'SFX ON' : 'SFX'}</span>
            </button>

            <button
              type="button"
              className="nav-btn-ghost"
              onClick={() => setImporterOpen(true)}
            >
              <Youtube size={14} />
              <span>Import URL</span>
            </button>

            <button type="button" className="nav-btn-ghost" onClick={onOpenProject}>
              <span>Open Project</span>
            </button>

            <button type="button" className="nav-btn-primary" aria-label="Start editing" onClick={onStartEditing}>
              <span>New blank project</span>
              <ArrowUpRight size={15} />
            </button>
          </div>
        </header>

        {/* Hero Section */}
        <section className="glacial-hero-section">
          <div className="hero-tag-badge">
            <span className="tag-pulse" />
            <span className="tag-text">LOCAL FIRST · YOUTUBE & SHORT FORM</span>
          </div>

          <h1 className="hero-headline">
            Your recording.
            <br />
            <span className="gradient-ice-text">Your next upload.</span>
          </h1>

          <p className="hero-subline">
            Edit for YouTube. Turn moments into Shorts. Prepare your publishing draft.
            <br />
            Start with a recording, review the edit, and export on your device.
          </p>

          <div className="hero-cta-group">
            <button
              type="button"
              className="cta-primary-glacial"
              onClick={() => {
                playCryoTone('chime', soundEnabled);
                recordingInput.current?.click();
              }}
            >
              <span>Import your recording</span>
              <ArrowRight size={17} />
            </button>

            <button
              type="button"
              className="cta-secondary-glass"
              aria-label="Try a sample project"
              onClick={() => {
                playCryoTone('pop', soundEnabled);
                onTryDemo();
              }}
            >
              <Play size={14} fill="currentColor" />
              <span>Open sample project</span>
            </button>

          </div>
          <details className="landing-more-options">
            <summary>More ways to start</summary>
            <div className="hero-cta-group">
            {onTrySpeechDemo && (
              <button
                type="button"
                className="cta-secondary-glass"
                onClick={() => {
                  playCryoTone('switch', soundEnabled);
                  onTrySpeechDemo();
                }}
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
          </details>

          <div className="hero-guarantee-line">
            <div className="guarantee-chip">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span>Local editing · source files stay on this device</span>
            </div>
            <div className="guarantee-chip">
              <Cpu size={14} className="text-sky-400" />
              <span>YouTube 16:9 · Shorts, Reels & TikTok 9:16</span>
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

          {/* Interactive Software Cockpit 2.0 Showcase (Fully Playable Mini-Editor!) */}
          <PrecisionCockpit soundEnabled={soundEnabled} />
        </section>

        {/* Precision Metrics Banner */}
        <section className="precision-metrics-row">
          <div className="metric-cell">
            <b className="metric-number">16:9</b>
            <span className="metric-label">YouTube long format</span>
          </div>
          <div className="metric-divider" />
          <div className="metric-cell">
            <b className="metric-number">9:16</b>
            <span className="metric-label">Short form formats</span>
          </div>
          <div className="metric-divider" />
          <div className="metric-cell">
            <b className="metric-number">Local</b>
            <span className="metric-label">Editing & transcription</span>
          </div>
          <div className="metric-divider" />
          <div className="metric-cell">
            <b className="metric-number">MP4</b>
            <span className="metric-label">Reviewable video export</span>
          </div>
        </section>

        {/* Interactive Silence Slicer Before & After Showcase */}
        <SilenceSlicerShowcase soundEnabled={soundEnabled} />

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
              Analyze audio waveforms locally to automatically detect quiet gaps. Keep rhythm energetic without timeline scrub fatigue.
            </p>
            <div className="feature-sub-detail">
              <Zap size={13} className="text-amber-400" />
              <span>Review detected silence before applying cuts</span>
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
            <h3>Local-first processing</h3>
            <p>
              Edit local footage in your browser. URL imports and compatible native exports use the local helper server. Model downloads require an internet connection.
            </p>
            <div className="feature-sub-detail">
              <Lock size={13} className="text-emerald-400" />
              <span>You choose the source files and export destination</span>
            </div>
          </PrecisionCard>
        </section>

        {/* Interactive Kinetic Subtitle Forge (Live Custom Input!) */}
        <InteractiveSubtitleForge soundEnabled={soundEnabled} />

        {/* Interactive Command Deck (Tactile Keycaps Tester) */}
        <InteractiveCommandDeck soundEnabled={soundEnabled} />

        {/* Tech Companion Assistant 2.0 */}
        <section className="companion-section">
          <ScottishFoldCompanion soundEnabled={soundEnabled} />
        </section>

        {/* Clean Modern Footer */}
        <footer className="glacial-footer">
          <div className="footer-left">
            <div className="brand-crest-box small">
              <Snowflake size={14} className="text-sky-400" />
            </div>
            <span>FrostCut — From a recording to YouTube and short form.</span>
          </div>
          <div className="footer-right">
            <span>WebCodecs & WebAssembly Powered</span>
            <span className="dot-sep">·</span>
            <span>Local-first workflow</span>
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
