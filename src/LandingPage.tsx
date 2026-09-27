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
  MessageSquareText,
  Zap,
  Lock,
  Type,
  Flame,
  Youtube,
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

// 🌌 Canvas Engine: Aurora Borealis, Gothic Castle Silhouette, Rolling Mist & Snow
function GothicAtmosphereCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Pre-render Castle Silhouette into Offscreen Canvas to avoid 30+ path re-calculations every frame
    const offscreenCastle = document.createElement('canvas');
    const renderCastleOffscreen = (cWidth: number, cHeight: number) => {
      offscreenCastle.width = cWidth;
      offscreenCastle.height = cHeight;
      const cCtx = offscreenCastle.getContext('2d');
      if (!cCtx) return;

      const baseY = Math.min(cHeight * 0.62, cHeight - 260);

      cCtx.save();
      cCtx.beginPath();
      cCtx.moveTo(0, cHeight);
      cCtx.lineTo(0, baseY + 60);

      // Distant jagged mountains & fortress spires
      cCtx.lineTo(cWidth * 0.05, baseY + 30);
      cCtx.lineTo(cWidth * 0.08, baseY - 20); // Spire 1
      cCtx.lineTo(cWidth * 0.1, baseY + 25);
      cCtx.lineTo(cWidth * 0.14, baseY + 20);

      // Cathedral Spire Left
      cCtx.lineTo(cWidth * 0.17, baseY - 80);
      cCtx.lineTo(cWidth * 0.18, baseY - 120);
      cCtx.lineTo(cWidth * 0.19, baseY - 80);
      cCtx.lineTo(cWidth * 0.22, baseY + 10);

      // Castle Wall & Flying Buttresses
      cCtx.lineTo(cWidth * 0.26, baseY - 10);
      cCtx.lineTo(cWidth * 0.28, baseY - 50);
      cCtx.lineTo(cWidth * 0.3, baseY - 15);
      cCtx.lineTo(cWidth * 0.35, baseY);

      // Central Grand Gothic Spire
      cCtx.lineTo(cWidth * 0.44, baseY - 30);
      cCtx.lineTo(cWidth * 0.47, baseY - 140);
      cCtx.lineTo(cWidth * 0.48, baseY - 170);
      cCtx.lineTo(cWidth * 0.49, baseY - 140);
      cCtx.lineTo(cWidth * 0.52, baseY - 20);

      // Cathedral Nave & Roof Ridge
      cCtx.lineTo(cWidth * 0.58, baseY - 35);
      cCtx.lineTo(cWidth * 0.62, baseY - 65);
      cCtx.lineTo(cWidth * 0.64, baseY - 110);
      cCtx.lineTo(cWidth * 0.65, baseY - 65);
      cCtx.lineTo(cWidth * 0.7, baseY - 10);

      // Right Fortress Bastion
      cCtx.lineTo(cWidth * 0.75, baseY + 15);
      cCtx.lineTo(cWidth * 0.79, baseY - 70);
      cCtx.lineTo(cWidth * 0.81, baseY - 30);
      cCtx.lineTo(cWidth * 0.86, baseY + 10);
      cCtx.lineTo(cWidth * 0.9, baseY - 45);
      cCtx.lineTo(cWidth * 0.92, baseY + 20);
      cCtx.lineTo(cWidth, baseY + 50);
      cCtx.lineTo(cWidth, cHeight);
      cCtx.closePath();

      // Deep obsidian gradient fill
      const castleGrad = cCtx.createLinearGradient(0, baseY - 180, 0, cHeight);
      castleGrad.addColorStop(0, 'rgba(8, 14, 24, 0.45)');
      castleGrad.addColorStop(0.4, 'rgba(5, 8, 14, 0.75)');
      castleGrad.addColorStop(1, 'rgba(2, 4, 8, 0.95)');
      cCtx.fillStyle = castleGrad;
      cCtx.fill();

      // Delicate Candlelit Amber Lancet Windows
      const drawWindow = (wx: number, wy: number, ww: number, wh: number) => {
        cCtx.save();
        cCtx.fillStyle = 'rgba(251, 191, 36, 0.85)';
        cCtx.shadowColor = '#f59e0b';
        cCtx.shadowBlur = 6;
        cCtx.beginPath();
        cCtx.ellipse(wx, wy, ww, wh, 0, 0, Math.PI * 2);
        cCtx.fill();
        cCtx.restore();
      };

      drawWindow(cWidth * 0.18, baseY - 40, 2, 6);
      drawWindow(cWidth * 0.48, baseY - 75, 2.5, 8);
      drawWindow(cWidth * 0.48, baseY - 45, 2.5, 7);
      drawWindow(cWidth * 0.635, baseY - 40, 2.5, 7);
      drawWindow(cWidth * 0.795, baseY - 35, 2, 5);

      cCtx.restore();
    };

    renderCastleOffscreen(width, height);

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      renderCastleOffscreen(width, height);
    };
    window.addEventListener('resize', onResize, { passive: true });

    // Particle definition
    interface Flake {
      x: number;
      y: number;
      radius: number;
      speedY: number;
      speedX: number;
      phase: number;
    }

    const flakesCount = Math.min(65, Math.floor(window.innerWidth / 20));
    const flakes: Flake[] = [];

    for (let i = 0; i < flakesCount; i++) {
      flakes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.8 + 0.6,
        speedY: Math.random() * 0.6 + 0.3,
        speedX: Math.random() * 0.3 - 0.15,
        phase: Math.random() * Math.PI * 2,
      });
    }

    let mouseX = -1000;
    let mouseY = -1000;
    const onMouseMove = (e: globalThis.MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    let isVisible = true;
    const onVisibility = () => {
      isVisible = !document.hidden;
      if (isVisible) {
        cancelAnimationFrame(animId);
        animId = requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    let frame = 0;
    const render = () => {
      if (!isVisible) return;
      frame++;
      ctx.clearRect(0, 0, width, height);

      // 1. 🌌 Aurora Borealis (Waving Ribbons of Northern Light)
      const wave1 = Math.sin(frame * 0.007) * 35;
      const wave2 = Math.cos(frame * 0.009) * 45;

      const auroraGrad1 = ctx.createLinearGradient(0, 0, width, height * 0.45);
      auroraGrad1.addColorStop(0, 'transparent');
      auroraGrad1.addColorStop(0.3, 'rgba(45, 212, 191, 0.08)');
      auroraGrad1.addColorStop(0.6, 'rgba(20, 184, 166, 0.04)');
      auroraGrad1.addColorStop(1, 'transparent');

      ctx.beginPath();
      ctx.moveTo(0, height * 0.12 + wave1);
      ctx.bezierCurveTo(
        width * 0.3,
        height * 0.05 + wave2,
        width * 0.7,
        height * 0.28 + wave1,
        width,
        height * 0.15 + wave2,
      );
      ctx.lineTo(width, height * 0.4);
      ctx.bezierCurveTo(
        width * 0.7,
        height * 0.45 + wave1,
        width * 0.3,
        height * 0.2 + wave2,
        0,
        height * 0.3 + wave1,
      );
      ctx.closePath();
      ctx.fillStyle = auroraGrad1;
      ctx.fill();

      // 2. 🏰 Gothic Castle Silhouette (BLITTED IN 1 GPU CALL FROM CACHED CANVAS)
      ctx.drawImage(offscreenCastle, 0, 0);

      // 3. 🌫️ Rolling Cold Winter Mist
      const mistX1 = ((frame * 0.3) % (width + 500)) - 250;
      const grad1 = ctx.createRadialGradient(
        mistX1,
        height - 60,
        30,
        mistX1,
        height - 60,
        Math.min(500, width * 0.55),
      );
      grad1.addColorStop(0, 'rgba(14, 116, 144, 0.08)');
      grad1.addColorStop(0.7, 'transparent');
      ctx.fillStyle = grad1;
      ctx.fillRect(0, height - 320, width, 320);

      // 4. ❄️ Falling Snow (BATCHED IN 1 SINGLE GPU DRAW CALL)
      ctx.fillStyle = 'rgba(186, 230, 253, 0.55)';
      ctx.beginPath();
      for (let i = 0; i < flakes.length; i++) {
        const f = flakes[i];
        f.y += f.speedY;
        f.x += f.speedX + Math.sin(frame * 0.015 + f.phase) * 0.2;

        const dx = f.x - mouseX;
        const dy = f.y - mouseY;
        const distSq = dx * dx + dy * dy;
        if (distSq < 6400 && distSq > 0) {
          const dist = Math.sqrt(distSq);
          const force = (1 - dist / 80) * 1.2;
          f.x += (dx / dist) * force;
          f.y += (dy / dist) * force;
        }

        if (f.y > height + 5) {
          f.y = -5;
          f.x = Math.random() * width;
        }
        if (f.x > width + 5) f.x = -5;
        if (f.x < -5) f.x = width + 5;

        ctx.moveTo(f.x + f.radius, f.y);
        ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
      }
      ctx.fill();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(animId);
    };
  }, []);

  return <canvas ref={canvasRef} className="gothic-snow-canvas" aria-hidden="true" />;
}

