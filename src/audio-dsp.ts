export type BiquadFilterType =
  | 'peaking'
  | 'lowpass'
  | 'highpass'
  | 'lowshelf'
  | 'highshelf'
  | 'notch';

export type BiquadCoeffs = {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
};

export function computeBiquadCoefficients(
  type: BiquadFilterType,
  frequency: number,
  sampleRate: number,
  q = 1.0,
  gainDb = 0,
): BiquadCoeffs {
  const f0 = Math.max(10, Math.min(sampleRate * 0.49, frequency));
  const w0 = (2 * Math.PI * f0) / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const A = Math.pow(10, gainDb / 40);
  const alpha = sinW0 / (2 * Math.max(0.01, q));

  let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;

  switch (type) {
    case 'peaking': {
      b0 = 1 + alpha * A;
      b1 = -2 * cosW0;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cosW0;
      a2 = 1 - alpha / A;
      break;
    }
    case 'lowpass': {
      b0 = (1 - cosW0) * 0.5;
      b1 = 1 - cosW0;
      b2 = (1 - cosW0) * 0.5;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    }
    case 'highpass': {
      b0 = (1 + cosW0) * 0.5;
      b1 = -(1 + cosW0);
      b2 = (1 + cosW0) * 0.5;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    }
    case 'lowshelf': {
      const aRoot = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cosW0 + aRoot);
      b1 = 2 * A * (A - 1 - (A + 1) * cosW0);
      b2 = A * (A + 1 - (A - 1) * cosW0 - aRoot);
      a0 = A + 1 + (A - 1) * cosW0 + aRoot;
      a1 = -2 * (A - 1 + (A + 1) * cosW0);
      a2 = A + 1 + (A - 1) * cosW0 - aRoot;
      break;
    }
    case 'highshelf': {
      const aRoot = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cosW0 + aRoot);
      b1 = -2 * A * (A - 1 + (A + 1) * cosW0);
      b2 = A * (A + 1 + (A - 1) * cosW0 - aRoot);
      a0 = A + 1 - (A - 1) * cosW0 + aRoot;
      a1 = 2 * (A - 1 - (A + 1) * cosW0);
      a2 = A + 1 - (A - 1) * cosW0 - aRoot;
      break;
    }
    case 'notch': {
      b0 = 1;
      b1 = -2 * cosW0;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    }
  }

  const invA0 = 1 / a0;
  return {
    b0: b0 * invA0,
    b1: b1 * invA0,
    b2: b2 * invA0,
    a1: a1 * invA0,
    a2: a2 * invA0,
  };
}

export class BiquadFilter {
  private coeffs: BiquadCoeffs;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(coeffs: BiquadCoeffs) {
    this.coeffs = coeffs;
  }

  processSample(x: number): number {
    const c = this.coeffs;
    const y = c.b0 * x + c.b1 * this.x1 + c.b2 * this.x2 - c.a1 * this.y1 - c.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }

  processBuffer(input: Float32Array): Float32Array {
    const output = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      output[i] = this.processSample(input[i]);
    }
    return output;
  }

  reset() {
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }
}

export type CompressorConfig = {
  thresholdDb: number; // e.g. -20 dBFS
  ratio: number; // e.g. 4.0 (4:1)
  kneeDb: number; // e.g. 6 dB
  attackMs: number; // e.g. 10 ms
  releaseMs: number; // e.g. 100 ms
  makeupGainDb: number; // e.g. 3 dB
};

export const defaultCompressorConfig = (): CompressorConfig => ({
  thresholdDb: -18,
  ratio: 4.0,
  kneeDb: 6.0,
  attackMs: 10,
  releaseMs: 100,
  makeupGainDb: 0,
});

export class DynamicRangeCompressor {
  private config: CompressorConfig;
  private sampleRate: number;
  private envelope = 0;

  constructor(config: CompressorConfig = defaultCompressorConfig(), sampleRate = 48000) {
    this.config = config;
    this.sampleRate = sampleRate;
  }

  private computeGainReductionDb(xDb: number): number {
    const { thresholdDb: T, ratio: R, kneeDb: W } = this.config;
    if (R <= 1) return 0;

    const slope = 1 - 1 / R;

    if (xDb <= T - W * 0.5) {
      return 0; // Below knee
    } else if (xDb >= T + W * 0.5) {
      return -slope * (xDb - T); // Above knee
    } else {
      // Soft knee interpolation
      const delta = xDb - T + W * 0.5;
      return (-slope * delta * delta) / (2 * W);
    }
  }

  processBuffer(input: Float32Array): Float32Array {
    const output = new Float32Array(input.length);
    const makeupLin = Math.pow(10, this.config.makeupGainDb / 20);

    const alphaAttack = Math.exp(-1 / ((this.sampleRate * this.config.attackMs) / 1000));
    const alphaRelease = Math.exp(-1 / ((this.sampleRate * this.config.releaseMs) / 1000));

    for (let i = 0; i < input.length; i++) {
      const x = input[i];
      const absX = Math.abs(x);

      // Level detection (peak envelope)
      const alpha = absX > this.envelope ? alphaAttack : alphaRelease;
      this.envelope = alpha * this.envelope + (1 - alpha) * absX;

      const envDb = 20 * Math.log10(Math.max(1e-6, this.envelope));
      const gainReductionDb = this.computeGainReductionDb(envDb);
      const gainLinear = Math.pow(10, gainReductionDb / 20);

      output[i] = x * gainLinear * makeupLin;
    }

    return output;
  }

  reset() {
    this.envelope = 0;
  }
}

export function applyBrickwallLimiter(
  buffer: Float32Array,
  ceilingDb = -0.1,
): Float32Array {
  const maxLinear = Math.pow(10, ceilingDb / 20);
  const out = new Float32Array(buffer.length);

  for (let i = 0; i < buffer.length; i++) {
    const val = buffer[i];
    out[i] = Math.max(-maxLinear, Math.min(maxLinear, val));
  }

  return out;
}
