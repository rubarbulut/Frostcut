import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { addMedia, createProject, defaultProps, duration } from '../model';
import { newAdjustment } from '../adjustments';
import { defaultChroma } from '../visual-effects';
import { useEditor } from '../store';
import {
  RecipeReviewScreen,
  buildDefaultProposals,
  DEFAULT_CREATOR_PROFILE,
} from './RecipeReviewScreen';
import {
  createCreatorRecipe,
  materializeCreatorOutput,
  type CreatorProfile,
  type CreatorProposal,
} from '../creator-recipe';
import type { CandidateEvidence } from './candidate-finder';

const profile: CreatorProfile = {
  version: 1,
  id: 'channel-test-profile',
  name: 'Test Gaming Channel',
  game: 'Cyberpunk 2077',
  language: 'tr',
  audience: 'Turkish gaming viewers',
  commentary: 'unspecified',
  longTargetSeconds: 600,
  shortTargetSeconds: 45,
  shortCount: 2,
  fillMode: 'blur-background',
};

const proposals: readonly CreatorProposal[] = [
  {
    id: 'long-story',
    name: 'Main Mission Gameplay',
    kind: 'youtube-long',
    ranges: [
      { start: 0, end: 5 },
      { start: 6, end: 10 },
    ],
    reason: 'Full mission setup and boss battle climax.',
  },
  {
    id: 'short-highlight',
    name: 'Boss Battle Finisher',
    kind: 'youtube-short',
    ranges: [{ start: 6, end: 10 }],
    reason: 'Combat finisher moment (6s to 10s).',
  },
];

function createTestFixture() {
  const p = addMedia(createProject('Cyberpunk Session', 'YouTube'), {
    id: 'game-video',
    name: 'gameplay.mp4',
    duration: 60,
    width: 1920,
    height: 1080,
    size: 1024,
    type: 'video/mp4',
  });
  p.tracks.find((track) => track.id === 'V2')!.name = 'Overlay';
  p.media.push({
    id: 'bg-music',
    name: 'music.mp3',
    duration: 60,
    width: 1,
    height: 1,
    size: 512,
    type: 'audio/mpeg',
  });
  p.clips = [
    {
      id: 'clip-1',
      mediaId: 'game-video',
      trackId: 'V1',
      start: 0,
      sourceStart: 10,
      sourceEnd: 30,
      properties: { ...defaultProps, speed: 2, volume: 0.8 },
      voiceEnhance: true,
      captionWords: [
        { id: 'w1', text: 'Critical strike!', start: 12, end: 14, speakerId: 'spk1' },
      ],
    },
    {
      id: 'clip-overlay',
      mediaId: 'game-video',
      trackId: 'V2',
      start: 0,
      sourceStart: 0,
      sourceEnd: 10,
      properties: { ...defaultProps, opacity: 0.5 },
      effects: { chroma: defaultChroma() },
    },
    {
      id: 'clip-audio',
      mediaId: 'bg-music',
      trackId: 'A1',
      start: 0,
      sourceStart: 0,
      sourceEnd: 30,
      properties: { ...defaultProps, volume: 0.3 },
      audioRole: 'music',
      autoDuck: true,
    },
  ];
  p.adjustments = [newAdjustment(0, 10)];
  const files = new Map([
    ['game-video', new File(['video-data'], 'gameplay.mp4')],
    ['bg-music', new File(['music-data'], 'music.mp3')],
  ]);
  return { p, files };
}

