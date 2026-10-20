/**
 * FrostCut YouTube Publisher Client Service
 * Persona: 1. DEMİR (Graphics & Render Pipeline Lead)
 * Task: B004-D
 * 
 * Provides high-level export-to-YouTube publishing integration.
 * Accepts rendered Blob (video/mp4) from visual-renderer or turbo-export,
 * coordinates chunked resumable upload with YouTube Data API v3,
 * dispatches granular progress events, handles abort/cancellation,
 * validates inputs strictly without silent truncation, and verifies
 * permanent YouTube video IDs.
 */

import {
  executeResumableUpload,
  normalizeChunkSize,
  type YouTubeUploadMetadata,
  type YouTubePrivacyStatus,
  type UploadProgress,
  DEFAULT_CHUNK_SIZE,
  YouTubeUploadError,
  UploadAbortedError,
} from './server/youtube-upload';

export interface YouTubePublishMetadata {
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: YouTubePrivacyStatus;
  categoryId?: string;
  publishAt?: string;
  selfDeclaredMadeForKids?: boolean;
}

export interface YouTubePublishProgress extends UploadProgress {
  estimatedSecondsRemaining?: number;
}

export interface YouTubePublishOptions {
  accessToken: string;
  chunkSize?: number;
  signal?: AbortSignal;
  onProgress?: (progress: YouTubePublishProgress) => void;
  maxRetries?: number;
  retryDelayMs?: number;
  fetchFn?: typeof fetch;
  endpointUrl?: string;
  uploadUrl?: string;
  allowedHosts?: string[];
  tokenRefreshFn?: () => Promise<string>;
}

export interface YouTubePublishResult {
  videoId: string;
  url: string;
  title: string;
  privacyStatus: YouTubePrivacyStatus;
  uploadedAt: string;
  publishedAt?: string;
  processingStatus: 'uploaded' | 'processing' | 'succeeded' | 'failed';
  rawResponse: Record<string, any>;
}

export class YouTubeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YouTubeValidationError';
  }
}

/**
 * Validates a YouTube video ID format (typically 11 characters, alphanumeric with _ and -)
 */
export function isValidYouTubeVideoId(id?: string): boolean {
  if (!id || typeof id !== 'string') return false;
  const trimmed = id.trim();
  return /^[a-zA-Z0-9_-]{8,32}$/.test(trimmed);
}

/**
 * Validates scheduled publish time according to YouTube API specifications.
 * YouTube requires videos scheduled with publishAt to have privacyStatus set to 'private'.
 */
export function validateScheduledPublish(publishAt: string, privacyStatus?: YouTubePrivacyStatus): {
  valid: boolean;
  error?: string;
} {
  const dateMs = Date.parse(publishAt);
  if (isNaN(dateMs)) {
    return { valid: false, error: `Invalid publishAt timestamp: "${publishAt}". Must be a valid ISO-8601 string.` };
  }

  // Must be in the future (at least 2 minutes in the future to avoid race conditions)
  const now = Date.now();
  if (dateMs <= now + 2 * 60 * 1000) {
    return {
      valid: false,
      error: `Scheduled publish time (${publishAt}) must be in the future (at least 2 minutes from now).`,
    };
  }

  // Google requirement: scheduled videos must be private at upload time
  if (privacyStatus && privacyStatus !== 'private') {
    return {
      valid: false,
      error: `YouTube requires scheduled videos (publishAt) to have privacyStatus set to "private" (currently "${privacyStatus}").`,
    };
  }

  return { valid: true };
}

/**
 * Validates video publishing metadata according to YouTube Data API v3 limits.
 * Rejects oversized inputs with explicit validation errors instead of silently truncating them.
 */
