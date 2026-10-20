import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react';

export type OwlEyeColor = 'gold' | 'cyan' | 'emerald' | 'violet';
export type OwlLookDirection = 'left' | 'center' | 'right' | 'up' | 'down';

export interface PixelSnowOwlProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
  blinking?: boolean;
  autoBlink?: boolean;
  eyeColor?: OwlEyeColor;
  lookDirection?: OwlLookDirection;
  showBlush?: boolean;
  interactive?: boolean;
  title?: string;
  ariaLabel?: string;
  onClick?: (e: MouseEvent<SVGSVGElement>) => void;
}

const EYE_PALETTES: Record<OwlEyeColor, { iris: string; irisLight: string; glow: string }> = {
  gold: {
    iris: '#f59e0b',
    irisLight: '#fde047',
    glow: 'rgba(245, 158, 11, 0.45)',
  },
  cyan: {
    iris: '#00f0ff',
    irisLight: '#a5f3fc',
    glow: 'rgba(0, 240, 255, 0.55)',
  },
  emerald: {
    iris: '#10b981',
    irisLight: '#6ee7b7',
    glow: 'rgba(16, 185, 129, 0.45)',
  },
  violet: {
    iris: '#a855f7',
    irisLight: '#d8b4fe',
    glow: 'rgba(168, 85, 247, 0.45)',
  },
};

/**
 * PixelSnowOwl
 * An adorable, ultra-crisp vector pixel art snowy owl head.
 * Rendered using SVG crispEdges for 100% pixel perfection at any screen scale.
 * Features auto-blinking, pupil tracking, ear tufts, and sweet blush pixels.
 */
