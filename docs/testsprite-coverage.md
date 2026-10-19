# FrostCut: portal generation brief and coverage evidence

The FC labels below are requirements supplied to the **TestSprite 3.0 web portal**,
not generated test IDs or passing results. A real reviewed 12-case diagnostic run has
now finished; see its actual evidence below. Use the deployed source in
`_deployment.json`, never a hardcoded old source revision in future PR cases.

## Product and test setup

FrostCut is a browser video editor: original media stays on the device, while
project metadata, timeline edits, captions and export settings remain editable.
Use a fresh browser profile per independent case (IndexedDB/autosave stores user
state). No application login is needed. Use the small **Try a sample project** for
editing tests; its captions are illustrative and must not be treated as recognized
speech. Use **Try a spoken demo** only for actual speech workflows.

Portal authentication choice: no application login. Explore the real landing and
editor before generating plans. Recheck labels in the live DOM. Per-case scenarios
must verify observable changes/downloaded project content, not merely click buttons
or check that the page is present. The source's existing Playwright tests can help
explain controls; they are not a substitute for generating the portal suite.

## Original diagnostic requirements (preserved)

| ID | User action and assertions | Regression prevented |
| --- | --- | --- |
| FC-01 | Open deployed landing, open sample, verify one real V1 clip, caption lane and project title; assert no error toast | Broken public assets or unusable editor |
| FC-02 | Split a selected clip at an interior time, verify two clips and unchanged total time; undo then redo and verify counts | Destructive or inert timeline edits/history |
| FC-03 | Edit caption text and exact start/end; save, reopen and assert the retained values and updated C1 block | Text/timing edits that do not persist |
| FC-04 | Attempt end-before-start caption timing; assert visible validation and no saved invalid block; correct and save | Corrupt caption timings |
| FC-05 | Add a manual caption in a gap, move/resize it, verify changed times, then undo; assert video clips remain unchanged | Caption operations accidentally cut video |
| FC-06 | Customize caption color, size, alignment and spacing; assert selected values and visible style, save project and verify metadata | Cosmetic controls with no real saved effect |
| FC-07 | Change preview speed to 2x, save project and assert source clip/export speed is unchanged; restore preview speed | Preview control alters exported timing |
| FC-08 | Pan/zoom timeline, verify changed viewport while source timings and undo state stay unchanged | Navigation mutates the edit |
| FC-09 | Create equal parts with a bounded count, verify part count/names/durations and retained original; switch sequences | Missing/unequal parts or source edit lost |
| FC-10 | Save project, open its downloaded JSON, verify expected edits/settings and no media bytes/ephemeral blob URLs | Broken project roundtrip or media leak |
| FC-11 | Load an invalid/oversized project fixture, assert helpful rejection and the current edit remains usable | Failed open destroys existing project |
| FC-12 | Change caption style or clip transform, undo and redo, verify both UI values and saved project content | History only changes labels, not data |

Assertions should inspect accessible UI or downloaded artifacts. Do not assert
internal Zustand state, synthesize a pass, replace actions with mocks or auto-heal
away a genuine failed requirement. Assert the selected source revision before
testing a PR, so another deployment cannot masquerade as the tested version.

## Extended cloud cases, after core stability and balance review

- Tiny original MP4 + manual captions → export actual MP4; verify nonempty output,
  playable duration/dimensions and burned caption visibility. A success toast alone
  does not prove valid media. Use a tiny openly licensed/generated fixture.
- Two saved tiny parts → batch ZIP; inspect entries and decoded durations. Cancel a
  real job and verify it stops without deleting the edit; retry deliberately.
- Save/open with original-file relinking; verify restored timing and captions.
- Speech: use a short known spoken excerpt, explicitly run the selected model,
  review actual words/timestamps and cancellation. No transcript from the sample
  project can stand in for recognition. Model/network failures must be visible.
- Test a mobile viewport and keyboard-focused core edits. Exclude desktop pointer
  gestures from touch-only expectations; core editing must remain navigable.

Cloud execution uses TestSprite credits. Start with the core suite, inspect actual
remaining credits and enable extended model/media cases deliberately. No model or
render runs on site load. No paid plan, artificial engagement, vote automation or
unbounded run schedule is part of this setup.

## Actual verified coverage on October 19

