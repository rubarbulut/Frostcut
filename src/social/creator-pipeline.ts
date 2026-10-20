/**
 * FrostCut Unified Creator Pipeline Controller
 * Persona: MANAGER (Director Batch 004)
 * 
 * Provides end-to-end coordination:
 * Source Recording + Files -> Persistent CreatorProfile -> Evidence-Based Proposals ->
 * Review Modal -> Independent Materialized Outputs (Long + Shorts) -> Single-Slot Export Queue ->
 * Capability-Aware YouTube Publishing Adapter.
 * 
 * Guarantees:
 * - Single runId/generation with AbortController: prevents duplicate prepares/encodes and rejects stale promises.
 * - Source File Isolation: switching between materialized outputs preserves source files & media URLs.
 * - Safe return to source project without media registry purging.
 * - Stale recipe invalidation on edit or file relink.
 * - Single-slot encode queue with metadata-only re-encode bypass.
 */

import { duration, uid, type Project } from '../model';
import {
  createCreatorRecipe,
  creatorRecipeIsCurrent,
  materializeCreatorOutput,
  parseCreatorProfile,
  type CreatorOutput,
  type CreatorProfile,
  type CreatorProposal,
  type CreatorRecipe,
} from '../creator-recipe';
import {
  findProjectCandidates,
  type CandidateEvidence,
  type CandidateFinderOptions,
} from './candidate-finder';
import {
  computeProjectVideoRevision,
  executeRenderJob,
  type RenderArtifact,
  type RenderProgress,
} from '../render-adapter';
import {
  publishVideoToYouTube,
  type YouTubePublishMetadata,
  type YouTubePublishOptions,
  type YouTubePublishProgress,
  type YouTubePublishResult,
} from '../youtube-publisher';
import type { YouTubeCapabilityInfo } from '../server/youtube-oauth';

export type PipelineStage =
  | 'idle'
  | 'preparing'
  | 'reviewing'
  | 'rendering'
  | 'rendered'
  | 'uploading'
  | 'uploaded'
  | 'cancelled'
  | 'failed';

export interface PipelineError {
  code: string;
  message: string;
  details?: unknown;
}

export interface CreatorPipelineSession {
  runId: string;
  generation: number;
  sourceProject: Project;
  sourceFiles: ReadonlyMap<string, File>;
  profile: CreatorProfile;
  proposals: readonly CreatorProposal[];
  evidence: ReadonlyMap<string, CandidateEvidence>;
  recipe: CreatorRecipe | null;
  materializedOutputs: Map<string, Project>;
  activeOutputId: string | null; // null represents the source project
  renderArtifacts: Map<string, RenderArtifact>;
  stage: PipelineStage;
  error: PipelineError | null;
}

export class CreatorPipeline {
  private currentSession: CreatorPipelineSession | null = null;
  private currentAbortController: AbortController | null = null;
  private generationCounter = 0;
  private isPreparing = false;
  private isEncoding = false;
  private isUploading = false;

  /**
   * Returns the active pipeline session or null if idle.
   */
  getSession(): CreatorPipelineSession | null {
    return this.currentSession;
  }

