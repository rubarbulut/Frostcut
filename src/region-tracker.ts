export type TrackingRegion = { x: number; y: number; width: number; height: number };
export type TrackingFrame = { width: number; height: number; time: number; pixels: Uint8Array };
export type TrackingRgbaFrame = { width: number; height: number; time: number; rgba: Uint8ClampedArray };
export type TrackingOptions = { searchRadius?: number; minCorrelation?: number; minMargin?: number };
export type TrackingPoint = { time: number; x: number; y: number; correlation: number; margin?: number };
export type TrackingStep =
  | { status: 'seed' | 'tracked'; point: TrackingPoint }
  | { status: 'lost'; time: number; reason: 'low-correlation' | 'ambiguous'; correlation: number; margin: number };

function dimensions(width: number, height: number, time: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8 ||
    width > 640 || height > 640 || !Number.isFinite(time) || time < 0 || time > 86400)
    throw new Error('Tracking needs bounded 8–640 px frames and a valid source timestamp.');
}
export function validateTrackingRgbaFrame(frame: TrackingRgbaFrame) {
  dimensions(frame.width, frame.height, frame.time);
  if (!(frame.rgba instanceof Uint8ClampedArray) || frame.rgba.length !== frame.width * frame.height * 4)
    throw new Error('A complete decoded RGBA source frame is required.');
}
export function trackingGray(frame: TrackingRgbaFrame): TrackingFrame {
  validateTrackingRgbaFrame(frame);
  const pixels = new Uint8Array(frame.width * frame.height);
  for (let i = 0; i < pixels.length; i++) {
    const offset = i * 4;
    pixels[i] = (77 * frame.rgba[offset] + 150 * frame.rgba[offset + 1] + 29 * frame.rgba[offset + 2]) >>> 8;
  }
  return { width: frame.width, height: frame.height, time: frame.time, pixels };
}
function validateFrame(frame: TrackingFrame) {
  dimensions(frame.width, frame.height, frame.time);
  if (!(frame.pixels instanceof Uint8Array) || frame.pixels.length !== frame.width * frame.height)
    throw new Error('A complete grayscale source frame is required.');
}

/** Fixed-template, mean-subtracted normalized correlation; never predicts missing positions. */
export class RegionTracker {
  readonly seed: TrackingStep;
  private readonly width: number;
  private readonly height: number;
  private readonly patchWidth: number;
  private readonly patchHeight: number;
  private readonly offsets: number[] = [];
  private readonly template: Float64Array;
  private readonly templateEnergy: number;
  private readonly templateSum: number;
  private readonly scores: Float64Array;
  private readonly radius: number;
  private readonly minCorrelation: number;
  private readonly minMargin: number;
  private x: number;
  private y: number;
  private time: number;
  private lost = false;

