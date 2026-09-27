import { describe, it, expect } from 'vitest';
import {
  createProject,
  addMedia,
  removeMedia,
  insertMediaClip,
  updateMediaAsset,
  validateProject,
  type MediaAsset,
} from './model';
import { captionAppearance } from './caption-style';
import { CAPTION_PALETTES, CAPTION_ANIMATIONS } from './CaptionAppearance';

describe('Video Editor Quality & Feature Control', () => {
  const sampleVideo: MediaAsset = {
    id: 'asset-video-1',
    name: 'frost_cinematic.mp4',
    duration: 12.5,
    width: 1920,
    height: 1080,
    size: 15 * 1024 * 1024,
    type: 'video/mp4',
  };

  const sampleAudio: MediaAsset = {
    id: 'asset-audio-1',
    name: 'nordic_wind.mp3',
    duration: 30,
    width: 1920,
    height: 1080,
    size: 2 * 1024 * 1024,
    type: 'audio/mp3',
  };

  it('safely deletes media assets and cascades removal to timeline clips and transcripts', () => {
    let p = createProject('Arctic Tale');
    p = addMedia(p, sampleVideo);
    p = addMedia(p, sampleAudio);

    expect(p.media).toHaveLength(2);
    expect(p.clips).toHaveLength(2);

    // Add a transcript for video
    p.transcripts.push({
      mediaId: sampleVideo.id,
      language: 'English',
      source: 'imported',
      words: [{ id: 'w1', text: 'Cold', start: 0, end: 1, speakerId: 'speaker-1' }],
    });

    // Delete the video asset
    p = removeMedia(p, sampleVideo.id);

    expect(p.media.map((m) => m.id)).toEqual([sampleAudio.id]);
    expect(p.clips.every((c) => c.mediaId !== sampleVideo.id)).toBe(true);
    expect(p.transcripts.every((t) => t.mediaId !== sampleVideo.id)).toBe(true);
    expect(() => validateProject(p)).not.toThrow();
  });

  it('inserts media clips at desired timeline positions', () => {
    let p = createProject();
    p = addMedia(p, sampleVideo);
    expect(p.clips).toHaveLength(1);

    // Insert duplicate instance at playhead 5s
    p = insertMediaClip(p, sampleVideo.id, 5.0);
    expect(p.clips).toHaveLength(2);
    expect(p.clips[1].start).toBe(5.0);
    expect(p.clips[1].mediaId).toBe(sampleVideo.id);
    expect(() => validateProject(p)).not.toThrow();
  });

  it('supports media folders and favorite stars', () => {
    let p = createProject();
    p = addMedia(p, sampleVideo);

    // Tag into folder and star
    p = updateMediaAsset(p, sampleVideo.id, { folder: 'B-Roll Footage', starred: true });
    expect(p.media[0].folder).toBe('B-Roll Footage');
    expect(p.media[0].starred).toBe(true);
    expect(() => validateProject(p)).not.toThrow();

    // Clear folder
    p = updateMediaAsset(p, sampleVideo.id, { folder: undefined, starred: false });
    expect(p.media[0].folder).toBeUndefined();
    expect(p.media[0].starred).toBe(false);
    expect(() => validateProject(p)).not.toThrow();
  });

  it('provides customizable subtitle background box properties', () => {
    const p = createProject();
    p.captions.appearance = {
      ...captionAppearance(p.captions),
      boxColor: '#0a141e',
      boxOpacity: 0.75,
      boxRadius: 12,
      boxPadding: 8,
      animation: 'glow',
      shadow: true,
    };

    const validated = validateProject(p);
    expect(validated.captions.appearance?.boxColor).toBe('#0a141e');
    expect(validated.captions.appearance?.boxOpacity).toBe(0.75);
    expect(validated.captions.appearance?.boxRadius).toBe(12);
    expect(validated.captions.appearance?.boxPadding).toBe(8);
    expect(validated.captions.appearance?.animation).toBe('glow');
    expect(validated.captions.appearance?.shadow).toBe(true);

    // Invalid opacity should fail validation
    const invalid = structuredClone(p);
    invalid.captions.appearance!.boxOpacity = 1.5;
    expect(() => validateProject(invalid)).toThrow();

    // Invalid animation should fail validation
    const invalidAnim = structuredClone(p);
    (invalidAnim.captions.appearance as any).animation = 'explosive-rainbow';
    expect(() => validateProject(invalidAnim)).toThrow();
  });

  it('includes 1-click aesthetic viral subtitle palettes', () => {
    expect(CAPTION_PALETTES.length).toBeGreaterThanOrEqual(5);
    const glacier = CAPTION_PALETTES.find((pal) => pal.id === 'frost-glacier');
    expect(glacier).toBeDefined();
    expect(glacier?.accent).toBe('#38bdf8');
    expect(glacier?.animation).toBe('glow');

    const tiktok = CAPTION_PALETTES.find((pal) => pal.id === 'tiktok-viral');
    expect(tiktok).toBeDefined();
    expect(tiktok?.accent).toBe('#facc15');
    expect(tiktok?.animation).toBe('pop');

    // All palettes should produce valid appearances
    for (const pal of CAPTION_PALETTES) {
      const p = createProject();
      p.captions.appearance = {
        ...captionAppearance(p.captions),
        color: pal.color,
        accent: pal.accent,
        outlineColor: pal.outlineColor,
        outline: pal.outline,
        boxColor: pal.boxColor,
        boxOpacity: pal.boxOpacity,
        animation: pal.animation,
      };
      expect(() => validateProject(p)).not.toThrow();
    }
  });

  it('defines TikTok & Reels animation types (pop, bounce, glow, typewriter, karaoke)', () => {
    const ids = CAPTION_ANIMATIONS.map((a) => a.id);
    expect(ids).toContain('pop');
    expect(ids).toContain('bounce');
    expect(ids).toContain('glow');
    expect(ids).toContain('typewriter');
    expect(ids).toContain('karaoke');
    expect(ids).toContain('none');
  });
});
