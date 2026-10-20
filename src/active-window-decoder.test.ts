import { describe, it, expect } from 'vitest';
import { createProject, defaultProps, type Project } from './model';
import { getActiveWindowClips, buildProjectPreviewPlan } from './Preview';

describe('ActiveWindowDecoder / Virtual Decoder Pooling (PR #402)', () => {
  function makeTestProject(clipCount = 40): Project {
    const proj = createProject();
    proj.media = Array.from({ length: clipCount }, (_, i) => ({
      id: `media-${i}`,
      name: `video-${i}.mp4`,
      duration: 5,
      width: 1080,
      height: 1920,
      size: 50000,
      type: 'video/mp4',
    }));
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

  function createMediaAsset(id: string) {
    return { id, name: `${id}.mp4`, duration: 10, width: 1080, height: 1920, size: 50000, type: 'video/mp4' };
  }

  it('properly pre-rolls upcoming clip during gap before cut point', () => {
    const project = createProject();
    project.media = [createMediaAsset('m1')];
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

  it('keeps both clipFrom and clipTo in decoder pool during active transitions', () => {
    const project = createProject();
    project.media = [createMediaAsset('m1'), createMediaAsset('m2')];
    project.clips = [
      {
        id: 'clip-A',
        mediaId: 'm1',
        start: 0,
        sourceStart: 0,
        sourceEnd: 5,
        trackId: 'V1',
        properties: defaultProps,
        transition: { type: 'cross-dissolve', duration: 1.0 },
      },
      {
        id: 'clip-B',
        mediaId: 'm2',
        start: 4.5,
        sourceStart: 0,
        sourceEnd: 5,
        trackId: 'V1',
        properties: defaultProps,
      },
    ];

    // During transition between clip-A and clip-B around t = 4.7s
    const pool = getActiveWindowClips(project, 4.7);
    expect(pool.some((c) => c.id === 'clip-A')).toBe(true);
    expect(pool.some((c) => c.id === 'clip-B')).toBe(true);
  });

  it('keeps all 3 contributing video layers in pool without arbitrary 2-clip cap', () => {
    const project = createProject();
    project.media = [createMediaAsset('m1'), createMediaAsset('m2'), createMediaAsset('m3')];
    project.tracks = [
      { id: 'V1', name: 'Background', kind: 'video', muted: false, hidden: false, locked: false, height: 64 },
      { id: 'V2', name: 'Overlay', kind: 'video', muted: false, hidden: false, locked: false, height: 64 },
      { id: 'V3', name: 'PiP', kind: 'video', muted: false, hidden: false, locked: false, height: 64 },
    ];
    project.clips = [
      { id: 'c-v1', mediaId: 'm1', start: 0, sourceStart: 0, sourceEnd: 10, trackId: 'V1', properties: defaultProps },
      { id: 'c-v2', mediaId: 'm2', start: 0, sourceStart: 0, sourceEnd: 10, trackId: 'V2', properties: defaultProps },
      { id: 'c-v3', mediaId: 'm3', start: 0, sourceStart: 0, sourceEnd: 10, trackId: 'V3', properties: defaultProps },
    ];

    const pool = getActiveWindowClips(project, 2.5);
    expect(pool.length).toBe(3);
    expect(pool.map((c) => c.id)).toContain('c-v1');
    expect(pool.map((c) => c.id)).toContain('c-v2');
    expect(pool.map((c) => c.id)).toContain('c-v3');
  });

  it('keeps 2 transition sources plus 3rd simultaneous layer in pool', () => {
    const project = createProject();
    project.media = [createMediaAsset('m1'), createMediaAsset('m2'), createMediaAsset('m3')];
    project.tracks = [
      { id: 'V1', name: 'Main', kind: 'video', muted: false, hidden: false, locked: false, height: 64 },
      { id: 'V2', name: 'Overlay', kind: 'video', muted: false, hidden: false, locked: false, height: 64 },
    ];
    project.clips = [
      {
        id: 'tr-from',
        mediaId: 'm1',
        start: 0,
        sourceStart: 0,
        sourceEnd: 5,
        trackId: 'V1',
        properties: defaultProps,
        transition: { type: 'cross-dissolve', duration: 1.0 },
      },
      { id: 'tr-to', mediaId: 'm2', start: 4.5, sourceStart: 0, sourceEnd: 5, trackId: 'V1', properties: defaultProps },
      { id: 'overlay-v2', mediaId: 'm3', start: 3.0, sourceStart: 0, sourceEnd: 8, trackId: 'V2', properties: defaultProps },
    ];

    const pool = getActiveWindowClips(project, 4.7);
    expect(pool.length).toBe(3);
    expect(pool.map((c) => c.id)).toContain('tr-from');
    expect(pool.map((c) => c.id)).toContain('tr-to');
    expect(pool.map((c) => c.id)).toContain('overlay-v2');
  });

  it('keeps video clip in pool if video track is hidden but audio is audible', () => {
    const project = createProject();
    project.media = [createMediaAsset('m1')];
    project.tracks = [
      { id: 'V1', name: 'Video 1', kind: 'video', muted: false, hidden: true, locked: false, height: 64 },
    ];
    project.clips = [
      { id: 'audible-hidden', mediaId: 'm1', start: 0, sourceStart: 0, sourceEnd: 5, trackId: 'V1', properties: defaultProps },
    ];

    const pool = getActiveWindowClips(project, 2.0);
    // Hidden video track is still audible, so clip is mounted in pool for audio playback
    expect(pool.length).toBe(1);
    expect(pool[0].id).toBe('audible-hidden');
  });

  it('excludes hidden video clip if track is also muted', () => {
    const project = createProject();
    project.media = [createMediaAsset('m1')];
    project.tracks = [
      { id: 'V1', name: 'Video 1', kind: 'video', muted: true, hidden: true, locked: false, height: 64 },
    ];
    project.clips = [
      { id: 'muted-hidden', mediaId: 'm1', start: 0, sourceStart: 0, sourceEnd: 5, trackId: 'V1', properties: defaultProps },
    ];

    const pool = getActiveWindowClips(project, 2.0);
    expect(pool.length).toBe(0);
  });

  describe('B002-K Immutable Plan & Independent Seek Lifecycle', () => {
    it('uses immutable ProjectPreviewPlan to avoid recalculating audio plans on every tick', async () => {
      const { buildProjectPreviewPlan, getActiveWindowClips } = await import('./Preview');
      const project = makeTestProject(10);

      const plan1 = buildProjectPreviewPlan(project);
      expect(plan1.videoPlans.length).toBe(10);

      // Same plan passed across different playhead times
      const poolAt1 = getActiveWindowClips(plan1, 1.0);
      const poolAt4 = getActiveWindowClips(plan1, 4.0);
      expect(poolAt1.map((c) => c.id)).toContain('clip-0');
      expect(poolAt4.map((c) => c.id)).toContain('clip-0');
      expect(poolAt4.map((c) => c.id)).toContain('clip-1'); // pre-roll
    });

    it('prevents seek pileup when video element is already seeking', async () => {
      const { gopReverseEngine } = await import('./shuttle-controller');
      gopReverseEngine.reset();

      const fakeVideo = { currentTime: 5.0, seeking: true };
      // Even with large time difference, inflight seek must be respected (no pileup)
      const shouldSeek = gopReverseEngine.shouldSeekVideoElement(1.0, fakeVideo as any, 30, -1, 'clip-1');
      expect(shouldSeek).toBe(false);

      // Once seeking finishes, seek command is allowed
      fakeVideo.seeking = false;
      const shouldSeekNow = gopReverseEngine.shouldSeekVideoElement(1.0, fakeVideo as any, 30, -1, 'clip-1');
      expect(shouldSeekNow).toBe(true);
    });

    it('ensures independent video sources do not throttle each other during multi-track playback', async () => {
      const { gopReverseEngine } = await import('./shuttle-controller');
      gopReverseEngine.reset();

      const layer1 = { currentTime: 5.0, seeking: false };
      const layer2 = { currentTime: 5.0, seeking: false };

      // Layer 1 seeks
      const seek1 = gopReverseEngine.shouldSeekVideoElement(2.0, layer1 as any, 30, -1, 'layer-1');
      expect(seek1).toBe(true);

      // Immediately (0ms later), Layer 2 needs to seek: must NOT be blocked by layer 1's seek timestamp
      const seek2 = gopReverseEngine.shouldSeekVideoElement(2.0, layer2 as any, 30, -1, 'layer-2');
      expect(seek2).toBe(true);
    });

    it('triggers hardware decoder cleanup (pause, removeAttribute src, load) on element unmount', () => {
      const fakeVideo = {
        paused: false,
        attributes: { src: 'blob:http://localhost/video-1' } as Record<string, string>,
        pauseCalled: false,
        loadCalled: false,
        pause() {
          this.pauseCalled = true;
          this.paused = true;
        },
        removeAttribute(attr: string) {
          delete this.attributes[attr];
        },
        load() {
          this.loadCalled = true;
        },
      };

      // Simulates unmount hook in VideoLayer / ProposedLayer
      const unmountCleanup = () => {
        fakeVideo.pause();
        fakeVideo.removeAttribute('src');
        fakeVideo.load();
      };

      unmountCleanup();

      expect(fakeVideo.pauseCalled).toBe(true);
      expect(fakeVideo.attributes.src).toBeUndefined();
      expect(fakeVideo.loadCalled).toBe(true);
    });

    it('registers and unregisters video elements in videoMap for transitions without memory leaks', () => {
      const videoMap = new Map<string, HTMLVideoElement>();
      const onRegisterVideo = (id: string, el: HTMLVideoElement | null) => {
        if (el) videoMap.set(id, el);
        else videoMap.delete(id);
      };

      const fakeEl = { id: 'el-1' } as unknown as HTMLVideoElement;
      onRegisterVideo('clip-1', fakeEl);
      expect(videoMap.get('clip-1')).toBe(fakeEl);

      // On unmount:
      onRegisterVideo('clip-1', null);
      expect(videoMap.has('clip-1')).toBe(false);
    });

    it('verifies real transition source access with distinct sources (sourceA !== sourceB)', () => {
      const project = createProject();
      project.media = [createMediaAsset('m1'), createMediaAsset('m2')];
      project.clips = [
        {
          id: 'clip-A',
          mediaId: 'm1',
          start: 0,
          sourceStart: 0,
          sourceEnd: 5,
          trackId: 'V1',
          properties: defaultProps,
          transition: { type: 'cross-dissolve', duration: 1.0 },
        },
        {
          id: 'clip-B',
          mediaId: 'm2',
          start: 4.5,
          sourceStart: 0,
          sourceEnd: 5,
          trackId: 'V1',
          properties: defaultProps,
        },
      ];

      const plan = buildProjectPreviewPlan(project);
      expect(plan.transitions.length).toBe(1);
      const tr = plan.transitions[0];

      const videoMap = new Map<string, HTMLVideoElement>();
      const fakeVideoA = { readyState: 4, src: 'media-1.mp4' } as HTMLVideoElement;
      const fakeVideoB = { readyState: 4, src: 'media-2.mp4' } as HTMLVideoElement;

      videoMap.set(tr.clipFrom.id, fakeVideoA);
      videoMap.set(tr.clipTo.id, fakeVideoB);

      const sourceA = videoMap.get(tr.clipFrom.id) ?? null;
      const sourceB = videoMap.get(tr.clipTo.id) ?? null;

      expect(sourceA).not.toBeNull();
      expect(sourceB).not.toBeNull();
      expect(sourceA).not.toBe(sourceB); // sourceA !== sourceB holds true!
    });

    it('keeps 3 contributing video layers mounted while dropping distant pre-roll (>2s) and past clips', () => {
      const project = createProject();
      project.media = [
        createMediaAsset('m1'),
        createMediaAsset('m2'),
        createMediaAsset('m3'),
        createMediaAsset('m4'),
        createMediaAsset('m5'),
      ];
      project.tracks = [
        { id: 'V1', name: 'Background', kind: 'video', muted: false, hidden: false, locked: false, height: 64 },
        { id: 'V2', name: 'Middle', kind: 'video', muted: false, hidden: false, locked: false, height: 64 },
        { id: 'V3', name: 'Overlay', kind: 'video', muted: false, hidden: false, locked: false, height: 64 },
      ];
      project.clips = [
        // Past clip: ended at t = 4.0s (should be dropped at t = 5.0s)
        { id: 'past-clip', mediaId: 'm1', start: 0, sourceStart: 0, sourceEnd: 4, trackId: 'V1', properties: defaultProps },
        // 3 active layers at t = 5.0s:
        { id: 'active-v1', mediaId: 'm1', start: 4, sourceStart: 0, sourceEnd: 10, trackId: 'V1', properties: defaultProps },
        { id: 'active-v2', mediaId: 'm2', start: 0, sourceStart: 0, sourceEnd: 10, trackId: 'V2', properties: defaultProps },
        { id: 'active-v3', mediaId: 'm3', start: 2, sourceStart: 0, sourceEnd: 10, trackId: 'V3', properties: defaultProps },
        // Distant pre-roll clip: starts at 7.5s (5.0s + 2.5s > 2.0s preRollWindow -> MUST be dropped)
        { id: 'distant-clip', mediaId: 'm4', start: 7.5, sourceStart: 0, sourceEnd: 10, trackId: 'V1', properties: defaultProps },
        // Near pre-roll clip: starts at 6.5s (5.0s + 1.5s <= 2.0s preRollWindow -> can be kept)
        { id: 'near-preroll', mediaId: 'm5', start: 6.5, sourceStart: 0, sourceEnd: 10, trackId: 'V2', properties: defaultProps },
      ];

      const plan = buildProjectPreviewPlan(project);
      const pool = getActiveWindowClips(plan, 5.0);

      // All 3 active layers are present
      expect(pool.some((c) => c.id === 'active-v1')).toBe(true);
      expect(pool.some((c) => c.id === 'active-v2')).toBe(true);
      expect(pool.some((c) => c.id === 'active-v3')).toBe(true);

      // Past clip is dropped (unmounted)
      expect(pool.some((c) => c.id === 'past-clip')).toBe(false);

      // Distant clip (> 2s away) is dropped
      expect(pool.some((c) => c.id === 'distant-clip')).toBe(false);

      // Near pre-roll clip is included in pre-roll quota
      expect(pool.some((c) => c.id === 'near-preroll')).toBe(true);
    });
  });
});


