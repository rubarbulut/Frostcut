import { describe, it, expect } from 'vitest';
import {
  createProject,
  addMedia,
  removeMedia,
  insertMediaClip,
  updateMediaAsset,
  validateProject,
  changeAspectRatio,
  type MediaAsset,
} from './model';
import { captionAppearance } from './caption-style';
import { CAPTION_PALETTES, CAPTION_ANIMATIONS } from './CaptionAppearance';
import { viralPhrases, keywordPattern, generateShortTitle, highlightRanges } from './highlights';
import { SPEED_RAMP_PRESETS } from './SpeedRampingControls';

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

  it('customizes subtitle typography and font styles', () => {
    const fonts: ('sans' | 'impact' | 'serif' | 'mono')[] = ['sans', 'impact', 'serif', 'mono'];
    for (const font of fonts) {
      const p = createProject();
      p.captions.appearance = {
        ...captionAppearance(p.captions),
        fontFamily: font,
      };
      const validated = validateProject(p);
      expect(validated.captions.appearance?.fontFamily).toBe(font);
    }

    // Invalid font should fail validation
    const invalid = createProject();
    (invalid.captions as any).appearance = {
      ...captionAppearance(invalid.captions),
      fontFamily: 'Comic-Sans-Pro-Ultra',
    };
    expect(() => validateProject(invalid)).toThrow();
  });

  it('detects Turkish & English viral hooks and generates clean short titles', () => {
    // Turkish viral phrases
    const turkishPhrase = 'Bunu biliyor muydunuz? Bugün sizlere harika bir taktik anlatacağım.';
    expect(viralPhrases.some((p) => p.test(turkishPhrase))).toBe(true);

    const titleQuestion = generateShortTitle('Bunu biliyor muydunuz?', 'question');
    expect(titleQuestion).toBe('❓ "Bunu biliyor muydunuz?"');

    const titleMistake = generateShortTitle('Yapılan en büyük hata nedir?', 'mistake');
    expect(titleMistake).toBe('⚠️ "Yapılan en büyük hata nedir?"');

    const titleSecret = generateShortTitle('İşte videonuzu viral yapacak sırrı', 'secret');
    expect(titleSecret).toBe('💡 "İşte videonuzu viral yapacak sırrı"');

    // Unicode word boundary test on Turkish keywords
    expect(keywordPattern.test('önemli')).toBe(true);
    expect(keywordPattern.test('püf noktası')).toBe(true);
    expect(keywordPattern.test('taktik')).toBe(true);
  });

  it('prevents sentence fragmentation at commas and avoids hanging conjunctions', () => {
    let p = createProject('Turkish Speech');
    p = addMedia(p, {
      id: 'm-speech',
      name: 'speech.mp4',
      duration: 60,
      width: 1920,
      height: 1080,
      size: 5000,
      type: 'video/mp4',
    });

    // Create 3 sentences:
    // 1: Hook with comma (should NOT break at comma)
    // 2: Middle explanation ending with complete period
    // 3: Hanging clause ending with "çünkü"
    const sentence1 = 'Bunu biliyor muydunuz, aslında herkes bu konuda çok büyük bir hata yapıyor.';
    const sentence2 = 'Bu taktik ile izlenmelerinizi tam üç katına çıkarabilirsiniz.';
    const sentence3 = 'Ve bu yöntemi mutlaka denemelisiniz çünkü';

    const words1 = sentence1.split(' ').map((text, i) => ({
      id: `w1-${i}`,
      text,
      start: i * 0.4,
      end: i * 0.4 + 0.35,
      speakerId: 'speaker-1',
    }));

    const offset2 = words1.at(-1)!.end + 0.5;
    const words2 = sentence2.split(' ').map((text, i) => ({
      id: `w2-${i}`,
      text,
      start: offset2 + i * 0.4,
      end: offset2 + i * 0.4 + 0.35,
      speakerId: 'speaker-1',
    }));

    const offset3 = words2.at(-1)!.end + 0.5;
    const words3 = sentence3.split(' ').map((text, i) => ({
      id: `w3-${i}`,
      text,
      start: offset3 + i * 0.4,
      end: offset3 + i * 0.4 + 0.35,
      speakerId: 'speaker-1',
    }));

    p.transcripts = [
      {
        mediaId: 'm-speech',
        language: 'Turkish',
        source: 'local',
        words: [...words1, ...words2, ...words3],
      },
    ];

    const clips = highlightRanges(p, {
      goal: 'Short-form clips',
      count: 1,
      length: 14,
      pacing: 'Natural',
      reorder: false,
      composite: false,
      sensitivity: 50,
    });

    expect(clips.length).toBeGreaterThan(0);
    const bestClip = clips[0];

    // High viral potential score
    expect(bestClip.score).toBeGreaterThanOrEqual(80);
    expect(bestClip.reason).toContain('Viral Potential');

    // Title includes hook icon
    expect(bestClip.text).toMatch(/^[❓🔥💡⚠️🎬]/);

    // Outro should not end on "çünkü"
    expect(bestClip.text).not.toContain('çünkü');
  });

  it('switches aspect ratio dynamically with proper dimensions and validation', () => {
    let p = createProject('Aspect Ratio Test');

    // 16:9 Landscape
    p = changeAspectRatio(p, '16:9');
    expect(p.settings.width).toBe(1920);
    expect(p.settings.height).toBe(1080);
    expect(p.settings.aspectRatio).toBe('16:9');
    expect(p.settings.preset).toBe('YouTube');
    expect(p.exportSettings.width).toBe(1920);
    expect(p.exportSettings.height).toBe(1080);
    expect(() => validateProject(p)).not.toThrow();

    // 9:16 Portrait
    p = changeAspectRatio(p, '9:16');
    expect(p.settings.width).toBe(1080);
    expect(p.settings.height).toBe(1920);
    expect(p.settings.aspectRatio).toBe('9:16');
    expect(p.settings.preset).toBe('YouTube Shorts');
    expect(() => validateProject(p)).not.toThrow();

    // 1:1 Square
    p = changeAspectRatio(p, '1:1');
    expect(p.settings.width).toBe(1080);
    expect(p.settings.height).toBe(1080);
    expect(p.settings.aspectRatio).toBe('1:1');
    expect(() => validateProject(p)).not.toThrow();

    // 4:5 Social Portrait
    p = changeAspectRatio(p, '4:5');
    expect(p.settings.width).toBe(1080);
    expect(p.settings.height).toBe(1350);
    expect(p.settings.aspectRatio).toBe('4:5');
    expect(() => validateProject(p)).not.toThrow();
  });

  it('defines speed ramping presets with dynamic velocity curves', () => {
    expect(SPEED_RAMP_PRESETS.length).toBeGreaterThanOrEqual(4);

    const ids = SPEED_RAMP_PRESETS.map((p: any) => p.id);
    expect(ids).toContain('steady');
    expect(ids).toContain('hero');
    expect(ids).toContain('bullet');
    expect(ids).toContain('flash');

    for (const preset of SPEED_RAMP_PRESETS) {
      expect(preset.name).toBeDefined();
      expect(preset.svgPath).toContain('M');
      expect(preset.speed).toBeGreaterThan(0);
    }
  });
});


