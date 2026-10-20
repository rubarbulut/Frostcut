# B004 Director review — integration not yet accepted

Date: 2026-10-20. Reviewed shared checkout HEAD: `46dc95054967991e0b4b7377a0472a417042cf6d`, branch `feat/social-media-hub`.

Read BASELINE and all five delivery reports; compared their claims with production handlers, controller, tests and Git tracking. This was a static code review. No new test run, build, encode, ASR or live Google request was performed. The reports' green test counts are author-reported evidence, not independently rerun evidence.

**Verdict: implementation work is present, but B004 cannot be closed as an integrated end-to-end pilot.** Keep the existing modules and design; close the concrete wiring and evidence gaps below first.

## P0 — clean checkout is missing required source

Owner: Manager, with each file's actual author.

`git status --short` still reports required modules as untracked: `src/creator-recipe.ts`, `src/audio/`, `src/social/candidate-finder.ts`, `src/social/audio-to-timeline.ts`, `src/StudioDock.tsx`, `src/StudioMenu.tsx`, `src/studio-workspace.css`, `src/audio-bus.ts`, `src/turbo-eligibility.ts`, `src/virtualized-timeline.ts` and other dependencies. `git ls-files` confirms these are absent from this branch's tracked tree. Tracked App/controller files import them. A green local check using those untracked files is not evidence that a fresh checkout builds.

The branch is also seven commits ahead of its recorded remote-tracking ref; the Manager's integration commits have not been demonstrated on a current remote PR.

Fix: reconcile author-owned files, stage explicit paths, inspect staged contents and commit all actual dependencies. Do not blanket-add the shared checkout. Validate the complete tracked tree on one final SHA; record its pushed branch and real PR/check URLs. Preserve Codex's AE workspace hunks and other agents' work.

## P0 — the actual Apply callback invalidates its own recipe

Owner: Manager. Evidence: `App.tsx:1784`; `social/creator-pipeline.ts`, `switchToOutput` and `materializeOutput`; `creator-recipe.ts`, `creatorRecipeIsCurrent`.

The App invokes `switchToOutput(output.id, p)`. On the first switch, activeOutputId is null, so the controller replaces `session.sourceProject` with `structuredClone(currentEditedProject)` before materialization. The canonical recipe is bound to the original Project identity; the clone fails `binding.original === project`. An uncached first output therefore throws the stale-recipe error in the real UI path.

The isolation test calls the first `switchToOutput` without the App's current-project argument, so it does not cover this failure.

Fix: preserve the bound source identity and distinguish an unchanged current source from a new edit that requires a new recipe. Check current source/File identity before using cached outputs as well. Add a focused controller test using the exact App call and a short real UI Apply test.

## P1 — review choices and the pipeline have two separate recipes

Owner: Manager + Barış.

RecipeReviewScreen recompiles a recipe using its local fill-mode selection and supplies a materialized project to callbacks. App's Apply and Export callbacks ignore that `materialized` argument, selecting/rendering the controller's separately compiled project instead. The chosen fill mode can therefore be discarded. App also does not pass the session's evidence map or the media revision to the review screen.

Fix: choose one canonical reviewed recipe/project for confirmation and export. Keep the canonical source-safety checks. Pass actual evidence and media revision; test changing fill mode and confirming the resulting project, not just rendering the option text.

## P1 — candidate detection is not wired to the shared audio provider

Owner: Manager + Kaan + Okan.

App calls `preparePlan(p, mediaFiles, creatorProfile)` without signal inputs. The controller passes profile preferences to `findProjectCandidates`, but never forwards its `sourceFiles` argument into candidate options, never obtains/passes audioProfiles and does not supply mediaRevision. The provider/mapping modules exist; this production path does not demonstrate the claimed shared audio analysis. It can legitimately use equal-parts, but the report must not describe provider integration as finished.

Fix: connect one identity-safe, cancellable provider result to proposal generation; forward live file/revision inputs. Keep review/card selection free of decode/ASR/render side effects. Distinguish explicit analysis from fallback partitioning in the UI.

Kaan: `buildAnalysisCacheKey` currently distinguishes external signals by their array/profile count. Same-length replacement signal data on the same Project can reuse stale analysis. Key by actual signal revision/identity or compare the relevant inputs, and test changed values with unchanged counts.

## P1 — stale render protection omits visible/audible edits

Owner: Demir + Manager.

`computeProjectVideoRevision` includes clips/properties/effects and export settings, but omits project captions/style, transcript words, per-clip captionWords, adjustment layers, framing/fill settings and top-level EQ values. Those can change the exported picture or sound while leaving the same revision, so renderOutput can return an older Blob and publishOutput can accept it.

Its File signature is only size/lastModified; replacing a File with different bytes but identical metadata is not rejected. The canonical recipe already treats runtime File identity more strictly. The comment also calls the eight-hex-digit hash 64-bit although the implementation is 32-bit.