The portal-generated **FrostCut PR core** project is
`2b7bdea7-7743-4036-96f1-3527e99a4ea3`. After exploration proposed 70 plans across
seven use cases, ten distinct scenarios were selected and reviewed before
Generate & Run. Its
[initial execution 8ccb1dc9-ee0e-4def-9f96-c853b108c56f](https://www.testsprite.com/dashboard-v3/o/my-workspace-ee3a6b41/projects/2b7bdea7-7743-4036-96f1-3527e99a4ea3/execution/8ccb1dc9-ee0e-4def-9f96-c853b108c56f)
finished **10 passed, 0 failed, 0 blocked** on verified source `9fbecb8`.

| Generated case title | Observable assertions |
| --- | --- |
| Open sample project from landing page | Real V1 clip, eight C1 blocks, title, playable sample; initial duration 24 s with explicit codec-padding tolerance |
| Split a clip and restore with history | Two clips after split, one after Undo, two after Redo; total baseline duration unchanged |
| Edit and persist a caption's text and timing | Exact text, 0.500-4.000 s, Saved locally, reload same context and Continue, retained values |
| Reject an invalid caption end time and keep draft edits | End-before-start validation, retained draft, correction can save |
| Edit a manual caption and preserve changes through undo redo | Add 4.3-5.2 s, edit 4.4-5.3, shorten to 5.25; Undo/Redo exact end time; V1 unchanged |
| Persist caption styling controls across reload | Color #00ff88, size 80, Left, spacing 0.1; undo/redo spacing then reload with retained fields |
| Preview at double speed without changing source properties | Top preview selector 2x advances playback; clip speed remains 1.00x / 100%; source bounds preserved; reset 1x |
| Pan the timeline while preserving disabled undo state | Zoom/pan changes viewport; Undo stays disabled and content/times stay unchanged |
| Create equal short-form parts from the source clip | Three approximately 8 s parts within one frame, Original edit retained; sequence list survives reload |
| Rename the project and recover it after reload | Core autosave proof name, Continue after reload, retained name/clip/captions/duration |

The core suite proves UI plus actual IndexedDB autosave/reload. Missing-media
relink notices after reload are expected: original bytes are deliberately omitted.
It does **not** pretend to inspect native downloaded files, prove native drag
semantics, run speech recognition, or verify media renders.

### Real file and gesture assertions: GitHub Chromium

[Quality run 39253972919](https://github.com/rubarbulut/Frostcut/actions/runs/39253972919)
passed **233 unit tests in 38 files, production build and 5/5 real Chromium cases**
(10.9 s for the browser cases). The current `playwright.hackathon.config.ts`
extends that selection to seven real scenarios; latest results are on the PR:

1. Existing caption text/exact-time/add/drag/resize/Undo and file persistence.
2. Existing invalid caption-time validation.
3. Actual backup download: inspect JSON name, exact caption/timing/style and absent
   media bytes/blob URLs, then import that same downloaded file and verify values.
4. Actual malformed JSON and downloaded SRT supplied to Open project: assert
   rejection and retained edit, then save valid backup.
5. Equal parts plus retained original: inspect actual downloaded JSON, reimport it,
   verify three saved sequences and original full duration.
6. Actual middle-mouse and Hand-tool drags change scroll position without changing
   Playhead/history; Ctrl-wheel zoom preserves the time under the cursor.
7. Actual 4x video playback advances faster, while the downloaded project retains
   clip speed 1 and contains no serialized preview-rate field.

The backup case additionally asserts exact caption tokens, 0.5-4 s source timing
and Right alignment inside the actual JSON before importing that file.

The browser runner uses actual downloads and file inputs, no internal Zustand
injection or mocked media. A first run had four passes and one test-selector
failure; the recorded DOM exposed the real Text alignment combobox. Correcting
the test to the accessible role produced all five passes without weakening the app.
The core portal pass and these real file passes provide distinct evidence.

### PR automation and genuine failure history

TestSprite GitHub App **173013929** is connected from the same suite account and
GitHub settings confirmed **only rubarbulut/Frostcut** selected. The core project's
active trigger watches Vercel commit status and tests
`https://frostcut-git-{branch-slug}-rubar.vercel.app/`, after deployment is Ready.
Merge gate is enabled. The manual PR event started
[72f0b84b-a955-4be9-9688-4a4c4996b58f](https://www.testsprite.com/dashboard-v3/o/ee3a6b41-5680-5bdf-998e-5b37da0e18af/projects/2b7bdea7-7743-4036-96f1-3527e99a4ea3/execution/72f0b84b-a955-4be9-9688-4a4c4996b58f);
it finished **10 passed, 0 failed, 0 blocked** and genuine TestSprite V3 status success on source `9fbecb8`.

New commit `a1aa503` automatically started
[0d710c47-b2da-433f-9df6-b06854fbf780](https://www.testsprite.com/dashboard-v3/o/my-workspace-ee3a6b41/projects/2b7bdea7-7743-4036-96f1-3527e99a4ea3/execution/0d710c47-b2da-433f-9df6-b06854fbf780),
without a manual dispatch. Its panning case reported failure: the agent clicked
the minimap, observed unchanged Undo/clip count/duration, but could not prove exact
before/after viewport movement or the required mouse drag. That failure is retained.
The portal navigation plan now explicitly records Playhead 0, clicks the real
minimap center, asserts a 10-14 s value, then resets to 0 with exact edit baseline
unchanged. This is a minimap assertion, not a claim to prove drag semantics.
Real drag/scroll/zoom and playback isolation are separate required Chromium cases.
The latest PR results must verify both paths; earlier 10/10 is not a newer-head pass.

Main requires strict up-to-date **Quality checks** from GitHub Actions App 15368
and **TestSprite V3** from genuine TestSprite App 2756476, including admins. The
[entry PR](https://github.com/rubarbulut/Frostcut/pull/1) carries authoritative checks
and bot comments for its latest head. A failed TestSprite run left that PR blocked.

The original diagnostic project `a34e8de5-bcc5-43f5-8de6-91793ac81697`, its 12
case definitions and all execution history are preserved. Only its duplicate
trigger is disabled; cases and failed/blocked reports were not deleted:

| Execution | Actual outcome / finding |
| --- | --- |
| [2aeddbd3-edee-4ef0-bcab-936f29b2350a](https://www.testsprite.com/dashboard-v3/o/my-workspace-ee3a6b41/projects/a34e8de5-bcc5-43f5-8de6-91793ac81697/execution/2aeddbd3-edee-4ef0-bcab-936f29b2350a) | 0 pass, 8 fail, 4 blocked; cloud Chromium could not decode H.264 sample |
| [69f69260-5615-4ff0-a799-dbd9967d5fa1](https://www.testsprite.com/dashboard-v3/o/ee3a6b41-5680-5bdf-998e-5b37da0e18af/projects/a34e8de5-bcc5-43f5-8de6-91793ac81697/execution/69f69260-5615-4ff0-a799-dbd9967d5fa1) | 3 pass, 0 fail, 9 blocked after WebM fix; native JSON/SRT download inspection blocked |
| [40ad35dd-5b40-4494-a7db-3c4440f5f8b4](https://www.testsprite.com/dashboard-v3/o/ee3a6b41-5680-5bdf-998e-5b37da0e18af/projects/a34e8de5-bcc5-43f5-8de6-91793ac81697/execution/40ad35dd-5b40-4494-a7db-3c4440f5f8b4) | New substantive commit 7f1c924 automatically ran after Vercel; 2 pass, 2 fail, 8 blocked. Split/history visibly worked, but overbroad final JSON assertion could not be fulfilled by harness |
| [4aad333e-19e0-4f9c-9b1b-54db47e41f20](https://www.testsprite.com/dashboard-v3/o/ee3a6b41-5680-5bdf-998e-5b37da0e18af/projects/a34e8de5-bcc5-43f5-8de6-91793ac81697/execution/4aad333e-19e0-4f9c-9b1b-54db47e41f20) | Genuine later failing status on 9fbecb8 retained; never reported as passing |

The additional WebM sample preserves all 576 decoded video frames; original MP4
is unchanged. See [sample format evidence](sample-format-evidence.json).
TestSprite Test Files requires a paid plan/trial, which was declined. An export
toast is not file proof, and speculative AI report suggestions are not app defects.
No whole-diagnostic-suite pass, ASR/render result, paid trial or deleted failure is claimed.
