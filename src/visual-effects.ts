export type ChromaKey = {
  enabled: boolean;
  color: string;
  similarity: number;
  softness: number;
  spill: number;
};

export type ClipMask = {
  enabled: boolean;
  shape: 'rectangle' | 'ellipse' | 'polygon';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  feather: number;
  invert: boolean;
  points: { x: number; y: number }[];
};

export type ColorGradeEffect = {
  enabled: boolean;
  exposure: number;
  temperature: number;
  tint: number;
  contrast: number;
  lift: [number, number, number];
  gamma: [number, number, number];
  gain: [number, number, number];
};

export type LensEffect = {
  enabled: boolean;
  vignette: number;
  chromaticAberration: number;
  distortion: number;
};

export type CornerPinEffect = {
  enabled: boolean;
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
};

export type VisualEffects = {
  chroma?: ChromaKey;
  mask?: ClipMask;
  grade?: ColorGradeEffect;
  lens?: LensEffect;
  cornerPin?: CornerPinEffect;
};

export const defaultChroma = (): ChromaKey => ({
  enabled: true,
  color: '#00ff00',
  similarity: 20,
  softness: 15,
  spill: 50,
});

export const defaultMask = (): ClipMask => ({
  enabled: true,
  shape: 'ellipse',
  x: 50,
  y: 50,
  width: 80,
  height: 80,
  rotation: 0,
  feather: 0,
  invert: false,
  points: [
    { x: 20, y: 20 },
    { x: 80, y: 20 },
    { x: 80, y: 80 },
    { x: 20, y: 80 },
  ],
});

export const defaultGrade = (): ColorGradeEffect => ({
  enabled: true,
  exposure: 0,
  temperature: 0,
  tint: 0,
  contrast: 100,
  lift: [0, 0, 0],
  gamma: [1, 1, 1],
  gain: [1, 1, 1],
});

export const defaultLens = (): LensEffect => ({
  enabled: true,
  vignette: 0,
  chromaticAberration: 0,
  distortion: 0,
});

export const defaultCornerPin = (): CornerPinEffect => ({
  enabled: true,
  topLeft: { x: 0, y: 0 },
  topRight: { x: 100, y: 0 },
  bottomRight: { x: 100, y: 100 },
  bottomLeft: { x: 0, y: 100 },
});

export const hasVisualEffects = (effects?: VisualEffects) =>
  !!(
    effects?.chroma?.enabled ||
    effects?.mask?.enabled ||
    effects?.grade?.enabled ||
    effects?.lens?.enabled ||
    effects?.cornerPin?.enabled
  );

export function validVisualEffects(value: unknown): value is VisualEffects {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const effects = value as VisualEffects;
  if (
    Object.keys(effects).some(
      (key) => !['chroma', 'mask', 'grade', 'lens', 'cornerPin'].includes(key),
    )
  )
    return false;
  const number = (n: unknown, min = 0, max = 100) =>
    typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;

  if (effects.chroma !== undefined) {
    const c = effects.chroma;
    if (
      !c ||
      typeof c.enabled !== 'boolean' ||
      !/^#[0-9a-f]{6}$/i.test(c.color) ||
      ![c.similarity, c.softness, c.spill].every((n) => number(n))
    )
      return false;
  }

  if (effects.mask !== undefined) {
    const m = effects.mask;
    if (
      !m ||
      typeof m.enabled !== 'boolean' ||
      typeof m.invert !== 'boolean' ||
      !['rectangle', 'ellipse', 'polygon'].includes(m.shape) ||
      !number(m.x) ||
      !number(m.y) ||
      !number(m.width, 1) ||
      !number(m.height, 1) ||
      !number(m.rotation, -180, 180) ||
      !number(m.feather, 0, 30) ||
      !Array.isArray(m.points) ||
      m.points.length < 3 ||
      m.points.length > 24 ||
      m.points.some((p) => !p || !number(p.x) || !number(p.y))
    )
      return false;
  }

  if (effects.grade !== undefined) {
    const g = effects.grade;
    if (
      !g ||
      typeof g.enabled !== 'boolean' ||
      !number(g.exposure, -4, 4) ||
      !number(g.temperature, -100, 100) ||
      !number(g.tint, -100, 100) ||
      !number(g.contrast, 0, 200) ||
      !Array.isArray(g.lift) ||
      g.lift.length !== 3 ||
      !g.lift.every((n) => number(n, -1, 1)) ||
      !Array.isArray(g.gamma) ||
      g.gamma.length !== 3 ||
      !g.gamma.every((n) => number(n, 0.1, 5)) ||
      !Array.isArray(g.gain) ||
      g.gain.length !== 3 ||
      !g.gain.every((n) => number(n, 0, 5))
    )
      return false;
  }

  if (effects.lens !== undefined) {
    const l = effects.lens;
    if (
      !l ||
      typeof l.enabled !== 'boolean' ||
      !number(l.vignette, 0, 100) ||
      !number(l.chromaticAberration, 0, 100) ||
      !number(l.distortion, -100, 100)
    )
      return false;
  }

  if (effects.cornerPin !== undefined) {
    const cp = effects.cornerPin;
    if (
      !cp ||
      typeof cp.enabled !== 'boolean' ||
      ![cp.topLeft, cp.topRight, cp.bottomRight, cp.bottomLeft].every(
        (p) => p && number(p.x, -50, 150) && number(p.y, -50, 150),
      )
    )
      return false;
  }

  return true;
}

export function rgbColor(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}
