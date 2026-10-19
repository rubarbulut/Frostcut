import { describe, expect, it } from 'vitest';
import {
  SFX_PRESETS,
  encodeWav,
  computeWaveformPeaks,
  getSfxFile,
  addSfxToProject,
  autoAddWhooshesToCuts,
  autoAddPopsToCaptions,
  autoAddImpactToHook,
  clearSfxClips,
} from './sfx-library';
import { createProject, validateProject, addMedia, splitClip, uid, type Project } from './model';

describe('sfx-library: procedural audio synthesis and presets', () => {
  it('has 18 high-production sound presets across 4 categories', () => {
    expect(SFX_PRESETS.length).toBe(18);
    const categories = new Set(SFX_PRESETS.map((p) => p.category));
    expect(categories).toContain('whoosh');
    expect(categories).toContain('impact');
    expect(categories).toContain('pop');
    expect(categories).toContain('riser');
  });

  it('all presets synthesize finite non-silent audio samples within duration', () => {
    for (const preset of SFX_PRESETS) {
      expect(preset.duration).toBeGreaterThan(0.05);
      expect(preset.duration).toBeLessThanOrEqual(2.5);

      const { left, right } = preset.generateSamples(44100);
      expect(left.length).toBe(Math.floor(preset.duration * 44100));

      let hasNonZero = false;
      let hasNaN = false;
      for (let i = 0; i < left.length; i++) {
        if (!Number.isFinite(left[i])) hasNaN = true;
        if (Math.abs(left[i]) > 0.001) hasNonZero = true;
      }
      expect(hasNaN).toBe(false);
      expect(hasNonZero).toBe(true);

      if (right) {
        expect(right.length).toBe(left.length);
        let hasNonZeroR = false;
        for (let i = 0; i < right.length; i++) {
          if (!Number.isFinite(right[i])) hasNaN = true;
          if (Math.abs(right[i]) > 0.001) hasNonZeroR = true;
        }
        expect(hasNaN).toBe(false);
        expect(hasNonZeroR).toBe(true);
      }
    }
  });

  it('encodes valid 16-bit PCM WAV headers and files', () => {
    const samples = new Float32Array(44100);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
    }
    const wav = encodeWav(samples, undefined, 44100);

    // Check RIFF header
    const textDecoder = new TextDecoder('ascii');
    expect(textDecoder.decode(wav.subarray(0, 4))).toBe('RIFF');
    expect(textDecoder.decode(wav.subarray(8, 12))).toBe('WAVE');
    expect(textDecoder.decode(wav.subarray(12, 16))).toBe('fmt ');
    expect(textDecoder.decode(wav.subarray(36, 40))).toBe('data');

    // Expected size: 44 header bytes + 44100 * 2 bytes = 88244
    expect(wav.length).toBe(44 + 44100 * 2);
  });

  it('computes waveform peak bars for timeline visualizer', () => {
    const samples = new Float32Array(44100);
    samples.fill(0.5);
    const peaks = computeWaveformPeaks(samples, undefined, 44100, 1.0);
    expect(peaks.length).toBeGreaterThanOrEqual(6);
    expect(peaks.every((p) => p >= 0.08 && p <= 1.0)).toBe(true);
  });

  it('memoizes generated SFX files in cache', () => {
    const first = getSfxFile('whoosh-clean');
    const second = getSfxFile('whoosh-clean');
    expect(first.file).toBe(second.file);
    expect(first.file.name).toBe('SFX - Clean Whoosh.wav');
    expect(first.file.type).toBe('audio/wav');
    expect(first.duration).toBe(0.45);
  });
});

