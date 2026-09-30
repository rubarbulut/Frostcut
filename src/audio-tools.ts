import { clipAudible, clipEnd, isAudioClip, type Clip, type Project } from './model';

/** Percussive onset peaks, in source seconds. No fabricated evenly-spaced beat grid. */
export function detectBeats(samples: Float32Array, sampleRate = 16000): number[] {
  const hop = Math.max(1, Math.round(sampleRate * 0.01));
  const energy = new Float32Array(Math.ceil(samples.length / hop));
  for (let i = 0; i < samples.length; i++) energy[Math.floor(i / hop)] += samples[i] ** 2 / hop;
  const flux = energy.map((value, i) =>
    Math.max(0, Math.sqrt(value) - Math.sqrt(energy[Math.max(0, i - 2)])),
  );
  const beats: number[] = [];
  for (let i = 2; i < flux.length - 2; i++) {
    const a = Math.max(0, i - 50),
      b = Math.min(flux.length, i + 50);
    let mean = 0;
    for (let j = a; j < b; j++) mean += flux[j];
    mean /= b - a;
    if (
      flux[i] > Math.max(0.006, mean * 2.2) &&
      flux[i] >= flux[i - 1] &&
      flux[i] > flux[i + 1] &&
      flux[i] >= flux[i - 2] &&
      flux[i] > flux[i + 2]
    ) {
      const time = (i * hop) / sampleRate;
      if (!beats.length || time - beats.at(-1)! >= 0.2) beats.push(time);
    }
  }
  return beats;
}

export function timelineBeats(p: Project, excluded: string[] = []) {
  return p.clips
    .filter((c) => isAudioClip(p, c) && !excluded.includes(c.id))
    .flatMap((c) =>
      (p.beats?.[c.mediaId] ?? [])
        .filter((t) => t >= c.sourceStart && t <= c.sourceEnd)
        .map((t) => c.start + (t - c.sourceStart) / c.properties.speed),
    )
    .sort((a, b) => a - b);
}

export function speechRanges(p: Project, musicId?: string) {
  const ranges = p.clips
    .filter(
      (c) =>
        c.id !== musicId && clipAudible(p, c) && c.properties.volume > 0 && c.audioRole !== 'music',
    )
    .flatMap((c) => {
      const words = c.captionWords?.length
        ? c.captionWords
        : p.transcripts.find((t) => t.mediaId === c.mediaId)?.words;
      if (!words?.length) return [{ start: c.start, end: clipEnd(c) }];
      return words
        .filter((w) => w.end > c.sourceStart && w.start < c.sourceEnd)
        .map((w) => ({
          start: c.start + (Math.max(w.start, c.sourceStart) - c.sourceStart) / c.properties.speed,
          end: c.start + (Math.min(w.end, c.sourceEnd) - c.sourceStart) / c.properties.speed,
        }));
    })
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r.start - last.end <= 0.45) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

export function duckGain(p: Project, c: Clip, time: number) {
  if (!c.autoDuck || c.audioRole !== 'music') return 1;
  let gain = 1;
  for (const r of speechRanges(p, c.id)) {
    if (time < r.start - 0.15 || time > r.end + 0.3) continue;
    const envelope =
      time < r.start ? (r.start - time) / 0.15 : time <= r.end ? 0 : (time - r.end) / 0.3;
    gain = Math.min(gain, 0.25 + 0.75 * envelope);
  }
  return gain;
}

/** Compile merged speech once; seek directly to the next release boundary. */
export function createDuckGain(p: Project, c: Clip): (time: number) => number {
  if (!c.autoDuck || c.audioRole !== 'music') return () => 1;
  const ranges = speechRanges(p, c.id);
  return (time) => {
    let low = 0, high = ranges.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (ranges[mid].end + 0.3 < time) low = mid + 1;
      else high = mid;
    }
    let gain = 1;
    // Usually one candidate; keep exact minimum semantics at floating-point boundaries.
    for (let i = low; i < ranges.length; i++) {
      const r = ranges[i];
      if (time < r.start - 0.15) break;
      const envelope = time < r.start ? (r.start - time) / 0.15
        : time <= r.end ? 0 : (time - r.end) / 0.3;
      gain = Math.min(gain, 0.25 + 0.75 * envelope);
    }
    return gain;
  };
}

export function audioEffectsFilter(p: Project, c: Clip, timelineStart: number) {
  const effects = c.voiceEnhance
    ? 'highpass=f=80,lowpass=f=8000,acompressor=threshold=0.125:ratio=3:attack=10:release=100:makeup=1.5,'
    : '';
  if (!c.autoDuck || c.audioRole !== 'music') return effects + `volume=${c.properties.volume}`;
  // Individual volume stages avoid an unbounded nested expression on long edits.
  // Ranges are merged first, so ramps never multiply during overlapping speech.
  const ranges = speechRanges(p, c.id).filter(
    (r) => r.end + 0.3 > c.start && r.start - 0.15 < clipEnd(c),
  );
  const envelope = ranges.map((r) => {
    const start = (r.start - timelineStart).toFixed(4),
      end = (r.end - timelineStart).toFixed(4);
    return `if(lt(t,${start}-0.15),1,if(lt(t,${start}),0.25+0.75*(${start}-t)/0.15,if(lt(t,${end}),0.25,if(lt(t,${end}+0.3),0.25+0.75*(t-${end})/0.3,1))))`;
  });
  return (
    effects +
    `volume=${c.properties.volume}` +
    envelope.map((e) => `,volume='${e}':eval=frame`).join('')
  );
}
