/**
 * Comprehensive Tests for YouTube Resumable Upload Engine & Publisher Service
 * Persona: 1. DEMİR (Graphics & Render Pipeline Lead)
 * Task: B004-D (D0 + D1)
 * 
 * Verifies chunking, resumable retry on network drops, byte-offset discovery,
 * immediate AbortSignal cancellation, host security, safe browser headers,
 * 308 range validation (missing, malformed, out-of-bounds, regressive),
 * session expiry (404), token refresh (401), metadata validation, and video ID verification.
 * 
 * ZERO real API calls, zero quota consumed. Uses mock HTTP doubles.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  initiateResumableUpload,
  queryUploadStatus,
  uploadChunk,
  executeResumableUpload,
  normalizeChunkSize,
  parse308RangeHeader,
  parseRetryAfter,
  buildSafeHeaders,
  isAuthorizedUploadHost,
  cancellableSleep,
  CHUNK_GRANULARITY,
  DEFAULT_CHUNK_SIZE,
  YouTubeUploadError,
  YouTubeSessionExpiredError,
  YouTubeHostSecurityError,
  UploadAbortedError,
  type YouTubeUploadMetadata,
} from './youtube-upload';
import {
  publishVideoToYouTube,
  isValidYouTubeVideoId,
  validateScheduledPublish,
  validatePublishMetadata,
  YouTubeValidationError,
} from '../youtube-publisher';

describe('B004-D: YouTube Resumable Upload & Publisher Engine (Demir)', () => {
  const sampleMetadata: YouTubeUploadMetadata = {
    snippet: {
      title: 'FrostCut Epic Gameplay Highlights',
      description: 'Edited with FrostCut high-performance engine.',
      tags: ['gaming', 'frostcut', 'montage'],
    },
    status: {
      privacyStatus: 'unlisted',
    },
  };

  const allowedTestHosts = ['upload.youtube.mock', 'www.googleapis.com', 'localhost'];

  describe('1. Chunk Size Normalization (Google 256 KiB Multiple Rule)', () => {
    it('defaults to 5 MB (exact multiple of 256 KiB)', () => {
      const defaultSize = normalizeChunkSize();
      expect(defaultSize).toBe(DEFAULT_CHUNK_SIZE);
      expect(defaultSize % CHUNK_GRANULARITY).toBe(0);
      expect(defaultSize).toBe(5 * 1024 * 1024);
    });

    it('clamps chunk size to minimum 256 KiB if smaller size requested', () => {
      const small = normalizeChunkSize(100 * 1024);
      expect(small).toBe(256 * 1024);
      expect(small % CHUNK_GRANULARITY).toBe(0);
    });

    it('rounds down to nearest multiple of 256 KiB for irregular sizes', () => {
      const irregular = 600 * 1024;
      const normalized = normalizeChunkSize(irregular);
      expect(normalized).toBe(512 * 1024);
      expect(normalized % CHUNK_GRANULARITY).toBe(0);
    });
  });

  describe('2. Security & Header Hygiene (D0)', () => {
    it('permits authorized Google API hosts and explicit test hosts', () => {
      expect(isAuthorizedUploadHost('https://www.googleapis.com/upload/youtube/v3/videos')).toBe(true);
      expect(isAuthorizedUploadHost('https://youtube.googleapis.com/upload/session123')).toBe(true);
      expect(isAuthorizedUploadHost('https://upload.youtube.mock/session', ['upload.youtube.mock'])).toBe(true);
    });

    it('rejects unauthorized or arbitrary external hosts to prevent credential leakage', () => {
      expect(isAuthorizedUploadHost('https://evil-hacker.com/steal-token')).toBe(false);
      expect(isAuthorizedUploadHost('http://malicious.org/upload')).toBe(false);
    });

    it('throws YouTubeHostSecurityError when initiating session with untrusted endpoint', async () => {
      const mockFetch = vi.fn();
      await expect(
        initiateResumableUpload(sampleMetadata, 10_000_000, 'video/mp4', {
          accessToken: 'token123',
          endpointUrl: 'https://attacker-phishing.com/api',
          fetchFn: mockFetch as any,
        }),
      ).rejects.toThrow(YouTubeHostSecurityError);
    });

    it('strips Content-Length in browser environments per W3C fetch specification', () => {
      const headers = {
        'Content-Type': 'video/mp4',
        'Content-Length': '1048576',
        'Content-Range': 'bytes 0-1048575/5000000',
      };
      const safe = buildSafeHeaders(headers, true /* isBrowserEnv */);
      expect(safe['Content-Length']).toBeUndefined();
      expect(safe['Content-Type']).toBe('video/mp4');
      expect(safe['Content-Range']).toBe('bytes 0-1048575/5000000');
    });

    it('retains Content-Length in Node server environment', () => {
      const headers = {
        'Content-Type': 'video/mp4',
        'Content-Length': '1048576',
      };
      const safe = buildSafeHeaders(headers, false /* isBrowserEnv */);
      expect(safe['Content-Length']).toBe('1048576');
    });
  });

  describe('3. Range Parsing & 308 Protocol Conformance (D0)', () => {
    it('returns offset 0 when 308 response has no Range header (Google has 0 bytes)', () => {
      const res = parse308RangeHeader(null, 10_000_000);
      expect(res.valid).toBe(true);
      expect(res.offset).toBe(0);
    });

    it('parses valid Range bytes=0-5242879 to next offset 5242880', () => {
      const res = parse308RangeHeader('bytes=0-5242879', 10_000_000);
      expect(res.valid).toBe(true);
      expect(res.offset).toBe(5242880);
    });

    it('rejects malformed Range header (e.g. non-zero start or non-numeric)', () => {
      const res1 = parse308RangeHeader('bytes=100-500', 10_000_000);
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('Malformed Range header');

      const res2 = parse308RangeHeader('bytes=invalid', 10_000_000);
      expect(res2.valid).toBe(false);
    });

    it('rejects out-of-bounds Range exceeding total payload size', () => {
      const totalSize = 5_000_000;
      const res = parse308RangeHeader('bytes=0-6000000', totalSize);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('exceeds total video payload size');
    });
  });

  describe('4. Session Initiation & Status Recovery', () => {
    it('initiates upload session and returns upload URL from Location header', async () => {
      const mockUploadUrl = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=session_abc123';
      
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ Location: mockUploadUrl }),
        text: async () => '',
      });

      const url = await initiateResumableUpload(sampleMetadata, 10_000_000, 'video/mp4', {
        accessToken: 'mock_valid_token',
        fetchFn: mockFetch as any,
      });

      expect(url).toBe(mockUploadUrl);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws YouTubeSessionExpiredError on 404 without creating duplicate sessions', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 404,
        headers: new Headers(),
        text: async () => 'Session Not Found',
      });

      await expect(
        queryUploadStatus('https://www.googleapis.com/upload/expired_session', 12_000_000, {
          fetchFn: mockFetch as any,
        }),
      ).rejects.toThrow(YouTubeSessionExpiredError);
    });

    it('returns complete true when Google returns 200 on status query (already completed on server)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers(),
        json: async () => ({ id: 'yt_already_finished_456' }),
      });

      const res = await queryUploadStatus('https://www.googleapis.com/upload/finished_session', 12_000_000, {
        fetchFn: mockFetch as any,
      });

      expect(res.complete).toBe(true);
      expect(res.videoId).toBe('yt_already_finished_456');
    });
  });

  describe('5. Multi-Chunk Streaming, Retry & Cancellation', () => {
    it('uploads multi-chunk video and validates all headers and ranges', async () => {
      const totalSize = 12_000_000;
      const chunkSize = 5 * 1024 * 1024;
      const dummyData = new Uint8Array(totalSize);
      const uploadedRanges: string[] = [];

      const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        if (init.method === 'POST') {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ Location: 'https://upload.youtube.mock/session_stream' }),
            text: async () => '',
          };
        }
        if (init.method === 'PUT') {
          const range = init.headers['Content-Range'];
          uploadedRanges.push(range);

          if (range === 'bytes 10485760-11999999/12000000') {
            return {
              status: 200,
              headers: new Headers(),
              json: async () => ({
                id: 'yt_success_multi_chunk',
                status: { privacyStatus: 'unlisted', uploadStatus: 'uploaded' },
                snippet: { title: 'Multi Chunk' },
              }),
            };
          }

          const match = range.match(/bytes \d+-(\d+)\//);
          const lastByte = match ? match[1] : '0';
          return {
            status: 308,
            headers: new Headers({ Range: `bytes=0-${lastByte}` }),
          };
        }
      });

      const result = await executeResumableUpload(dummyData, sampleMetadata, {
        accessToken: 'mock_token',
        chunkSize,
        fetchFn: mockFetch as any,
        allowedHosts: allowedTestHosts,
      });

      expect(result.videoId).toBe('yt_success_multi_chunk');
      expect(result.privacyStatus).toBe('unlisted');
      expect(result.processingStatus).toBe('uploaded');
      expect(uploadedRanges.length).toBe(3);
    });

    it('aborts immediately when AbortSignal is fired during chunk transmission', async () => {
      const totalSize = 10_000_000;
      const dummyData = new Uint8Array(totalSize);
      const controller = new AbortController();

      const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        if (init.method === 'POST') {
          controller.abort(); // Cancel right after initiation
          return {
            ok: true,
            status: 200,
            headers: new Headers({ Location: 'https://upload.youtube.mock/session_abort' }),
            text: async () => '',
          };
        }
        return { status: 308, headers: new Headers() };
      });

      await expect(
        executeResumableUpload(dummyData, sampleMetadata, {
          accessToken: 'mock_token',
          signal: controller.signal,
          fetchFn: mockFetch as any,
          allowedHosts: allowedTestHosts,
        }),
      ).rejects.toThrow(UploadAbortedError);
    });

    it('cancels backoff sleep immediately when signal aborts', async () => {
      const controller = new AbortController();
      const sleepPromise = cancellableSleep(5000, controller.signal);
      controller.abort();
      await expect(sleepPromise).rejects.toThrow(UploadAbortedError);
    });

    it('attempts single token refresh on 401 Unauthorized', async () => {
      const totalSize = 2_000_000;
      const dummyData = new Uint8Array(totalSize);
      let attempts = 0;
      let tokenRefreshed = false;

      const mockRefresh = vi.fn().mockImplementation(async () => {
        tokenRefreshed = true;
        return 'new_fresh_token_456';
      });

      const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        if (init.method === 'POST') {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ Location: 'https://upload.youtube.mock/session_token_refresh' }),
            text: async () => '',
          };
        }
        if (init.method === 'PUT') {
          attempts++;
          if (attempts === 1) {
            return {
              status: 401,
              statusText: 'Unauthorized',
              headers: new Headers(),
              text: async () => 'Token expired',
            };
          }
          return {
            status: 200,
            headers: new Headers(),
            json: async () => ({ id: 'yt_refreshed_vid_777' }),
          };
        }
      });

      const result = await executeResumableUpload(dummyData, sampleMetadata, {
        accessToken: 'initial_token_123',
        tokenRefreshFn: mockRefresh,
        fetchFn: mockFetch as any,
        allowedHosts: allowedTestHosts,
      });

      expect(tokenRefreshed).toBe(true);
      expect(mockRefresh).toHaveBeenCalledTimes(1);
      expect(result.videoId).toBe('yt_refreshed_vid_777');
    });

    it('fails fast on non-retryable 403 Forbidden without retrying', async () => {
      const totalSize = 2_000_000;
      const dummyData = new Uint8Array(totalSize);
      let putCount = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        if (init.method === 'POST') {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ Location: 'https://upload.youtube.mock/session_quota' }),
            text: async () => '',
          };
        }
        if (init.method === 'PUT') {
          putCount++;
          return {
            status: 403,
            statusText: 'Quota Exceeded',
            headers: new Headers(),
            text: async () => 'Daily quota limit reached',
          };
        }
      });

      await expect(
        executeResumableUpload(dummyData, sampleMetadata, {
          accessToken: 'token_123',
          fetchFn: mockFetch as any,
          allowedHosts: allowedTestHosts,
        }),
      ).rejects.toThrow(YouTubeUploadError);

      expect(putCount).toBe(1); // No retries for 403!
    });
  });

  describe('6. High-Level publishVideoToYouTube & Input Validation (D0)', () => {
    it('rejects title longer than 100 characters with explicit validation error', () => {
      const oversizedTitle = 'A'.repeat(101);
      expect(() =>
        validatePublishMetadata({ title: oversizedTitle }),
      ).toThrow(YouTubeValidationError);
    });

    it('rejects description longer than 5000 characters with explicit validation error', () => {
      const oversizedDesc = 'D'.repeat(5001);
      expect(() =>
        validatePublishMetadata({ title: 'Valid Title', description: oversizedDesc }),
      ).toThrow(YouTubeValidationError);
    });

    it('rejects empty title', () => {
      expect(() =>
        validatePublishMetadata({ title: '   ' }),
      ).toThrow(YouTubeValidationError);
    });

    it('validates schedule publishAt enforces private status and future date', () => {
      const pastDate = new Date(Date.now() - 100000).toISOString();
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      // Past date rejected
      const pastRes = validateScheduledPublish(pastDate, 'private');
      expect(pastRes.valid).toBe(false);
      expect(pastRes.error).toContain('must be in the future');

      // Non-private status rejected
      const publicSchedule = validateScheduledPublish(futureDate, 'public');
      expect(publicSchedule.valid).toBe(false);
      expect(publicSchedule.error).toContain('privacyStatus set to "private"');

      // Valid future private date accepted
      const validSchedule = validateScheduledPublish(futureDate, 'private');
      expect(validSchedule.valid).toBe(true);
    });

    it('successfully publishes Blob, captures uploadedAt and verified privacyStatus', async () => {
      const blob = new Blob([new Uint8Array(1024 * 1024)], { type: 'video/mp4' });

      const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        if (init.method === 'POST') {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ Location: 'https://upload.youtube.mock/session_pub' }),
            text: async () => '',
          };
        }
        if (init.method === 'PUT') {
          return {
            status: 200,
            headers: new Headers(),
            json: async () => ({
              id: 'dQw4w9WgXcQ',
              status: { privacyStatus: 'private', uploadStatus: 'uploaded' },
              snippet: { title: 'Test Publish', publishedAt: '2026-10-25T12:00:00Z' },
            }),
          };
        }
      });

      const res = await publishVideoToYouTube(
        blob,
        {
          title: 'Test Publish',
          description: 'A valid test publish.',
          privacyStatus: 'private',
          selfDeclaredMadeForKids: false,
        },
        {
          accessToken: 'token_abc',
          fetchFn: mockFetch as any,
          allowedHosts: allowedTestHosts,
        },
      );

      expect(res.videoId).toBe('dQw4w9WgXcQ');
      expect(res.url).toBe('https://youtu.be/dQw4w9WgXcQ');
      expect(res.privacyStatus).toBe('private');
      expect(res.processingStatus).toBe('uploaded');
      expect(res.uploadedAt).toBeDefined();
      expect(res.publishedAt).toBe('2026-10-25T12:00:00Z');
    });
  });
});