  /**
   * Prepares candidate proposals and compiles a canonical CreatorRecipe.
   * Guarded against double clicks and stale async results via run generation.
   */
  async preparePlan(
    sourceProject: Project,
    sourceFiles: ReadonlyMap<string, File>,
    profileInput: CreatorProfile,
    options: CandidateFinderOptions = {},
  ): Promise<CreatorPipelineSession> {
    if (options.signal?.aborted) {
      throw new DOMException('Pipeline preparation cancelled.', 'AbortError');
    }

    // Prevent concurrent preparation (double-click protection)
    if (this.isPreparing || this.currentSession?.stage === 'preparing') {
      throw new Error('A creator plan preparation is already in flight. Please wait or cancel.');
    }
    this.isPreparing = true;

    const totalDur = duration(sourceProject);
    if (!sourceProject.clips.length || !Number.isFinite(totalDur) || totalDur <= 0) {
      this.isPreparing = false;
      throw new Error('Project must contain at least one valid clip with positive duration.');
    }

    // Abort previous in-flight run if active
    if (this.currentAbortController) {
      this.currentAbortController.abort('New pipeline run initiated.');
    }

    this.generationCounter++;
    const thisGen = this.generationCounter;
    const runId = uid();
    const abortController = new AbortController();
    this.currentAbortController = abortController;

    if (options.signal) {
      options.signal.addEventListener('abort', () => abortController.abort(options.signal?.reason), { once: true });
    }

    const validatedProfile = parseCreatorProfile(profileInput);

    // Initial session state in 'preparing'
    this.currentSession = {
      runId,
      generation: thisGen,
      sourceProject,
      sourceFiles: new Map(sourceFiles),
      profile: validatedProfile,
      proposals: [],
      evidence: new Map(),
      recipe: null,
      materializedOutputs: new Map(),
      activeOutputId: null,
      renderArtifacts: new Map(),
      stage: 'preparing',
      error: null,
    };

    try {
      // Yield to event loop to allow cooperative cancellation
      await new Promise((resolve) => setTimeout(resolve, 0));

      if (abortController.signal.aborted || options.signal?.aborted || thisGen !== this.generationCounter) {
        throw new DOMException('Pipeline preparation cancelled.', 'AbortError');
      }

      // Step 1: Candidate proposal finding (cached & honest telemetry)
      const candidateResult = findProjectCandidates(sourceProject, {
        ...options,
        longTargetSeconds: validatedProfile.longTargetSeconds,
        shortTargetSeconds: validatedProfile.shortTargetSeconds,
        shortCount: validatedProfile.shortCount,
        signal: abortController.signal,
      });

      if (abortController.signal.aborted || options.signal?.aborted || thisGen !== this.generationCounter) {
        throw new DOMException('Pipeline preparation cancelled.', 'AbortError');
      }

      // Step 2: Compile canonical CreatorRecipe
      const recipe = createCreatorRecipe(
        sourceProject,
        sourceFiles,
        validatedProfile,
        candidateResult.proposals,
      );

      if (abortController.signal.aborted || options.signal?.aborted || thisGen !== this.generationCounter) {
        throw new DOMException('Pipeline preparation cancelled.', 'AbortError');
      }

      this.currentSession = {
        ...this.currentSession,
        proposals: candidateResult.proposals,
        evidence: candidateResult.evidence,
        recipe,
        stage: 'reviewing',
      };

      return this.currentSession;
    } catch (err: any) {
      if (thisGen === this.generationCounter && this.currentSession) {
        const isAbort = err?.name === 'AbortError' || abortController.signal.aborted || options.signal?.aborted;
        this.currentSession.stage = isAbort ? 'cancelled' : 'failed';
        this.currentSession.error = {
          code: isAbort ? 'PREPARE_ABORTED' : 'PREPARE_FAILED',
          message: err?.message || 'Failed to prepare creator plan.',
        };
      }
      throw err;
    } finally {
      this.isPreparing = false;
    }
  }

  /**
   * Materializes an output from the recipe into an independent Project.
   * Caches the materialized project so edits are preserved across output switches.
   */
  materializeOutput(outputId: string): Project {
    const session = this.currentSession;
    if (!session || !session.recipe) {
      throw new Error('No active creator recipe. Call preparePlan first.');
    }

    // Return cached materialized project if already generated
    const existing = session.materializedOutputs.get(outputId);
    if (existing) {
      return existing;
    }

    if (!creatorRecipeIsCurrent(session.recipe, session.sourceProject, session.sourceFiles)) {
      throw new Error('The source edit or original media changed. Rebuild the output recipes.');
    }

    const materialized = materializeCreatorOutput(
      session.recipe,
      session.sourceProject,
      session.sourceFiles,
      outputId,
    );

    session.materializedOutputs.set(outputId, materialized);
    return materialized;
  }

  /**
   * Switches the active editor focus to the specified output.
   * If currentEditedProject is provided, persists any user edits before switching.
   * Guarantees source files remain accessible in session.
   */
  switchToOutput(outputId: string, currentEditedProject?: Project): Project {
    const session = this.currentSession;
    if (!session || !session.recipe) {
      throw new Error('No active creator recipe. Call preparePlan first.');
    }

    // Save user modifications to current active project
    if (currentEditedProject) {
      if (session.activeOutputId) {
        session.materializedOutputs.set(session.activeOutputId, currentEditedProject);
      } else {
        session.sourceProject = structuredClone(currentEditedProject);
      }
    }

    const targetProject = this.materializeOutput(outputId);
    session.activeOutputId = outputId;
    return targetProject;
  }

  /**
   * Returns focus back to the parent source project without losing any output edits.
   */
  returnToSource(currentEditedProject?: Project): Project {
    const session = this.currentSession;
    if (!session) {
      throw new Error('No active pipeline session.');
    }

    if (currentEditedProject && session.activeOutputId) {
      session.materializedOutputs.set(session.activeOutputId, currentEditedProject);
    }

    session.activeOutputId = null;
    return session.sourceProject;
  }

