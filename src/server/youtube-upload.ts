/**
 * FrostCut YouTube Resumable Upload Engine (YouTube Data API v3)
 * Persona: 1. DEMİR (Graphics & Render Pipeline Lead)
 * Task: B004-D
 * 
 * Implements chunked HTTP PUT upload over Google YouTube Data API v3 Resumable Upload protocol.
 * Guarantees chunk boundaries are exact multiples of 256 KiB (Google requirement).
 * Implements byte-level resumption via 'Content-Range: bytes * / size' on network drops.
 * Enforces immediate cancellation, request aborting and buffer cleanup via AbortSignal.
 * Guards against token leakage, out-of-bounds ranges, duplicate inserts, and regressive offsets.
 */

export const GOOGLE_YOUTUBE_RESUMABLE_ENDPOINT =
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

/** Google requirement: chunk size MUST be a multiple of 256 KiB (262,144 bytes) */
export const CHUNK_GRANULARITY = 256 * 1024; // 262,144 bytes

/** Default upload chunk size: 5 MB (20 * 256 KiB = 5,242,880 bytes) */
export const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5,242,880 bytes

/** Authorized Google YouTube API hostnames */
export const AUTHORIZED_GOOGLE_HOSTS = [
  'www.googleapis.com',
  'googleapis.com',
  'youtube.googleapis.com',
  'accounts.google.com',
];

export type YouTubePrivacyStatus = 'private' | 'unlisted' | 'public';

export interface YouTubeVideoSnippet {
  title: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
}

export interface YouTubeVideoStatus {
  privacyStatus: YouTubePrivacyStatus;
  embeddable?: boolean;
  license?: 'youtube' | 'creativeCommon';
  selfDeclaredMadeForKids?: boolean;
  publishAt?: string;
}

export interface YouTubeUploadMetadata {
  snippet: YouTubeVideoSnippet;
  status?: YouTubeVideoStatus;
}

export type UploadStage =
  | 'initiating'
  | 'uploading'
  | 'resuming'
  | 'completed'
  | 'aborted'
  | 'failed';

export interface UploadProgress {
  bytesUploaded: number;
  totalBytes: number;
  percentage: number;
  chunkIndex: number;
  totalChunks: number;
  stage: UploadStage;
}

export interface ResumableUploadOptions {
  accessToken: string;
  chunkSize?: number;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
  maxRetries?: number;
  retryDelayMs?: number;
  maxDelayMs?: number;
  fetchFn?: typeof fetch;
  endpointUrl?: string;
  uploadUrl?: string;
  allowedHosts?: string[];
  tokenRefreshFn?: () => Promise<string>;
}

export interface YouTubeUploadResult {
  videoId: string;
  url: string;
  title: string;
  status: number;
  privacyStatus?: YouTubePrivacyStatus;
  uploadedAt: string;
  publishedAt?: string;
  processingStatus?: 'uploaded' | 'processing' | 'succeeded' | 'failed';
  data: Record<string, any>;
}

export class YouTubeUploadError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public responseBody?: string,
    public isRetryable: boolean = false,
  ) {
    super(message);
    this.name = 'YouTubeUploadError';
  }
}

export class YouTubeSessionExpiredError extends YouTubeUploadError {
  constructor(public uploadUrl: string, responseBody?: string) {
    super(
      `YouTube resumable upload session has expired or is invalid (HTTP 404). Controlled restart required; no duplicate video will be automatically created.`,
      404,
      responseBody,
      false,
    );
    this.name = 'YouTubeSessionExpiredError';
  }
}

export class YouTubeHostSecurityError extends YouTubeUploadError {
  constructor(host: string) {
    super(
      `Untrusted host encountered during upload request: "${host}". Request blocked to prevent credential/data leakage.`,
      403,
      '',
      false,
    );
    this.name = 'YouTubeHostSecurityError';
  }
}

export class UploadAbortedError extends Error {
  constructor(message = 'Upload was aborted by user.') {
    super(message);
    this.name = 'UploadAbortedError';
  }
}

/**
 * Validates whether the given URL points to an authorized Google API host
 * or an explicitly allowed test double host.
 */
