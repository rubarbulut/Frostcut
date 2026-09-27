import { describe, it, expect } from 'vitest';
import {
  addMedia,
  createProject,
  detachAudio,
  clipAudible,
  isLocked,
  splitClip,
  validateProject,
  timelineWords,
  deleteRange,
} from './model';
describe('independent source audio', () => {
  const source = () =>
    addMedia(createProject(), {
      id: 'm',
      name: 'source.mp4',
      duration: 10,
      width: 360,
      height: 640,
      size: 100,
      type: 'video/mp4',
    });
  it('detaches once and retains source/speed timing without duplicate captions or audio', () => {
    const original = source();
    original.clips[0].properties.speed = 2;
    const p = detachAudio(original, original.clips[0].id),
      [video, audio] = p.clips;
    expect(original.clips).toHaveLength(1);
    expect(p.clips).toHaveLength(2);
    expect(audio.properties.speed).toBe(2);
    expect(audio.trackId).toBe('A1');
    expect(clipAudible(p, video)).toBe(false);
    expect(clipAudible(p, audio)).toBe(true);
    expect(detachAudio(p, video.id).clips).toHaveLength(2);
    expect(validateProject(JSON.parse(JSON.stringify(p))).clips).toHaveLength(2);
    p.transcripts = [
      {
        mediaId: 'm',
        source: 'local',
        language: 'English',
        words: [{ id: 'w', text: 'hello', start: 1, end: 2, speakerId: 'speaker-1' }],
      },
    ];
    expect(timelineWords(p)).toHaveLength(1);
  });
  it('honors only relevant track locks and splits audio independently', () => {
    const original = source(),
      p = detachAudio(original, original.clips[0].id);
    p.tracks.find((t) => t.id === 'A1')!.locked = true;
    expect(isLocked(p, p.clips[0])).toBe(false);
    expect(isLocked(p, p.clips[1])).toBe(true);
    expect(deleteRange(p, 1, 2)).toBe(p);
    p.clips[1].trackId = 'A2';
    p.tracks.find((t) => t.id === 'A1')!.muted = true;
    expect(clipAudible(p, p.clips[1])).toBe(true);
    const split = splitClip(p, p.clips[1].id, 3);
    expect(split.clips.filter((c) => c.trackId === 'A2')).toHaveLength(2);
    expect(split.clips.find((c) => c.id === p.clips[0].id)?.sourceEnd).toBe(10);
  });
});
