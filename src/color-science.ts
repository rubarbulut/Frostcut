export type RGB = [number, number, number];

export type AscCdl = {
  slope: RGB;
  offset: RGB;
  power: RGB;
  saturation: number;
};

export type LiftGammaGain = {
  lift: RGB;
  gamma: RGB;
  gain: RGB;
  offset: RGB;
};

export type ColorGradingParams = {
  enabled: boolean;
  exposure?: number;
  temperature?: number;
  tint?: number;
  contrast?: number;
  cdl?: Partial<AscCdl>;
  lgg?: Partial<LiftGammaGain>;
};

export const defaultCdl = (): AscCdl => ({
  slope: [1, 1, 1],
  offset: [0, 0, 0],
  power: [1, 1, 1],
  saturation: 1,
});

export const defaultLgg = (): LiftGammaGain => ({
  lift: [0, 0, 0],
  gamma: [1, 1, 1],
  gain: [1, 1, 1],
  offset: [0, 0, 0],
});

export const REC709_LUMA: RGB = [0.2126, 0.7152, 0.0722];

export function srgbToLinear(channel: number): number {
  const c = Math.max(0, Math.min(1, channel));
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(channel: number): number {
  const c = Math.max(0, channel);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function rgbToLinear(rgb: RGB): RGB {
  return [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];
}

export function linearToRgb(linear: RGB): RGB {
  return [linearToSrgb(linear[0]), linearToSrgb(linear[1]), linearToSrgb(linear[2])];
}

export function luminance(color: RGB, weights: RGB = REC709_LUMA): number {
  return color[0] * weights[0] + color[1] * weights[1] + color[2] * weights[2];
}

export function applyAscCdl(color: RGB, cdl: Partial<AscCdl>): RGB {
  const slope = cdl.slope ?? [1, 1, 1];
  const offset = cdl.offset ?? [0, 0, 0];
  const power = cdl.power ?? [1, 1, 1];
  const saturation = cdl.saturation ?? 1;

  const result: RGB = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const v = Math.max(0, color[i] * slope[i] + offset[i]);
    result[i] = power[i] === 1 ? v : Math.pow(v, Math.max(0.0001, power[i]));
  }

  if (saturation !== 1) {
    const luma = luminance(result);
    for (let i = 0; i < 3; i++) {
      result[i] = Math.max(0, luma + saturation * (result[i] - luma));
    }
  }

  return result;
}

export function applyLiftGammaGain(color: RGB, lgg: Partial<LiftGammaGain>): RGB {
  const lift = lgg.lift ?? [0, 0, 0];
  const gamma = lgg.gamma ?? [1, 1, 1];
  const gain = lgg.gain ?? [1, 1, 1];
  const offset = lgg.offset ?? [0, 0, 0];

  const result: RGB = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let c = color[i] + offset[i];
    const lifted = c + lift[i] * (1 - c);
    const gained = gainedValue(lifted, gain[i]);
    const g = Math.max(0.0001, gamma[i]);
    result[i] = gained <= 0 ? 0 : Math.pow(gained, 1 / g);
  }
  return result;
}

function gainedValue(val: number, gain: number): number {
  return Math.max(0, val * gain);
}

export function applyExposure(color: RGB, exposureEv: number): RGB {
  if (exposureEv === 0) return [...color];
  const multiplier = Math.pow(2, exposureEv);
  return [color[0] * multiplier, color[1] * multiplier, color[2] * multiplier];
}

export function applyWhiteBalance(color: RGB, temperature: number, tint: number): RGB {
  if (temperature === 0 && tint === 0) return [...color];
  const tempFactor = temperature / 100;
  const tintFactor = tint / 100;

  const r = color[0] * (1 + tempFactor * 0.4);
  const g = color[1] * (1 - tintFactor * 0.3);
  const b = color[2] * (1 - tempFactor * 0.4 + tintFactor * 0.15);

  return [Math.max(0, r), Math.max(0, g), Math.max(0, b)];
}

export function applySigmoidContrast(val: number, contrast: number, pivot = 0.5): number {
  if (contrast === 1) return val;
  const centered = val - pivot;
  const k = contrast;
  const s = centered < 0
    ? -0.5 * Math.pow(Math.abs(centered) * 2, k)
    : 0.5 * Math.pow(centered * 2, k);
  return Math.max(0, Math.min(1, s + pivot));
}

export function gradePixel(color: RGB, params: ColorGradingParams): RGB {
  if (!params.enabled) return [...color];

  let current = rgbToLinear(color);

  if (params.exposure !== undefined && params.exposure !== 0) {
    current = applyExposure(current, params.exposure);
  }

  if ((params.temperature ?? 0) !== 0 || (params.tint ?? 0) !== 0) {
    current = applyWhiteBalance(current, params.temperature ?? 0, params.tint ?? 0);
  }

  if (params.cdl) {
    current = applyAscCdl(current, params.cdl);
  }

  if (params.lgg) {
    current = applyLiftGammaGain(current, params.lgg);
  }

  let srgb = linearToRgb(current);

  if (params.contrast !== undefined && params.contrast !== 1) {
    srgb = [
      applySigmoidContrast(srgb[0], params.contrast),
      applySigmoidContrast(srgb[1], params.contrast),
      applySigmoidContrast(srgb[2], params.contrast),
    ];
  }

  return [
    Math.max(0, Math.min(1, srgb[0])),
    Math.max(0, Math.min(1, srgb[1])),
    Math.max(0, Math.min(1, srgb[2])),
  ];
}

export const COLOR_SCIENCE_GLSL = `
vec3 srgbToLinear(vec3 c) {
  vec3 low = c / 12.92;
  vec3 high = pow((c + vec3(0.055)) / 1.055, vec3(2.4));
  return mix(low, high, step(vec3(0.04045), c));
}

vec3 linearToSrgb(vec3 c) {
  vec3 low = c * 12.92;
  vec3 high = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - vec3(0.055);
  return mix(low, high, step(vec3(0.0031308), c));
}

float getLuma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 applyCdlGlsl(vec3 linearColor, vec3 slope, vec3 offset, vec3 power, float sat) {
  vec3 val = max(linearColor * slope + offset, vec3(0.0));
  val = pow(val, max(power, vec3(0.0001)));
  float luma = getLuma(val);
  return max(vec3(0.0), mix(vec3(luma), val, sat));
}

vec3 applyLggGlsl(vec3 linearColor, vec3 lift, vec3 gamma, vec3 gain, vec3 offset) {
  vec3 c = linearColor + offset;
  vec3 lifted = c + lift * (vec3(1.0) - c);
  vec3 gained = max(lifted * gain, vec3(0.0));
  return pow(gained, vec3(1.0) / max(gamma, vec3(0.0001)));
}
`;
