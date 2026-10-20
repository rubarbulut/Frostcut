/**
 * Vite Dev & Preview Server Plugin for YouTube Publish & OAuth Integration
 * Persona: 1. DEMİR (Graphics & Render Pipeline Lead)
 * Task: B004-D (D2)
 * 
 * Exposes local helper endpoints for YouTube capability status, OAuth authorization,
 * callback handling, and controlled local token retrieval.
 * Guards against token leakage: client secrets and refresh tokens are strictly preserved on server.
 */

import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import { YouTubeOAuthManager } from './youtube-oauth';

export interface YouTubePublishHandlerOptions {
  oauthManager?: YouTubeOAuthManager;
  allowedHosts?: string[];
}

/**
 * Creates the Connect-compatible HTTP request handler for YouTube publishing and OAuth endpoints.
 */
export function createYouTubePublishHandler(options: YouTubePublishHandlerOptions = {}) {
  const oauth = options.oauthManager || new YouTubeOAuthManager();
  const allowedHosts = options.allowedHosts || ['localhost', '127.0.0.1'];

  return async (req: any, res: any, next?: any) => {
    const rawUrl = req.url || '';
    const hostHeader = (req.headers.host || '').split(':')[0].toLowerCase();

    // Verify host origin for local security
    const isLocalHost = allowedHosts.includes(hostHeader);

    // Endpoint 1: Capability Status
    if (rawUrl.startsWith('/api/youtube/capability')) {
      const capability = oauth.getCapability();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(capability));
      return;
    }

    // Endpoint 2: Generate OAuth Auth URL
    if (rawUrl.startsWith('/api/youtube/auth-url')) {
      try {
        const authData = oauth.generateAuthUrl();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(authData));
      } catch (err: any) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err?.message || 'Failed to generate auth URL' }));
      }
      return;
    }

    // Endpoint 3: OAuth Callback
    if (rawUrl.startsWith('/api/youtube/callback')) {
      try {
        const parsed = new URL(rawUrl, 'http://127.0.0.1:5173');
        const code = parsed.searchParams.get('code');
        const state = parsed.searchParams.get('state');
        const error = parsed.searchParams.get('error');

        if (error) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: `OAuth authorization denied: ${error}` }));
          return;
        }

        if (!code || !state) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing code or state in OAuth callback.' }));
          return;
        }

        const result = await oauth.handleCallback(code, state);
        // Successful authorization: redirect back to app or return JSON confirmation
        if (req.headers.accept?.includes('text/html')) {
          res.statusCode = 302;
          res.setHeader('Location', '/?youtube_connected=true');
          res.end();
        } else {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, connected: true, expiresAt: result.expiresAt }));
        }
      } catch (err: any) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err?.message || 'OAuth callback failed.' }));
      }
      return;
    }

    // Endpoint 4: Disconnect
    if (rawUrl.startsWith('/api/youtube/disconnect') && req.method === 'POST') {
      oauth.disconnect();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ disconnected: true }));
      return;
    }

    // Endpoint 5: Retrieve Active Access Token (strictly guarded to local host only)
    if (rawUrl.startsWith('/api/youtube/token')) {
      if (!isLocalHost) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Token endpoint only accessible from authorized local host.' }));
        return;
      }

      const token = await oauth.getValidAccessToken();
      if (!token) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'No active or valid YouTube session token available.' }));
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ accessToken: token }));
      return;
    }

    if (next) {
      next();
    }
  };
}

/**
 * YouTube Publishing Vite plugin for registering dev and preview server middleware.
 * Manager registers this in vite.config.ts.
 */
export function youtubePublishPlugin(options: YouTubePublishHandlerOptions = {}): Plugin {
  const handler = createYouTubePublishHandler(options);

  return {
    name: 'vite-plugin-youtube-publish',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(handler);
    },
  };
}
