export type BezierHandles = [number, number, number, number];

export const BEZIER_PRESETS: Record<string, BezierHandles> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1.0],
  easeIn: [0.42, 0.0, 1.0, 1.0],
  easeOut: [0.0, 0.0, 0.58, 1.0],
  easeInOut: [0.42, 0.0, 0.58, 1.0],
  anticipate: [0.36, 0.0, 0.66, -0.56],
  overshoot: [0.34, 1.56, 0.64, 1.0],
};

export class CubicBezier {
  private x1: number;
  private y1: number;
  private x2: number;
  private y2: number;

  constructor(x1: number, y1: number, x2: number, y2: number) {
    this.x1 = Math.max(0, Math.min(1, x1));
    this.y1 = y1;
    this.x2 = Math.max(0, Math.min(1, x2));
    this.y2 = y2;
  }

  private sampleCurveX(t: number): number {
    return ((1 - 3 * this.x2 + 3 * this.x1) * t + (3 * this.x2 - 6 * this.x1)) * t * t + 3 * this.x1 * t;
  }

  private sampleCurveY(t: number): number {
    return ((1 - 3 * this.y2 + 3 * this.y1) * t + (3 * this.y2 - 6 * this.y1)) * t * t + 3 * this.y1 * t;
  }

  private sampleDerivativeX(t: number): number {
    return (3 * (1 - 3 * this.x2 + 3 * this.x1) * t + 2 * (3 * this.x2 - 6 * this.x1)) * t + 3 * this.x1;
  }

  solveCurveX(x: number, epsilon = 1e-6): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    // Newton-Raphson iteration
    let t = x;
    for (let i = 0; i < 8; i++) {
      const xEst = this.sampleCurveX(t) - x;
      if (Math.abs(xEst) < epsilon) return t;
      const dX = this.sampleDerivativeX(t);
      if (Math.abs(dX) < 1e-6) break;
      t = t - xEst / dX;
    }

    // Fallback to binary search / bisection
    let t0 = 0.0;
    let t1 = 1.0;
    t = x;

    while (t0 < t1) {
      const xEst = this.sampleCurveX(t);
      if (Math.abs(xEst - x) < epsilon) return t;
      if (x > xEst) t0 = t;
      else t1 = t;
      t = (t1 + t0) * 0.5;
    }

    return t;
  }

  evaluate(x: number): number {
    return this.sampleCurveY(this.solveCurveX(x));
  }
}

export function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;

  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

export function hermiteSpline(
  p0: number,
  m0: number,
  p1: number,
  m1: number,
  t: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;

  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1;
}

export type SplineKeyframe = {
  time: number;
  value: number;
  bezier?: BezierHandles;
  easing?: 'linear' | 'smooth' | 'bezier';
};

export function interpolateSplineKeyframes(
  frames: SplineKeyframe[] | undefined,
  time: number,
  fallback: number,
): number {
  if (!frames || frames.length === 0) return fallback;
  if (time <= frames[0].time) return frames[0].value;
  if (time >= frames[frames.length - 1].time) return frames[frames.length - 1].value;

  for (let i = 1; i < frames.length; i++) {
    const next = frames[i];
    const prev = frames[i - 1];
    if (time > next.time) continue;

    const dt = next.time - prev.time;
    if (dt <= 0) return prev.value;

    const t = Math.max(0, Math.min(1, (time - prev.time) / dt));

    let easedT = t;
    if (prev.easing === 'smooth') {
      easedT = t * t * (3 - 2 * t);
    } else if (prev.easing === 'bezier' && prev.bezier) {
      const solver = new CubicBezier(...prev.bezier);
      easedT = solver.evaluate(t);
    }

    return prev.value + (next.value - prev.value) * easedT;
  }

  return frames[frames.length - 1].value;
}
