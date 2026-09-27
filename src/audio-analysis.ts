import type { Word } from './model';
export function analysisWindows(duration: number, step = 90) {
  const windows: { start: number; duration: number; coreStart: number; coreEnd: number }[] = [];
  for (let coreStart = 0; coreStart < duration; coreStart += step) {
    const start = Math.max(0, coreStart - 1),
      coreEnd = Math.min(duration, coreStart + step);
    windows.push({ start, duration: Math.min(duration, coreEnd + 1) - start, coreStart, coreEnd });
  }
  return windows;
}
export function rmsEnvelope(samples: Float32Array, sampleRate = 16000) {
  const hop = Math.round(sampleRate * 0.02),
    out = new Float32Array(Math.ceil(samples.length / hop));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    const end = Math.min(samples.length, (i + 1) * hop);
    for (let j = i * hop; j < end; j++) sum += samples[j] * samples[j];
    out[i] = Math.sqrt(sum / Math.max(1, end - i * hop));
  }
  return out;
}
export function silencesFromEnvelope(envelope: Float32Array, sensitivity = 50) {
  const threshold = 0.001 + (sensitivity / 100) ** 2 * 0.024;
  const ranges: { start: number; end: number }[] = [];
  let start = -1;
  for (let i = 0; i <= envelope.length; i++) {
    const quiet = i < envelope.length && envelope[i] < threshold;
    if (quiet && start < 0) start = i * 0.02;
    if (!quiet && start >= 0) {
      if (i * 0.02 - start > 0.35)
        ranges.push({ start: start + 0.08, end: i * 0.02 - (i === envelope.length ? 0 : 0.08) });
      start = -1;
    }
  }
  return ranges;
}
export function mergeWindowWords(
  previous: Word[],
  incoming: Word[],
  window: ReturnType<typeof analysisWindows>[number],
) {
  const additions = incoming
    .map((w) => ({ ...w, start: w.start + window.start, end: w.end + window.start }))
    .filter(
      (w) => (w.start + w.end) / 2 >= window.coreStart && (w.start + w.end) / 2 < window.coreEnd,
    );
  const result = [...previous];
  for (const word of additions) {
    const last = result.at(-1);
    if (
      last &&
      last.text.toLowerCase() === word.text.toLowerCase() &&
      Math.abs(last.start - word.start) < 0.25
    )
      continue;
    result.push(word);
  }
  return result;
}
