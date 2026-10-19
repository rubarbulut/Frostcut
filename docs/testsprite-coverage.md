# FrostCut: portal generation brief and coverage evidence

The FC labels below are requirements supplied to the **TestSprite 3.0 web portal**,
not generated test IDs or passing results. A real reviewed 12-case initial run has
now started; see its actual evidence below. Use the deployed source in
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

## Core PR suite: review/generate these scenarios first

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

## Account and CI evidence to append after it exists

| Evidence | Value |
| --- | --- |
| Portal project / suite | Project a34e8de5-bcc5-43f5-8de6-91793ac81697; exploration finished; 12 reviewed distinct cases generated/run |
| Generated core case IDs/count | 12 selected from 57 proposed across 6 use cases; sample test case 2eb00247-3b2a-4a30-bc8c-d5e41af4cacb; append remaining IDs after completion |
| Initial execution and failures | [2aeddbd3-edee-4ef0-bcab-936f29b2350a](https://www.testsprite.com/dashboard-v3/o/my-workspace-ee3a6b41/projects/a34e8de5-bcc5-43f5-8de6-91793ac81697/execution/2aeddbd3-edee-4ef0-bcab-936f29b2350a) in progress; sample MP4 cannot be decoded by cloud browser; real failure preserved |
| Final passing execution | Pending |
| Entry PR with authentic TestSprite comment/check | PR #1 open; authentic TestSprite result pending |
| New-commit automatic rerun | Pending |
| Required blocking check/rules | Pending |

After setup, summarize **actual generated coverage** in README and link its portal
execution/PR evidence. Optional extended cases stay excluded from any core-pass
claim until genuinely executed. A GitHub build/unit pass is separate evidence.