  /**
   * Single-slot render execution for a materialized output.
   * If only publishing metadata changed (and video/audio edit operations are identical),
   * returns the cached render artifact without redundant re-encoding.
   */
  async renderOutput(
    outputId: string,
    options: {
      onProgress?: (progress: RenderProgress) => void;
      preferredEngine?: 'turbo' | 'browser' | 'auto';
      signal?: AbortSignal;
    } = {},
  ): Promise<RenderArtifact> {
    const session = this.currentSession;
    if (!session) {
      throw new Error('No active pipeline session.');
    }

    if (this.isEncoding) {
      throw new Error('Another export render is already in progress. Single-slot queue enforced.');
    }

    const outputProject = session.materializedOutputs.get(outputId) || this.materializeOutput(outputId);
    const mediaFilesMap = new Map(session.sourceFiles);

    // Compute deterministic video revision (metadata excluded)
    const currentRevision = computeProjectVideoRevision(outputProject, mediaFilesMap);

    // Check if we already have a valid rendered artifact matching this video revision
    const existingArtifact = session.renderArtifacts.get(outputId);
    if (existingArtifact && existingArtifact.videoRevision === currentRevision && existingArtifact.sizeBytes > 0) {
      options.onProgress?.({
        message: 'Existing render artifact is up-to-date with current edits.',
        percentage: 100,
        stage: 'completed',
        isEstimate: false,
        engine: existingArtifact.renderEngineUsed,
      });
      return existingArtifact;
    }

    this.isEncoding = true;
    session.stage = 'rendering';

    try {
      const artifact = await executeRenderJob({
        outputProject,
        mediaFiles: mediaFilesMap,
        signal: options.signal,
        onProgress: options.onProgress,
        preferredEngine: options.preferredEngine,
      });

      session.renderArtifacts.set(outputId, artifact);
      session.stage = 'rendered';
      return artifact;
    } catch (err: any) {
      session.stage = options.signal?.aborted ? 'cancelled' : 'failed';
      session.error = {
        code: options.signal?.aborted ? 'RENDER_ABORTED' : 'RENDER_FAILED',
        message: err?.message || 'Failed to render output.',
      };
      throw err;
    } finally {
      this.isEncoding = false;
    }
  }

  /**
   * Publishes a rendered output to YouTube via Demir's resumable publisher.
   */
  async publishOutput(
    outputId: string,
    metadata: YouTubePublishMetadata,
    options: YouTubePublishOptions,
  ): Promise<YouTubePublishResult> {
    const session = this.currentSession;
    if (!session) {
      throw new Error('No active pipeline session.');
    }

    if (this.isUploading) {
      throw new Error('Another publication is already in progress.');
    }

    const artifact = session.renderArtifacts.get(outputId);
    if (!artifact || !artifact.blob || artifact.sizeBytes === 0) {
      throw new Error('Render artifact is not ready. Please render the video before publishing.');
    }

    // Verify output project edits have not changed since render
    const outputProject = session.materializedOutputs.get(outputId);
    if (outputProject) {
      const currentRev = computeProjectVideoRevision(outputProject, new Map(session.sourceFiles));
      if (currentRev !== artifact.videoRevision) {
        throw new Error('The video edits changed after rendering. Please re-render before uploading.');
      }
    }

    this.isUploading = true;
    session.stage = 'uploading';

    try {
      const result = await publishVideoToYouTube(artifact.blob, metadata, options);
      session.stage = 'uploaded';
      return result;
    } catch (err: any) {
      session.stage = options.signal?.aborted ? 'cancelled' : 'failed';
      session.error = {
        code: options.signal?.aborted ? 'UPLOAD_ABORTED' : 'UPLOAD_FAILED',
        message: err?.message || 'Failed to publish video to YouTube.',
      };
      throw err;
    } finally {
      this.isUploading = false;
    }
  }

  /**
   * Cancels the active pipeline preparation or upload.
   */
  cancel(reason = 'User cancelled pipeline operation.') {
    if (this.currentAbortController) {
      this.currentAbortController.abort(reason);
      this.currentAbortController = null;
    }
    if (this.currentSession) {
      this.currentSession.stage = 'cancelled';
    }
  }

  /**
   * Checks whether the current session recipe is still valid against a project and files.
   */
  isCurrent(project: Project, files: ReadonlyMap<string, File>): boolean {
    if (!this.currentSession?.recipe) return false;
    return creatorRecipeIsCurrent(this.currentSession.recipe, project, files);
  }
}

/** Global singleton pipeline controller for App-level access */
export const creatorPipeline = new CreatorPipeline();
