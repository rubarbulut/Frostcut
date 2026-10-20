import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CreatorPipeline } from './creator-pipeline';
import { createProject, addMedia, defaultProps, type Project } from '../model';
import type { CreatorProfile } from '../creator-recipe';
import * as renderAdapter from '../render-adapter';
import * as youtubePublisher from '../youtube-publisher';

function createSampleProject(): { project: Project; files: Map<string, File> } {
  const p = addMedia(createProject('Speedrun Clip', 'YouTube'), {
    id: 'asset-1',
    name: 'speedrun.mp4',
    duration: 60,
    width: 1920,
    height: 1080,
    size: 2000000,
    type: 'video/mp4',
  });
  p.clips = [
    {
      id: 'clip-1',
      mediaId: 'asset-1',
      trackId: 'V1',
      start: 0,
      sourceStart: 0,
      sourceEnd: 60,
      properties: { ...defaultProps },
    },
  ];

  const fakeFile = new File([new Uint8Array(2000000)], 'speedrun.mp4', { type: 'video/mp4' });
  const files = new Map<string, File>([['asset-1', fakeFile]]);

  return { project: p, files };
}

const sampleProfile: CreatorProfile = {
  version: 1,
  id: 'profile-main',
  name: 'Gaming Hub',
  language: 'en',
  game: 'Speedrunners',
  audience: 'Esports',
  commentary: 'unspecified',
  longTargetSeconds: 60,
  shortTargetSeconds: 30,
  shortCount: 2,
  fillMode: 'blur-background',
};

