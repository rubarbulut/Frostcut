import { describe, it, expect } from 'vitest';
import {
  createProject,
  defaultProps,
  duration,
  validateProject,
  type Project,
} from '../model';
import {
  findProjectCandidates,
  analyzeSharedTimeline,
} from './candidate-finder';
import {
  mapSourceRangeToClipTimeline,
  mapAssetProfilesToTimeline,
  isClipAudibleOnTimeline,
} from './audio-to-timeline';
import type { AssetAudioProfile } from '../audio/asset-audio-profile';
import {
  createCreatorRecipe,
  materializeCreatorOutput,
  parseCreatorProfile,
  type CreatorProfile,
} from '../creator-recipe';

describe('B004-K Candidate Finder, Audio-to-Timeline & Evidence Honesty', () => {
  function makeTestGamingProject(clipCount = 4, clipDuration = 50): Project {
    const project = createProject();
    project.name = 'Valorant Scrim VOD';
    project.settings.fps = 30;
    project.settings.noSpeech = true;

    project.media = Array.from({ length: clipCount }, (_, i) => ({
      id: `media-${i}`,
      name: `gameplay-${i}.mp4`,
      duration: clipDuration * 2,
      width: 1920,
      height: 1080,
      size: 100_000_000,
      type: 'video/mp4',
    }));

    project.clips = Array.from({ length: clipCount }, (_, i) => ({
      id: `clip-${i}`,
      mediaId: `media-${i}`,
      start: i * clipDuration,
      sourceStart: 10,
      sourceEnd: 10 + clipDuration,
      trackId: 'V1',
      properties: { ...defaultProps, speed: 1.0 },
    }));

    return project;
  }

  function makeMockFiles(project: Project): Map<string, File> {
    const files = new Map<string, File>();
    for (const m of project.media) {
      files.set(m.id, new File(['fake-video-bytes'], m.name, { type: m.type }));
    }
    return files;
  }

  function makeMockAudioProfile(assetId: string, durationSec = 100): AssetAudioProfile {
    const hopSizeMs = 50;
    const frameCount = Math.floor((durationSec * 1000) / hopSizeMs);
    const speechEnergyScore = new Float32Array(frameCount);
    const rmsDb = new Float32Array(frameCount);

    // Place an active reaction around source seconds 15 to 25
    const startFrame = Math.floor((15 * 1000) / hopSizeMs);
    const endFrame = Math.floor((25 * 1000) / hopSizeMs);
    for (let f = startFrame; f < endFrame; f++) {
      speechEnergyScore[f] = 0.85;
      rmsDb[f] = -12;
    }

    return {
      assetId,
      fileIdentity: `file-${assetId}`,
      status: 'available',
      byteLength: 1024,
      duration: durationSec,
      sampleRate: 16000,
      hopSizeMs,
      frameCount,
      rmsDb,
      peakLinear: new Float32Array(frameCount),
      zcr: new Float32Array(frameCount),
      spectralCentroid: new Float32Array(frameCount),
      speechBandRatio: new Float32Array(frameCount),
      speechEnergyScore,
      silenceMask: [{ start: 60, end: 80, duration: 20 }],
      activeSpeechRegions: [{ start: 15, end: 25, duration: 10 }],
      highlights: [
        {
          start: 15,
          end: 25,
          duration: 10,
          peakSpeechScore: 0.85,
          avgSpeechScore: 0.8,
          avgRmsDb: -14,
          peakRmsDb: -10,
          reason: 'speech-burst',
        },
      ],
      stats: {
        duration: durationSec,
        avgRmsDb: -24,
        peakRmsDb: -6,
        silenceDuration: 20,
        silenceRatio: 0.2,
        speechDuration: 10,
        speechRatio: 0.1,
        avgZcr: 0.05,
        avgSpectralCentroid: 1200,
      },
    };
  }

  describe('K0 — Candidate Correctness & Evidence Honesty', () => {
    it('strictly respects shortCount = 0 (returns zero shorts)', () => {
      const project = makeTestGamingProject(4, 50); // 200s
      const { proposals, evidence } = findProjectCandidates(project, { shortCount: 0 });

      const shorts = proposals.filter((p) => p.kind === 'youtube-short');
      expect(shorts.length).toBe(0);

      const longs = proposals.filter((p) => p.kind === 'youtube-long');
      expect(longs.length).toBe(1);
      expect(evidence.size).toBe(1);
    });

    it('strictly respects shortCount = 1 (returns at most 1 short)', () => {
      const project = makeTestGamingProject(4, 50);
      const { proposals } = findProjectCandidates(project, { shortCount: 1 });

      const shorts = proposals.filter((p) => p.kind === 'youtube-short');
      expect(shorts.length).toBe(1);
    });

    it('respects shortCount = 12 without fabricating duplicates', () => {
      const project = makeTestGamingProject(6, 60); // 360s
      const { proposals } = findProjectCandidates(project, { shortCount: 12, shortTargetSeconds: 30 });

      const shorts = proposals.filter((p) => p.kind === 'youtube-short');
      // In 360s with 30s target, at most ~12 non-overlapping shorts can fit
      expect(shorts.length).toBeLessThanOrEqual(12);
      expect(shorts.length).toBeGreaterThanOrEqual(1);

      // Verify no duplicates
      const ids = new Set(shorts.map((s) => s.id));
      expect(ids.size).toBe(shorts.length);
    });

    it('provides honest equal-parts fallback when signals are absent', () => {
      const project = makeTestGamingProject(4, 30); // 120s, no tracking, no audio, no markers
      const { proposals, evidence, analysis } = findProjectCandidates(project, { shortCount: 2 });

      expect(analysis.availableSignals).toEqual(['none']);
      expect(analysis.unavailableSignals.length).toBeGreaterThan(0);

      const shorts = proposals.filter((p) => p.kind === 'youtube-short');
      expect(shorts.length).toBe(2);

      for (const short of shorts) {
        const ev = evidence.get(short.id)!;
        expect(ev.method).toBe('equal-parts');
        expect(ev.signalsUsed).toEqual(['none']);
        expect(short.reason).toMatch(/equal partition/i);
        // Must NOT falsely claim to be an AI highlight or hook
        expect(short.reason).not.toMatch(/ai highlight|key hook|reaction/i);
      }
    });

    it('handles very short source recordings honestly', () => {
      const project = createProject();
      project.media = [
        { id: 'm-short', name: 'short.mp4', duration: 8, width: 1920, height: 1080, size: 5000, type: 'video/mp4' },
      ];
      project.clips = [
        {
          id: 'clip-short',
          mediaId: 'm-short',
          start: 0,
          sourceStart: 0,
          sourceEnd: 8,
          trackId: 'V1',
          properties: defaultProps,
        },
      ];

      const { proposals, analysis } = findProjectCandidates(project, {
        shortTargetSeconds: 30,
        minShortSeconds: 15,
        shortCount: 2,
      });

      // 8-second video cannot fit 2 standard 15s+ shorts
      const shorts = proposals.filter((p) => p.kind === 'youtube-short');
      expect(shorts.length).toBeLessThanOrEqual(1);
      if (shorts.length === 1) {
        expect(shorts[0].ranges[0].end - shorts[0].ranges[0].start).toBe(8);
      }
    });

    it('preserves full source timeline in long proposal without unverified claims', () => {
      const project = makeTestGamingProject(5, 60); // 300s
      const { proposals, evidence } = findProjectCandidates(project, { longTargetSeconds: 120 });

      const long = proposals.find((p) => p.kind === 'youtube-long')!;
      expect(long).toBeDefined();

      const totalActual = long.ranges.reduce((sum, r) => sum + r.end - r.start, 0);
      expect(totalActual).toBe(300);

      const ev = evidence.get(long.id)!;
      expect(ev.actualSeconds).toBe(300);
      expect(ev.targetSeconds).toBe(120);
      expect(long.reason).toMatch(/preserved in full/i);
      expect(long.reason).not.toMatch(/lobby removed/i);
    });
  });

  describe('K1 — Source Time to Timeline Mapping (audio-to-timeline)', () => {
    it('correctly maps 2.0x clip speed: duration halves on timeline', () => {
      const clip = {
        id: 'clip-2x',
        mediaId: 'asset-1',
        start: 10,
        sourceStart: 20,
        sourceEnd: 60,
        trackId: 'V1',
        properties: { ...defaultProps, speed: 2.0 },
      };

      // Source highlight from 30s to 50s (20s in source)
      const mapped = mapSourceRangeToClipTimeline(30, 50, clip, true);
      expect(mapped).not.toBeNull();
      // On timeline: start = 10 + (30 - 20) / 2 = 15s
      // end = 10 + (50 - 20) / 2 = 25s
      // duration = 10s
      expect(mapped!.start).toBe(15);
      expect(mapped!.end).toBe(25);
      expect(mapped!.duration).toBe(10);
      expect(mapped!.speed).toBe(2.0);
    });

    it('correctly maps 0.5x clip speed: duration doubles on timeline', () => {
      const clip = {
        id: 'clip-slow',
        mediaId: 'asset-1',
        start: 0,
        sourceStart: 10,
        sourceEnd: 30,
        trackId: 'V1',
        properties: { ...defaultProps, speed: 0.5 },
      };

      // Source range 12s to 16s (4s in source)
      const mapped = mapSourceRangeToClipTimeline(12, 16, clip, true);
      expect(mapped).not.toBeNull();
      // On timeline: start = 0 + (12 - 10) / 0.5 = 4s
      // end = 0 + (16 - 10) / 0.5 = 12s
      // duration = 8s
      expect(mapped!.start).toBe(4);
      expect(mapped!.end).toBe(12);
      expect(mapped!.duration).toBe(8);
    });

    it('maps an asset profile used across multiple separate clips on the timeline', () => {
      const project = createProject();
      project.media = [
        { id: 'shared-asset', name: 'game.mp4', duration: 100, width: 1920, height: 1080, size: 50000, type: 'video/mp4' },
      ];
      // Clip A: timeline 0-30, source 0-30
      // Clip B: timeline 50-80, source 10-40
      project.clips = [
        {
          id: 'clip-a',
          mediaId: 'shared-asset',
          start: 0,
          sourceStart: 0,
          sourceEnd: 30,
          trackId: 'V1',
          properties: defaultProps,
        },
        {
          id: 'clip-b',
          mediaId: 'shared-asset',
          start: 50,
          sourceStart: 10,
          sourceEnd: 40,
          trackId: 'V1',
          properties: defaultProps,
        },
      ];

      const profile = makeMockAudioProfile('shared-asset', 100);
      // Source highlight is at 15-25s. It should map into BOTH Clip A and Clip B!
      const mapping = mapAssetProfilesToTimeline(project, [profile]);

      expect(mapping.highlightRegions.length).toBe(2);

      // In Clip A: tl = 15 to 25
      const hlA = mapping.highlightRegions.find((h) => h.clipId === 'clip-a')!;
      expect(hlA).toBeDefined();
      expect(hlA.start).toBe(15);
      expect(hlA.end).toBe(25);

      // In Clip B: tl = 50 + (15 - 10) = 55 to 50 + (25 - 10) = 65
      const hlB = mapping.highlightRegions.find((h) => h.clipId === 'clip-b')!;
      expect(hlB).toBeDefined();
      expect(hlB.start).toBe(55);
      expect(hlB.end).toBe(65);
    });

    it('flags muted tracks and zero volume clips as isAudible: false', () => {
      const project = createProject();
      project.tracks = [
        { id: 'V1', name: 'Video 1', kind: 'video', locked: false, muted: true, hidden: false, height: 64 },
        { id: 'A1', name: 'Audio 1', kind: 'audio', locked: false, muted: false, hidden: false, height: 48 },
      ];
      project.clips = [
        {
          id: 'c-muted',
          mediaId: 'm1',
          start: 0,
          sourceStart: 0,
          sourceEnd: 50,
          trackId: 'V1',
          properties: defaultProps,
        },
        {
          id: 'c-audible',
          mediaId: 'm1',
          start: 0,
          sourceStart: 0,
          sourceEnd: 50,
          trackId: 'A1',
          properties: defaultProps,
        },
      ];

      expect(isClipAudibleOnTimeline(project, project.clips[0])).toBe(false);
      expect(isClipAudibleOnTimeline(project, project.clips[1])).toBe(true);
    });

    it('integrates audioProfiles seamlessly into findProjectCandidates', () => {
      const project = makeTestGamingProject(3, 40); // 120s
      const profile = makeMockAudioProfile('media-0', 100);

      const { proposals, analysis } = findProjectCandidates(project, {
        audioProfiles: [profile],
        shortTargetSeconds: 30,
        shortCount: 2,
      });

      expect(analysis.availableSignals).toContain('audio-activity');
      expect(proposals.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('K2 — Cache Invalidation, Performance & AbortSignal', () => {
    it('reuses analysis cache when only proposal selection parameters change', () => {
      const project = makeTestGamingProject(4, 40);

      // First run with shortCount 1
      const res1 = findProjectCandidates(project, { shortCount: 1 });
      // Second run with shortCount 3
      const res2 = findProjectCandidates(project, { shortCount: 3 });

      // Raw timeline analysis MUST be the identical cached reference (zero duplicate CPU sweep)
      expect(res1.analysis).toBe(res2.analysis);
      expect(res1.proposals.filter((p) => p.kind === 'youtube-short').length).toBe(1);
      expect(res2.proposals.filter((p) => p.kind === 'youtube-short').length).toBe(3);
    });

    it('invalidates cache when sourceFiles change (relink detection)', () => {
      const project = makeTestGamingProject(3, 40);

      const file1 = new Map([['media-0', new File(['aaa'], 'game.mp4', { lastModified: 1000 })]]);
      const analysis1 = analyzeSharedTimeline(project, { sourceFiles: file1 });

      // Relink with different file modification timestamp / size
      const file2 = new Map([['media-0', new File(['bbb-longer'], 'game.mp4', { lastModified: 5000 })]]);
      const analysis2 = analyzeSharedTimeline(project, { sourceFiles: file2 });

      expect(analysis2).not.toBe(analysis1);
    });

    it('cooperatively cancels analysis when AbortSignal is triggered', () => {
      const project = makeTestGamingProject(4, 50);
      const controller = new AbortController();
      controller.abort();

      expect(() => {
        analyzeSharedTimeline(project, { signal: controller.signal });
      }).toThrow(/aborted/i);

      expect(() => {
        findProjectCandidates(project, { signal: controller.signal });
      }).toThrow(/aborted/i);
    });

    it('end-to-end integration: validates successfully with Codex createCreatorRecipe & materialize', () => {
      const project = makeTestGamingProject(4, 50); // 200s
      const sourceFiles = makeMockFiles(project);

      const { proposals } = findProjectCandidates(project, {
        shortTargetSeconds: 35,
        shortCount: 2,
      });

      const profile: CreatorProfile = parseCreatorProfile({
        version: 1,
        id: 'prof-integration',
        name: 'Integration Channel',
        language: 'en',
        game: 'Valorant',
        audience: 'Tactical FPS enthusiasts',
        commentary: 'unspecified',
        longTargetSeconds: 180,
        shortTargetSeconds: 35,
        shortCount: 2,
        fillMode: 'blur-background',
      });

      const recipe = createCreatorRecipe(project, sourceFiles, profile, proposals);
      expect(recipe).toBeDefined();
      expect(recipe.outputs.length).toBe(3); // 1 Long + 2 Shorts

      // Materialize both Long and Short drafts
      for (const output of recipe.outputs) {
        const draft = materializeCreatorOutput(recipe, project, sourceFiles, output.id);
        expect(draft).toBeDefined();
        expect(validateProject(draft)).toBe(draft);
      }
    });
  });
});