export function PixelSnowOwl({
  size = 24,
  className = '',
  style,
  blinking: controlledBlink,
  autoBlink = true,
  eyeColor = 'gold',
  lookDirection = 'center',
  showBlush = true,
  interactive = true,
  title = 'FrostCut Snowy Owl',
  ariaLabel = 'FrostCut Pixel Art Snowy Owl',
  onClick,
}: PixelSnowOwlProps) {
  const [internalBlink, setInternalBlink] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Auto-blink timer: every 3.5 to 5.5 seconds, owl winks for 180ms
  useEffect(() => {
    if (!autoBlink || controlledBlink !== undefined) return;
    let timerId: NodeJS.Timeout;

    const scheduleBlink = () => {
      const delay = 3200 + Math.random() * 2400;
      timerId = setTimeout(() => {
        setInternalBlink(true);
        setTimeout(() => {
          setInternalBlink(false);
          scheduleBlink();
        }, 180);
      }, delay);
    };

    scheduleBlink();
    return () => clearTimeout(timerId);
  }, [autoBlink, controlledBlink]);

  const isBlinking = controlledBlink ?? internalBlink;
  const palette = EYE_PALETTES[eyeColor] || EYE_PALETTES.gold;

  // Pupil offsets based on lookDirection
  let pupilDx = 0;
  let pupilDy = 0;
  if (lookDirection === 'left') pupilDx = -1;
  else if (lookDirection === 'right') pupilDx = 1;
  else if (lookDirection === 'up') pupilDy = -1;
  else if (lookDirection === 'down') pupilDy = 1;

  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      className={`pixel-snow-owl ${isHovered ? 'owl-hovered' : ''} ${className}`}
      style={{
        imageRendering: 'pixelated',
        shapeRendering: 'crispEdges',
        display: 'block',
        margin: 'auto',
        flexShrink: 0,
        ...style,
      }}
      role="img"
      aria-label={ariaLabel}
      onMouseEnter={() => interactive && setIsHovered(true)}
      onMouseLeave={() => interactive && setIsHovered(false)}
      onClick={onClick}
    >
      {title && <title>{title}</title>}

      {/* --- LAYER 1: BASE SHADOW & DARK OUTER OUTLINE --- */}
      {/* Ear tufts dark edges */}
      <rect x="4" y="1" width="2" height="1" fill="#0f172a" />
      <rect x="14" y="1" width="2" height="1" fill="#0f172a" />
      <rect x="3" y="2" width="1" height="2" fill="#0f172a" />
      <rect x="16" y="2" width="1" height="2" fill="#0f172a" />

      {/* Head top contour */}
      <rect x="6" y="2" width="8" height="1" fill="#0f172a" />
      <rect x="2" y="4" width="1" height="7" fill="#0f172a" />
      <rect x="17" y="4" width="1" height="7" fill="#0f172a" />

      {/* Chin contour */}
      <rect x="3" y="11" width="1" height="2" fill="#0f172a" />
      <rect x="16" y="11" width="1" height="2" fill="#0f172a" />
      <rect x="4" y="13" width="1" height="2" fill="#0f172a" />
      <rect x="15" y="13" width="1" height="2" fill="#0f172a" />
      <rect x="5" y="15" width="10" height="1" fill="#0f172a" />

      {/* --- LAYER 2: WHITE & ICE-BLUE PLUMAGE --- */}
      {/* Ear tufts white fill */}
      <rect x="4" y="2" width="2" height="2" fill="#ffffff" />
      <rect x="14" y="2" width="2" height="2" fill="#ffffff" />
      <rect x="5" y="3" width="1" height="1" fill="#e0f2fe" />
      <rect x="14" y="3" width="1" height="1" fill="#e0f2fe" />

      {/* Crown & Forehead */}
      <rect x="6" y="3" width="8" height="2" fill="#ffffff" />
      <rect x="3" y="4" width="14" height="2" fill="#ffffff" />

      {/* Snowy plumage spots (characteristic snowy owl markings) */}
      <rect x="7" y="3" width="1" height="1" fill="#64748b" />
      <rect x="12" y="3" width="1" height="1" fill="#64748b" />
      <rect x="5" y="4" width="1" height="1" fill="#94a3b8" />
      <rect x="10" y="4" width="1" height="1" fill="#475569" />
      <rect x="14" y="4" width="1" height="1" fill="#94a3b8" />

      {/* Mid face background behind eyes */}
      <rect x="3" y="6" width="14" height="6" fill="#ffffff" />

      {/* Forehead center feather feathering */}
      <rect x="9" y="5" width="2" height="2" fill="#f8fafc" />
      <rect x="9" y="7" width="2" height="2" fill="#f1f5f9" />

      {/* Fluffy cheeks ice shadow */}
      <rect x="3" y="7" width="1" height="4" fill="#e0f2fe" />
      <rect x="16" y="7" width="1" height="4" fill="#e0f2fe" />
      <rect x="4" y="11" width="1" height="2" fill="#bae6fd" />
      <rect x="15" y="11" width="1" height="2" fill="#bae6fd" />

      {/* Lower chin & chest feather fluff */}
      <rect x="5" y="12" width="10" height="3" fill="#ffffff" />
      <rect x="6" y="14" width="8" height="1" fill="#bae6fd" />
      {/* Chest speckles */}
      <rect x="7" y="13" width="1" height="1" fill="#64748b" />
      <rect x="12" y="13" width="1" height="1" fill="#64748b" />

      {/* --- LAYER 3: CUTE ROSY BLUSH CHEEKS --- */}
      {showBlush && (
        <>
          <rect x="3" y="10" width="2" height="1" fill="#f472b6" opacity="0.85" />
          <rect x="15" y="10" width="2" height="1" fill="#f472b6" opacity="0.85" />
          <rect x="4" y="11" width="1" height="1" fill="#fda4af" opacity="0.6" />
          <rect x="15" y="11" width="1" height="1" fill="#fda4af" opacity="0.6" />
        </>
      )}

      {/* --- LAYER 4: EYES (BIG, ROUND & ADORABLE) --- */}
      {!isBlinking ? (
        <>
          {/* LEFT EYE */}
          {/* Eye socket ring (dark outline) */}
          <rect x="4" y="6" width="4" height="1" fill="#0f172a" />
          <rect x="3" y="7" width="1" height="3" fill="#0f172a" />
          <rect x="8" y="7" width="1" height="3" fill="#0f172a" />
          <rect x="4" y="10" width="4" height="1" fill="#0f172a" />

          {/* Iris color glow */}
          <rect x="4" y="7" width="4" height="3" fill={palette.iris} />
          <rect x="5" y="9" width="2" height="1" fill={palette.irisLight} />

          {/* Jet black pupil (moves with pupilDx / pupilDy) */}
          <rect
            x={5 + pupilDx}
            y={7 + pupilDy}
            width="2"
            height="2"
            fill="#020617"
          />

          {/* Glistening white catchlight (stays high-left for cuteness) */}
          <rect x="4" y="7" width="1" height="1" fill="#ffffff" />
          <rect x="5" y="7" width="1" height="1" fill="#ffffff" />

          {/* RIGHT EYE */}
          {/* Eye socket ring (dark outline) */}
          <rect x="12" y="6" width="4" height="1" fill="#0f172a" />
          <rect x="11" y="7" width="1" height="3" fill="#0f172a" />
          <rect x="16" y="7" width="1" height="3" fill="#0f172a" />
          <rect x="12" y="10" width="4" height="1" fill="#0f172a" />

          {/* Iris color glow */}
          <rect x="12" y="7" width="4" height="3" fill={palette.iris} />
          <rect x="13" y="9" width="2" height="1" fill={palette.irisLight} />

          {/* Jet black pupil (moves with pupilDx / pupilDy) */}
          <rect
            x={13 + pupilDx}
            y={7 + pupilDy}
            width="2"
            height="2"
            fill="#020617"
          />

          {/* Glistening white catchlight */}
          <rect x="12" y="7" width="1" height="1" fill="#ffffff" />
          <rect x="13" y="7" width="1" height="1" fill="#ffffff" />
        </>
      ) : (
        /* BLINKING EXPRESSION: Happy curved eyelids (^ _ ^) */
        <>
          {/* Left closed eye */}
          <rect x="4" y="7" width="1" height="1" fill="#bae6fd" />
          <rect x="5" y="8" width="3" height="1" fill="#0f172a" />
          <rect x="4" y="8" width="1" height="1" fill="#0f172a" />
          <rect x="8" y="8" width="1" height="1" fill="#bae6fd" />

          {/* Right closed eye */}
          <rect x="11" y="8" width="1" height="1" fill="#bae6fd" />
          <rect x="12" y="8" width="3" height="1" fill="#0f172a" />
          <rect x="15" y="8" width="1" height="1" fill="#0f172a" />
          <rect x="15" y="7" width="1" height="1" fill="#bae6fd" />
        </>
      )}

      {/* --- LAYER 5: CUTE GOLDEN BEAK --- */}
      {/* Upper beak */}
      <rect x="9" y="8" width="2" height="1" fill="#fbbf24" />
      {/* Mid beak */}
      <rect x="9" y="9" width="2" height="2" fill="#f59e0b" />
      {/* Lower point */}
      <rect x="9" y="11" width="2" height="1" fill="#d97706" />
      {/* Center highlight */}
      <rect x="9" y="9" width="1" height="1" fill="#fef08a" />
    </svg>
  );
}

export default PixelSnowOwl;