// 🕯️ Warm Amber Lantern Cursor: Follows mouse and provides warm light through the cold
// (100% GPU Hardware Accelerated - ZERO React state re-renders)
function WarmAmberLantern() {
  const lanternRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let targetX = -1000;
    let targetY = -1000;
    let currentX = -1000;
    let currentY = -1000;
    let frameId: number;
    let visible = false;

    const onMove = (e: globalThis.MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
      if (!visible) {
        visible = true;
        currentX = targetX;
        currentY = targetY;
        if (lanternRef.current) lanternRef.current.style.opacity = '1';
      }
    };
    window.addEventListener('mousemove', onMove, { passive: true });

    const lerp = () => {
      currentX += (targetX - currentX) * 0.16;
      currentY += (targetY - currentY) * 0.16;
      if (lanternRef.current && visible) {
        lanternRef.current.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
      }
      frameId = requestAnimationFrame(lerp);
    };
    frameId = requestAnimationFrame(lerp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div
      ref={lanternRef}
      className="warm-amber-lantern"
      style={{ opacity: 0, willChange: 'transform' }}
      aria-hidden="true"
    >
      <div className="lantern-ember-core" />
      <div className="lantern-amber-halo" />
    </div>
  );
}

// 🧊 Frost Thaw Card Wrapper: Frost melts away when mouse hovers over it
// (Direct CSS Custom Property updates - ZERO React setState re-renders)
interface FrostThawCardProps {
  className?: string;
  children: ReactNode;
}

