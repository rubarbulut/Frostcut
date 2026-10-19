import {
  applyOperations, changeAspectRatio, clipEnd, duration, isLocked, uid, validateProject,
  type AspectFillMode, type Project,
} from './model';
import { syncSequence } from './sequences';

/** Channel preferences only: no credentials, implied connected account or publishing consent. */
export type CreatorProfile = {
  version: 1; id: string; name: string; language: string; game: string; audience: string;
  commentary: 'unspecified' | 'spoken' | 'game-audio' | 'mixed';
  longTargetSeconds: number; shortTargetSeconds: number; shortCount: number; fillMode: AspectFillMode;
};
export type CreatorRange = { readonly start: number; readonly end: number };
export type CreatorProposal = {
  readonly id: string; readonly name: string; readonly kind: 'youtube-long' | 'youtube-short';
  readonly ranges: readonly CreatorRange[]; readonly reason: string;
};
export type CreatorOutput = CreatorProposal & { readonly seconds: number; readonly targetSeconds: number };
export type CreatorRecipe = {
  readonly version: 1; readonly projectId: string; readonly profile: Readonly<CreatorProfile>;
  readonly outputs: readonly CreatorOutput[]; readonly sourceIds: readonly string[];
};
type Binding = { original: Project; snapshot: Project; files: ReadonlyMap<string, File> };
const bindings = new WeakMap<CreatorRecipe, Binding>();
const text = (value: unknown, limit: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Parse only the documented profile fields; return an independent canonical value. */
export function parseCreatorProfile(value: unknown): CreatorProfile {
  const p = value as CreatorProfile | null;
  if (!p || p.version !== 1 || !text(p.id, 128) || !text(p.name, 100) || !text(p.game, 200) ||
    !text(p.audience, 500) || !text(p.language, 35) || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(p.language) ||
    !['unspecified', 'spoken', 'game-audio', 'mixed'].includes(p.commentary) ||
    !finite(p.longTargetSeconds, 1, 86400) || !finite(p.shortTargetSeconds, 1, 180) ||
    !Number.isInteger(p.shortCount) || !finite(p.shortCount, 0, 12) ||
    !['fit', 'crop', 'blur-background'].includes(p.fillMode))
    throw new Error('Check the creator profile, language, output targets and fill mode.');
  return { version: 1, id: p.id.trim(), name: p.name.trim(), language: p.language,
    game: p.game.trim(), audience: p.audience.trim(), commentary: p.commentary,
    longTargetSeconds: p.longTargetSeconds, shortTargetSeconds: p.shortTargetSeconds,
    shortCount: p.shortCount, fillMode: p.fillMode };
}

/** Compile explicit source-time proposals, not invented AI highlights. No media
 * read/analysis, engine, network, account or publishing side effect. One private
 * immutable edit snapshot feeds all materializations; no per-format transcription.
 * Recipe bindings are session-local and intentionally cannot be imported as JSON.
 */
export function createCreatorRecipe(project: Project, sourceFiles: ReadonlyMap<string, File>,
  profileValue: CreatorProfile, proposals: readonly CreatorProposal[]): CreatorRecipe {
  const profile = parseCreatorProfile(profileValue), total = duration(project);
  if (!project.clips.length || !Number.isFinite(total) || total <= 0)
    throw new Error('Add a playable source timeline before creating output recipes.');
  // Existing assemble deliberately skips locked edits. Never return an uncut
  // project as if the proposed output succeeded.
  if (project.clips.some((clip) => isLocked(project, clip)) || project.adjustments?.some((layer) => layer.locked))
    throw new Error('Unlock clips and adjustment layers before creating output recipes.');
  if (!Array.isArray(proposals) || !proposals.length || proposals.length > 13 ||
    proposals.filter((item) => item.kind === 'youtube-long').length > 1 ||
    proposals.filter((item) => item.kind === 'youtube-short').length > profile.shortCount)
    throw new Error('Choose at most one long output and the configured number of Shorts.');
  const ids = new Set<string>(), sources = new Set<string>();
  const assets = new Map(project.media.map((asset) => [asset.id, asset]));
  const outputs = proposals.map((proposal: CreatorProposal): CreatorOutput => {
    if (!text(proposal.id, 128) || ids.has(proposal.id.trim()) || !text(proposal.name, 100) ||
      !text(proposal.reason, 2000) || !['youtube-long', 'youtube-short'].includes(proposal.kind) ||
      !Array.isArray(proposal.ranges) || !proposal.ranges.length || proposal.ranges.length > 128)
      throw new Error('Each output needs a unique ID, name, rationale and supported source ranges.');
    ids.add(proposal.id.trim());
    const ranges = proposal.ranges.map((range: CreatorRange) => {
      if (!range || !finite(range.start, 0, total) || !finite(range.end, 0, total) || range.end <= range.start)
        throw new Error('Choose finite output ranges inside the source timeline.');
      const clips = project.clips.filter((clip) => clip.start < range.end && clipEnd(clip) > range.start);
      if (!clips.length) throw new Error('An output range must contain source footage or audio.');
      for (const clip of clips) {
        // Persisted nested editing remains gated on the separate development
        // branch; fail explicitly rather than flattening or making fake assets.
        if (typeof clip.mediaId !== 'string' || 'sequenceId' in clip && clip.sequenceId !== undefined)
          throw new Error('Nested source recipes require the completed nested preview/export integration.');
        const asset = assets.get(clip.mediaId);
        if (!asset || !sourceFiles.get(asset.id)) throw new Error('Relink the original sources before creating output recipes.');
        if (!finite(asset.duration, 0, 86400) || !finite(clip.properties.speed, 0.25, 4) ||
          !finite(clip.start, 0, 86400) || !finite(clip.sourceStart, 0, asset.duration) ||
          !finite(clip.sourceEnd, 0, asset.duration) || clip.sourceEnd <= clip.sourceStart)
          throw new Error('Check the source clip timing, duration and speed.');
        sources.add(asset.id);
      }
      return Object.freeze({ start: range.start, end: range.end });
    });
    // The current editor has no synthetic trailing-black-duration clip. Preserve
    // internal gaps, but reject a trailing gap instead of silently shortening it.
    const final = ranges.at(-1)!;
    if (!project.clips.some((clip) => clip.start < final.end && clipEnd(clip) >= final.end))
      throw new Error('End the output on source footage or audio; trailing empty duration is not supported yet.');
    const seconds = ranges.reduce((sum, range) => sum + range.end - range.start, 0);
    if (!finite(seconds, 0.001, 86400)) throw new Error('Choose an output between one millisecond and 24 hours.');
    if (proposal.kind === 'youtube-short' && seconds > 180)
      throw new Error('This pilot supports short output recipes up to 180 seconds. Choose a shorter range.');
    return Object.freeze({ id: proposal.id.trim(), name: proposal.name.trim(), kind: proposal.kind,
      ranges: Object.freeze(ranges), reason: proposal.reason.trim(), seconds,
      targetSeconds: proposal.kind === 'youtube-long' ? profile.longTargetSeconds : profile.shortTargetSeconds });
  });
  const recipe: CreatorRecipe = Object.freeze({ version: 1, projectId: project.id,
    profile: Object.freeze(profile), outputs: Object.freeze(outputs), sourceIds: Object.freeze([...sources]) });
  bindings.set(recipe, { original: project, snapshot: structuredClone(project),
    files: new Map(recipe.sourceIds.map((id) => [id, sourceFiles.get(id)!])) });
  return recipe;
}

/** Any immutable editor commit or original File relink requires rebuilding the
 * recipe. Equal file names/sizes do not establish that source bytes still match. */
export function creatorRecipeIsCurrent(recipe: CreatorRecipe, project: Project, files: ReadonlyMap<string, File>) {
  const binding = bindings.get(recipe);
  return !!binding && binding.original === project && [...binding.files].every(([id, file]) => files.get(id) === file);
}

/** REAL editor assembly over every contributing track, preserving source trims,
 * speed, audio, captions, effects and motion. It only builds a draft Project;
 * rendering/SEO/thumbnail selection/OAuth/upload remain separate explicit work.
 */
export function materializeCreatorOutput(recipe: CreatorRecipe, project: Project, files: ReadonlyMap<string, File>, outputId: string): Project {
  if (!creatorRecipeIsCurrent(recipe, project, files))
    throw new Error('The source edit or original media changed. Rebuild the output recipes.');
  const output = recipe.outputs.find((item) => item.id === outputId);
  if (!output) throw new Error('Choose an output from this recipe.');
  const source = bindings.get(recipe)!.snapshot;
  let draft = applyOperations(source, [{ type: 'assemble', ranges: output.ranges.map((range) => ({ ...range })) }]);
  if (Math.abs(duration(draft) - output.seconds) > 1e-6)
    throw new Error('The assembled output did not preserve its planned duration. Review the source ranges.');
  draft = changeAspectRatio(draft, output.kind === 'youtube-long' ? '16:9' : '9:16', recipe.profile.fillMode);
  draft.id = uid(); draft.name = output.name;
  draft.createdAt = draft.updatedAt = new Date().toISOString();
  // Derived cuts need their own reviewed metadata/chapter times. Original source
  // metadata remains untouched; a stale publication or SEO claim is never copied.
  draft.publishing = undefined; draft.chapters = undefined; draft.suggestions = [];
  return validateProject(syncSequence(draft));
}
