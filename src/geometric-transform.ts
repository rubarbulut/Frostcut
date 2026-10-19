export type Point2D = { x: number; y: number };
export type Quad = [Point2D, Point2D, Point2D, Point2D];
export type Mat3 = [
  number, number, number,
  number, number, number,
  number, number, number,
];

export function identityMat3(): Mat3 {
  return [
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
  ];
}

export function solveLinearSystem8x8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
        maxRow = k;
      }
    }
    if (Math.abs(M[maxRow][i]) < 1e-12) return null;

    const temp = M[i];
    M[i] = M[maxRow];
    M[maxRow] = temp;

    for (let k = i + 1; k < n; k++) {
      const factor = M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) {
        M[k][j] -= factor * M[i][j];
      }
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= M[i][j] * x[j];
    }
    x[i] = sum / M[i][i];
  }

  return x;
}

export function computeHomography(src: Quad, dst: Quad): Mat3 | null {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const sx = src[i].x;
    const sy = src[i].y;
    const dx = dst[i].x;
    const dy = dst[i].y;

    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);

    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }

  const h = solveLinearSystem8x8(A, b);
  if (!h) return null;

  return [
    h[0], h[1], h[2],
    h[3], h[4], h[5],
    h[6], h[7], 1.0,
  ];
}

export function invertMat3(m: Mat3): Mat3 | null {
  const [
    m00, m01, m02,
    m10, m11, m12,
    m20, m21, m22,
  ] = m;

  const det =
    m00 * (m11 * m22 - m12 * m21) -
    m01 * (m10 * m22 - m12 * m20) +
    m02 * (m10 * m21 - m11 * m20);

  if (Math.abs(det) < 1e-12) return null;

  const invDet = 1.0 / det;

  return [
    (m11 * m22 - m12 * m21) * invDet,
    (m02 * m21 - m01 * m22) * invDet,
    (m01 * m12 - m02 * m11) * invDet,

    (m12 * m20 - m10 * m22) * invDet,
    (m00 * m22 - m02 * m20) * invDet,
    (m02 * m10 - m00 * m12) * invDet,

    (m10 * m21 - m11 * m20) * invDet,
    (m01 * m20 - m00 * m21) * invDet,
    (m00 * m11 - m01 * m10) * invDet,
  ];
}

export function transformPoint(m: Mat3, p: Point2D): Point2D {
  const x = m[0] * p.x + m[1] * p.y + m[2];
  const y = m[3] * p.x + m[4] * p.y + m[5];
  const w = m[6] * p.x + m[7] * p.y + m[8];

  const invW = Math.abs(w) > 1e-12 ? 1.0 / w : 1.0;
  return { x: x * invW, y: y * invW };
}

export function applyRadialDistortion(
  p: Point2D,
  center: Point2D = { x: 0.5, y: 0.5 },
  k1 = 0,
  k2 = 0,
): Point2D {
  if (k1 === 0 && k2 === 0) return p;

  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const r2 = dx * dx + dy * dy;
  const r4 = r2 * r2;
  const factor = 1 + k1 * r2 + k2 * r4;

  return {
    x: center.x + dx * factor,
    y: center.y + dy * factor,
  };
}

export function computeVignette(
  uv: Point2D,
  center: Point2D = { x: 0.5, y: 0.5 },
  amount = 0.5,
  roundness = 2.0,
): number {
  if (amount <= 0) return 1.0;
  const dx = Math.abs(uv.x - center.x) * 2;
  const dy = Math.abs(uv.y - center.y) * 2;
  const dist = Math.pow(Math.pow(dx, roundness) + Math.pow(dy, roundness), 1 / roundness);
  const factor = Math.max(0, 1.0 - dist * amount);
  return factor * factor;
}

export const GEOMETRIC_OPTICAL_GLSL = `
vec2 homographyTransformGlsl(vec2 uv, mat3 invH) {
  vec3 p = invH * vec3(uv, 1.0);
  return p.xy / (abs(p.z) > 0.00001 ? p.z : 1.0);
}

vec2 applyLensDistortionGlsl(vec2 uv, vec2 center, float k1, float k2) {
  vec2 d = uv - center;
  float r2 = dot(d, d);
  float factor = 1.0 + k1 * r2 + k2 * r2 * r2;
  return center + d * factor;
}

float computeVignetteGlsl(vec2 uv, vec2 center, float amount) {
  vec2 d = (uv - center) * 2.0;
  float dist = length(d);
  float v = clamp(1.0 - dist * amount * 0.5, 0.0, 1.0);
  return v * v;
}
`;
