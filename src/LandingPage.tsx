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
  Copy,
  RotateCcw,
  Send,
  Activity,
} from 'lucide-react';
import type { Project } from './model';
import { PixelSnowOwl, type OwlEyeColor, type OwlLookDirection } from './PixelSnowOwl';
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
  type: 'chime' | 'snip' | 'pop' | 'tick' | 'switch' | 'beat' | 'hoot' | 'jackpot',
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
    } else if (type === 'hoot') {
      // Gentle two-tone owl hoot: 640Hz -> 520Hz
      osc.type = 'sine';
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.16);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.05, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === 'jackpot') {
      // Arpeggiated victory sparkle
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.05);
      osc.frequency.setValueAtTime(783.99, now + 0.1);
      osc.frequency.setValueAtTime(1046.5, now + 0.15);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
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

// 📊 Studio Telemetry & Format Architecture Deck (Interactive Dual-Format & Privacy Hub)
type TelemetryFormatId = '16:9' | '9:16' | 'local' | 'mp4';

interface TelemetryFormatData {
  id: TelemetryFormatId;
  metric: string;
  name: string;
  subtitle: string;
  badge: string;
  icon: typeof Youtube;
  accent: string;
  specs: {
    target: string;
    bitrate: string;
    processing: string;
    perk: string;
  };
  highlights: string[];
}

const TELEMETRY_FORMATS: TelemetryFormatData[] = [
  {
    id: '16:9',
    metric: '16:9',
    name: 'YouTube Landscape',
    subtitle: 'Cinema Long-Form Studio',
    badge: '4K BROADCAST',
    icon: Youtube,
    accent: '#ef4444',
    specs: {
      target: 'YouTube Main Video',
      bitrate: '35–45 Mbps (4K UHD)',
      processing: 'Rec.709 Color Pipeline',
      perk: 'Multi-Track & Chapter Sync',
    },
    highlights: [
      'Multi-track timeline with precision cut points',
      'Automatic chapter marker generation',
      'Broadcast audio loudness (-14 LUFS)',
    ],
  },
  {
    id: '9:16',
    metric: '9:16',
    name: 'Vertical Viral Suite',
    subtitle: 'Shorts, Reels & TikTok',
    badge: 'ALGORITHM READY',
    icon: Smartphone,
    accent: '#38bdf8',
    specs: {
      target: 'TikTok, Reels, Shorts',
      bitrate: '18–22 Mbps (FHD)',
      processing: 'Safe-Zone Overlay Clearance',
      perk: 'Hormozi Kinetic Captions',
    },
    highlights: [
      'Word-by-word kinetic subtitle pop highlights',
      'Protected UI margin safe-zones',
      'AI face centering & speed ramp transitions',
    ],
  },
  {
    id: 'local',
    metric: '100%',
    name: 'On-Device Privacy',
    subtitle: 'Zero Cloud Upload / Leak',
    badge: 'OFFLINE FIRST',
    icon: ShieldCheck,
    accent: '#10b981',
    specs: {
      target: 'Client Browser Hardware',
      bitrate: '0 KB Cloud Transmission',
      processing: 'Local Whisper AI Speech',
      perk: 'Zero Subscription Paywalls',
    },
    highlights: [
      'Your footage and audio never leave this device',
      'Local Whisper transcription running via WebAssembly',
      'Completely functional without cloud account queues',
    ],
  },
  {
    id: 'mp4',
    metric: 'MP4',
    name: 'Hardware Turbo Export',
    subtitle: 'WebCodecs GPU Acceleration',
    badge: 'ZERO WATERMARK',
    icon: Zap,
    accent: '#f59e0b',
    specs: {
      target: 'Universal MP4 / H.264',
      bitrate: 'Direct Hardware Encode',
      processing: 'WebCodecs Surface Pipeline',
      perk: 'Clean Professional Output',
    },
    highlights: [
      'Fast GPU-accelerated frame processing',
      'Zero export watermarks, clean review copy',
      'Mastered 48kHz audio bus synchronization',
    ],
  },
];

