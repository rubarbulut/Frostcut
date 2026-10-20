import {
  parseCreatorProfile,
  type CreatorProfile,
} from '../creator-recipe';

export const PROFILE_STORAGE_KEY = 'frostcut-creator-profile-v1';

export const DEFAULT_CREATOR_PROFILE: CreatorProfile = Object.freeze({
  version: 1,
  id: 'default-channel-profile',
  name: 'Main Channel',
  language: 'en',
  game: 'General',
  audience: 'Community',
  commentary: 'unspecified',
  longTargetSeconds: 600,
  shortTargetSeconds: 60,
  shortCount: 2,
  fillMode: 'blur-background',
});

export interface ProfileStorageBackend {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

export interface StoredProfileEnvelope {
  storageVersion: 1;
  savedAt: string;
  profile: CreatorProfile;
}

export type StorageErrorCode =
  | 'STORAGE_UNAVAILABLE'
  | 'CORRUPTED_DATA'
  | 'UNSUPPORTED_VERSION'
  | 'VALIDATION_FAILED';

export type ProfileStorageResult<T> =
  | { ok: true; data: T; error?: never; code?: never }
  | { ok: false; data?: never; error: string; code: StorageErrorCode };

/**
 * Default backend uses idb-keyval when available in the browser context.
 * In SSR / non-IndexedDB environments, it safely reports STORAGE_UNAVAILABLE.
 */
export const defaultIndexedDBBackend: ProfileStorageBackend = {
  async get(key: string) {
    if (typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB is not available in this environment.');
    }
    const { get } = await import('idb-keyval');
    return get(key);
  },
  async set(key: string, value: unknown) {
    if (typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB is not available in this environment.');
    }
    const { set } = await import('idb-keyval');
    return set(key, value);
  },
  async del(key: string) {
    if (typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB is not available in this environment.');
    }
    const { del } = await import('idb-keyval');
    return del(key);
  },
};

/**
 * Creates an in-memory storage backend for unit testing and SSR fallbacks.
 */
export function createMemoryProfileStorageBackend(
  initialData?: Record<string, unknown>,
): ProfileStorageBackend {
  const store = new Map<string, unknown>(Object.entries(initialData ?? {}));
  return {
    async get(key: string) {
      return store.get(key);
    },
    async set(key: string, value: unknown) {
      store.set(key, value);
    },
    async del(key: string) {
      store.delete(key);
    },
  };
}

/**
 * Loads and validates canonical CreatorProfile from storage.
 * Gracefully handles corrupted data, older/unsupported versions, and missing storage.
 */
export async function loadCreatorProfile(
  backend: ProfileStorageBackend = defaultIndexedDBBackend,
): Promise<ProfileStorageResult<CreatorProfile | null>> {
  let raw: unknown;
  try {
    raw = await backend.get(PROFILE_STORAGE_KEY);
  } catch (err) {
    return {
      ok: false,
      error: `Storage access failed: ${(err as Error).message}`,
      code: 'STORAGE_UNAVAILABLE',
    };
  }

  if (raw === undefined || raw === null) {
    return { ok: true, data: null };
  }

  // Handle JSON string format if stored as stringified JSON
  let parsedRaw = raw;
  if (typeof raw === 'string') {
    try {
      parsedRaw = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        error: 'Corrupted profile data in storage: invalid JSON.',
        code: 'CORRUPTED_DATA',
      };
    }
  }

  if (typeof parsedRaw !== 'object' || parsedRaw === null) {
    return {
      ok: false,
      error: 'Corrupted profile data: expected object payload.',
      code: 'CORRUPTED_DATA',
    };
  }

  // Check envelope version if wrapped
  let candidateProfile = parsedRaw;
  if ('storageVersion' in parsedRaw) {
    const envelope = parsedRaw as Partial<StoredProfileEnvelope>;
    if (envelope.storageVersion !== 1) {
      return {
        ok: false,
        error: `Unsupported profile storage version: ${envelope.storageVersion}.`,
        code: 'UNSUPPORTED_VERSION',
      };
    }
    if (!envelope.profile) {
      return {
        ok: false,
        error: 'Corrupted profile envelope: missing profile field.',
        code: 'CORRUPTED_DATA',
      };
    }
    candidateProfile = envelope.profile;
  }

  // Strictly validate through canonical parseCreatorProfile
  try {
    const validated = parseCreatorProfile(candidateProfile);
    return { ok: true, data: validated };
  } catch (err) {
    return {
      ok: false,
      error: `Profile validation failed: ${(err as Error).message}`,
      code: 'VALIDATION_FAILED',
    };
  }
}

/**
 * Strictly validates and persists canonical CreatorProfile to storage.
 * Strips any tokens, credentials or arbitrary fields before saving.
 */
export async function saveCreatorProfile(
  profileInput: unknown,
  backend: ProfileStorageBackend = defaultIndexedDBBackend,
): Promise<ProfileStorageResult<CreatorProfile>> {
  // Validate and sanitize into canonical CreatorProfile
  let canonical: CreatorProfile;
  try {
    canonical = parseCreatorProfile(profileInput);
  } catch (err) {
    return {
      ok: false,
      error: `Cannot save invalid profile: ${(err as Error).message}`,
      code: 'VALIDATION_FAILED',
    };
  }

  const envelope: StoredProfileEnvelope = {
    storageVersion: 1,
    savedAt: new Date().toISOString(),
    profile: canonical,
  };

  try {
    await backend.set(PROFILE_STORAGE_KEY, envelope);
    return { ok: true, data: canonical };
  } catch (err) {
    return {
      ok: false,
      error: `Storage write failed: ${(err as Error).message}`,
      code: 'STORAGE_UNAVAILABLE',
    };
  }
}

/**
 * Removes stored profile from storage backend.
 */
export async function clearCreatorProfile(
  backend: ProfileStorageBackend = defaultIndexedDBBackend,
): Promise<ProfileStorageResult<void>> {
  try {
    await backend.del(PROFILE_STORAGE_KEY);
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: `Storage clear failed: ${(err as Error).message}`,
      code: 'STORAGE_UNAVAILABLE',
    };
  }
}
