# YouTube pilot: shared creator recipe

Status: implemented as an explicit, session-local production API, not mounted in
the editor yet. It assembles real draft Projects using existing edit operations;
it does not analyze footage, find trends, render, authorize accounts or publish.

`src/creator-recipe.ts` exports:

- `parseCreatorProfile(value)` validates/copies the documented preference fields.
  Version1: id, name, language, game, audience, commentary (`unspecified`, `spoken`,
  `game-audio`, `mixed`), longTargetSeconds, shortTargetSeconds, shortCount and
  fillMode. No account IDs, tokens or inferred automatic publishing consent.
- `createCreatorRecipe(project, originalFiles, profile, proposals)` binds all
  outputs to one immutable edit snapshot and the exact contributing File objects.
  Proposals contain id, name, kind (`youtube-long` or `youtube-short`), a reason
  and ordered source-timeline ranges `{start,end}`. These are timeline seconds,
  not seconds relative to the last output or individual decoder sources. Existing
  assembly maps them through actual per-clip trims and speed, keeping all tracks.
- `creatorRecipeIsCurrent(recipe, project, originalFiles)` checks edit identity
  and selected original File versions. Call before showing/using a held recipe;
  immutable edits and relinks require rebuilding. Metadata-only equal filenames
  do not establish source identity. An unused File change does not affect it.
- `materializeCreatorOutput(recipe, project, originalFiles, outputId)` returns an
  independently editable, model-validated Project with a new project ID and wide
  or vertical dimensions using the selected fill mode. No source mutation, file
  read, ASR, engine allocation or network action occurs.

Example, after explicit user selection or a separately verified analysis result:

```ts
const recipe = createCreatorRecipe(project, mediaFiles, profile, [
  { id: 'long', name: 'Main story', kind: 'youtube-long',
    ranges: [{ start: 5, end: 30 }, { start: 90, end: 120 }],
    reason: 'Reviewed source intervals: setup and outcome.' },
  { id: 'short-1', name: 'One moment', kind: 'youtube-short',
    ranges: [{ start: 95, end: 120 }], reason: 'Reviewed complete moment.' },
]);
const shortDraft = materializeCreatorOutput(recipe, project, mediaFiles, 'short-1');
// Only a subsequent explicit export/publishing workflow may consume shortDraft.
```

The source clip/effects/motion/audio/caption state is copied through the actual
editor assembly operation. Adjustment intervals remap through the same function
as existing edits. Active stored-sequence data is synchronized to the derived
timeline. Old publishing metadata, chapters and suggestions are cleared in the
derived project because their prior editorial/timing approval does not apply;
the original retains them. Original media IDs and transcript source times remain.

## Bounds and honest states

- At most one long output and the configured0–12 short outputs; up to128 ranges
  per output. Targets are preferences, not claims about actual assembled duration.
  The pilot caps short recipes at180s and all outputs at24h. These are application
  bounds, not a guarantee of platform classification, eligibility or quality.
- Input proposals are explicit. A specified rationale is not proof that an AI
  observed an event. No synthetic gameplay events or hardcoded viral/SEO scores.
- Reordering and replaying intervals is permitted when explicitly proposed.
  Internal gaps are retained. An all-empty range or trailing empty duration is
  rejected, since the current editor cannot represent a synthetic trailing-black
  duration without a real ending clip. It is never silently shortened/padded.
- Locked clip/adjustment edits fail rather than returning an uncut apparent
  success. Output duration and full project validation run before returning.
- Bindings use a WeakMap. Recipes are session-local: JSON reimport/reload does
  not restore source ownership or readiness. Persisting channel preferences and
  rebuilding/restoring reviewed plans is a later explicit UI integration task.
- Nested references remain gated on the separate unfinished nested branch. The
  API rejects unsupported references; it does not flatten them or invent assets.
- Snapshot/metadata work is shared per recipe, but the existing assembler/aspect
  functions clone project data per materialization. No zero-allocation, measured
  memory improvement or actual media-quality claim is made.

## Verification — 19 October 2026

Twelve focused tests passed in383ms, one worker. They exercise the real model
assembly, source-time mapping through2× clips, three simultaneous tracks, audio
properties, captions, effects/motion data, adjustment remapping, independent wide/
vertical drafts, JSON/model validation, stale edit/File checks, lock protection,
gap/replay semantics and active-sequence synchronization. No codec/model/media job.

Command:

```text
node node_modules/vitest/vitest.mjs run src/creator-recipe.test.ts --maxWorkers=1 --no-file-parallelism
```

Focused TypeScript check of this module/test and their imported source graph also
passed using a temporary config extending tsconfig.json and including only those
two files. A full repository noEmit check was attempted and was not green: at
base880e081 the tracked virtualized-timeline.test.ts imports virtualized-timeline,
whose implementation existed only as untracked work in the original checkout.
Related implicit-any errors followed. Do not report a full repository type pass
for this branch. Manager owns reconciling those concurrent baseline files.

Still required: channel-profile/recipe UI and persistence, proposal production
using real content evidence, metadata/thumbnail research, full integration checks,
actual playback/render quality and real OAuth/upload/publishing. Full P2 stays open.
