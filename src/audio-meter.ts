export type StereoPeaks = { left: number; right: number };
export type MeterLevels = StereoPeaks & { peakLeft: number; peakRight: number; clipHold: number };
export const emptyMeter = (): MeterLevels => ({ left: 0, right: 0, peakLeft: 0, peakRight: 0, clipHold: 0 });

/** Sample peak, not RMS/LUFS or an oversampled true-peak measurement. */
export function samplePeak(samples: Float32Array) {
  let peak = 0;
  for (const sample of samples) if (Number.isFinite(sample)) peak = Math.max(peak, Math.abs(sample));
  return peak;
}
export const peakDb = (peak: number) => peak > 0 && Number.isFinite(peak) ? 20 * Math.log10(peak) : -Infinity;
export const meterPercent = (peak: number) => Math.max(0, Math.min(100, (peakDb(peak) + 60) / 60 * 100));

export function updateMeter(previous: MeterLevels, samples: StereoPeaks, elapsed: number): MeterLevels {
  const dt = Math.max(0, Math.min(0.25, elapsed));
  const release = 10 ** (-24 * dt / 20), holdRelease = 10 ** (-6 * dt / 20);
  return {
    left: Math.max(samples.left, previous.left * release),
    right: Math.max(samples.right, previous.right * release),
    peakLeft: Math.max(samples.left, previous.peakLeft * holdRelease),
    peakRight: Math.max(samples.right, previous.peakRight * holdRelease),
    clipHold: Math.max(samples.left, samples.right) >= 1 ? 1 : Math.max(0, previous.clipHold - dt),
  };
}
