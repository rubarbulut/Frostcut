import { clipAudible, clipDuration, clipEnd, isAudioClip, isSequenceClip, type Clip, type Project } from './model';
import { createDuckGain, duckGain } from './audio-tools';
import { requireClipSource } from './clip-source';
export function audioWindow(p: Project, c: Clip) {
  const asset = requireClipSource(p, c);
  const audible = (clip: Clip) => clipAudible(p, clip);
  const audioTrack = (clip: Clip) => (isAudioClip(p, clip) ? clip.trackId : 'A1');
  const previous = p.clips.find(
    (x) =>
      x.id !== c.id &&
      audioTrack(x) === audioTrack(c) &&
      Math.abs(clipEnd(x) - c.start) < 0.001 &&
      audible(x),
  );
  const next = p.clips.find(
    (x) =>
      x.id !== c.id &&
      audioTrack(x) === audioTrack(c) &&
      Math.abs(x.start - clipEnd(c)) < 0.001 &&
      audible(x),
  );
  const before = (clip: Clip) =>
    Math.min(0.015, clipDuration(clip) / 4, clip.sourceStart / clip.properties.speed);
  const after = (clip: Clip) =>
    Math.min(
      0.015,
      clipDuration(clip) / 4,
      Math.max(0, requireClipSource(p, clip).duration - clip.sourceEnd) /
        clip.properties.speed,
    );
  const pre = previous ? before(c) : 0,
    post = next ? after(c) : 0;
  const fadeIn = Math.min(
    clipDuration(c) / 2,
    Math.max(c.properties.fadeIn, previous ? pre + after(previous) : 0),
  );
  const fadeOut = Math.min(
    clipDuration(c) / 2,
    Math.max(c.properties.fadeOut, next ? post + before(next) : 0),
  );
  return {
    pre,
    post,
    fadeIn,
    fadeOut,
    start: Math.max(0, c.sourceStart - pre * c.properties.speed),
    end: isSequenceClip(c) ? c.sourceEnd + post * c.properties.speed
      : Math.min(asset.duration, c.sourceEnd + post * c.properties.speed),
    timelineStart: c.start - pre,
    duration: clipDuration(c) + pre + post,
  };
}
export function audioGainAt(p: Project, c: Clip, time: number) {
  if (!clipAudible(p, c)) return 0;
  const window = audioWindow(p, c),
    local = time - window.timelineStart;
  if (local < 0 || local >= window.duration) return 0;
  return (
    c.properties.volume *
    duckGain(p, c, time) *
    Math.max(
      0,
      Math.min(
        1,
        local / Math.max(0.0001, window.fadeIn),
        (window.duration - local) / Math.max(0.0001, window.fadeOut),
      ),
    )
  );
}

/** A zero-duration afade can retain FFmpeg's default sample fade; emit only requested ramps. */
export function audioFadeFilter(window: Pick<ReturnType<typeof audioWindow>, 'fadeIn' | 'fadeOut' | 'duration'>) {
  const number = (n: number) => Number(n.toFixed(6)).toString();
  const filters: string[] = [];
  if (window.fadeIn > 0) filters.push(`afade=t=in:d=${number(Math.max(0.0001, window.fadeIn))}`);
  if (window.fadeOut > 0) {
    const fade = Math.max(0.0001, window.fadeOut);
    filters.push(`afade=t=out:st=${number(Math.max(0, window.duration - fade))}:d=${number(fade)}`);
  }
  return filters.join(',') || 'anull';
}

export type ClipAudioPlan = {
  readonly window: ReturnType<typeof audioWindow>;
  readonly audible: boolean;
  readonly gainAt: (time: number) => number;
};

/** Edit-dependent timing/speech data; no media decoding or playhead-dependent cache. */
export function createClipAudioPlan(p: Project, c: Clip, hasAudio?: ReadonlyMap<string, boolean>): ClipAudioPlan {
  const window = audioWindow(p, c), audible = clipAudible(p, c);
  const volume = c.properties.volume, duckAt = audible ? createDuckGain(p, c, hasAudio) : () => 1;
  return {
    window, audible,
    gainAt(time) {
      if (!audible) return 0;
      const local = time - window.timelineStart;
      if (local < 0 || local >= window.duration) return 0;
      return volume * duckAt(time) * Math.max(0, Math.min(
        1,
        local / Math.max(0.0001, window.fadeIn),
        (window.duration - local) / Math.max(0.0001, window.fadeOut),
      ));
    },
  };
}
