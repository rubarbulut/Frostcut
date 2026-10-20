/**
 * YouTube OAuth2 Helper & Capability Adapter
 * Persona: 1. DEMİR (Graphics & Render Pipeline Lead)
 * Task: B004-D (D2)
 * 
 * Implements server-side OAuth2 web-server flow for YouTube Data API v3 upload.
 * Strictly manages secrets on server-side: NEVER exposes client_secret or refresh_token to client/browser.
 * Uses in-memory session token storage with single-use CSRF state tokens.
 * Reports honest capability statuses: 'not-configured' | 'disconnected' | 'connected' | 'expired' | 'unavailable'.
 */

import { randomBytes } from 'node:crypto';

export type YouTubeCapabilityStatus =
  | 'not-configured'
  | 'disconnected'
  | 'connected'
  | 'expired'
  | 'unavailable';

export interface YouTubeCapabilityInfo {
  status: YouTubeCapabilityStatus;
  configured: boolean;
  connected: boolean;
  channelTitle?: string;
  expiresAt?: number;
  message?: string;
}

export interface YouTubeOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes?: string[];
  tokenEndpoint?: string;
  authEndpoint?: string;
}

export interface StoredOAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
}

export const YOUTUBE_UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export class YouTubeOAuthManager {
  private config: YouTubeOAuthConfig;
  private currentToken: StoredOAuthToken | null = null;
  private pendingStates = new Map<string, number>(); // state -> createdAt ms
  private stateExpiryMs = 10 * 60 * 1000; // 10 minutes

  constructor(config: YouTubeOAuthConfig = {}) {
    this.config = {
      clientId: config.clientId || process.env.YOUTUBE_CLIENT_ID,
      clientSecret: config.clientSecret || process.env.YOUTUBE_CLIENT_SECRET,
      redirectUri:
        config.redirectUri ||
        process.env.YOUTUBE_REDIRECT_URI ||
        'http://localhost:5173/api/youtube/callback',
      scopes: config.scopes || [YOUTUBE_UPLOAD_SCOPE],
      tokenEndpoint: config.tokenEndpoint || GOOGLE_TOKEN_ENDPOINT,
      authEndpoint: config.authEndpoint || GOOGLE_AUTH_ENDPOINT,
    };
  }

  /**
   * Updates configuration dynamically (e.g. from environment or test setup)
   */
  public updateConfig(newConfig: Partial<YouTubeOAuthConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Evaluates and reports current YouTube upload capability.
   */
  public getCapability(): YouTubeCapabilityInfo {
    const isConfigured = Boolean(this.config.clientId?.trim() && this.config.clientSecret?.trim());

    if (!isConfigured) {
      return {
        status: 'not-configured',
        configured: false,
        connected: false,
        message: 'YouTube OAuth credentials not configured. Setup client ID and secret in environment.',
      };
    }

    if (!this.currentToken) {
      return {
        status: 'disconnected',
        configured: true,
        connected: false,
        message: 'YouTube account not connected. Authorize via OAuth to enable direct publishing.',
      };
    }

    const now = Date.now();
    if (this.currentToken.expiresAt <= now) {
      if (this.currentToken.refreshToken) {
        return {
          status: 'expired',
          configured: true,
          connected: false,
          expiresAt: this.currentToken.expiresAt,
          message: 'Access token expired; auto-refresh will be attempted on next request.',
        };
      }
      return {
        status: 'expired',
        configured: true,
        connected: false,
        expiresAt: this.currentToken.expiresAt,
        message: 'OAuth session has expired. Re-authorization required.',
      };
    }

    return {
      status: 'connected',
      configured: true,
      connected: true,
      expiresAt: this.currentToken.expiresAt,
    };
  }

  /**
   * Generates Google OAuth authorization URL with single-use CSRF state token.
   */
  public generateAuthUrl(customState?: string): { url: string; state: string } {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('Cannot generate auth URL: YouTube client ID or secret is not configured.');
    }

    // Clean up expired states
    const now = Date.now();
    for (const [s, ts] of this.pendingStates.entries()) {
      if (now - ts > this.stateExpiryMs) {
        this.pendingStates.delete(s);
      }
    }

    const state = customState || randomBytes(32).toString('hex');
    this.pendingStates.set(state, now);

    const params = new URLSearchParams({
      client_id: this.config.clientId.trim(),
      redirect_uri: this.config.redirectUri!,
      response_type: 'code',
      scope: (this.config.scopes || [YOUTUBE_UPLOAD_SCOPE]).join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return {
      url: `${this.config.authEndpoint}?${params.toString()}`,
      state,
    };
  }

  /**
   * Handles OAuth callback: validates state, exchanges code for tokens, and updates session store.
   */
  public async handleCallback(
    code: string,
    state: string,
    options: { fetchFn?: typeof fetch } = {},
  ): Promise<{ success: boolean; expiresAt?: number }> {
    if (!state || !this.pendingStates.has(state)) {
      throw new Error('Invalid or expired OAuth state parameter (potential CSRF).');
    }

    // Single-use guarantee: consume state immediately
    this.pendingStates.delete(state);

    if (!code || !code.trim()) {
      throw new Error('Missing OAuth authorization code in callback.');
    }

    const fetcher = options.fetchFn || globalThis.fetch;
    const bodyParams = new URLSearchParams({
      code: code.trim(),
      client_id: this.config.clientId!.trim(),
      client_secret: this.config.clientSecret!.trim(),
      redirect_uri: this.config.redirectUri!,
      grant_type: 'authorization_code',
    });

    const response = await fetcher(this.config.tokenEndpoint!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString(),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Failed to exchange code for tokens (HTTP ${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (!data.access_token) {
      throw new Error('Google token response did not contain an access_token.');
    }

    const expiresInSeconds = typeof data.expires_in === 'number' ? data.expires_in : 3600;
    const expiresAt = Date.now() + expiresInSeconds * 1000;

    this.currentToken = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || this.currentToken?.refreshToken,
      expiresAt,
      scope: data.scope,
    };

    return { success: true, expiresAt };
  }

  /**
   * Retrieves a valid access token. Automatically refreshes using refresh_token if expired.
   */
  public async getValidAccessToken(options: { fetchFn?: typeof fetch } = {}): Promise<string | null> {
    if (!this.currentToken) return null;

    const now = Date.now();
    // Buffer of 60 seconds before expiration
    if (this.currentToken.expiresAt > now + 60 * 1000) {
      return this.currentToken.accessToken;
    }

    // Token is expired or expiring soon; attempt refresh if refresh_token is present
    if (!this.currentToken.refreshToken) {
      return null;
    }

    const fetcher = options.fetchFn || globalThis.fetch;
    const bodyParams = new URLSearchParams({
      client_id: this.config.clientId!.trim(),
      client_secret: this.config.clientSecret!.trim(),
      refresh_token: this.currentToken.refreshToken,
      grant_type: 'refresh_token',
    });

    try {
      const response = await fetcher(this.config.tokenEndpoint!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString(),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (!data.access_token) return null;

      const expiresInSeconds = typeof data.expires_in === 'number' ? data.expires_in : 3600;
      this.currentToken.accessToken = data.access_token;
      this.currentToken.expiresAt = Date.now() + expiresInSeconds * 1000;
      if (data.refresh_token) {
        this.currentToken.refreshToken = data.refresh_token;
      }

      return this.currentToken.accessToken;
    } catch {
      return null;
    }
  }

  /**
   * Sets token directly (useful for tests or mocking)
   */
  public setSessionToken(token: StoredOAuthToken): void {
    this.currentToken = { ...token };
  }

  /**
   * Clears stored tokens and disconnects session.
   */
  public disconnect(): void {
    this.currentToken = null;
    this.pendingStates.clear();
  }
}