function FrostThawCard({ className = '', children }: FrostThawCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const handlePointerMove = (e: MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const clientX = e.clientX;
    const clientY = e.clientY;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--thaw-x', `${clientX - rect.left}px`);
      card.style.setProperty('--thaw-y', `${clientY - rect.top}px`);
      card.classList.add('thawing');
    });
  };

  const handlePointerLeave = () => {
    cancelAnimationFrame(rafRef.current);
    const card = cardRef.current;
    if (!card) return;
    card.classList.remove('thawing');
  };

  return (
    <div
      ref={cardRef}
      className={`frost-thaw-card ${className}`}
      onMouseMove={handlePointerMove}
      onMouseLeave={handlePointerLeave}
    >
      {/* Dynamic Melting Frost Overlay */}
      <div className="frost-glass-sheet" aria-hidden="true" />
      <div className="thaw-amber-edge" aria-hidden="true" />
      <div className="card-inner-content">{children}</div>
    </div>
  );
}

// 🐱 Pixel Art Scottish Fold Cat (Faithfully based on user's chubby fold photo)
function PixelScottishFoldMascot() {
  const [pupilOffset, setPupilOffset] = useState({ x: 0, y: 0 });
  const [purring, setPurring] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [burstKey, setBurstKey] = useState(0);
  const [blinking, setBlinking] = useState(false);

  const tips = [
    'Hey! Your footage stays 100% on your device. Zero cloud uploads, zero privacy leaks.',
    'Auto Cut slices dead pauses and repeated takes automatically.',
    'Dynamic subtitles with semantic keyword pops boost viewer retention by 40%.',
    'Render and export directly from your local browser with WebCodecs at 60 FPS.',
  ];

  // Natural pixel blinking
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlinking(true);
      setTimeout(() => setBlinking(false), 180);
    }, 4200);
    return () => clearInterval(blinkInterval);
  }, []);

  // Pupil eye-tracking towards mouse (RAF throttled + viewport check)
  useEffect(() => {
    let lastX = 0;
    let lastY = 0;
    let rafId: number;

    const handleMove = (e: globalThis.MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const el = document.getElementById('pixel-cat-container');
        if (!el) return;
        const rect = el.getBoundingClientRect();
        // Skip calculation if element is offscreen
        if (rect.bottom < 0 || rect.top > window.innerHeight) return;

        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;

        const angle = Math.atan2(dy, dx);
        // Discrete pixel step: -1, 0, or 1 in pixel grid
        const px = Math.round(Math.cos(angle));
        const py = Math.round(Math.sin(angle));
        if (px !== lastX || py !== lastY) {
          lastX = px;
          lastY = py;
          setPupilOffset({ x: px, y: py });
        }
      });
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  const handleClick = () => {
    setPurring(true);
    setBurstKey((k) => k + 1);
    setTipIndex((prev) => (prev + 1) % tips.length);
    setTimeout(() => setPurring(false), 900);
  };

  return (
    <div
      className="cat-interactive-card pixel-cat-card"
      id="pixel-cat-container"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      title="Click your chubby Scottish Fold for tips!"
    >
      <div className="cat-visual-stage">
        {/* Ambient warm amber & frost aura */}
        <div className={`cat-aura-glow ${purring ? 'purr-active' : ''}`} />

        {/* 48x48 Authentic Pixel Art Scottish Fold SVG in Sitting Posture with Cozy Scarf */}
        <svg
          className={`pixel-cat-svg ${purring ? 'cat-bounce' : ''}`}
          viewBox="0 0 48 48"
          width="105"
          height="105"
          shapeRendering="crispEdges"
        >
          {/* Ground shadow beneath paws and sitting body */}
          <rect x="7" y="43" width="34" height="2" fill="rgba(3,7,14,0.55)" />
          {/* Striped Fluffy Tail (curling peacefully beside the cat on the floor) */}
          <rect x="35" y="41" width="6" height="3" fill="#cbd5e1" />
          <rect x="39" y="38" width="4" height="4" fill="#94a3b8" />
          <rect x="41" y="34" width="4" height="4" fill="#cbd5e1" />
          <rect x="42" y="29" width="3" height="5" fill="#64748b" />
          <rect x="41" y="25" width="3" height="4" fill="#475569" />
          <rect x="39" y="23" width="3" height="3" fill="#334155" /> {/* Dark tail tip */}
          {/* Chubby Sitting Body & Haunches */}
          {/* Left Sitting Haunch/Thigh */}
          <rect x="8" y="32" width="9" height="11" fill="#f8fafc" />
          <rect x="7" y="34" width="2" height="8" fill="#cbd5e1" />
          <rect x="8" y="35" width="3" height="2" fill="#94a3b8" />
          <rect x="8" y="39" width="3" height="2" fill="#94a3b8" />
          {/* Right Sitting Haunch/Thigh */}
          <rect x="31" y="32" width="9" height="11" fill="#f8fafc" />
          <rect x="39" y="34" width="2" height="8" fill="#cbd5e1" />
          <rect x="37" y="35" width="3" height="2" fill="#94a3b8" />
          <rect x="37" y="39" width="3" height="2" fill="#94a3b8" />
          {/* Central Chubby Belly & Chest (Creamy white) */}
          <rect x="13" y="25" width="22" height="17" fill="#f8fafc" />
          <rect x="15" y="26" width="18" height="15" fill="#ffffff" />
          {/* Front Left Leg & Paw Planted on the Ground */}
          <rect x="16" y="32" width="5" height="9" fill="#f1f5f9" />
          <rect x="15" y="40" width="7" height="4" fill="#ffffff" />
          <rect x="16" y="43" width="5" height="1" fill="#cbd5e1" />
          <rect x="17" y="42" width="1" height="1" fill="#fda4af" />
          <rect x="19" y="42" width="1" height="1" fill="#fda4af" />
          {/* Front Right Leg & Paw Planted on the Ground */}
          <rect x="27" y="32" width="5" height="9" fill="#f1f5f9" />
          <rect x="26" y="40" width="7" height="4" fill="#ffffff" />
          <rect x="27" y="43" width="5" height="1" fill="#cbd5e1" />
          <rect x="28" y="42" width="1" height="1" fill="#fda4af" />
          <rect x="30" y="42" width="1" height="1" fill="#fda4af" />
          {/* 🧣 Cozy Knit Winter Scarf (Warm Amber/Crimson Pattern) */}
          {/* Main Scarf Wrap Around Neck */}
          <rect x="11" y="21" width="26" height="5" fill="#d97706" />
          <rect x="12" y="22" width="24" height="3" fill="#f59e0b" />
          <rect x="14" y="21" width="3" height="5" fill="#be123c" />
          <rect x="20" y="21" width="2" height="5" fill="#be123c" />
          <rect x="26" y="21" width="2" height="5" fill="#be123c" />
          <rect x="31" y="21" width="3" height="5" fill="#be123c" />
          {/* Scarf Knot */}
          <rect x="21" y="23" width="6" height="4" fill="#b45309" />
          <rect x="22" y="24" width="4" height="2" fill="#d97706" />
          {/* Scarf Tail Hanging Down in Front */}
          <rect x="22" y="26" width="4" height="9" fill="#d97706" />
          <rect x="22" y="28" width="4" height="2" fill="#f59e0b" />
          <rect x="22" y="32" width="4" height="2" fill="#be123c" />
          {/* Scarf Tassels / Fringe */}
          <rect x="22" y="35" width="1" height="2" fill="#fbbf24" />
          <rect x="24" y="35" width="1" height="2" fill="#fbbf24" />
          <rect x="25" y="35" width="1" height="2" fill="#fbbf24" />
          {/* Round Head (Scottish Fold) */}
          <rect x="11" y="8" width="26" height="15" fill="#f8fafc" />
          <rect x="10" y="10" width="28" height="11" fill="#f8fafc" />
          {/* Folded Ears (Folded tightly downwards on head like photo) */}
          {/* Left Folded Ear */}
          <rect x="9" y="7" width="5" height="4" fill="#94a3b8" />
          <rect x="10" y="9" width="4" height="3" fill="#cbd5e1" />
          <rect x="11" y="10" width="2" height="2" fill="#fda4af" />
          {/* Right Folded Ear */}
          <rect x="34" y="7" width="5" height="4" fill="#94a3b8" />
          <rect x="34" y="9" width="4" height="3" fill="#cbd5e1" />
          <rect x="35" y="10" width="2" height="2" fill="#fda4af" />
          {/* Forehead Grey Tabby "M" Stripes */}
          <rect x="21" y="9" width="1" height="3" fill="#94a3b8" />
          <rect x="26" y="9" width="1" height="3" fill="#94a3b8" />
          <rect x="22" y="11" width="4" height="1" fill="#64748b" />
          <rect x="23" y="12" width="2" height="2" fill="#94a3b8" />
          {/* Chubby Cheeks Shadow */}
          <rect x="10" y="16" width="3" height="4" fill="#e2e8f0" />
          <rect x="35" y="16" width="3" height="4" fill="#e2e8f0" />
          {/* Soulful Ice-Blue Eyes (with pupil tracking & blinking) */}
          {blinking ? (
            <>
              {/* Closed happy eyes while blinking or purring */}
              <rect x="15" y="15" width="5" height="1" fill="#334155" />
              <rect x="28" y="15" width="5" height="1" fill="#334155" />
            </>
          ) : (
            <>
              {/* Left Eye */}
              <rect x="15" y="13" width="5" height="5" fill="#0284c7" />
              <rect x="16" y="13" width="3" height="5" fill="#38bdf8" />
              <rect x="15" y="14" width="5" height="3" fill="#7dd3fc" />
              {/* Left Eye Pupil (Tracking Mouse) */}
              <rect
                x={17 + pupilOffset.x}
                y={14 + pupilOffset.y}
                width="2"
                height="3"
                fill="#0f172a"
              />
              <rect x="18" y="13" width="1" height="1" fill="#ffffff" /> {/* Eye glint */}
              {/* Right Eye */}
              <rect x="28" y="13" width="5" height="5" fill="#0284c7" />
              <rect x="29" y="13" width="3" height="5" fill="#38bdf8" />
              <rect x="28" y="14" width="5" height="3" fill="#7dd3fc" />
              {/* Right Eye Pupil (Tracking Mouse) */}
              <rect
                x={30 + pupilOffset.x}
                y={14 + pupilOffset.y}
                width="2"
                height="3"
                fill="#0f172a"
              />
              <rect x="31" y="13" width="1" height="1" fill="#ffffff" />
            </>
          )}
          {/* Cute Greyish Pink Nose */}
          <rect x="23" y="18" width="2" height="1" fill="#f43f5e" />
          <rect x="23" y="19" width="2" height="1" fill="#e11d48" />
          {/* Mouth (Sweet cat smile) */}
          <rect x="22" y="20" width="1" height="1" fill="#64748b" />
          <rect x="25" y="20" width="1" height="1" fill="#64748b" />
          <rect x="23" y="20" width="2" height="1" fill="#f8fafc" />
          {/* Delicate Pixel Whiskers */}
          <rect x="6" y="17" width="4" height="1" fill="#94a3b8" />
          <rect x="5" y="20" width="5" height="1" fill="#94a3b8" />
          <rect x="38" y="17" width="4" height="1" fill="#94a3b8" />
          <rect x="38" y="20" width="5" height="1" fill="#94a3b8" />
        </svg>

        {/* Floating Heart / Amber Sparks on Purr */}
        {purring && (
          <div className="purr-hearts" key={burstKey}>
            <span className="burst-item i1">❄️</span>
            <span className="burst-item i2">✨</span>
            <span className="burst-item i3">💙</span>
          </div>
        )}
      </div>

      <div className="cat-dialog-wrap">
        <div className="cat-status-line">
          <span className="cat-dot" />
          <b>SCOTTISH FOLD GUARDIAN</b>
          <span className="cat-sub-hint">Click me for tips</span>
        </div>
        <p className="cat-quote">{tips[tipIndex]}</p>
      </div>
    </div>
  );
}