  constructor(frame: TrackingFrame, region: TrackingRegion, options: TrackingOptions = {}) {
    validateFrame(frame);
    if (!region || ![region.x, region.y, region.width, region.height].every(Number.isFinite) ||
      region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0 ||
      region.x + region.width > 1 || region.y + region.height > 1)
      throw new Error('Select a rectangle inside the source image.');
    this.radius = options.searchRadius ?? 24;
    this.minCorrelation = options.minCorrelation ?? 0.72;
    this.minMargin = options.minMargin ?? 0.04;
    if (!Number.isInteger(this.radius) || this.radius < 2 || this.radius > 64 ||
      !Number.isFinite(this.minCorrelation) || this.minCorrelation < 0.1 || this.minCorrelation > 1 ||
      !Number.isFinite(this.minMargin) || this.minMargin < 0 || this.minMargin > 1)
      throw new Error('Tracking search/quality settings are outside the supported range.');
    this.width = frame.width; this.height = frame.height; this.time = frame.time;
    this.patchWidth = Math.round(region.width * this.width);
    this.patchHeight = Math.round(region.height * this.height);
    if (this.patchWidth < 8 || this.patchHeight < 8)
      throw new Error('Select a larger tracking region (at least 8 px at analysis resolution).');
    this.x = Math.min(this.width - this.patchWidth, Math.round(region.x * this.width));
    this.y = Math.min(this.height - this.patchHeight, Math.round(region.y * this.height));
    const columns = Math.min(16, this.patchWidth), rows = Math.min(16, this.patchHeight);
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      this.offsets.push(Math.floor(row * (this.patchHeight - 1) / (rows - 1)) * this.width +
        Math.floor(col * (this.patchWidth - 1) / (columns - 1)));
    }
    const origin = this.y * this.width + this.x;
    this.template = Float64Array.from(this.offsets, (offset) => frame.pixels[origin + offset]);
    const mean = this.template.reduce((n, value) => n + value, 0) / this.template.length;
    for (let i = 0; i < this.template.length; i++) this.template[i] -= mean;
    this.templateEnergy = this.template.reduce((n, value) => n + value * value, 0);
    this.templateSum = this.template.reduce((n, value) => n + value, 0);
    if (this.templateEnergy / this.template.length < 16)
      throw new Error('This region has too little texture. Choose an edge or patterned detail.');
    this.scores = new Float64Array((2 * this.radius + 1) ** 2);
    this.seed = { status: 'seed', point: this.point(frame.time, this.correlation(frame, this.x, this.y)) };
  }

  private correlation(frame: TrackingFrame, x: number, y: number) {
    const origin = y * this.width + x;
    let sum = 0, squared = 0, dot = 0;
    for (let i = 0; i < this.offsets.length; i++) {
      const value = frame.pixels[origin + this.offsets[i]];
      sum += value; squared += value * value; dot += value * this.template[i];
    }
    const variance = squared - sum * sum / this.offsets.length;
    if (variance / this.offsets.length < 16) return -1;
    return Math.max(-1, Math.min(1,
      (dot - sum / this.offsets.length * this.templateSum) / Math.sqrt(variance * this.templateEnergy)));
  }
  private point(time: number, correlation: number, margin?: number): TrackingPoint {
    return { time, x: (this.x + this.patchWidth / 2) / this.width,
      y: (this.y + this.patchHeight / 2) / this.height, correlation, ...(margin === undefined ? {} : { margin }) };
  }

  next(frame: TrackingFrame): TrackingStep {
    if (this.lost) throw new Error('Tracking stopped at a lost target. Select a new reference region to restart.');
    validateFrame(frame);
    if (frame.width !== this.width || frame.height !== this.height || frame.time <= this.time)
      throw new Error('Tracking frames must keep their dimensions and increase in source time.');
    const left = Math.max(0, this.x - this.radius), top = Math.max(0, this.y - this.radius);
    const right = Math.min(this.width - this.patchWidth, this.x + this.radius);
    const bottom = Math.min(this.height - this.patchHeight, this.y + this.radius);
    let best = -Infinity, bestX = this.x, bestY = this.y, index = 0;
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const score = this.correlation(frame, x, y);
      this.scores[index++] = score;
      if (score > best) { best = score; bestX = x; bestY = y; }
    }
    const separation = Math.max(4, Math.min(this.patchWidth, this.patchHeight) / 3);
    let competitor = -1;
    index = 0;
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const score = this.scores[index++];
      if ((x - bestX) ** 2 + (y - bestY) ** 2 >= separation ** 2) competitor = Math.max(competitor, score);
    }
    const margin = best - competitor;
    this.time = frame.time;
    if (best < this.minCorrelation || margin < this.minMargin) {
      this.lost = true;
      return { status: 'lost', time: frame.time, reason: best < this.minCorrelation ? 'low-correlation' : 'ambiguous', correlation: best, margin };
    }
    this.x = bestX; this.y = bestY;
    return { status: 'tracked', point: this.point(frame.time, best, margin) };
  }
}
