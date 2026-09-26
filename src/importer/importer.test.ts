import { describe, it, expect } from 'vitest';
import {
  extractYouTubeId,
  getYouTubeThumbnail,
  isValidMediaUrl,
  resolveRemoteMedia,
} from './youtube-resolver';
import { isAudioOnlyFile } from './audio-inspector';

describe('Media & YouTube Importer', () => {
  describe('extractYouTubeId', () => {
    it('extracts ID from standard watch URL', () => {
      expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeId('https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('dQw4w9WgXcQ');
    });

    it('extracts ID from short youtu.be URL', () => {
      expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeId('http://youtu.be/dQw4w9WgXcQ?si=abc123xyz')).toBe('dQw4w9WgXcQ');
    });

    it('extracts ID from YouTube Shorts URL', () => {
      expect(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('extracts ID from embed and music URLs', () => {
      expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeId('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('handles direct 11-char ID', () => {
      expect(extractYouTubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('returns null for non-YouTube strings', () => {
      expect(extractYouTubeId('https://google.com')).toBeNull();
      expect(extractYouTubeId('not-a-valid-id')).toBeNull();
      expect(extractYouTubeId('')).toBeNull();
    });
  });

  describe('getYouTubeThumbnail', () => {
    it('constructs standard high quality thumbnail link', () => {
      expect(getYouTubeThumbnail('dQw4w9WgXcQ')).toBe(
        'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      );
    });
  });

  describe('isValidMediaUrl', () => {
    it('recognizes YouTube URLs', () => {
      expect(isValidMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
      expect(isValidMediaUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
      expect(isValidMediaUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(true);
    });

    it('recognizes direct MP4 and MP3 URLs', () => {
      expect(isValidMediaUrl('https://cdn.example.com/videos/sample.mp4')).toBe(true);
      expect(isValidMediaUrl('https://cdn.example.com/audio/podcast.mp3')).toBe(true);
      expect(isValidMediaUrl('https://cdn.example.com/soundtrack.wav')).toBe(true);
    });

    it('rejects invalid or generic non-media URLs', () => {
      expect(isValidMediaUrl('https://example.com/article.html')).toBe(false);
      expect(isValidMediaUrl('random string')).toBe(false);
      expect(isValidMediaUrl('')).toBe(false);
    });
  });

  describe('resolveRemoteMedia', () => {
    it('resolves YouTube video metadata with formats', async () => {
      const meta = await resolveRemoteMedia('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(meta.source).toBe('youtube');
      expect(meta.id).toBe('dQw4w9WgXcQ');
      expect(meta.thumbnailUrl).toContain('dQw4w9WgXcQ');
      expect(meta.availableFormats.length).toBeGreaterThanOrEqual(2);

      const hasVideo = meta.availableFormats.some((f) => f.type === 'video');
      const hasAudio = meta.availableFormats.some((f) => f.type === 'audio');
      expect(hasVideo).toBe(true);
      expect(hasAudio).toBe(true);
    });

    it('resolves direct MP3 URL metadata', async () => {
      const meta = await resolveRemoteMedia('https://cdn.example.com/music/winter-theme.mp3');
      expect(meta.source).toBe('direct');
      expect(meta.title).toBe('winter-theme.mp3');
      expect(meta.availableFormats[0].type).toBe('audio');
      expect(meta.availableFormats[0].ext).toBe('mp3');
    });

    it('throws error for invalid media URL', async () => {
      await expect(resolveRemoteMedia('invalid-url')).rejects.toThrow();
    });
  });

  describe('isAudioOnlyFile', () => {
    it('identifies MP3, WAV, AAC, M4A as audio files', () => {
      const mp3 = new File(['dummy'], 'song.mp3', { type: 'audio/mpeg' });
      const wav = new File(['dummy'], 'sfx.wav', { type: 'audio/wav' });
      const m4a = new File(['dummy'], 'voice.m4a', { type: 'audio/mp4' });
      expect(isAudioOnlyFile(mp3)).toBe(true);
      expect(isAudioOnlyFile(wav)).toBe(true);
      expect(isAudioOnlyFile(m4a)).toBe(true);
    });

    it('does not identify MP4 or WebM video as audio only', () => {
      const mp4 = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' });
      const webm = new File(['dummy'], 'clip.webm', { type: 'video/webm' });
      expect(isAudioOnlyFile(mp4)).toBe(false);
      expect(isAudioOnlyFile(webm)).toBe(false);
    });
  });
});
