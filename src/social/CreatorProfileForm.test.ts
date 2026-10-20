import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { CreatorProfileForm } from './CreatorProfileForm';
import {
  createMemoryProfileStorageBackend,
  DEFAULT_CREATOR_PROFILE,
} from './profile-storage';
import type { CreatorProfile } from '../creator-recipe';

describe('CreatorProfileForm (B004-B)', () => {
  it('renders all canonical fields with accessible labels', () => {
    const html = renderToString(
      React.createElement(CreatorProfileForm, {
        initialProfile: DEFAULT_CREATOR_PROFILE,
        autoLoad: false,
      }),
    );

    expect(html).toContain('Kanal ve İçerik Profili (CreatorProfile)');
    expect(html).toContain('Kanal / Profil Adı:');
    expect(html).toContain('İçerik Dili (ISO Kodu):');
    expect(html).toContain('Oyun / Kategori:');
    expect(html).toContain('Hedef Kitle Açıklaması:');
    expect(html).toContain('Yorum &amp; Ses Tarzı (Commentary):');
    expect(html).toContain('Kadraj Doldurma Modu (Fill Mode):');
    expect(html).toContain('Uzun Video Hedef Süresi (sn):');
    expect(html).toContain('Short Hedef Süresi (sn, maks 180):');
    expect(html).toContain('Üretilecek Short Sayısı (0 - 12):');
    expect(html).toContain('Profili Kaydet');
  });

  it('renders shortCount = 0 correctly and preserves 0 in value', () => {
    const zeroShortProfile: CreatorProfile = {
      ...DEFAULT_CREATOR_PROFILE,
      shortCount: 0,
    };

    const html = renderToString(
      React.createElement(CreatorProfileForm, {
        initialProfile: zeroShortProfile,
        autoLoad: false,
      }),
    );

    expect(html).toContain('value="0"');
    expect(html).toContain('0 seçilirse sadece uzun format video üretilir.');
  });

  it('renders commentary = "unspecified" correctly', () => {
    const html = renderToString(
      React.createElement(CreatorProfileForm, {
        initialProfile: { ...DEFAULT_CREATOR_PROFILE, commentary: 'unspecified' },
        autoLoad: false,
      }),
    );

    expect(html).toContain('value="unspecified" selected=""');
    expect(html).toContain('Belirtilmemiş (Unspecified)');
  });
});
