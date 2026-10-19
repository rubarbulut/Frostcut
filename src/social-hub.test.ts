import { describe, expect, it } from 'vitest';
import { createProject, changeAspectRatio } from './model';

describe('Social Media Hub', () => {
  it('correctly adapts project dimensions and fill modes for social formats', () => {
    const project = createProject('Viral TikTok', 'YouTube Shorts');
    expect(project.settings.width).toBe(1080);
    expect(project.settings.height).toBe(1920);

    // Switch to 1:1 Square
    const squareProject = changeAspectRatio(project, '1:1', 'blur-background');
    expect(squareProject.settings.width).toBe(1080);
    expect(squareProject.settings.height).toBe(1080);
    expect(squareProject.settings.aspectRatio).toBe('1:1');
    expect(squareProject.settings.fillMode).toBe('blur-background');

    // Switch to 16:9 Landscape
    const landscapeProject = changeAspectRatio(squareProject, '16:9', 'fit');
    expect(landscapeProject.settings.width).toBe(1920);
    expect(landscapeProject.settings.height).toBe(1080);
    expect(landscapeProject.settings.aspectRatio).toBe('16:9');
    expect(landscapeProject.settings.fillMode).toBe('fit');

    // Switch to 4:5 Portrait
    const portraitProject = changeAspectRatio(landscapeProject, '4:5', 'crop');
    expect(portraitProject.settings.width).toBe(1080);
    expect(portraitProject.settings.height).toBe(1350);
    expect(portraitProject.settings.aspectRatio).toBe('4:5');
    expect(portraitProject.settings.fillMode).toBe('crop');

    // Switch to 9:16 Vertical
    const verticalProject = changeAspectRatio(portraitProject, '9:16', 'blur-background');
    expect(verticalProject.settings.width).toBe(1080);
    expect(verticalProject.settings.height).toBe(1920);
    expect(verticalProject.settings.aspectRatio).toBe('9:16');
  });

  it('preserves caption safe area configuration', () => {
    const project = createProject('Reels Project', 'YouTube Shorts');
    expect(project.captions.safeArea).toBe(false);

    // Toggle on
    project.captions.safeArea = false;
    expect(project.captions.safeArea).toBe(false);

    // Toggle on
    project.captions.safeArea = true;
    expect(project.captions.safeArea).toBe(true);
  });

  it('scopes transcription windows strictly to visible/selected ranges instead of entire raw video', async () => {
    const { analysisWindows } = await import('./audio-analysis');
    
    // A 1-hour raw video (3600 seconds) would normally create 40 windows:
    const fullWindows = analysisWindows(3600);
    expect(fullWindows).toHaveLength(40);

    // When scoping to a 15-second selected clip (from 120s to 135s):
    const selectiveWindows = analysisWindows(3600, 90, [{ start: 120, end: 135 }]);
    expect(selectiveWindows).toHaveLength(1);
    expect(selectiveWindows[0].coreStart).toBe(120);
    expect(selectiveWindows[0].coreEnd).toBe(135);
    expect(selectiveWindows[0].start).toBe(119); // 1s acoustic overlap padding
    expect(selectiveWindows[0].duration).toBe(17);

    // When scoping to 2 timeline clips separated across the video:
    const multiClipWindows = analysisWindows(3600, 90, [
      { start: 10, end: 25 },
      { start: 1800, end: 1820 },
    ]);
    expect(multiClipWindows).toHaveLength(2);
    expect(multiClipWindows[0].coreStart).toBe(10);
    expect(multiClipWindows[1].coreStart).toBe(1800);
  });
});
