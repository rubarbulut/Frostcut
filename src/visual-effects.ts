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
export type VisualEffects = { chroma?: ChromaKey; mask?: ClipMask };
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
export const hasVisualEffects = (effects?: VisualEffects) =>
  !!(effects?.chroma?.enabled || effects?.mask?.enabled);
export function validVisualEffects(value: unknown): value is VisualEffects {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const effects = value as VisualEffects;
  if (Object.keys(effects).some((key) => !['chroma', 'mask'].includes(key))) return false;
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
  return true;
}
export function rgbColor(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}
