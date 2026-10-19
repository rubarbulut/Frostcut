import { describe, it, expect } from 'vitest';
import { createProject, defaultProps, type Project } from './model';
import { getActiveWindowClips } from './Preview';

describe('ActiveWindowDecoder / Virtual Decoder Pooling (PR #402)', () => {
  function makeTestProject(clipCount = 40): Project {
    const proj = createProject();
    // Create 40 consecutive 5-second video clips (total duration 200s)
    proj.clips = Array.from({ length: clipCount }, (_, i) => ({
      id: `clip-${i}`,
      mediaId: `media-${i}`,
      start: i * 5,
      sourceStart: 0,
      sourceEnd: 5,
      trackId: 'V1',
      properties: defaultProps,
    }));
    return proj;
  }

  it('keeps strictly MAXIMUM 2 video clips in DOM pool (active + pre-roll < 2s)', () => {
    const project = makeTestProject(40);

    // At time = 3.5s:
    // clip-0 runs 0-5s (active)
    // clip-1 starts at 5s -> distance is 5 - 3.5 = 1.5s <= 2.0s (pre-roll candidate)
    // clip-2 starts at 10s -> distance is 10 - 3.5 = 6.5s > 2.0s
    const pool = getActiveWindowClips(project, 3.5);

    expect(pool.length).toBe(2);
    expect(pool.map((c) => c.id)).toEqual(['clip-0', 'clip-1']);
  });

  it('unmounts pre-roll clip when next cut point is farther than 2 seconds', () => {
    const project = makeTestProject(40);

    // At time = 1.0s:
    // clip-0 runs 0-5s (active)
    // clip-1 starts at 5s -> distance is 5 - 1.0 = 4.0s > 2.0s (not ready for pre-roll)
    const pool = getActiveWindowClips(project, 1.0);

    expect(pool.length).toBe(1);
    expect(pool[0].id).toBe('clip-0');
  });

  it('unmounts distant clips and transitions seamlessly across cut points', () => {
    const project = makeTestProject(40);

    // At time = 5.1s (just after cut point):
    // clip-0 has ended (unmounted to free decoder & GPU textures)
    // clip-1 is active (starts at 5s, ends at 10s)
    // clip-2 starts at 10s -> distance is 10 - 5.1 = 4.9s > 2s (not yet in pre-roll)
    const pool = getActiveWindowClips(project, 5.1);

    expect(pool.length).toBe(1);
    expect(pool[0].id).toBe('clip-1');
  });

  it('stress test: 40 clips timeline never exceeds 2 decoders at any playhead position', () => {
    const project = makeTestProject(40);

    // Test every 0.25 seconds across the entire 200s timeline
    for (let t = 0; t <= 200; t += 0.25) {
      const pool = getActiveWindowClips(project, t);
      const videoClips = pool.filter((c) => c.trackId === 'V1');
      expect(videoClips.length).toBeLessThanOrEqual(2);
    }
  });

  it('properly pre-rolls upcoming clip during gap before cut point', () => {
    const project = createProject();
    project.clips = [
      {
        id: 'clip-gap-1',
        mediaId: 'm1',
        start: 5,
        sourceStart: 0,
        sourceEnd: 5,
        trackId: 'V1',
        properties: defaultProps,
      },
    ];

    // At time = 3.5s, no active clip, but clip-gap-1 starts in 1.5s (<= 2s)
    const pool = getActiveWindowClips(project, 3.5);
    expect(pool.length).toBe(1);
    expect(pool[0].id).toBe('clip-gap-1');

    // At time = 1.0s (> 2s away from start)
    const emptyPool = getActiveWindowClips(project, 1.0);
    expect(emptyPool.length).toBe(0);
  });
});