describe('sfx-library: timeline project integration', () => {
  const createTestProject = (): Project => {
    const p = createProject('SFX Test');
    return addMedia(p, {
      id: 'video_1',
      name: 'speech.mp4',
      duration: 10,
      width: 1080,
      height: 1920,
      size: 5000000,
      type: 'video/mp4',
    });
  };

  it('adds an SFX clip to track A2 and produces a valid project', () => {
    const p = createTestProject();
    const { nextProject, clipId, assetId } = addSfxToProject(p, 'whoosh-clean', 2.5);

    expect(nextProject.clips).toHaveLength(2);
    const sfxClip = nextProject.clips.find((c) => c.id === clipId);
    expect(sfxClip).toBeDefined();
    expect(sfxClip?.trackId).toBe('A2');
    expect(sfxClip?.start).toBe(2.5);
    expect(sfxClip?.audioRole).toBe('sfx');
    expect(sfxClip?.mediaId).toBe(assetId);

    const asset = nextProject.media.find((m) => m.id === assetId);
    expect(asset).toBeDefined();
    expect(asset?.folder).toBe('SFX');
    expect(asset?.type).toBe('audio/wav');

    // Verify project satisfies validateProject
    expect(() => validateProject(nextProject)).not.toThrow();
  });

  it('reuses the same MediaAsset when inserting the same SFX preset multiple times', () => {
    const p = createTestProject();
    const { nextProject: p1, assetId: id1 } = addSfxToProject(p, 'whoosh-whip', 1.0);
    const { nextProject: p2, assetId: id2 } = addSfxToProject(p1, 'whoosh-whip', 4.0);

    expect(id1).toBe(id2);
    // 1 video media + 1 SFX media = 2 media items total
    expect(p2.media).toHaveLength(2);
    // 1 video clip + 2 whoosh clips = 3 clips total
    expect(p2.clips).toHaveLength(3);
    expect(() => validateProject(p2)).not.toThrow();
  });

  it('autoAddWhooshesToCuts inserts whooshes at video cut points', () => {
    let p = createTestProject();
    // Split clip at 3.0s and 6.0s
    p = splitClip(p, p.clips[0].id, 3.0);
    p = splitClip(p, p.clips[1].id, 6.0);
    expect(p.clips.filter((c) => c.trackId === 'V1')).toHaveLength(3);

    const { nextProject, count } = autoAddWhooshesToCuts(p);
    expect(count).toBe(2);
    const sfxClips = nextProject.clips.filter((c) => c.audioRole === 'sfx');
    expect(sfxClips).toHaveLength(2);
    expect(sfxClips[0].start).toBeCloseTo(3.0 - 0.18, 2);
    expect(sfxClips[1].start).toBeCloseTo(6.0 - 0.18, 2);
    expect(() => validateProject(nextProject)).not.toThrow();
  });

  it('autoAddPopsToCaptions inserts pops at keyword caption words', () => {
    const p = createTestProject();
    p.transcripts = [
      {
        mediaId: 'video_1',
        language: 'English',
        source: 'demo',
        words: [
          { id: 'w1', speakerId: 's1', text: 'Welcome', start: 0.5, end: 1.0, important: false },
          { id: 'w2', speakerId: 's1', text: 'Secret', start: 1.5, end: 2.0, important: true },
          { id: 'w3', speakerId: 's1', text: 'Formula', start: 2.1, end: 2.6, important: true }, // close to 1.5s, should be throttled
          { id: 'w4', speakerId: 's1', text: 'Success', start: 4.0, end: 4.5, important: true },
        ],
      },
    ];

    const { nextProject, count } = autoAddPopsToCaptions(p);
    expect(count).toBe(2); // Secret (1.5s) and Success (4.0s)
    const pops = nextProject.clips.filter((c) => c.audioRole === 'sfx');
    expect(pops).toHaveLength(2);
    expect(pops[0].start).toBe(1.5);
    expect(pops[1].start).toBe(4.0);
    expect(() => validateProject(nextProject)).not.toThrow();
  });

  it('autoAddImpactToHook adds bass drop at 0.0s', () => {
    const p = createTestProject();
    const { nextProject, added } = autoAddImpactToHook(p);
    expect(added).toBe(true);
    const impact = nextProject.clips.find((c) => c.audioRole === 'sfx' && c.start === 0);
    expect(impact).toBeDefined();

    // Adding again returns added: false
    const { added: secondTry } = autoAddImpactToHook(nextProject);
    expect(secondTry).toBe(false);
  });

  it('clearSfxClips removes all SFX clips from timeline', () => {
    let p = createTestProject();
    p = addSfxToProject(p, 'whoosh-clean', 1.0).nextProject;
    p = addSfxToProject(p, 'pop-bubble', 2.0).nextProject;
    expect(p.clips.filter((c) => c.audioRole === 'sfx')).toHaveLength(2);

    const cleared = clearSfxClips(p);
    expect(cleared.clips.filter((c) => c.audioRole === 'sfx')).toHaveLength(0);
    expect(cleared.clips).toHaveLength(1); // original video remains
    expect(() => validateProject(cleared)).not.toThrow();
  });
});