export function isAuthorizedUploadHost(targetUrl: string, allowedHosts?: string[]): boolean {
  try {
    const parsed = new URL(targetUrl);
    const hostname = parsed.hostname.toLowerCase();

    // Allow mock domains and local loopbacks for unit tests and local dev
    if (hostname.endsWith('.mock') || hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }

    if (allowedHosts && allowedHosts.some((h) => hostname === h.toLowerCase() || hostname.endsWith(`.${h.toLowerCase()}`))) {
      return true;
    }

    return AUTHORIZED_GOOGLE_HOSTS.some(
      (h) => hostname === h.toLowerCase() || hostname.endsWith(`.${h.toLowerCase()}`),
    );
  } catch {
    return false;
  }
}

/**
 * Strips forbidden browser headers (such as Content-Length) when running in browser environments.
 */
export function buildSafeHeaders(
  headers: Record<string, string>,
  isBrowserEnv: boolean = typeof window !== 'undefined',
): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (isBrowserEnv && key.toLowerCase() === 'content-length') {
      // Forbidden header in browser fetch specification; browser computes this automatically
      continue;
    }
    safe[key] = value;
  }
  return safe;
}

/**
 * Normalizes chunk size to ensure it is a valid positive multiple of 256 KiB.
 */
export function normalizeChunkSize(size?: number): number {
  if (!size || size <= 0) return DEFAULT_CHUNK_SIZE;
  return Math.max(CHUNK_GRANULARITY, Math.floor(size / CHUNK_GRANULARITY) * CHUNK_GRANULARITY);
}

/**
 * Safely sleeps with exponential backoff, jitter, and immediate cancellation via AbortSignal.
 */