// 🗿 The Obsidian Monolith: 3D Interactive Editor Showcase
// (100% Direct DOM Ref & RAF - ZERO React Root Re-renders on MouseMove)
function ObsidianMonolith() {
  const monolithRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const handleMonolithMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (monolithRef.current) {
        monolithRef.current.style.transform = `rotateX(${y * -8}deg) rotateY(${x * 8}deg)`;
      }
    });
  };

  const handleMonolithLeave = () => {
    cancelAnimationFrame(rafRef.current);
    if (monolithRef.current) {
      monolithRef.current.style.transform = 'rotateX(0deg) rotateY(0deg)';
    }
  };

  return (
    <div className="hero-product gothic-monolith-wrapper">
      <FrostThawCard className="monolith-thaw-shell">
        <div
          ref={monolithRef}
          className="gothic-monolith"
          onMouseMove={handleMonolithMove}
          onMouseLeave={handleMonolithLeave}
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
              <span className="icicle-bar" style={{ height: '20px', animationDelay: '0.15s' }} />
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
      </FrostThawCard>
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
  // Subtitle Preview Preset
  const [captionPreset, setCaptionPreset] = useState<'clean' | 'glacial' | 'bold'>('glacial');

  // Media & YouTube Importer State
  const [importerOpen, setImporterOpen] = useState(false);
  const handleMediaReady = (file: File) => {
    if (onImportFile) {
      onImportFile(file);
    } else {
      onStartEditing();
    }
  };

  return (
    <main className="landing gothic-landing">
      {/* Background Interactive Canvas: Aurora Borealis + Gothic Castle + Snow */}
      <GothicAtmosphereCanvas />

      {/* Warm Amber Lantern Cursor */}
      <WarmAmberLantern />

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
            <button
              className="text-button gothic-nav-btn-ghost"
              onClick={() => setImporterOpen(true)}
            >
              <Youtube size={15} style={{ marginRight: 6 }} /> Import YouTube
            </button>
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
              {onTrySpeechDemo && (
                <button className="demo-button gothic-cta-demo" onClick={onTrySpeechDemo}>
                  Try a spoken demo <Play size={13} />
                </button>
              )}

              <button
                className="demo-button gothic-cta-import"
                onClick={() => setImporterOpen(true)}
              >
                <span className="gothic-demo-icon-ring import-icon-ring">
                  <Youtube size={13} />
                </span>
                Import YouTube / Audio
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

          {/* Right Column: The Obsidian Monolith (3D Editor Showcase with Frost Thawing) */}
          <ObsidianMonolith />
        </section>

        {/* Feature Grid: Clean, creator-focused core benefits with Frost Thaw */}
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
            <FrostThawCard className="gothic-pillar-card">
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
            </FrostThawCard>

            {/* Pillar 2 */}
            <FrostThawCard className="gothic-pillar-card">
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
            </FrostThawCard>

            {/* Pillar 3 */}
            <FrostThawCard className="gothic-pillar-card">
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
            </FrostThawCard>
          </div>
        </section>

        {/* Interactive Subtitle Style Playground with Frost Thaw */}
        <section className="gothic-caption-forge">
          <FrostThawCard className="forge-card-thaw-wrap">
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
          </FrostThawCard>
        </section>

        {/* Featured Scottish Fold Cat Mascot */}
        <section className="gothic-familiar-section">
          <PixelScottishFoldMascot />
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

      {/* Media & Remote YouTube Importer Modal */}
      <MediaImporterModal
        isOpen={importerOpen}
        onClose={() => setImporterOpen(false)}
        onMediaReady={handleMediaReady}
      />
    </main>
  );
}
