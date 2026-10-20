import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import CreatorTools, { CREATOR_TOOLS_CATALOG } from './CreatorTools';
import { createProject } from './model';
import { useEditor } from './store';

describe('Creator Studio Pro UX & Layout Suite', () => {
  it('maintains catalog integrity for all 12 creator tools across 3 workflow categories', () => {
    expect(CREATOR_TOOLS_CATALOG.length).toBe(12);

    const requiredIds = [
      'Reframe',
      'Split',
      'Parts',
      'Chapters',
      'Subtitles',
      'Brand kit',
      'B-roll',
      'Style memory',
      'Publish',
      'Discover',
      'Analytics',
      'Batch export',
    ];

    for (const id of requiredIds) {
      const tool = CREATOR_TOOLS_CATALOG.find((t) => t.id === id);
      expect(tool).toBeDefined();
      expect(tool!.name.length).toBeGreaterThan(0);
      expect(tool!.subtitle.length).toBeGreaterThan(0);
      expect(tool!.proTip.length).toBeGreaterThan(15);
      expect(tool!.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(['cut', 'style', 'publish']).toContain(tool!.category);
    }
  });

  it('renders Creator Studio Pro layout with luxury header, categorized sidebar, and inspirational pro-tips', () => {
    const p = createProject();
    useEditor.getState().load(p);

    const html = renderToString(
      React.createElement(CreatorTools, {
        onClose: () => {},
        initialTab: 'Reframe',
      }),
    );

    // Verify Studio Luxury Topbar
    expect(html).toContain('Creator Studio Pro');
    expect(html).toContain('SUITE');
    expect(html).toContain('Viral Kurgu, Biçimlendirme &amp; Yayınlama Paketi');

    // Verify Categorized Sidebar
    expect(html).toContain('Viral Kurgu &amp; Format');
    expect(html).toContain('Görsel &amp; Marka Stili');
    expect(html).toContain('Yayın &amp; Büyüme');

    // Verify Search Box
    expect(html).toContain('creator-studio-search-input');
    expect(html).toContain('Ara... (örn. altyazı, reframe)');

    // Verify Active Hero Banner for Reframe
    expect(html).toContain('Auto Reframe');
    expect(html).toContain('AI VIRAL');
    expect(html).toContain('Creator Tavsiyesi:');
    expect(html).toContain('akıllı yüz ve hareket takibiyle');

    // Verify active tool body is rendered
    expect(html).toContain('creator-studio-tool-body');
  });

  it('switches initial tab to Subtitles and reflects styling and pro-tips accurately', () => {
    const p = createProject();
    useEditor.getState().load(p);

    const html = renderToString(
      React.createElement(CreatorTools, {
        onClose: () => {},
        initialTab: 'Subtitles',
      }),
    );

    // Active tool should be Captions & Subtitles
    expect(html).toContain('Captions &amp; Subtitles');
    expect(html).toContain('HOT');
    expect(html).toContain('Videoların %80&#x27;i mobilde sessiz izlenir');
  });

  it('switches initial tab to Publish and renders metadata distribution platform', () => {
    const p = createProject();
    useEditor.getState().load(p);

    const html = renderToString(
      React.createElement(CreatorTools, {
        onClose: () => {},
        initialTab: 'Publish',
      }),
    );

    expect(html).toContain('Publish &amp; Metadata');
    expect(html).toContain('YouTube, TikTok &amp; Reels');
    expect(html).toContain('AUTO');
    expect(html).toContain('Videonuzun başlık, açıklama ve etiketlerini');
  });
});