describe('CreatorPipeline Controller (B004-M)', () => {
  let pipeline: CreatorPipeline;

  beforeEach(() => {
    pipeline = new CreatorPipeline();
  });

  it('prepares candidate proposals and recipe successfully', async () => {
    const { project, files } = createSampleProject();
    const session = await pipeline.preparePlan(project, files, sampleProfile);

    expect(session.stage).toBe('reviewing');
    expect(session.proposals.length).toBeGreaterThanOrEqual(1);
    expect(session.recipe).not.toBeNull();
    expect(session.recipe?.outputs.length).toBeGreaterThanOrEqual(1);
    expect(pipeline.getSession()).toBe(session);
  });

  it('prevents concurrent preparePlan calls (double-click protection)', async () => {
    const { project, files } = createSampleProject();

    // Call preparePlan concurrently
    const p1 = pipeline.preparePlan(project, files, sampleProfile);
    const p2 = pipeline.preparePlan(project, files, sampleProfile);

    // Second call should either abort first or reject immediately if in preparing
    await expect(Promise.all([p1, p2])).rejects.toThrow();
  });

  it('supports cancellation and aborts active preparation cleanly', async () => {
    const { project, files } = createSampleProject();
    const abortCtrl = new AbortController();

    const prepPromise = pipeline.preparePlan(project, files, sampleProfile, {
      signal: abortCtrl.signal,
    });
    abortCtrl.abort('User cancelled plan generation');

    await expect(prepPromise).rejects.toThrow();
    expect(pipeline.getSession()?.stage).toBe('cancelled');
  });

  it('isolates edits between materialized outputs and preserves source files', async () => {
    const { project, files } = createSampleProject();
    const session = await pipeline.preparePlan(project, files, sampleProfile);

    const outputs = session.recipe!.outputs;
    expect(outputs.length).toBeGreaterThanOrEqual(1);

    const firstOutputId = outputs[0].id;
    const outputProject1 = pipeline.switchToOutput(firstOutputId);

    expect(outputProject1.id).not.toBe(project.id);
    expect(session.activeOutputId).toBe(firstOutputId);

    // Modify title on output 1
    const modifiedOutput1 = { ...outputProject1, name: 'Custom Output Title' };

    // Switch back to source
    const restoredSource = pipeline.returnToSource(modifiedOutput1);
    expect(session.activeOutputId).toBeNull();
    expect(restoredSource.name).toBe('Speedrun Clip');

    // Switch back to output 1 and verify edits were preserved
    const reloadedOutput1 = pipeline.switchToOutput(firstOutputId);
    expect(reloadedOutput1.name).toBe('Custom Output Title');
    // Source files must still be completely intact in session
    expect(session.sourceFiles.has('asset-1')).toBe(true);
  });

  it('detects stale recipe when source project or files change', async () => {
    const { project, files } = createSampleProject();
    await pipeline.preparePlan(project, files, sampleProfile);

    expect(pipeline.isCurrent(project, files)).toBe(true);

    // New file instance relinked
    const newFiles = new Map([
      ['asset-1', new File([new Uint8Array(100)], 'different.mp4', { type: 'video/mp4' })],
    ]);
    expect(pipeline.isCurrent(project, newFiles)).toBe(false);

    // Modified project edit
    const modifiedProject = { ...project, clips: [] };
    expect(pipeline.isCurrent(modifiedProject, files)).toBe(false);
  });

  it('skips redundant re-encoding when only publishing metadata changes', async () => {
    const { project, files } = createSampleProject();
    const session = await pipeline.preparePlan(project, files, sampleProfile);
    const outputId = session.recipe!.outputs[0].id;

    const mockArtifact: renderAdapter.RenderArtifact = {
      blob: new Blob(['fake video content'], { type: 'video/mp4' }),
      mimeType: 'video/mp4',
      sizeBytes: 1000,
      outputId,
      videoRevision: 'rev_test_rev',
      renderEngineUsed: 'turbo',
      renderedAt: new Date().toISOString(),
      exportSettings: { ...project.exportSettings },
    };

    const executeSpy = vi
      .spyOn(renderAdapter, 'executeRenderJob')
      .mockResolvedValueOnce(mockArtifact);

    const revSpy = vi
      .spyOn(renderAdapter, 'computeProjectVideoRevision')
      .mockReturnValue('rev_test_rev');

    // First render
    const artifact1 = await pipeline.renderOutput(outputId);
    expect(executeSpy).toHaveBeenCalledOnce();
    expect(artifact1.sizeBytes).toBe(1000);

    // Update only publishing title on output
    const outProj = pipeline.materializeOutput(outputId);
    pipeline.switchToOutput(outputId, {
      ...outProj,
      publishing: { title: 'New SEO Title', description: 'Updated', hashtags: '#viral' },
    });

    // Second render with unchanged video revision -> should skip re-encode!
    const progressFn = vi.fn();
    const artifact2 = await pipeline.renderOutput(outputId, { onProgress: progressFn });

    expect(executeSpy).toHaveBeenCalledOnce(); // Not called a second time!
    expect(artifact2).toBe(artifact1);
    expect(progressFn).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('up-to-date') }),
    );

    executeSpy.mockRestore();
    revSpy.mockRestore();
  });

  it('publishes rendered output and enforces video revision matching', async () => {
    const { project, files } = createSampleProject();
    const session = await pipeline.preparePlan(project, files, sampleProfile);
    const outputId = session.recipe!.outputs[0].id;

    // Attempting to publish without rendering fails
    await expect(
      pipeline.publishOutput(outputId, { title: 'Test' }, { accessToken: 'token' }),
    ).rejects.toThrow(/render the video before publishing/);

    // Provide pre-rendered artifact
    const mockArtifact: renderAdapter.RenderArtifact = {
      blob: new Blob(['fake video content'], { type: 'video/mp4' }),
      mimeType: 'video/mp4',
      sizeBytes: 1000,
      outputId,
      videoRevision: 'rev_matching_rev',
      renderEngineUsed: 'turbo',
      renderedAt: new Date().toISOString(),
      exportSettings: { ...project.exportSettings },
    };
    session.renderArtifacts.set(outputId, mockArtifact);

    const revSpy = vi
      .spyOn(renderAdapter, 'computeProjectVideoRevision')
      .mockReturnValue('rev_matching_rev');

    const publishSpy = vi
      .spyOn(youtubePublisher, 'publishVideoToYouTube')
      .mockResolvedValueOnce({
        videoId: 'dQw4w9WgXcQ',
        url: 'https://youtu.be/dQw4w9WgXcQ',
        title: 'Uploaded Video',
        privacyStatus: 'private',
        uploadedAt: new Date().toISOString(),
        processingStatus: 'uploaded',
        rawResponse: {},
      });

    const result = await pipeline.publishOutput(
      outputId,
      { title: 'Uploaded Video' },
      { accessToken: 'valid_token' },
    );

    expect(result.videoId).toBe('dQw4w9WgXcQ');
    expect(session.stage).toBe('uploaded');

    publishSpy.mockRestore();
    revSpy.mockRestore();
  });
});
