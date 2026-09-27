import { clipAudible, clipDuration, clipEnd, isAudioClip, type Clip, type Project } from './model';
import { duckGain } from './audio-tools';
export function audioWindow(p: Project, c: Clip) {
  const asset = p.media.find((m) => m.id === c.mediaId)!;
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
      Math.max(0, p.media.find((m) => m.id === clip.mediaId)!.duration - clip.sourceEnd) /
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
    end: Math.min(asset.duration, c.sourceEnd + post * c.properties.speed),
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
