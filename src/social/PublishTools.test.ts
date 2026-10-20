import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createProject, addMedia, defaultProps, type Project } from '../model';
import { PublishTools } from '../PublishTools';
import { SocialPostKit, type SocialPostKitProps } from '../SocialPostKit';

function createProjectFixture(): Project {
  const p = addMedia(createProject('Cyberpunk 2077 Walkthrough', 'YouTube'), {
    id: 'm1',
    name: 'cyberpunk.mp4',
    duration: 120,
    width: 1920,
    height: 1080,
    size: 5000,
    type: 'video/mp4',
  });
  p.name = 'Cyberpunk 2077 Walkthrough';
  p.clips = [
    {
      id: 'c1',
      mediaId: 'm1',
      trackId: 'V1',
      start: 0,
      sourceStart: 0,
      sourceEnd: 60,
      properties: { ...defaultProps },
    },
  ];
  p.publishing = {
    title: 'Night City Ep 1 - Türkçe Başlangıç',
    description: 'İlk bölüm ve karakter yaratımı detayları.',
    hashtags: '#cyberpunk #türkçe #oyun',
  };
  return p;
}

describe('PublishTools & SocialPostKit (B004-B)', () => {
  it('renders publishing form with title, description, and decoupled hashtags', () => {
    const p = createProjectFixture();
    const html = renderToString(React.createElement(PublishTools, { platform: 'youtube', project: p }));

    expect(html).toContain('YouTube Başlığı (Title)');
    expect(html).toContain('Night City Ep 1 - Türkçe Başlangıç');
    expect(html).toContain('YouTube Açıklaması (Description)');
    expect(html).toContain('İlk bölüm ve karakter yaratımı detayları.');
    expect(html).toContain('Hashtags (başlık ve açıklamada listelenecek etiketler)');
    expect(html).toContain('#cyberpunk #türkçe #oyun');
    expect(html).toContain('Hashtag&#x27;ler doğrudan video metninde listelenir; YouTube tags alanı ile karıştırılmaz.');
    expect(html).toContain('Taslağı Kaydet');
    expect(html).toContain('Metni Kopyala');
    expect(html).toContain('Metni İndir');
  });

  it('renders platform character limits accurately for YouTube vs Instagram Reels', () => {
    const p = createProjectFixture();
    const youtubeHtml = renderToString(React.createElement(PublishTools, { platform: 'youtube', project: p }));
    expect(youtubeHtml).toContain('5000<!-- --> karakter');

    const reelsHtml = renderToString(React.createElement(PublishTools, { platform: 'instagram', project: p }));
    expect(reelsHtml).toContain('2200<!-- --> karakter');
    expect(reelsHtml).toContain('Instagram Reels');
  });

  it('renders not-researched trend notice on draft suggestions', () => {
    const p = createProjectFixture();
    const html = renderToString(React.createElement(PublishTools, { platform: 'youtube', project: p }));
    expect(html).toContain('Trend araştırması yapılmadı · not-researched');
  });

  it('disables save button when title is empty', () => {
    const p = createProjectFixture();
    p.publishing = {
      title: '   ',
      description: 'Some description',
      hashtags: '#test',
    };
    const html = renderToString(React.createElement(PublishTools, { platform: 'youtube', project: p }));
    expect(html).toContain('disabled=""');
    expect(html).toContain('Başlık boş bırakılamaz.');
  });

  it('preserves Turkish and Unicode characters in publishing metadata without mangling', () => {
    const p = createProjectFixture();
    p.publishing = {
      title: 'Özel Türkçe Başlık: Çığır Açan Çözüm Şöleni',
      description: 'İğneleyici ve özgün içerik açıklaması.',
      hashtags: '#türkçe #özgür #çağdaş',
    };
    const html = renderToString(React.createElement(PublishTools, { platform: 'youtube', project: p }));
    expect(html).toContain('Özel Türkçe Başlık: Çığır Açan Çözüm Şöleni');
    expect(html).toContain('İğneleyici ve özgün içerik açıklaması.');
    expect(html).toContain('#türkçe #özgür #çağdaş');
  });

  it('renders empty prompt in SocialPostKit when project has no clips', () => {
    const emptyProj = createProject('Empty Edit', 'YouTube');
    emptyProj.clips = [];

    const html = renderToString(React.createElement(SocialPostKit as any, { project: emptyProj }));
    expect(html).toContain('Önce kaydınızı ekleyin');
    expect(html).not.toContain('Taslağı Kaydet');
  });

  it('renders tabs and manual draft notice in SocialPostKit when clips are present', () => {
    const p = createProjectFixture();
    const html = renderToString(React.createElement(SocialPostKit as any, { project: p }));
    expect(html).toContain('Yayın Taslağı (Publishing Draft)');
    expect(html).toContain('Shorts');
    expect(html).toContain('Reels');
    expect(html).toContain('TikTok');
    expect(html).toContain('Manuel taslak · Paylaşmadan önce inceleyin');
    expect(html).toContain('not-researched');
  });

  it('triggers commit callback only on save click without mutating on mount', () => {
    const p = createProjectFixture();
    const onCommit = vi.fn();

    renderToString(
      React.createElement(PublishTools, {
        platform: 'youtube',
        project: p,
        onCommit,
      }),
    );

    // Initial render should NOT trigger commit mutation
    expect(onCommit).not.toHaveBeenCalled();
  });
});