describe('RecipeReviewScreen (B004-B)', () => {
  it('renders Long (16:9) and Short (9:16) draft cards on a single review screen', () => {
    const { p, files } = createTestFixture();
    const html = renderToString(
      React.createElement(RecipeReviewScreen, {
        isOpen: true,
        onClose: () => {},
        project: p,
        sourceFiles: files,
        profile,
        proposals,
        onApplyProject: () => {},
      }),
    );

    // Header & Channel profile badges
    expect(html).toContain('Creator Recipe İnceleme Ekranı');
    expect(html).toContain('Test Gaming Channel');
    expect(html).toContain('Cyberpunk 2077');
    expect(html).toContain('TR');

    // Fill mode selector
    expect(html).toContain('Dikey / Yatay Kadraj Doldurma Modu');
    expect(html).toContain('Blur Background');
    expect(html).toContain('Fit (Sığdır / Letterbox)');
    expect(html).toContain('Crop (Kırp / Doldur)');

    // Long output card (16:9)
    expect(html).toContain('16:9 Long');
    expect(html).toContain('Main Mission Gameplay');
    expect(html).toContain('Full mission setup and boss battle climax.');

    // Short output card (9:16)
    expect(html).toContain('9:16 Short');
    expect(html).toContain('Boss Battle Finisher');
    expect(html).toContain('Combat finisher moment (6s to 10s).');

    // Action buttons
    expect(html).toContain('Onayla ve Projeye Yükle');
    expect(html).toContain('İptal');
  });

  it('does not render when isOpen is false', () => {
    const { p, files } = createTestFixture();
    const html = renderToString(
      React.createElement(RecipeReviewScreen, {
        isOpen: false,
        onClose: () => {},
        project: p,
        sourceFiles: files,
        profile,
        proposals,
      }),
    );

    expect(html).toBe('');
  });

  it('does not mutate global store when opening modal', () => {
    const { p, files } = createTestFixture();
    useEditor.getState().load(p);

    const initialHistoryLength = useEditor.getState().past.length;
    const initialProject = useEditor.getState().project;

    renderToString(
      React.createElement(RecipeReviewScreen, {
        isOpen: true,
        onClose: () => {},
        project: initialProject,
        sourceFiles: files,
        profile,
        proposals,
      }),
    );

    expect(useEditor.getState().past.length).toBe(initialHistoryLength);
    expect(useEditor.getState().project).toBe(initialProject);
  });

  it('renders graceful error banner without crashing if media files are unlinked', () => {
    const { p } = createTestFixture();
    const emptyFiles = new Map<string, File>();

    const html = renderToString(
      React.createElement(RecipeReviewScreen, {
        isOpen: true,
        onClose: () => {},
        project: p,
        sourceFiles: emptyFiles,
        profile,
        proposals,
      }),
    );

    expect(html).toContain('Relink the original sources');
    expect(html).toContain('disabled');
  });

  it('builds canonical default proposals with equal-parts labeling without fake AI hook claims', () => {
    const { p } = createTestFixture();
    const defaultProposals = buildDefaultProposals(p, profile);

    expect(defaultProposals.length).toBeGreaterThanOrEqual(2);
    const longProp = defaultProposals.find((x) => x.kind === 'youtube-long');
    const shortProp = defaultProposals.find((x) => x.kind === 'youtube-short');

    expect(longProp).toBeDefined();
    expect(shortProp).toBeDefined();
    expect(longProp?.ranges[0].start).toBe(0);
    expect(longProp?.ranges[0].end).toBe(duration(p));

    // Verify absence of fake marketing claims
    expect(shortProp?.reason).not.toContain('Hook & key highlight');
    expect(shortProp?.reason).not.toContain('AI highlight');
    expect(shortProp?.reason).toContain('equal-parts');
  });

  it('renders candidate evidence metadata and signal tags when evidence is provided', () => {
    const { p, files } = createTestFixture();

    const mockEvidence: ReadonlyMap<string, CandidateEvidence> = new Map([
      [
        'short-highlight',
        {
          proposalId: 'short-highlight',
          method: 'signals',
          signalsUsed: ['audio-activity', 'motion-tracking'],
          timelineRanges: [{ start: 6, end: 10 }],
          unavailableSignals: ['transcript'],
          algorithmVersion: 'v1.0.0',
          explanation: 'High audio energy and visual activity detected near boss finisher.',
          targetSeconds: 45,
          actualSeconds: 4,
        },
      ],
    ]);

    const html = renderToString(
      React.createElement(RecipeReviewScreen, {
        isOpen: true,
        onClose: () => {},
        project: p,
        sourceFiles: files,
        profile,
        proposals,
        evidence: mockEvidence,
        onApplyProject: () => {},
      }),
    );

    expect(html).toContain('evidence-method-tag signals');
    expect(html).toContain('audio-activity, motion-tracking');
    expect(html).toContain('High audio energy and visual activity');
    expect(html).toContain('Eksik analiz: <!-- -->transcript');
  });

  it('disables actions and renders loading indicator when isProcessing is true', () => {
    const { p, files } = createTestFixture();

    const html = renderToString(
      React.createElement(RecipeReviewScreen, {
        isOpen: true,
        onClose: () => {},
        project: p,
        sourceFiles: files,
        profile,
        proposals,
        isProcessing: true,
        onApplyProject: () => {},
      }),
    );

    expect(html).toContain('İşleniyor...');
    expect(html).toContain('disabled=""');
  });

  it('materializes Long (16:9) and Short (9:16) projects adhering to Codex recipe contract', () => {
    const { p, files } = createTestFixture();
    const recipe = createCreatorRecipe(p, files, profile, proposals);

    // Materialize Long output
    const longProject = materializeCreatorOutput(recipe, p, files, 'long-story');
    expect(longProject.settings.width).toBe(1920);
    expect(longProject.settings.height).toBe(1080);
    expect(duration(longProject)).toBe(9); // 5 + 4 = 9 seconds
    expect(longProject.name).toBe('Main Mission Gameplay');

    // Materialize Short output
    const shortProject = materializeCreatorOutput(recipe, p, files, 'short-highlight');
    expect(shortProject.settings.width).toBe(1080);
    expect(shortProject.settings.height).toBe(1920);
    expect(duration(shortProject)).toBe(4); // 10 - 6 = 4 seconds
    expect(shortProject.name).toBe('Boss Battle Finisher');
  });

  it('supports export draft action button when onExportDraft is provided', () => {
    const { p, files } = createTestFixture();
    const onExport = vi.fn();

    const html = renderToString(
      React.createElement(RecipeReviewScreen, {
        isOpen: true,
        onClose: () => {},
        project: p,
        sourceFiles: files,
        profile,
        proposals,
        onExportDraft: onExport,
      }),
    );

    expect(html).toContain('Dışa Aktar');
  });

  it('hides export draft action button when onExportDraft is not provided', () => {
    const { p, files } = createTestFixture();

    const html = renderToString(
      React.createElement(RecipeReviewScreen, {
        isOpen: true,
        onClose: () => {},
        project: p,
        sourceFiles: files,
        profile,
        proposals,
        onExportDraft: undefined,
      }),
    );

    expect(html).not.toContain('Dışa Aktar');
  });
});
