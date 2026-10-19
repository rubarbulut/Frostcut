import type { RGB } from './color-science';

export type KeyerType = 'chroma' | 'color-difference' | 'luma';

export type DespillMethod = 'average' | 'maximum' | 'luminance-preserving';

export type KeyerConfig = {
  type: KeyerType;
  screenColor: 'green' | 'blue' | 'custom';
  customColor?: RGB;
  thresholdLow: number;
  thresholdHigh: number;
  choke: number;
  feather: number;
  despillMethod: DespillMethod;
  despillStrength: number;
};

export const defaultKeyerConfig = (): KeyerConfig => ({
  type: 'color-difference',
  screenColor: 'green',
  thresholdLow: 0.1,
  thresholdHigh: 0.4,
  choke: 0,
  feather: 0.05,
  despillMethod: 'luminance-preserving',
  despillStrength: 1.0,
});

export function applyDespillGreen(
  color: RGB,
  method: DespillMethod = 'luminance-preserving',
  strength = 1.0,
): RGB {
  const [r, g, b] = color;
  let limit = 0;

  switch (method) {
    case 'average':
      limit = (r + b) * 0.5;
      break;
    case 'maximum':
      limit = Math.max(r, b);
      break;
    case 'luminance-preserving':
      limit = (r + b) * 0.5;
      break;
  }

  const spill = Math.max(0, g - limit) * strength;
  if (spill <= 0) return [...color];

  if (method === 'luminance-preserving') {
    const lumaLoss = spill * 0.7152;
    const addR = lumaLoss * (0.2126 / (0.2126 + 0.0722));
    const addB = lumaLoss * (0.0722 / (0.2126 + 0.0722));
    return [
      Math.min(1, r + addR),
      Math.max(0, g - spill),
      Math.min(1, b + addB),
    ];
  }

  return [r, Math.max(0, g - spill), b];
}

export function applyDespillBlue(
  color: RGB,
  method: DespillMethod = 'luminance-preserving',
  strength = 1.0,
): RGB {
  const [r, g, b] = color;
  let limit = 0;

  switch (method) {
    case 'average':
      limit = (r + g) * 0.5;
      break;
    case 'maximum':
      limit = Math.max(r, g);
      break;
    case 'luminance-preserving':
      limit = (r + g) * 0.5;
      break;
  }

  const spill = Math.max(0, b - limit) * strength;
  if (spill <= 0) return [...color];

  if (method === 'luminance-preserving') {
    const lumaLoss = spill * 0.0722;
    const addR = lumaLoss * (0.2126 / (0.2126 + 0.7152));
    const addG = lumaLoss * (0.7152 / (0.2126 + 0.7152));
    return [
      Math.min(1, r + addR),
      Math.min(1, g + addG),
      Math.max(0, b - spill),
    ];
  }

  return [r, g, Math.max(0, b - spill)];
}

export function computeMatte(
  color: RGB,
  config: KeyerConfig,
): number {
  const [r, g, b] = color;
  let rawAlpha = 1.0;

  if (config.type === 'color-difference') {
    let diff = 0;
    if (config.screenColor === 'green') {
      diff = g - Math.max(r, b);
    } else if (config.screenColor === 'blue') {
      diff = b - Math.max(r, g);
    } else if (config.customColor) {
      const [cr, cg, cb] = config.customColor;
      diff = Math.max(0, 1.0 - Math.hypot(r - cr, g - cg, b - cb));
    }
    const delta = Math.max(0.0001, config.thresholdHigh - config.thresholdLow);
    const t = Math.max(0, Math.min(1, (diff - config.thresholdLow) / delta));
    rawAlpha = 1.0 - t;
  } else if (config.type === 'luma') {
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const delta = Math.max(0.0001, config.thresholdHigh - config.thresholdLow);
    rawAlpha = Math.max(0, Math.min(1, (luma - config.thresholdLow) / delta));
  } else if (config.type === 'chroma') {
    const target = config.screenColor === 'green'
      ? [0, 1, 0]
      : config.screenColor === 'blue'
      ? [0, 0, 1]
      : config.customColor ?? [0, 1, 0];
    const dist = Math.hypot(r - target[0], g - target[1], b - target[2]);
    const delta = Math.max(0.0001, config.thresholdHigh - config.thresholdLow);
    rawAlpha = Math.max(0, Math.min(1, (dist - config.thresholdLow) / delta));
  }

  if (config.choke !== 0) {
    rawAlpha = Math.max(0, Math.min(1, rawAlpha + config.choke));
  }

  if (config.feather > 0) {
    const edge = config.feather * 0.5;
    rawAlpha = smoothStep(0.5 - edge, 0.5 + edge, rawAlpha);
  }

  return rawAlpha;
}

function smoothStep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(0.00001, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function processKey(
  rgba: [number, number, number, number],
  config: KeyerConfig,
): [number, number, number, number] {
  const rgb: RGB = [rgba[0], rgba[1], rgba[2]];
  const matte = computeMatte(rgb, config);

  let despilledRgb = rgb;
  if (config.despillStrength > 0) {
    if (config.screenColor === 'green') {
      despilledRgb = applyDespillGreen(rgb, config.despillMethod, config.despillStrength);
    } else if (config.screenColor === 'blue') {
      despilledRgb = applyDespillBlue(rgb, config.despillMethod, config.despillStrength);
    }
  }

  const finalAlpha = rgba[3] * matte;
  return [despilledRgb[0], despilledRgb[1], despilledRgb[2], finalAlpha];
}

export const MATTE_KEYER_GLSL = `
vec3 despillGreenGlsl(vec3 color, int method, float strength) {
  float limit = (method == 1) ? max(color.r, color.b) : (color.r + color.b) * 0.5;
  float spill = max(0.0, color.g - limit) * strength;
  if (spill <= 0.0) return color;
  if (method == 2) {
    float lumaLoss = spill * 0.7152;
    return vec3(
      min(1.0, color.r + lumaLoss * (0.2126 / 0.2848)),
      max(0.0, color.g - spill),
      min(1.0, color.b + lumaLoss * (0.0722 / 0.2848))
    );
  }
  return vec3(color.r, max(0.0, color.g - spill), color.b);
}

vec3 despillBlueGlsl(vec3 color, int method, float strength) {
  float limit = (method == 1) ? max(color.r, color.g) : (color.r + color.g) * 0.5;
  float spill = max(0.0, color.b - limit) * strength;
  if (spill <= 0.0) return color;
  if (method == 2) {
    float lumaLoss = spill * 0.0722;
    return vec3(
      min(1.0, color.r + lumaLoss * (0.2126 / 0.9278)),
      min(1.0, color.g + lumaLoss * (0.7152 / 0.9278)),
      max(0.0, color.b - spill)
    );
  }
  return vec3(color.r, color.g, max(0.0, color.b - spill));
}

float colorDifferenceMatte(vec3 c, int screenColor, float low, float high) {
  float diff = (screenColor == 1) ? c.b - max(c.r, c.g) : c.g - max(c.r, c.b);
  float delta = max(0.0001, high - low);
  return 1.0 - clamp((diff - low) / delta, 0.0, 1.0);
}
`;