export function validatePublishMetadata(metadata: YouTubePublishMetadata): void {
  if (!metadata.title || !metadata.title.trim()) {
    throw new YouTubeValidationError('YouTube video title is required and cannot be empty.');
  }

  const trimmedTitle = metadata.title.trim();
  if (trimmedTitle.length > 100) {
    throw new YouTubeValidationError(
      `YouTube title exceeds maximum allowed length of 100 characters (got ${trimmedTitle.length} characters). Please shorten the title.`,
    );
  }

  if (metadata.description && metadata.description.length > 5000) {
    throw new YouTubeValidationError(
      `YouTube description exceeds maximum allowed length of 5000 characters (got ${metadata.description.length} characters). Please shorten the description.`,
    );
  }

  if (metadata.tags && metadata.tags.length > 0) {
    const totalTagChars = metadata.tags.join(',').length;
    if (totalTagChars > 500) {
      throw new YouTubeValidationError(
        `YouTube tags exceed maximum allowed length of 500 characters combined (got ${totalTagChars} characters).`,
      );
    }
  }

  if (metadata.publishAt) {
    const scheduleValidation = validateScheduledPublish(metadata.publishAt, metadata.privacyStatus);
    if (!scheduleValidation.valid) {
      throw new YouTubeValidationError(scheduleValidation.error!);
    }
  }
}

/**
 * High-level service function to upload a rendered video Blob directly to YouTube.
 */
export async function publishVideoToYouTube(
  videoBlob: Blob,
  metadata: YouTubePublishMetadata,
  options: YouTubePublishOptions,
): Promise<YouTubePublishResult> {
  if (!videoBlob || !(videoBlob instanceof Blob)) {
    throw new YouTubeUploadError('Invalid video input: expected a valid video Blob instance.');
  }

  if (videoBlob.size === 0) {
    throw new YouTubeUploadError('Cannot publish an empty video file (0 bytes).');
  }

  if (!options.accessToken || !options.accessToken.trim()) {
    throw new YouTubeUploadError('Missing YouTube OAuth2 access token.');
  }

  if (options.signal?.aborted) {
    throw new UploadAbortedError();
  }

  // Strict validation without silent truncation
  validatePublishMetadata(metadata);

  const uploadMetadata: YouTubeUploadMetadata = {
    snippet: {
      title: metadata.title.trim(),
      description: metadata.description || '',
      tags: metadata.tags || [],
      categoryId: metadata.categoryId || '20', // Default: Gaming / Entertainment
    },
    status: {
      privacyStatus: metadata.publishAt ? 'private' : (metadata.privacyStatus || 'private'),
      selfDeclaredMadeForKids: metadata.selfDeclaredMadeForKids ?? false,
      embeddable: true,
      ...(metadata.publishAt ? { publishAt: metadata.publishAt } : {}),
    },
  };

  const startTime = Date.now();

  const progressHandler = (p: UploadProgress) => {
    let estimatedSecondsRemaining: number | undefined;
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    if (elapsedSeconds > 0.5 && p.bytesUploaded > 0) {
      const bytesPerSecond = p.bytesUploaded / elapsedSeconds;
      const remainingBytes = p.totalBytes - p.bytesUploaded;
      estimatedSecondsRemaining = Math.max(0, Math.round(remainingBytes / bytesPerSecond));
    }

    options.onProgress?.({
      ...p,
      estimatedSecondsRemaining,
    });
  };

  const result = await executeResumableUpload(videoBlob, uploadMetadata, {
    accessToken: options.accessToken,
    chunkSize: options.chunkSize || DEFAULT_CHUNK_SIZE,
    signal: options.signal,
    onProgress: progressHandler,
    maxRetries: options.maxRetries ?? 5,
    retryDelayMs: options.retryDelayMs ?? 1000,
    fetchFn: options.fetchFn,
    endpointUrl: options.endpointUrl,
    uploadUrl: options.uploadUrl,
    allowedHosts: options.allowedHosts,
    tokenRefreshFn: options.tokenRefreshFn,
  });

  if (!isValidYouTubeVideoId(result.videoId)) {
    throw new YouTubeUploadError(
      `Received invalid or malformed video ID from YouTube API: "${result.videoId}"`,
    );
  }

  const verifiedPrivacy = (result.privacyStatus as YouTubePrivacyStatus) || metadata.privacyStatus || 'private';

  return {
    videoId: result.videoId,
    url: `https://youtu.be/${result.videoId}`,
    title: result.title,
    privacyStatus: verifiedPrivacy,
    uploadedAt: result.uploadedAt,
    publishedAt: result.publishedAt,
    processingStatus: result.processingStatus || 'uploaded',
    rawResponse: result.data,
  };
}
