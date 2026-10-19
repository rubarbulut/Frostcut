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
});