export async function cancellableSleep(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw new UploadAbortedError();
  if (ms <= 0) return;

  return new Promise((resolve, reject) => {
    let timer: any = null;
    const onAbort = () => {
      if (timer) clearTimeout(timer);
      reject(new UploadAbortedError());
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
  });
}

/**
 * Parses Retry-After header in seconds (defaulting to null if absent or invalid).
 */
export function parseRetryAfter(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const seconds = parseInt(headerValue.trim(), 10);
  if (!isNaN(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const dateMs = Date.parse(headerValue);
  if (!isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return diff > 0 ? diff : 0;
  }
  return null;
}

/**
 * Parses and validates Google 308 Range header: `bytes=0-<lastByte>`
 */
export function parse308RangeHeader(
  rangeHeader: string | null,
  totalSizeBytes: number,
): { valid: boolean; offset: number; error?: string } {
  if (!rangeHeader || !rangeHeader.trim()) {
    // Google specification: No Range header in 308 means 0 bytes have been recorded yet.
    return { valid: true, offset: 0 };
  }

  const match = rangeHeader.trim().match(/^bytes=0-(\d+)$/i);
  if (!match || !match[1]) {
    return {
      valid: false,
      offset: 0,
      error: `Malformed Range header in 308 response: "${rangeHeader}". Must be formatted as "bytes=0-<lastByte>".`,
    };
  }

  const lastByte = parseInt(match[1], 10);
  if (isNaN(lastByte) || lastByte < 0) {
    return {
      valid: false,
      offset: 0,
      error: `Invalid numeric byte range in 308 response: "${rangeHeader}".`,
    };
  }

  if (lastByte >= totalSizeBytes) {
    return {
      valid: false,
      offset: 0,
      error: `Range header byte offset (${lastByte}) exceeds total video payload size (${totalSizeBytes}).`,
    };
  }

  return { valid: true, offset: lastByte + 1 };
}

/**
 * Initiates a YouTube Resumable Upload session.
 * Issues POST request to Google API and returns the resumable upload URL from 'Location' header.
 */
export async function initiateResumableUpload(
  metadata: YouTubeUploadMetadata,
  totalSizeBytes: number,
  mimeType: string,
  options: {
    accessToken: string;
    signal?: AbortSignal;
    fetchFn?: typeof fetch;
    endpointUrl?: string;
    allowedHosts?: string[];
  },
): Promise<string> {
  const fetcher = options.fetchFn || globalThis.fetch;
  if (!fetcher) {
    throw new YouTubeUploadError('No fetch implementation available in current environment.');
  }

  if (options.signal?.aborted) {
    throw new UploadAbortedError();
  }

  const endpoint = options.endpointUrl || GOOGLE_YOUTUBE_RESUMABLE_ENDPOINT;
  if (!isAuthorizedUploadHost(endpoint, options.allowedHosts)) {
    throw new YouTubeHostSecurityError(endpoint);
  }

  const headers: Record<string, string> = buildSafeHeaders({
    Authorization: `Bearer ${options.accessToken.trim()}`,
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Type': mimeType || 'video/mp4',
    'X-Upload-Content-Length': String(totalSizeBytes),
  });

  const bodyPayload = {
    snippet: {
      title: metadata.snippet.title.trim(),
      description: metadata.snippet.description || '',
      tags: metadata.snippet.tags || [],
      ...(metadata.snippet.categoryId ? { categoryId: metadata.snippet.categoryId } : {}),
      ...(metadata.snippet.defaultLanguage ? { defaultLanguage: metadata.snippet.defaultLanguage } : {}),
    },
    status: {
      privacyStatus: metadata.status?.privacyStatus || 'private',
      selfDeclaredMadeForKids: metadata.status?.selfDeclaredMadeForKids ?? false,
      embeddable: metadata.status?.embeddable ?? true,
      ...(metadata.status?.publishAt ? { publishAt: metadata.status.publishAt } : {}),
    },
  };

  const response = await fetcher(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(bodyPayload),
    signal: options.signal,
  });

  if (options.signal?.aborted) {
    throw new UploadAbortedError();
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    const isRetryable = response.status >= 500 || response.status === 429;
    throw new YouTubeUploadError(
      `Failed to initiate resumable upload (HTTP ${response.status}): ${errorText || response.statusText}`,
      response.status,
      errorText,
      isRetryable,
    );
  }

  const uploadUrl = response.headers.get('Location') || response.headers.get('location');
  if (!uploadUrl) {
    throw new YouTubeUploadError('Google API did not return a Location header for the resumable session.');
  }

  if (!isAuthorizedUploadHost(uploadUrl, options.allowedHosts)) {
    throw new YouTubeHostSecurityError(uploadUrl);
  }

  return uploadUrl;
}

/**
 * Queries the current upload status of a resumable session using 'Content-Range: bytes * / total'.
 * Used for recovering from network drops and discovering the current byte offset.
 */
export async function queryUploadStatus(
  uploadUrl: string,
  totalSizeBytes: number,
  options: {
    signal?: AbortSignal;
    fetchFn?: typeof fetch;
    allowedHosts?: string[];
  } = {},
): Promise<{
  complete: boolean;
  receivedOffset: number;
  videoId?: string;
  data?: any;
}> {
  const fetcher = options.fetchFn || globalThis.fetch;
  if (!fetcher) {
    throw new YouTubeUploadError('No fetch implementation available.');
  }

  if (options.signal?.aborted) {
    throw new UploadAbortedError();
  }

  if (!isAuthorizedUploadHost(uploadUrl, options.allowedHosts)) {
    throw new YouTubeHostSecurityError(uploadUrl);
  }

  const headers = buildSafeHeaders({
    'Content-Range': `bytes */${totalSizeBytes}`,
    'Content-Length': '0',
  });

  const response = await fetcher(uploadUrl, {
    method: 'PUT',
    headers,
    signal: options.signal,
  });

  if (options.signal?.aborted) {
    throw new UploadAbortedError();
  }

  // HTTP 308 Resume Incomplete: upload is ongoing
  if (response.status === 308) {
    const rangeHeader = response.headers.get('Range') || response.headers.get('range');
    const parsed = parse308RangeHeader(rangeHeader, totalSizeBytes);
    if (!parsed.valid) {
      throw new YouTubeUploadError(parsed.error || 'Invalid 308 range header from Google YouTube API.', 308);
    }
    return { complete: false, receivedOffset: parsed.offset };
  }

  // HTTP 200 or 201: upload has already finished!
  if (response.status === 200 || response.status === 201) {
    const data = await response.json().catch(() => ({}));
    const videoId = data?.id;
    if (!videoId) {
      throw new YouTubeUploadError('Upload completed but Google response did not contain a video ID.');
    }
    return {
      complete: true,
      receivedOffset: totalSizeBytes,
      videoId,
      data,
    };
  }

  // HTTP 404: Session expired
  if (response.status === 404) {
    const errBody = await response.text().catch(() => '');
    throw new YouTubeSessionExpiredError(uploadUrl, errBody);
  }

  const errBody = await response.text().catch(() => '');
  const isRetryable = response.status >= 500 || response.status === 429;
  throw new YouTubeUploadError(
    `Failed to query upload status (HTTP ${response.status}): ${errBody}`,
    response.status,
    errBody,
    isRetryable,
  );
}

/**
 * Uploads a single chunk to Google Resumable session.
 */
export async function uploadChunk(
  uploadUrl: string,
  chunkData: Uint8Array | ArrayBuffer | Blob,
  startOffset: number,
  totalSizeBytes: number,
  mimeType: string,
  options: {
    signal?: AbortSignal;
    fetchFn?: typeof fetch;
    allowedHosts?: string[];
  } = {},
): Promise<{
  complete: boolean;
  receivedOffset: number;
  videoId?: string;
  data?: any;
}> {
  const fetcher = options.fetchFn || globalThis.fetch;
  if (!fetcher) {
    throw new YouTubeUploadError('No fetch implementation available.');
  }

  if (options.signal?.aborted) {
    throw new UploadAbortedError();
  }

  if (!isAuthorizedUploadHost(uploadUrl, options.allowedHosts)) {
    throw new YouTubeHostSecurityError(uploadUrl);
  }

  const chunkLength =
    chunkData instanceof Blob
      ? chunkData.size
      : chunkData instanceof ArrayBuffer
        ? chunkData.byteLength
        : chunkData.length;

  const endOffset = startOffset + chunkLength - 1;

  const headers = buildSafeHeaders({
    'Content-Type': mimeType || 'video/mp4',
    'Content-Length': String(chunkLength),
    'Content-Range': `bytes ${startOffset}-${endOffset}/${totalSizeBytes}`,
  });

  const response = await fetcher(uploadUrl, {
    method: 'PUT',
    headers,
    body: chunkData,
    signal: options.signal,
  });

  if (options.signal?.aborted) {
    throw new UploadAbortedError();
  }

  // 308 Resume Incomplete: Chunk processed, upload ongoing
  if (response.status === 308) {
    const rangeHeader = response.headers.get('Range') || response.headers.get('range');
    const parsed = parse308RangeHeader(rangeHeader, totalSizeBytes);
    if (!parsed.valid) {
      throw new YouTubeUploadError(parsed.error || 'Invalid 308 range header on chunk upload.', 308);
    }
    return {
      complete: false,
      receivedOffset: parsed.offset,
    };
  }

  // 200 / 201: Final chunk received, upload complete!
  if (response.status === 200 || response.status === 201) {
    const data = await response.json().catch(() => ({}));
    const videoId = data?.id;
    if (!videoId) {
      throw new YouTubeUploadError('Upload finished but response is missing video ID.', response.status);
    }
    return {
      complete: true,
      receivedOffset: totalSizeBytes,
      videoId,
      data,
    };
  }

  if (response.status === 404) {
    const errBody = await response.text().catch(() => '');
    throw new YouTubeSessionExpiredError(uploadUrl, errBody);
  }

  const errorText = await response.text().catch(() => '');
  const isRetryable = response.status >= 500 || response.status === 429;
  const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));

  const err = new YouTubeUploadError(
    `Chunk upload failed (HTTP ${response.status}): ${errorText || response.statusText}`,
    response.status,
    errorText,
    isRetryable,
  );
  if (retryAfterMs !== null) {
    (err as any).retryAfterMs = retryAfterMs;
  }
  throw err;
}

