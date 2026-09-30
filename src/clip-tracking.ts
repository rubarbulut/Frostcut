import { isAudioClip, isLocked, type Project } from './model';
import { validClipTracking, type ClipTracking, type MotionTrackingPoint } from './tracking-data';

export function setClipTracking(p: Project, clipId: string, tracking: ClipTracking | undefined): Project {
  const c = p.clips.find((clip) => clip.id === clipId);
  if (!c || isAudioClip(p, c) || isLocked(p, c)) return p;
  const media = p.media.find((m) => m.id === c.mediaId);
  if (tracking !== undefined && (!media || !validClipTracking(tracking, media.duration)))
    throw new Error('Tracking points or source range are invalid.');
  return { ...p, clips: p.clips.map((clip) => clip.id === clipId
    ? { ...clip, tracking: tracking ? structuredClone(tracking) : undefined } : clip) };
}

export function editTrackingPoint(t: ClipTracking, index: number, patch: Partial<Pick<MotionTrackingPoint, 'time' | 'x' | 'y'>>) {
  if (!Number.isInteger(index) || !t.points[index]) throw new Error('Select a saved tracking point.');
  const next = structuredClone(t);
  next.points[index] = { time: t.points[index].time, x: t.points[index].x, y: t.points[index].y, ...patch, manual: true };
  if (index === 0) next.start = next.points[0].time;
  if (!validClipTracking(next, next.end)) throw new Error('Point times must increase and stay inside the source range.');
  return next;
}

/** Any project change invalidates unapplied results; playback changes do not. */
export function trackingResultIsCurrent(snapshot: Project, current: Project, clipId: string, sourceUrl: string, currentUrl?: string) {
  const clip = current.clips.find((c) => c.id === clipId);
  return snapshot === current && sourceUrl === currentUrl && !!clip && !isLocked(current, clip);
}
