/**
 * Tests for YouTube OAuth2 Manager & Publish Plugin (D2)
 * Persona: 1. DEMİR (Graphics & Render Pipeline Lead)
 * Task: B004-D (D2)
 * 
 * Verifies honest capability statuses (not-configured, disconnected, connected, expired),
 * single-use CSRF state tokens, code exchange, token refresh, and endpoint security.
 * 
 * ZERO real OAuth requests, zero credentials leaked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { YouTubeOAuthManager, YOUTUBE_UPLOAD_SCOPE } from './youtube-oauth';
import { createYouTubePublishHandler } from './youtube-publish-plugin';

describe('B004-D: YouTube OAuth Manager & Publish Plugin (Demir)', () => {
  let oauth: YouTubeOAuthManager;

  beforeEach(() => {
    oauth = new YouTubeOAuthManager({
      clientId: 'mock_client_id.apps.googleusercontent.com',
      clientSecret: 'mock_client_secret_xyz',
      redirectUri: 'http://localhost:5173/api/youtube/callback',
    });
  });

  describe('1. Capability Status & Honest Reporting', () => {
    it('reports not-configured when client ID or secret is missing', () => {
      const emptyOauth = new YouTubeOAuthManager({ clientId: '', clientSecret: '' });
      const capability = emptyOauth.getCapability();
      expect(capability.status).toBe('not-configured');
      expect(capability.configured).toBe(false);
      expect(capability.connected).toBe(false);
    });

    it('reports disconnected when configured but not authorized', () => {
      const capability = oauth.getCapability();
      expect(capability.status).toBe('disconnected');
      expect(capability.configured).toBe(true);
      expect(capability.connected).toBe(false);
    });

    it('reports connected when active valid token is stored', () => {
      oauth.setSessionToken({
        accessToken: 'valid_access_token_123',
        expiresAt: Date.now() + 3600 * 1000,
        scope: YOUTUBE_UPLOAD_SCOPE,
      });

      const capability = oauth.getCapability();
      expect(capability.status).toBe('connected');
      expect(capability.connected).toBe(true);
    });

    it('reports expired when stored token has passed its expiration time', () => {
      oauth.setSessionToken({
        accessToken: 'expired_token',
        expiresAt: Date.now() - 5000, // 5 seconds ago
        refreshToken: 'valid_refresh_token',
      });

      const capability = oauth.getCapability();
      expect(capability.status).toBe('expired');
      expect(capability.connected).toBe(false);
    });
  });

  describe('2. State Token & CSRF Protection', () => {
    it('generates authorization URL containing single-use state and scope', () => {
      const { url, state } = oauth.generateAuthUrl();
      expect(url).toContain('accounts.google.com');
      expect(url).toContain(`state=${state}`);
      expect(url).toContain('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.upload');
      expect(state.length).toBeGreaterThanOrEqual(32);
    });

    it('rejects callback with invalid or mismatched state parameter', async () => {
      oauth.generateAuthUrl('valid_state_123');

      await expect(
        oauth.handleCallback('mock_code_123', 'wrong_state_456'),
      ).rejects.toThrow(/Invalid or expired OAuth state parameter/);
    });

    it('enforces single-use state: reusing same state fails on second attempt', async () => {
      const { state } = oauth.generateAuthUrl();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'fresh_token_1',
          expires_in: 3600,
        }),
      });

      // First use succeeds
      const first = await oauth.handleCallback('code_1', state, { fetchFn: mockFetch as any });
      expect(first.success).toBe(true);

      // Re-using the same state parameter fails
      await expect(
        oauth.handleCallback('code_2', state, { fetchFn: mockFetch as any }),
      ).rejects.toThrow(/Invalid or expired OAuth state parameter/);
    });
  });

  describe('3. Token Exchange & Auto-Refresh', () => {
    it('exchanges code for tokens and updates capability to connected', async () => {
      const { state } = oauth.generateAuthUrl();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'google_access_token_xyz',
          refresh_token: 'google_refresh_token_abc',
          expires_in: 1800,
        }),
      });

      await oauth.handleCallback('auth_code_99', state, { fetchFn: mockFetch as any });

      const capability = oauth.getCapability();
      expect(capability.status).toBe('connected');

      const token = await oauth.getValidAccessToken();
      expect(token).toBe('google_access_token_xyz');
    });

    it('automatically refreshes token when expired using refresh_token', async () => {
      oauth.setSessionToken({
        accessToken: 'old_expired_token',
        refreshToken: 'valid_refresh_token_99',
        expiresAt: Date.now() - 10000,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'refreshed_access_token_new',
          expires_in: 3600,
        }),
      });

      const token = await oauth.getValidAccessToken({ fetchFn: mockFetch as any });
      expect(token).toBe('refreshed_access_token_new');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [calledUrl, calledOpts] = mockFetch.mock.calls[0];
      expect(calledOpts.body).toContain('grant_type=refresh_token');
      expect(calledOpts.body).toContain('refresh_token=valid_refresh_token_99');
    });

    it('clears session on disconnect', () => {
      oauth.setSessionToken({
        accessToken: 'active_token',
        expiresAt: Date.now() + 3600000,
      });
      expect(oauth.getCapability().connected).toBe(true);

      oauth.disconnect();
      expect(oauth.getCapability().status).toBe('disconnected');
    });
  });

  describe('4. Vite Publish Middleware Handler Security', () => {
    it('serves capability status endpoint', async () => {
      const handler = createYouTubePublishHandler({ oauthManager: oauth });
      const req: any = { url: '/api/youtube/capability', headers: { host: 'localhost:5173' } };
      let resData = '';
      const res: any = {
        statusCode: 0,
        setHeader: vi.fn(),
        end: (data: string) => {
          resData = data;
        },
      };

      await handler(req, res);
      expect(res.statusCode).toBe(200);
      const parsed = JSON.parse(resData);
      expect(parsed.status).toBe('disconnected');
      expect(parsed.configured).toBe(true);
    });

    it('blocks /api/youtube/token requests coming from unauthorized non-local hosts', async () => {
      oauth.setSessionToken({
        accessToken: 'secret_token_123',
        expiresAt: Date.now() + 3600000,
      });

      const handler = createYouTubePublishHandler({ oauthManager: oauth });
      const req: any = {
        url: '/api/youtube/token',
        headers: { host: 'external-evil-domain.com' },
      };
      let resData = '';
      const res: any = {
        statusCode: 0,
        setHeader: vi.fn(),
        end: (data: string) => {
          resData = data;
        },
      };

      await handler(req, res);
      expect(res.statusCode).toBe(403);
      expect(resData).toContain('only accessible from authorized local host');
    });

    it('allows /api/youtube/token requests from localhost', async () => {
      oauth.setSessionToken({
        accessToken: 'secret_token_123',
        expiresAt: Date.now() + 3600000,
      });

      const handler = createYouTubePublishHandler({ oauthManager: oauth });
      const req: any = {
        url: '/api/youtube/token',
        headers: { host: 'localhost:5173' },
      };
      let resData = '';
      const res: any = {
        statusCode: 0,
        setHeader: vi.fn(),
        end: (data: string) => {
          resData = data;
        },
      };

      await handler(req, res);
      expect(res.statusCode).toBe(200);
      const parsed = JSON.parse(resData);
      expect(parsed.accessToken).toBe('secret_token_123');
    });
  });
});