/**
 * Memory-efficient data slicing from Blob or Uint8Array.
 */
function sliceData(
  data: Uint8Array | Blob,
  start: number,
  end: number,
): Uint8Array | Blob {
  if (data instanceof Blob) {
    return data.slice(start, end);
  }
  return data.subarray(start, end);
}

/**
 * Executes a full Resumable YouTube Upload workflow with chunking, retry on drops,
 * status query resumption, and strict cancellation.
 */
export async function executeResumableUpload(
  videoPayload: Uint8Array | Blob,
  metadata: YouTubeUploadMetadata,
  options: ResumableUploadOptions,
): Promise<YouTubeUploadResult> {
  const fetcher = options.fetchFn || globalThis.fetch;
  if (!fetcher) {
    throw new YouTubeUploadError('No fetch implementation available.');
  }

  const signal = options.signal;
  if (signal?.aborted) {
    throw new UploadAbortedError();
  }

  const totalBytes = videoPayload instanceof Blob ? videoPayload.size : videoPayload.length;
  if (totalBytes <= 0) {
    throw new YouTubeUploadError('Cannot upload empty video (0 bytes).');
  }

  const chunkSize = normalizeChunkSize(options.chunkSize);
  const totalChunks = Math.ceil(totalBytes / chunkSize);
  const maxRetries = options.maxRetries ?? 5;
  const baseDelayMs = options.retryDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30000;
  const mimeType = videoPayload instanceof Blob && videoPayload.type ? videoPayload.type : 'video/mp4';

  options.onProgress?.({
    bytesUploaded: 0,
    totalBytes,
    percentage: 0,
    chunkIndex: 0,
    totalChunks,
    stage: 'initiating',
  });

  // Step 1: Initiate session if uploadUrl was not provided
  let uploadUrl = options.uploadUrl;
  let activeToken = options.accessToken;

  if (!uploadUrl) {
    uploadUrl = await initiateResumableUpload(metadata, totalBytes, mimeType, {
      accessToken: activeToken,
      signal,
      fetchFn: fetcher,
      endpointUrl: options.endpointUrl,
      allowedHosts: options.allowedHosts,
    });
  }

  let currentOffset = 0;
  let chunkIndex = 0;
  let hasRefreshedToken = false;

  // Step 2: Sequentially stream chunks
  while (currentOffset < totalBytes) {
    if (signal?.aborted) {
      throw new UploadAbortedError();
    }

    const chunkEnd = Math.min(currentOffset + chunkSize, totalBytes);
    let chunkBuffer: Uint8Array | Blob | null = sliceData(videoPayload, currentOffset, chunkEnd);

    let attempt = 0;
    let uploadedSuccessfully = false;
    let consecutiveNonAdvancingAttempts = 0;

    options.onProgress?.({
      bytesUploaded: currentOffset,
      totalBytes,
      percentage: Math.min(100, Math.round((currentOffset / totalBytes) * 100)),
      chunkIndex,
      totalChunks,
      stage: 'uploading',
    });

    while (attempt <= maxRetries && !uploadedSuccessfully) {
      if (signal?.aborted) {
        chunkBuffer = null;
        throw new UploadAbortedError();
      }

      try {
        const result = await uploadChunk(
          uploadUrl,
          chunkBuffer!,
          currentOffset,
          totalBytes,
          mimeType,
          { signal, fetchFn: fetcher, allowedHosts: options.allowedHosts },
        );

        if (result.complete) {
          chunkBuffer = null;
          const videoId = result.videoId!;
          options.onProgress?.({
            bytesUploaded: totalBytes,
            totalBytes,
            percentage: 100,
            chunkIndex: totalChunks,
            totalChunks,
            stage: 'completed',
          });

          return {
            videoId,
            url: `https://youtu.be/${videoId}`,
            title: metadata.snippet.title,
            status: 200,
            privacyStatus: result.data?.status?.privacyStatus || metadata.status?.privacyStatus,
            uploadedAt: new Date().toISOString(),
            publishedAt: result.data?.snippet?.publishedAt || metadata.status?.publishAt,
            processingStatus: result.data?.status?.uploadStatus || 'uploaded',
            data: result.data || {},
          };
        }

        // Check if progress regressed or failed to advance
        if (result.receivedOffset < currentOffset) {
          throw new YouTubeUploadError(
            `Server reported regressive byte offset: ${result.receivedOffset} < current ${currentOffset}.`,
            308,
            '',
            true,
          );
        }

        if (result.receivedOffset === currentOffset) {
          consecutiveNonAdvancingAttempts++;
          if (consecutiveNonAdvancingAttempts >= 3) {
            throw new YouTubeUploadError(
              `Upload offset stalled at ${currentOffset} bytes for 3 consecutive attempts.`,
              308,
              '',
              false,
            );
          }
        } else {
          consecutiveNonAdvancingAttempts = 0;
        }

        currentOffset = result.receivedOffset;
        chunkIndex = Math.floor(currentOffset / chunkSize);
        uploadedSuccessfully = true;
      } catch (err: any) {
        if (err instanceof UploadAbortedError || signal?.aborted) {
          chunkBuffer = null;
          throw new UploadAbortedError();
        }

        // Handle single token refresh on 401 Unauthorized
        if (err?.statusCode === 401 && options.tokenRefreshFn && !hasRefreshedToken) {
          hasRefreshedToken = true;
          try {
            activeToken = await options.tokenRefreshFn();
            // Retry this chunk with refreshed token without counting against network retries
            continue;
          } catch (refreshErr) {
            chunkBuffer = null;
            throw new YouTubeUploadError(
              `OAuth token refresh failed during upload: ${(refreshErr as Error)?.message || refreshErr}`,
              401,
              '',
              false,
            );
          }
        }

        // Non-retryable errors: do NOT retry blindly
        if (err instanceof YouTubeSessionExpiredError) {
          chunkBuffer = null;
          throw err;
        }

        if (err instanceof YouTubeHostSecurityError) {
          chunkBuffer = null;
          throw err;
        }

        if (err?.statusCode && (err.statusCode === 400 || err.statusCode === 401 || err.statusCode === 403)) {
          chunkBuffer = null;
          throw err;
        }

        attempt++;
        if (attempt > maxRetries) {
          chunkBuffer = null;
          options.onProgress?.({
            bytesUploaded: currentOffset,
            totalBytes,
            percentage: Math.round((currentOffset / totalBytes) * 100),
            chunkIndex,
            totalChunks,
            stage: 'failed',
          });
          throw new YouTubeUploadError(
            `Resumable upload failed after ${maxRetries} retries: ${err?.message || err}`,
            err?.statusCode,
            err?.responseBody,
            false,
          );
        }

        // Network or 5xx drop: recover status via queryUploadStatus with jittered exponential backoff
        options.onProgress?.({
          bytesUploaded: currentOffset,
          totalBytes,
          percentage: Math.round((currentOffset / totalBytes) * 100),
          chunkIndex,
          totalChunks,
          stage: 'resuming',
        });

        const retryAfterMs = (err as any)?.retryAfterMs;
        const calculatedDelay = retryAfterMs ?? Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
        // Add 20% jitter
        const jitteredDelay = Math.round(calculatedDelay * (0.8 + Math.random() * 0.4));

        await cancellableSleep(jitteredDelay, signal);

        if (signal?.aborted) {
          chunkBuffer = null;
          throw new UploadAbortedError();
        }

        try {
          const statusResult = await queryUploadStatus(uploadUrl, totalBytes, {
            signal,
            fetchFn: fetcher,
            allowedHosts: options.allowedHosts,
          });

          if (statusResult.complete) {
            chunkBuffer = null;
            const videoId = statusResult.videoId!;
            options.onProgress?.({
              bytesUploaded: totalBytes,
              totalBytes,
              percentage: 100,
              chunkIndex: totalChunks,
              totalChunks,
              stage: 'completed',
            });
            return {
              videoId,
              url: `https://youtu.be/${videoId}`,
              title: metadata.snippet.title,
              status: 200,
              privacyStatus: statusResult.data?.status?.privacyStatus || metadata.status?.privacyStatus,
              uploadedAt: new Date().toISOString(),
              publishedAt: statusResult.data?.snippet?.publishedAt || metadata.status?.publishAt,
              processingStatus: statusResult.data?.status?.uploadStatus || 'uploaded',
              data: statusResult.data || {},
            };
          }

          // Advance offset strictly to Google's accepted byte offset
          currentOffset = statusResult.receivedOffset;
          chunkIndex = Math.floor(currentOffset / chunkSize);
          chunkBuffer = sliceData(videoPayload, currentOffset, Math.min(currentOffset + chunkSize, totalBytes));
        } catch (statusErr: any) {
          if (statusErr instanceof UploadAbortedError || signal?.aborted) {
            chunkBuffer = null;
            throw new UploadAbortedError();
          }
          if (statusErr instanceof YouTubeSessionExpiredError) {
            chunkBuffer = null;
            throw statusErr;
          }
          // Status query also failed, loop continues to next backoff attempt
        }
      }
    }

    chunkBuffer = null;
  }

  // Final check: confirm status with server
  const finalStatus = await queryUploadStatus(uploadUrl, totalBytes, {
    signal,
    fetchFn: fetcher,
    allowedHosts: options.allowedHosts,
  });

  if (finalStatus.complete && finalStatus.videoId) {
    return {
      videoId: finalStatus.videoId,
      url: `https://youtu.be/${finalStatus.videoId}`,
      title: metadata.snippet.title,
      status: 200,
      privacyStatus: finalStatus.data?.status?.privacyStatus || metadata.status?.privacyStatus,
      uploadedAt: new Date().toISOString(),
      publishedAt: finalStatus.data?.snippet?.publishedAt || metadata.status?.publishAt,
      processingStatus: finalStatus.data?.status?.uploadStatus || 'uploaded',
      data: finalStatus.data || {},
    };
  }

  throw new YouTubeUploadError('Upload finished all byte ranges without confirmation of completion from YouTube.');
}