Fix: derive the revision from a complete shared render-affecting manifest plus runtime source identity. Exclude publishing-only text deliberately. Test independent caption/style, adjustment, EQ, fill, relink and metadata-only changes with the real revision function, rather than mocking it to a constant.

## P1 — Cancel does not cancel render/upload or reject late success

Owner: Manager + Demir.

`cancel()` aborts the controller created by preparePlan. renderOutput and publishOutput instead pass only their caller's optional signal to the engines. Cancel changes the stage but does not stop those jobs; their late completion can store an artifact and set stage to rendered/uploaded. Neither completion checks that its session/generation is still current. `parseCreatorProfile` also runs after isPreparing becomes true but outside the try/finally, so invalid profile input leaves preparation locked.

Fix: link job-local cancellation to the controller, check generation/session and abort before storing artifacts/status, and include validation in a finally-protected prepare lifecycle. Test deferred render/upload cancellation, a replacement session and an invalid-profile retry. Rejections are not a queued export UX; do not report a full queue unless actual pending work is managed.

## P1 — recipe Export finishes without delivering an MP4

Owner: Manager + Barış.

The App's onExportDraft closes the modal immediately, awaits renderOutput, discards its returned artifact and displays a toast. It does not download the Blob or send it to the configured destination. Its catch swallows the error, so RecipeReviewScreen cannot keep its own error/retry state open as promised. Live edits on the active output are not synchronized into the controller before this export path.

Fix: preserve the review until successful completion, propagate failure, snapshot the current edited output and hand the artifact to the existing destination/download flow. Expose progress and cancellation, keeping UI busy guards. Test an actual button event with a mock renderer and destination sink; no codec workload is needed.

## P1 — YouTube is a transport module, not an integrated publish screen

Owner: Manager + Demir + Barış.

The helper plugin is registered. However, production search finds no frontend call to `/api/youtube/capability`, `/api/youtube/auth-url` or `/api/youtube/token`, and no UI call to `publishOutput`. Only the controller and tests call the publisher. Adding OAuth environment values alone will not complete the user-facing flow.

Fix: connect capability/setup/account state and an explicit reviewed publication action to the existing adapter. Keep upload unavailable and clearly explained when unconfigured. No real account or live upload is necessary for the mock UI acceptance check; real account verification remains a separate manual step. Do not claim automatic publishing on all platforms.

Demir: the helper currently checks Host only for the token endpoint and never checks Origin. Auth-url, callback and disconnect are handled earlier. This does not match the report's claim that all endpoints have Host/Origin protection. Review endpoint-specific method, Host and same-origin controls before exposing credentials; cover rejected origin/method cases with synthetic requests.

## P1 — evidence does not cover several reported acceptance results

Owner: Manager + Barış + Okan; each author corrects their own claims.

- RecipeReviewScreen tests use `renderToString`; the export test checks that the button exists. It does not click Confirm/Export, await a callback or test focus trapping.
- PublishTools' test named "triggers commit callback only on save click" only renders and asserts that commit has not run. It does not exercise save, typing, sequence change, undo or reload.
- The pipeline's seven tests do not cover render cancellation or an actual changed-revision rejection. The metadata reuse test mocks the revision function to a constant; this does not prove manifest correctness.
- Okan's report claims 120 Hz voice high-pass and 20 ms / 250 ms ducking parity. Current export uses 80 Hz high-pass plus low-pass/compression and a 150 ms / 300 ms envelope; the preview bus uses different ducking configuration. EQ shelf-vs-peaking and gain paths also require comparison. This review does not claim measured equivalence. Replace “100% mathematical parity” with verified shared behavior or a visible unsupported/preflight distinction.
- The required `docs/director-reports/batch-004/manual-qa.md` is absent at review time; no current integration PR/check URL or real Recipe UI event proof appears in Manager's report.

Fix: replace SSR-only acceptance claims with appropriately labeled evidence. Add only small event/controller tests for the missing cases; prepare commands/fixtures/expected outcomes for deferred render, ASR and live-account checks. Update the acceptance matrix with pass / failed / not-run / blocked-external per actual scenario.

## Recommended order

1. Manager: tracked-tree completeness and first Apply failure.
2. Manager + Barış: canonical review/output edits and actual downloadable export, with real event evidence.
3. Demir + Manager: complete render revision and cancellation/session guards.
4. Kaan + Okan + Manager: explicit shared analysis wiring and correct signal invalidation.
5. Demir + Barış: account/capability UI and truthful unsupported state, without a live upload.
6. Manager: combine corrected evidence on one pushed SHA, attach the actual PR/check URLs, and prepare manual QA. Do not mark all green from module existence or SSR text assertions.

No source changes were made for this review; the existing author reports remain intact. This file records the Director's independent acceptance decision and concrete follow-up work.
