export type RGBA = [number, number, number, number];

export type PorterDuffOp =
  | 'clear'
  | 'copy'
  | 'over'
  | 'under'
  | 'in'
  | 'out'
  | 'atop'
  | 'xor';

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'add'
  | 'subtract';

const EPSILON = 1e-6;

export function premultiply(rgba: RGBA): RGBA {
  const a = rgba[3];
  return [rgba[0] * a, rgba[1] * a, rgba[2] * a, a];
}

export function unpremultiply(rgba: RGBA): RGBA {
  const a = rgba[3];
  if (a < EPSILON) return [0, 0, 0, 0];
  const invA = 1 / a;
  return [rgba[0] * invA, rgba[1] * invA, rgba[2] * invA, a];
}

export function porterDuff(
  src: RGBA,
  dst: RGBA,
  op: PorterDuffOp,
  isPremultiplied = false,
): RGBA {
  const s = isPremultiplied ? src : premultiply(src);
  const d = isPremultiplied ? dst : premultiply(dst);
  const sa = s[3];
  const da = d[3];

  let fa = 0;
  let fb = 0;

  switch (op) {
    case 'clear':
      fa = 0;
      fb = 0;
      break;
    case 'copy':
      fa = 1;
      fb = 0;
      break;
    case 'over':
      fa = 1;
      fb = 1 - sa;
      break;
    case 'under':
      fa = 1 - da;
      fb = 1;
      break;
    case 'in':
      fa = da;
      fb = 0;
      break;
    case 'out':
      fa = 1 - da;
      fb = 0;
      break;
    case 'atop':
      fa = da;
      fb = 1 - sa;
      break;
    case 'xor':
      fa = 1 - da;
      fb = 1 - sa;
      break;
  }

  const outA = sa * fa + da * fb;
  const outPremult: RGBA = [
    s[0] * fa + d[0] * fb,
    s[1] * fa + d[1] * fb,
    s[2] * fa + d[2] * fb,
    outA,
  ];

  return isPremultiplied ? outPremult : unpremultiply(outPremult);
}

export function blendChannels(s: number, d: number, mode: BlendMode): number {
  switch (mode) {
    case 'normal':
      return s;
    case 'multiply':
      return s * d;
    case 'screen':
      return s + d - s * d;
    case 'overlay':
      return d <= 0.5 ? 2 * s * d : 1 - 2 * (1 - s) * (1 - d);
    case 'darken':
      return Math.min(s, d);
    case 'lighten':
      return Math.max(s, d);
    case 'color-dodge':
      if (d <= 0) return 0;
      if (s >= 1) return 1;
      return Math.min(1, d / (1 - s));
    case 'color-burn':
      if (d >= 1) return 1;
      if (s <= 0) return 0;
      return 1 - Math.min(1, (1 - d) / s);
    case 'hard-light':
      return s <= 0.5 ? 2 * s * d : 1 - 2 * (1 - s) * (1 - d);
    case 'soft-light':
      return (1 - 2 * s) * d * d + 2 * s * d;
    case 'difference':
      return Math.abs(d - s);
    case 'exclusion':
      return s + d - 2 * s * d;
    case 'add':
      return Math.min(1, s + d);
    case 'subtract':
      return Math.max(0, d - s);
  }
}

export function compositeBlend(
  src: RGBA,
  dst: RGBA,
  mode: BlendMode,
  opacity = 1,
): RGBA {
  const sa = Math.max(0, Math.min(1, src[3] * opacity));
  const da = Math.max(0, Math.min(1, dst[3]));

  if (sa < EPSILON) return [...dst];
  if (da < EPSILON) return [src[0], src[1], src[2], sa];

  const blendedR = blendChannels(src[0], dst[0], mode);
  const blendedG = blendChannels(src[1], dst[1], mode);
  const blendedB = blendChannels(src[2], dst[2], mode);

  const outA = sa + da * (1 - sa);

  const compR = (blendedR * sa * da + src[0] * sa * (1 - da) + dst[0] * da * (1 - sa)) / outA;
  const compG = (blendedG * sa * da + src[1] * sa * (1 - da) + dst[1] * da * (1 - sa)) / outA;
  const compB = (blendedB * sa * da + src[2] * sa * (1 - da) + dst[2] * da * (1 - sa)) / outA;

  return [
    Math.max(0, Math.min(1, compR)),
    Math.max(0, Math.min(1, compG)),
    Math.max(0, Math.min(1, compB)),
    outA,
  ];
}

export const BLEND_MODES_GLSL = `
vec3 blendMultiply(vec3 s, vec3 d) { return s * d; }
vec3 blendScreen(vec3 s, vec3 d) { return s + d - s * d; }
vec3 blendOverlay(vec3 s, vec3 d) {
  return mix(2.0 * s * d, 1.0 - 2.0 * (1.0 - s) * (1.0 - d), step(vec3(0.5), d));
}
vec3 blendDarken(vec3 s, vec3 d) { return min(s, d); }
vec3 blendLighten(vec3 s, vec3 d) { return max(s, d); }
vec3 blendHardLight(vec3 s, vec3 d) {
  return mix(2.0 * s * d, 1.0 - 2.0 * (1.0 - s) * (1.0 - d), step(vec3(0.5), s));
}
vec3 blendSoftLight(vec3 s, vec3 d) {
  return (vec3(1.0) - 2.0 * s) * d * d + 2.0 * s * d;
}
vec3 blendDifference(vec3 s, vec3 d) { return abs(d - s); }
vec3 blendExclusion(vec3 s, vec3 d) { return s + d - 2.0 * s * d; }
vec3 blendAdd(vec3 s, vec3 d) { return min(vec3(1.0), s + d); }
vec3 blendSubtract(vec3 s, vec3 d) { return max(vec3(0.0), d - s); }

vec4 compositeGlsl(vec4 src, vec4 dst, int mode, float opacity) {
  float sa = clamp(src.a * opacity, 0.0, 1.0);
  float da = clamp(dst.a, 0.0, 1.0);
  if (sa < 0.0001) return dst;
  if (da < 0.0001) return vec4(src.rgb, sa);

  vec3 blended = src.rgb;
  if (mode == 1) blended = blendMultiply(src.rgb, dst.rgb);
  else if (mode == 2) blended = blendScreen(src.rgb, dst.rgb);
  else if (mode == 3) blended = blendOverlay(src.rgb, dst.rgb);
  else if (mode == 4) blended = blendDarken(src.rgb, dst.rgb);
  else if (mode == 5) blended = blendLighten(src.rgb, dst.rgb);
  else if (mode == 6) blended = blendHardLight(src.rgb, dst.rgb);
  else if (mode == 7) blended = blendSoftLight(src.rgb, dst.rgb);
  else if (mode == 8) blended = blendDifference(src.rgb, dst.rgb);
  else if (mode == 9) blended = blendExclusion(src.rgb, dst.rgb);
  else if (mode == 10) blended = blendAdd(src.rgb, dst.rgb);
  else if (mode == 11) blended = blendSubtract(src.rgb, dst.rgb);

  float outA = sa + da * (1.0 - sa);
  vec3 rgb = (blended * sa * da + src.rgb * sa * (1.0 - da) + dst.rgb * da * (1.0 - sa)) / max(outA, 0.0001);
  return vec4(rgb, outA);
}
`;