function StudioTelemetryDeck({ soundEnabled }: { soundEnabled: boolean }) {
  const [activeFormatId, setActiveFormatId] = useState<TelemetryFormatId>('16:9');
  const activeData = TELEMETRY_FORMATS.find((f) => f.id === activeFormatId) || TELEMETRY_FORMATS[0];

  return (
    <section className="studio-telemetry-deck">
      <PrecisionCard className="telemetry-card">
        {/* Header with Live Status Pulsar */}
        <div className="telemetry-header">
          <div className="telemetry-title-block">
            <div className="section-eyebrow">
              <Cpu size={12} className="text-sky-400" />
              <span>STUDIO ARCHITECTURE &amp; MULTI-FORMAT TELEMETRY</span>
            </div>
            <h2>Dual-Format Master · 100% On-Device Privacy</h2>
            <p>
              Switch seamlessly between YouTube 16:9 cinema and 9:16 viral vertical feeds. No cloud transfers, no upload wait times, zero video watermarks.
            </p>
          </div>
          <div className="telemetry-live-status-pill">
            <span className="telemetry-pulse-dot" />
            <span>ALL ENGINES LOCAL &amp; HARDWARE ACCELERATED</span>
          </div>
        </div>

        {/* 4 Interactive Format Cards */}
        <div className="telemetry-grid">
          {TELEMETRY_FORMATS.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeFormatId;
            return (
              <div
                key={item.id}
                className={"telemetry-node " + (isActive ? "active" : "")}
                style={{ "--node-accent": item.accent } as React.CSSProperties}
                onClick={() => {
                  setActiveFormatId(item.id);
                  playCryoTone("switch", soundEnabled);
                }}
              >
                <div className="node-top-bar">
                  <div className="node-icon-box">
                    <Icon size={18} />
                  </div>
                  <span className="node-badge">{item.badge}</span>
                </div>

                <div className="node-metric-val">{item.metric}</div>
                <div className="node-title">{item.name}</div>
                <div className="node-sub">{item.subtitle}</div>

                <ul className="node-highlights">
                  {item.highlights.map((h, idx) => (
                    <li key={idx}>
                      <span className="node-bullet-check">✓</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>

                <div className="node-active-bar" />
              </div>
            );
          })}
        </div>

        {/* Live Format Telemetry Inspector Ribbon */}
        <div className="telemetry-inspector-ribbon">
          <div className="inspector-ribbon-tag">
            <Sliders size={13} className="text-sky-400" />
            <span>LIVE FORMAT TELEMETRY: <strong>{activeData.name}</strong></span>
          </div>
          <div className="inspector-specs-grid">
            <div className="spec-item">
              <span className="spec-lbl">TARGET PLATFORM</span>
              <span className="spec-val">{activeData.specs.target}</span>
            </div>
            <div className="spec-divider" />
            <div className="spec-item">
              <span className="spec-lbl">BANDWIDTH PROFILE</span>
              <span className="spec-val">{activeData.specs.bitrate}</span>
            </div>
            <div className="spec-divider" />
            <div className="spec-item">
              <span className="spec-lbl">PIPELINE ARCHITECTURE</span>
              <span className="spec-val">{activeData.specs.processing}</span>
            </div>
            <div className="spec-divider" />
            <div className="spec-item">
              <span className="spec-lbl">CREATOR ADVANTAGE</span>
              <span className="spec-val perk">{activeData.specs.perk}</span>
            </div>
          </div>
        </div>
      </PrecisionCard>
    </section>
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

// 🦉 Arctic Co-Pilot: Interactive Pixel Snow Owl Companion
function PixelSnowOwlCompanion({ soundEnabled }: { soundEnabled: boolean }) {
  const [eyeColor, setEyeColor] = useState<OwlEyeColor>('gold');
  const [lookDirection, setLookDirection] = useState<OwlLookDirection>('center');
  const [tipIndex, setTipIndex] = useState(0);
  const [isWinking, setIsWinking] = useState(false);
  const [sparkleCount, setSparkleCount] = useState(0);

  const CREATOR_TIPS = [
    'Hoo! Drop your core punchline within the first 1.2s — viewer retention surges by 34%.',
    'Hoo! Place captions at 68% screen height so TikTok and Reels descriptions never cover them.',
    'Hoo! Speed ramp down to 0.25x bullet-time right before an action impact for viral dopamine.',
    'Hoo! Silence Slicer eliminates dead-air pauses without chopping off natural voice cadence.',
    'Hoo! 60 FPS exports keep motion blur crisp on high-refresh mobile screens.',
    'Hoo! Use pattern interrupts (sound pops, zoom punches) every 3.5 seconds to reset attention.',
  ];

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const relY = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);

    if (Math.abs(relX) > Math.abs(relY)) {
      setLookDirection(relX < -0.2 ? 'left' : relX > 0.2 ? 'right' : 'center');
    } else {
      setLookDirection(relY < -0.2 ? 'up' : relY > 0.2 ? 'down' : 'center');
    }
  };

  const handlePetOwl = () => {
    setIsWinking(true);
    setSparkleCount((c) => c + 1);
    setTipIndex((prev) => (prev + 1) % CREATOR_TIPS.length);
    playCryoTone('hoot', soundEnabled);
    setTimeout(() => setIsWinking(false), 260);
  };

  return (
    <div
      className="owl-companion-widget"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setLookDirection('center')}
    >
      <div className="owl-avatar-perch" onClick={handlePetOwl} title="Click to pet Bubo the Snowy Owl!">
        <div className="owl-crest-pedestal">
          <PixelSnowOwl
            size={52}
            eyeColor={eyeColor}
            lookDirection={lookDirection}
            blinking={isWinking}
            className="bubo-avatar"
            ariaLabel="Bubo the Snowy Owl Mascot"
          />
          {sparkleCount > 0 && <span key={sparkleCount} className="owl-sparkle-puff">✨ Hoo!</span>}
        </div>
        <div className="owl-perch-branch">
          <span className="perch-icicle-left" />
          <span className="perch-bar" />
          <span className="perch-icicle-right" />
        </div>
      </div>

      <div className="owl-speech-bubble">
        <div className="owl-bubble-header">
          <div className="owl-name-tag">
            <span className="owl-status-dot" />
            <span className="owl-name">BUBO · ARCTIC CO-PILOT</span>
          </div>
          <div className="owl-eye-palette-strip">
            {(['gold', 'cyan', 'emerald', 'violet'] as const).map((color) => (
              <button
                key={color}
                type="button"
                className={`eye-chip ${eyeColor === color ? 'active' : ''} ${color}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setEyeColor(color);
                  playCryoTone('switch', soundEnabled);
                }}
                title={`Owl Eye Color: ${color.toUpperCase()}`}
              />
            ))}
          </div>
        </div>

        <p className="owl-tip-text">“{CREATOR_TIPS[tipIndex]}”</p>

        <div className="owl-bubble-footer">
          <button
            type="button"
            className="owl-action-btn"
            onClick={handlePetOwl}
          >
            <Sparkles size={13} className="text-amber-400" />
            <span>Pet Bubo & Get Next Secret</span>
          </button>
          <span className="owl-counter-hint">Tip {tipIndex + 1} of {CREATOR_TIPS.length}</span>
        </div>
      </div>
    </div>
  );
}

// ⚡ Interactive Speed Ramping Lab (Velocity Curves & Motion Simulation)
interface SpeedCurvePreset {
  id: 'bullet' | 'whip' | 'surge' | 'flash';
  name: string;
  badge: string;
  desc: string;
  curveSvg: string;
  curveFill: string;
  getSpeed: (t: number) => number;
}

const SPEED_PRESETS: SpeedCurvePreset[] = [
  {
    id: 'bullet',
    name: 'Bullet Time',
    badge: '1.8x ➔ 0.25x ➔ 2.0x',
    desc: 'Action impact matrix slowdown',
    curveSvg: 'M 5 20 C 25 20, 40 50, 60 50 C 75 50, 85 18, 95 18',
    curveFill: 'M 5 20 C 25 20, 40 50, 60 50 C 75 50, 85 18, 95 18 L 95 60 L 5 60 Z',
    getSpeed: (t: number) => {
      if (t < 0.25) return 1.8;
      if (t < 0.4) return 1.8 - ((t - 0.25) / 0.15) * 1.55;
      if (t < 0.65) return 0.25;
      if (t < 0.8) return 0.25 + ((t - 0.65) / 0.15) * 1.75;
      return 2.0;
    },
  },
  {
    id: 'whip',
    name: 'Whip-Pan Turbo',
    badge: '0.6x ➔ 4.5x ➔ 1.0x',
    desc: 'Kinetic whip transition snap',
    curveSvg: 'M 5 40 C 30 40, 45 10, 55 10 C 65 10, 80 34, 95 34',
    curveFill: 'M 5 40 C 30 40, 45 10, 55 10 C 65 10, 80 34, 95 34 L 95 60 L 5 60 Z',
    getSpeed: (t: number) => {
      if (t < 0.3) return 0.6;
      if (t < 0.5) return 0.6 + ((t - 0.3) / 0.2) * 3.9;
      if (t < 0.65) return 4.5;
      if (t < 0.85) return 4.5 - ((t - 0.65) / 0.2) * 3.5;
      return 1.0;
    },
  },
  {
    id: 'surge',
    name: 'Hero Surge',
    badge: '0.3x ➔ 2.2x',
    desc: 'Cinematic rising crescendo',
    curveSvg: 'M 5 48 C 35 46, 60 25, 95 12',
    curveFill: 'M 5 48 C 35 46, 60 25, 95 12 L 95 60 L 5 60 Z',
    getSpeed: (t: number) => {
      return 0.3 + Math.pow(t, 2) * 1.9;
    },
  },
  {
    id: 'flash',
    name: 'Flash EDM',
    badge: '2.5x ➔ 0.4x ➔ 3.0x',
    desc: 'Rhythmic bass-drop stutter',
    curveSvg: 'M 5 15 C 25 15, 35 48, 50 48 C 65 48, 75 12, 95 10',
    curveFill: 'M 5 15 C 25 15, 35 48, 50 48 C 65 48, 75 12, 95 10 L 95 60 L 5 60 Z',
    getSpeed: (t: number) => {
      if (t < 0.2) return 2.5;
      if (t < 0.45) return 0.4;
      if (t < 0.7) return 1.2;
      return 3.0;
    },
  },
];

function SpeedRampPlayground({ soundEnabled }: { soundEnabled: boolean }) {
  const [activePresetId, setActivePresetId] = useState<SpeedCurvePreset['id']>('bullet');
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0); // 0 to 1
  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const activePreset = SPEED_PRESETS.find((p) => p.id === activePresetId) || SPEED_PRESETS[0];
  const currentSpeed = activePreset.getSpeed(progress);

  useEffect(() => {
    if (!isPlaying) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    const step = (timestamp: number) => {
      if (lastTimeRef.current === null) lastTimeRef.current = timestamp;
      const deltaSec = Math.min(0.05, (timestamp - lastTimeRef.current) / 1000);
      lastTimeRef.current = timestamp;

      setProgress((prev) => {
        const speed = activePreset.getSpeed(prev);
        // Base timeline duration: 3.0 seconds at 1.0x speed
        const next = prev + (deltaSec * speed) / 3.0;
        return next >= 1 ? 0 : next;
      });

      animRef.current = requestAnimationFrame(step);
    };

    animRef.current = requestAnimationFrame(step);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      lastTimeRef.current = null;
    };
  }, [isPlaying, activePreset]);

  // Motion blur intensity based on speed
  const motionBlurAmount = Math.max(0, (currentSpeed - 1.2) * 2.2);

  return (
    <section className="speed-ramp-section">
      <PrecisionCard className="speed-ramp-card">
        <div className="section-eyebrow">
          <Activity size={13} className="text-sky-400" />
          <span>SPEED RAMPING LAB · VELOCITY ACCELERATION</span>
        </div>

        <div className="speed-ramp-header">
          <div>
            <h2>Feel the Rhythm: Kinetic Velocity Curves</h2>
            <p>
              Short-form dopamine relies on kinetic contrast. Switch bezier curves and watch the live video runner accelerate, time-dilate, and snap forward with real-time motion blur.
            </p>
          </div>
          <div className="speed-live-badge-box">
            <span className={`speed-badge ${currentSpeed < 0.5 ? 'matrix' : currentSpeed > 2.0 ? 'turbo' : 'normal'}`}>
              {currentSpeed < 0.5 ? '❄️ BULLET-TIME 0.25x' : currentSpeed > 2.0 ? `⚡ TURBO ${currentSpeed.toFixed(1)}x` : `${currentSpeed.toFixed(1)}x NORMAL`}
            </span>
          </div>
        </div>

        {/* Preset Selector Strip */}
        <div className="speed-presets-strip">
          {SPEED_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`speed-preset-btn ${activePresetId === preset.id ? 'active' : ''}`}
              onClick={() => {
                setActivePresetId(preset.id);
                setProgress(0);
                playCryoTone('switch', soundEnabled);
              }}
            >
              <div className="preset-mini-svg">
                <svg viewBox="0 0 100 60" className="mini-curve">
                  <path d={preset.curveSvg} fill="none" stroke="currentColor" strokeWidth="3" />
                </svg>
              </div>
              <div className="preset-btn-info">
                <span className="preset-btn-name">{preset.name}</span>
                <span className="preset-btn-badge">{preset.badge}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Speed Curve & Simulation Track */}
        <div className="speed-sim-container">
          {/* SVG Bezier Graph */}
          <div className="speed-graph-card">
            <div className="graph-header">
              <span className="graph-label">BEZIER VELOCITY CURVE</span>
              <span className="graph-preset-name">{activePreset.name} — {activePreset.desc}</span>
            </div>
            <div className="svg-curve-wrapper">
              <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="velocity-svg">
                <defs>
                  <linearGradient id="curveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="var(--gl-cyan)" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="var(--gl-cyan)" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <path d={activePreset.curveFill} fill="url(#curveGradient)" />
                <path d={activePreset.curveSvg} fill="none" stroke="var(--gl-cyan)" strokeWidth="2.5" />
                {/* Active Playhead on Curve */}
                <circle
                  cx={Math.max(5, Math.min(95, 5 + progress * 90))}
                  cy={Math.max(10, Math.min(50, 50 - ((currentSpeed - 0.2) / 4.3) * 40))}
                  r="4"
                  fill="#ffffff"
                  stroke="var(--gl-cyan)"
                  strokeWidth="2"
                  className="curve-playhead-dot"
                />
              </svg>
              <div className="graph-axis-labels">
                <span>0s (Cut Start)</span>
                <span>Peak Impact Beat</span>
                <span>3s (Cut Out)</span>
              </div>
            </div>
          </div>

          {/* Live Motion-Blurred Video Clip Runway Track */}
          <div className="speed-runway-card">
            <div className="runway-header">
              <div className="runway-title-group">
                <span className="runway-label">LIVE SIMULATION TRACK</span>
                <span className="runway-sub">Footage: Arctic_Ski_Drop.mp4</span>
              </div>
              <button
                type="button"
                className="runway-play-toggle"
                onClick={() => {
                  setIsPlaying((p) => !p);
                  playCryoTone('pop', soundEnabled);
                }}
              >
                {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
              </button>
            </div>

            {/* Visual Runway Track with Distance Markers */}
            <div
              className="runway-track"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickProgress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                setProgress(clickProgress);
                playCryoTone('tick', soundEnabled);
              }}
            >
              <div className="track-rail" />
              <div
                className="track-fill-progress"
                style={{ width: `${(progress * 100).toFixed(1)}%` }}
              />

              {/* Animated Video Clip Runner */}
              <div
                className={`runway-runner ${currentSpeed > 2.0 ? 'is-fast' : currentSpeed < 0.5 ? 'is-slow' : ''}`}
                style={{
                  left: `${(progress * 100).toFixed(1)}%`,
                  filter: `blur(${motionBlurAmount.toFixed(1)}px)`,
                }}
              >
                <div className="runner-clip-card">
                  <div className="runner-icon-box">
                    <Zap size={14} className="runner-zap" />
                  </div>
                  <div className="runner-meta">
                    <span className="runner-title">FRAME {Math.floor(progress * 90)}</span>
                    <span className="runner-speed">{currentSpeed.toFixed(2)}×</span>
                  </div>
                </div>
                {currentSpeed > 2.0 && <div className="motion-tail-ghost" />}
              </div>
            </div>

            {/* Speedometer Footer */}
            <div className="runway-meter-footer">
              <div className="meter-scale-bar">
                <span className="scale-mark">0.1x Slow</span>
                <span className="scale-mark center">1.0x Realtime</span>
                <span className="scale-mark right">5.0x Turbo</span>
              </div>
              <div className="meter-value-strip">
                <div
                  className="meter-needle-bar"
                  style={{ width: `${Math.min(100, (currentSpeed / 5.0) * 100).toFixed(1)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </PrecisionCard>
    </section>
  );
}

// 🎰 Viral Hook Slot Machine Generator
const HOOK_REEL_1 = [
  'STOP SCROLLING IF YOU',
  'NOBODY TALKS ABOUT THIS, BUT',
  'THIS 1 VIDEO EDITING MISTAKE',
  'DELETE THIS FROM YOUR TIMELINE IF',
  'I TESTED 50 VIRAL HOOKS AND',
  'THE REASON 99% OF SHORTS FLOP:',
  "DON'T POST ANOTHER VIDEO UNTIL",
];

const HOOK_REEL_2 = [
  'IS DESTROYING YOUR RETENTION IN 3 SECONDS',
  'TRIPLES YOUR AVERAGE WATCH TIME OVERNIGHT',
  'MAKES YOUR PACING UNSTOPPABLY ADDICTIVE',
  'IS SECRETLY REWARDED BY THE ALGORITHM',
  'TURNS BORING FOOTAGE INTO PURE CINEMA',
  'PREVENTS SWIPE-AWAY BEFORE SECOND THREE',
];

const HOOK_REEL_3 = [
  'TRY THIS ON YOUR NEXT EDIT.',
  'WATCH UNTIL THE EXACT PROOF AT 0:15.',
  'SAVE THIS FRAMEWORK BEFORE IT GETS PATCHED.',
  'HERE IS THE EXACT 3-STEP FORMULA:',
  'AND IT ONLY TAKES 10 SECONDS TO FIX.',
];

function ViralHookSpinner({
  soundEnabled,
  onInjectSubtitle,
}: {
  soundEnabled: boolean;
  onInjectSubtitle: (hookText: string) => void;
}) {
  const [reelIndex1, setReelIndex1] = useState(0);
  const [reelIndex2, setReelIndex2] = useState(1);
  const [reelIndex3, setReelIndex3] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [injectedToast, setInjectedToast] = useState(false);

  const fullHookSentence = `${HOOK_REEL_1[reelIndex1]} ${HOOK_REEL_2[reelIndex2]} — ${HOOK_REEL_3[reelIndex3]}`;

  const spinReels = () => {
    if (spinning) return;
    setSpinning(true);
    setCopied(false);
    setInjectedToast(false);
    playCryoTone('snip', soundEnabled);

    let spins = 0;
    const interval = setInterval(() => {
      setReelIndex1(Math.floor(Math.random() * HOOK_REEL_1.length));
      setReelIndex2(Math.floor(Math.random() * HOOK_REEL_2.length));
      setReelIndex3(Math.floor(Math.random() * HOOK_REEL_3.length));
      playCryoTone('tick', soundEnabled);
      spins++;
      if (spins > 9) {
        clearInterval(interval);
        setSpinning(false);
        playCryoTone('jackpot', soundEnabled);
      }
    }, 70);
  };

  const copyToClipboard = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(fullHookSentence);
      setCopied(true);
      playCryoTone('pop', soundEnabled);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const injectToSubtitleForge = () => {
    onInjectSubtitle(fullHookSentence);
    setInjectedToast(true);
    playCryoTone('chime', soundEnabled);
    setTimeout(() => setInjectedToast(false), 2200);
    const forgeEl = document.getElementById('interactive-subtitle-forge-section');
    if (forgeEl) {
      forgeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <section className="viral-hook-section" id="viral-hook-generator">
      <PrecisionCard className="viral-hook-card">
        <div className="section-eyebrow">
          <Sparkles size={12} className="text-amber-400" />
          <span>VIRAL HOOK GENERATOR · HIGH RETENTION SLOTS</span>
        </div>
        <div className="hook-header-row">
          <div>
            <h2>Spin the Algorithmic Hook Reel</h2>
            <p>
              The first 3 seconds decide if your video gets 500 views or 500,000. Spin the slot machine for battle-tested retention formulas.
            </p>
          </div>
          <div className="hook-meta-pill">
            <span className="flame-icon">🔥</span>
            <span>Est. Retention: <strong>94.2%</strong></span>
          </div>
        </div>

        {/* 3 Reel Slots Box */}
        <div className={`hook-reels-container ${spinning ? 'is-spinning' : ''}`}>
          <div className="hook-reel">
            <span className="reel-tag">TRIGGER / ANGLE</span>
            <div className="reel-window">
              <span className="reel-text">{HOOK_REEL_1[reelIndex1]}</span>
            </div>
          </div>
          <div className="hook-reel-divider">+</div>
          <div className="hook-reel">
            <span className="reel-tag">HIGH-STAKES PROMISE</span>
            <div className="reel-window">
              <span className="reel-text">{HOOK_REEL_2[reelIndex2]}</span>
            </div>
          </div>
          <div className="hook-reel-divider">➔</div>
          <div className="hook-reel">
            <span className="reel-tag">CALL TO ACTION</span>
            <div className="reel-window">
              <span className="reel-text">{HOOK_REEL_3[reelIndex3]}</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="hook-actions-bar">
          <button
            type="button"
            className="spin-hook-btn"
            onClick={spinReels}
            disabled={spinning}
          >
            <RotateCcw size={16} className={spinning ? 'spin-rotate' : ''} />
            <span>{spinning ? 'SPINNING REELS…' : 'SPIN HOOK 🎰'}</span>
          </button>

          <button
            type="button"
            className="inject-forge-btn"
            onClick={injectToSubtitleForge}
          >
            <Send size={14} />
            <span>{injectedToast ? 'Sent to Subtitle Forge! ⚡' : 'Send to Subtitle Forge ⚡'}</span>
          </button>

          <button
            type="button"
            className="copy-hook-btn"
            onClick={copyToClipboard}
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span>{copied ? 'Copied to Clipboard!' : 'Copy Hook'}</span>
          </button>
        </div>
      </PrecisionCard>
    </section>
  );
}

// ✍️ Interactive Kinetic Subtitle Forge (Custom User Input Headline!)
function InteractiveSubtitleForge({
  soundEnabled,
  injectedText,
}: {
  soundEnabled: boolean;
  injectedText?: string;
}) {
  const [userText, setUserText] = useState('FIND THE HOOK. CUT THE REST.');
  const [captionPreset, setCaptionPreset] = useState<'glacial' | 'bold' | 'neon' | 'minimal'>('glacial');
  const [wordsPerScreen, setWordsPerScreen] = useState(4);
  const [speed, setSpeed] = useState<'1.0x' | '1.5x' | '2.0x'>('1.5x');

  useEffect(() => {
    if (injectedText) {
      setUserText(injectedText.toUpperCase());
    }
  }, [injectedText]);

  const viralTemplates = [
    'STOP SCROLLING. WATCH THIS.',
    '3 SECRETS NOBODY TELLS YOU.',
    'I TESTED THIS FOR 30 DAYS.',
    'WAIT FOR THE PLOT TWIST 🔥',
  ];

  return (
    <section className="subtitle-forge-section" id="interactive-subtitle-forge-section">
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
  const [injectedSubtitleText, setInjectedSubtitleText] = useState<string | undefined>(undefined);
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
              <PixelSnowOwl size={24} />
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

          {/* Arctic Co-Pilot: Interactive Pixel Snow Owl Mascot */}
          <PixelSnowOwlCompanion soundEnabled={soundEnabled} />

          {/* Interactive Software Cockpit 2.0 Showcase (Fully Playable Mini-Editor!) */}
          <PrecisionCockpit soundEnabled={soundEnabled} />
        </section>

        {/* Studio Telemetry & Format Architecture Deck (Interactive Dual-Format & Privacy Hub) */}
        <StudioTelemetryDeck soundEnabled={soundEnabled} />

        {/* Interactive Silence Slicer Before & After Showcase */}
        <SilenceSlicerShowcase soundEnabled={soundEnabled} />

        {/* ⚡ Interactive Speed Ramping Bezier Lab */}
        <SpeedRampPlayground soundEnabled={soundEnabled} />

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

        {/* 🎰 Viral Hook Slot Machine Generator (Injects directly into Subtitle Forge!) */}
        <ViralHookSpinner
          soundEnabled={soundEnabled}
          onInjectSubtitle={(hookText) => setInjectedSubtitleText(hookText)}
        />

        {/* Interactive Kinetic Subtitle Forge (Live Custom Input!) */}
        <InteractiveSubtitleForge
          soundEnabled={soundEnabled}
          injectedText={injectedSubtitleText}
        />

        {/* Interactive Command Deck (Tactile Keycaps Tester) */}
        <InteractiveCommandDeck soundEnabled={soundEnabled} />

        {/* Tech Companion Assistant 2.0 */}
        <section className="companion-section">
          <ScottishFoldCompanion soundEnabled={soundEnabled} />
        </section>

        {/* Clean Modern Footer */}
        <footer className="glacial-footer">
          <div className="footer-left">
            <div className="brand-crest-box footer-crest">
              <PixelSnowOwl size={18} />
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
