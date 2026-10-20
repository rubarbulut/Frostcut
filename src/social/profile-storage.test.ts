import { describe, expect, it } from 'vitest';
import {
  loadCreatorProfile,
  saveCreatorProfile,
  clearCreatorProfile,
  createMemoryProfileStorageBackend,
  PROFILE_STORAGE_KEY,
  DEFAULT_CREATOR_PROFILE,
  type ProfileStorageBackend,
} from './profile-storage';
import type { CreatorProfile } from '../creator-recipe';

const validProfile: CreatorProfile = {
  version: 1,
  id: 'channel-test-123',
  name: 'Test Channel',
  language: 'tr',
  game: 'Elden Ring',
  audience: 'Action RPG Enthusiasts',
  commentary: 'unspecified',
  longTargetSeconds: 1200,
  shortTargetSeconds: 50,
  shortCount: 0, // Specifically 0!
  fillMode: 'crop',
};

describe('Profile Storage (B004-B)', () => {
  it('saves and restores canonical profile faithfully', async () => {
    const backend = createMemoryProfileStorageBackend();

    const saveResult = await saveCreatorProfile(validProfile, backend);
    expect(saveResult.ok).toBe(true);
    if (!saveResult.ok) return;
    expect(saveResult.data).toEqual(validProfile);

    const loadResult = await loadCreatorProfile(backend);
    expect(loadResult.ok).toBe(true);
    if (!loadResult.ok) return;
    expect(loadResult.data).toEqual(validProfile);
  });

  it('strictly preserves shortCount = 0 without coercing to 2 or any fallback', async () => {
    const backend = createMemoryProfileStorageBackend();
    const zeroShortProfile: CreatorProfile = {
      ...validProfile,
      shortCount: 0,
    };

    const saveResult = await saveCreatorProfile(zeroShortProfile, backend);
    expect(saveResult.ok).toBe(true);
    expect(saveResult.data?.shortCount).toBe(0);

    const loadResult = await loadCreatorProfile(backend);
    expect(loadResult.ok).toBe(true);
    expect(loadResult.data?.shortCount).toBe(0);
    expect(loadResult.data?.shortCount).not.toBe(2);
  });

  it('strictly preserves commentary = "unspecified" without replacing with fake defaults', async () => {
    const backend = createMemoryProfileStorageBackend();
    const unspecifiedProfile: CreatorProfile = {
      ...validProfile,
      commentary: 'unspecified',
    };

    const saveResult = await saveCreatorProfile(unspecifiedProfile, backend);
    expect(saveResult.ok).toBe(true);
    expect(saveResult.data?.commentary).toBe('unspecified');

    const loadResult = await loadCreatorProfile(backend);
    expect(loadResult.ok).toBe(true);
    expect(loadResult.data?.commentary).toBe('unspecified');
    expect(loadResult.data?.commentary).not.toBe('mixed');
  });

  it('strips credentials, account tokens, and secret fields before saving', async () => {
    const backend = createMemoryProfileStorageBackend();
    const profileWithSecrets = {
      ...validProfile,
      accountToken: 'secret_oauth_token_12345',
      clientSecret: 'secret_xyz',
      publishAutomatically: true,
      extraJunk: { nested: true },
    };

    const saveResult = await saveCreatorProfile(profileWithSecrets, backend);
    expect(saveResult.ok).toBe(true);
    if (!saveResult.ok) return;

    expect('accountToken' in saveResult.data).toBe(false);
    expect('clientSecret' in saveResult.data).toBe(false);
    expect('publishAutomatically' in saveResult.data).toBe(false);

    // Verify stored raw payload also does not have tokens
    const rawStored = (await backend.get(PROFILE_STORAGE_KEY)) as any;
    expect(rawStored.profile.accountToken).toBeUndefined();
    expect(rawStored.profile.clientSecret).toBeUndefined();
  });

  it('returns CORRUPTED_DATA error when stored value contains invalid JSON string', async () => {
    const backend = createMemoryProfileStorageBackend({
      [PROFILE_STORAGE_KEY]: 'this is definitely { not valid JSON',
    });

    const loadResult = await loadCreatorProfile(backend);
    expect(loadResult.ok).toBe(false);
    if (loadResult.ok) return;
    expect(loadResult.code).toBe('CORRUPTED_DATA');
    expect(loadResult.error).toContain('invalid JSON');
  });

  it('returns UNSUPPORTED_VERSION error when storage version is greater than 1', async () => {
    const backend = createMemoryProfileStorageBackend({
      [PROFILE_STORAGE_KEY]: {
        storageVersion: 99,
        savedAt: new Date().toISOString(),
        profile: validProfile,
      },
    });

    const loadResult = await loadCreatorProfile(backend);
    expect(loadResult.ok).toBe(false);
    if (loadResult.ok) return;
    expect(loadResult.code).toBe('UNSUPPORTED_VERSION');
    expect(loadResult.error).toContain('Unsupported profile storage version');
  });

  it('returns VALIDATION_FAILED error when stored data fails canonical validation', async () => {
    const backend = createMemoryProfileStorageBackend({
      [PROFILE_STORAGE_KEY]: {
        storageVersion: 1,
        savedAt: new Date().toISOString(),
        profile: {
          ...validProfile,
          shortCount: 999, // Exceeds max 12
        },
      },
    });

    const loadResult = await loadCreatorProfile(backend);
    expect(loadResult.ok).toBe(false);
    if (loadResult.ok) return;
    expect(loadResult.code).toBe('VALIDATION_FAILED');
  });

  it('rejects out-of-bounds, NaN, and Infinity inputs when saving', async () => {
    const backend = createMemoryProfileStorageBackend();

    for (const invalid of [
      { ...validProfile, shortCount: NaN },
      { ...validProfile, shortTargetSeconds: Infinity },
      { ...validProfile, shortCount: -1 },
      { ...validProfile, shortCount: 13 },
      { ...validProfile, longTargetSeconds: 0 },
      { ...validProfile, game: '' }, // empty game rejected
      { ...validProfile, language: 'invalid-lang-code-???' },
      { ...validProfile, fillMode: 'invalid-mode' },
    ]) {
      const res = await saveCreatorProfile(invalid, backend);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('VALIDATION_FAILED');
      }
    }
  });

  it('returns STORAGE_UNAVAILABLE cleanly when storage access throws', async () => {
    const faultyBackend: ProfileStorageBackend = {
      async get() {
        throw new Error('Disk quota exceeded or IndexedDB disabled');
      },
      async set() {
        throw new Error('Write permission denied');
      },
      async del() {
        throw new Error('Access denied');
      },
    };

    const loadResult = await loadCreatorProfile(faultyBackend);
    expect(loadResult.ok).toBe(false);
    if (!loadResult.ok) {
      expect(loadResult.code).toBe('STORAGE_UNAVAILABLE');
      expect(loadResult.error).toContain('Disk quota exceeded');
    }

    const saveResult = await saveCreatorProfile(validProfile, faultyBackend);
    expect(saveResult.ok).toBe(false);
    if (!saveResult.ok) {
      expect(saveResult.code).toBe('STORAGE_UNAVAILABLE');
      expect(saveResult.error).toContain('Write permission denied');
    }
  });

  it('clears stored profile cleanly', async () => {
    const backend = createMemoryProfileStorageBackend();
    await saveCreatorProfile(validProfile, backend);

    const clearResult = await clearCreatorProfile(backend);
    expect(clearResult.ok).toBe(true);

    const loadResult = await loadCreatorProfile(backend);
    expect(loadResult.ok).toBe(true);
    if (loadResult.ok) {
      expect(loadResult.data).toBeNull();
    }
  });
});
