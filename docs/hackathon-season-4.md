# TestSprite Season 4: FrostCut entry and evidence

Owner: Rubar, solo entrant. Repository: https://github.com/rubarbulut/Frostcut.
Account email and private account details belong in the actual submission, not this
public repository. This is a preparation/evidence record, **not a submitted entry**.

## Current implementation

- Public app: https://frostcut.vercel.app/ on the entrant's free Vercel Hobby
  project `rubar/frostcut`. Production
  [6BDmSSTVxML1maSXipaFiJCKGtXH](https://vercel.com/rubar/frostcut/6BDmSSTVxML1maSXipaFiJCKGtXH)
  is Ready at source `9fbecb8`. Production and the
  [PR preview](https://frostcut-git-codex-testsprite-hackathon-rubar.vercel.app/)
  passed unauthenticated source-revision, isolation-header and core-asset checks,
  including both sample formats. PR #1 remains open; production was promoted.
- The entrant approved removing preview authentication only from Frostcut. That
  saved setting makes PR previews reachable by TestSprite. The personal rubar.me
  project/domain was untouched. No bypass secret or paid feature was enabled.
- [PR #1](https://github.com/rubarbulut/Frostcut/pull/1) opened October 19, within
  the published build window. Its
  [quality run 39253972919](https://github.com/rubarbulut/Frostcut/actions/runs/39253972919)
  passed **233 unit tests in 38 files, metadata checks, production build and five
  real Chromium browser scenarios**. Native caption drag/resize/history, exact
  timing, JSON download/content/reimport, invalid JSON/SRT recovery and equal-parts
  file persistence are verified on GitHub, without mocked media or internal state.
- TestSprite's actual account matches the entrant's supplied email; profile Rubar,
  Free plan. The portal-generated **FrostCut PR core** suite
  [passed all 10 cases](https://www.testsprite.com/dashboard-v3/o/my-workspace-ee3a6b41/projects/2b7bdea7-7743-4036-96f1-3527e99a4ea3/execution/8ccb1dc9-ee0e-4def-9f96-c853b108c56f),
  with zero failures/blocks, on the verified preview. Plans were reviewed with
  exact text/times/style values and observable persistence assertions before run.
  Coverage: sample, split/history, caption editing/validation/manual edits/style,
  preview speed, timeline pan, equal parts and project rename/autosave recovery.
  This suite proves UI/IndexedDB reloads; it does not claim native-file, ASR or
  rendering evidence. The separate five Chromium cases provide actual file/gesture proof.
- TestSprite GitHub App installation **173013929** is connected from that account.
  The entrant saved **Only select repositories: rubarbulut/Frostcut**; a fresh GitHub
  settings read confirmed exactly one selected repository and disabled Save.
- The core project's PR trigger is **Active**, watches only the completed **Vercel
  commit status**, and uses `https://frostcut-git-{branch-slug}-rubar.vercel.app/`.
  **Merge gate is enabled**. A genuine Send Test Event started core PR execution
  [72f0b84b-a955-4be9-9688-4a4c4996b58f](https://www.testsprite.com/dashboard-v3/o/ee3a6b41-5680-5bdf-998e-5b37da0e18af/projects/2b7bdea7-7743-4036-96f1-3527e99a4ea3/execution/72f0b84b-a955-4be9-9688-4a4c4996b58f).
  It finished **10 passed, 0 failed, 0 blocked** and the genuine TestSprite V3
  status is success on source `9fbecb8`.
- Main protection was enabled and API-read back: strict required **Quality checks**
  bound to GitHub Actions App **15368**, and **TestSprite V3** bound to the real
  TestSprite App **2756476**, including admins and conversation resolution. A real
  failing TestSprite status left the PR blocked. No status is fabricated or bypassed.
- A prior substantive commit `7f1c924` automatically ran TestSprite after Vercel
  Ready: [40ad35dd-5b40-4494-a7db-3c4440f5f8b4](https://www.testsprite.com/dashboard-v3/o/ee3a6b41-5680-5bdf-998e-5b37da0e18af/projects/a34e8de5-bcc5-43f5-8de6-91793ac81697/execution/40ad35dd-5b40-4494-a7db-3c4440f5f8b4),
  **2 passed, 2 failed, 8 blocked**. The original plan incorrectly required file
  inspection even after successful visible split/history actions. This report and
  all original definitions/history remain; the old diagnostic trigger is disabled
  to avoid duplicate runs. The core trigger and real Chromium file checks replace
  those unsupported file assertions with independently verifiable evidence.
- Initial diagnostic run
  [2aeddbd3-edee-4ef0-bcab-936f29b2350a](https://www.testsprite.com/dashboard-v3/o/my-workspace-ee3a6b41/projects/a34e8de5-bcc5-43f5-8de6-91793ac81697/execution/2aeddbd3-edee-4ef0-bcab-936f29b2350a)
  was **0 passed, 8 failed, 4 blocked** and exposed a real H.264 decoding failure.
  The fix adds a genuinely inspected WebM sample while preserving the original MP4.
  [Cloud preparation run](https://github.com/rubarbulut/Frostcut/actions/runs/39250091522)
  verified **all 576 decoded video frames identical**, 360x640 and present Opus audio;
  WebM adds 8 ms codec padding. [Hashes/probes](sample-format-evidence.json) are saved.
  Four focused tests and source type-check passed locally; encoding happened on GitHub.
- First post-fix diagnostic PR run
  [69f69260-5615-4ff0-a799-dbd9967d5fa1](https://www.testsprite.com/dashboard-v3/o/ee3a6b41-5680-5bdf-998e-5b37da0e18af/projects/a34e8de5-bcc5-43f5-8de6-91793ac81697/execution/69f69260-5615-4ff0-a799-dbd9967d5fa1)
  was **3 passed, 0 failed, 9 blocked**, with an authentic
  [bot comment](https://github.com/rubarbulut/Frostcut/pull/1#issuecomment-6267077384).
  Sample opening, split/history and invalid-caption validation passed; blocked
  downloaded-file assertions were not counted as passes. Test Files required a
  $19/mo-after-trial plan; it was declined. No upgrade/card/upload was accepted.
- The first Chromium file run had 4 passes and one incorrect test selector. Its
  saved DOM identified the real Text alignment combobox. Correcting the selector
  produced the linked **5/5 pass**; no application behavior was weakened for a test.
- The entrant reports Discord membership with badge and unique/display name
  **Rubar**, and following TestSprite on X as **@RubarAren**. Discord web membership
  and username `rubar` were observed. The
  [official rules channel](https://discord.com/channels/1227394620623949934/1476641368615948453)
  still shows the Season 4 submission mention as **No access (opens Oct 19)**.
  The channel browser's submission search lists only archived Seasons 1-3 forums.
  The [Season 4 discussion](https://discord.com/channels/1227394620623949934/1556776381894099117)
  confirms the October 22 deadline and has no pins. The current submission template,
  duplicate check and final message remain unavailable; do not post in an old
  season or infer age/region/rights/terms consent from these handles.
- `_deployment.json` identifies the real source. The public verifier rejects
  redirects/authentication/HTML asset fallbacks and requires COOP/COEP. Asset paths
  respect Vite public base. No service worker or publishing token was added.
- Nested-sequence development remains separate on `codex/nested-sequences`
  (`73396b1`), incomplete and excluded from this public entry.

GitHub unit/build/browser checks and TestSprite portal/PR results are distinct.
The latest exact-revision checks are authoritative on PR #1; an old green run,
blocked case or readiness document cannot prove a newer revision passed.

## Execution order and acceptance

1. Publish the app and verify its exact deployed revision and assets; keep both
   production and the entry PR preview reachable through judging. No claim is made
   that it was live before the first verified publication.
2. Sign in to the entrant's existing TestSprite account. Verify its name/email,
   workspace, balance and plan in the actual portal. Do not create a second identity.
3. In the **3.0 web portal**, create the UI project for the live app, explore its
   real flows, review the scenarios in [the coverage brief](testsprite-coverage.md),
   generate the tests, and inspect the actual runs/assertions/replays. Fix genuine
   failures and rerun; never fabricate a red-to-green story.
4. From that same account, install the TestSprite GitHub App for **Frostcut only**.
   The current integration guide uses Workspace Settings → Connections →
   Integrations, then the project's GitHub Action tab; the event page describes an
   older Settings → GitHub App entry. Follow the actual portal UI.
5. Configure a PR trigger from the completed deployment signal, not build start.
   Derive the URL pattern from Vercel's actual Ready preview link, using the
   documented `{branch-slug}` placeholder where appropriate; do not guess a scope.
   Confirm the detected event includes the actual preview/deployment. Send a test
   event and inspect its portal execution and authentic TestSprite PR result.
6. Enable automatic PR runs and blocking after that suite passes. Inspect branch
   protection/rules and ensure the real TestSprite result is required, alongside
   Quality checks. A pending/missing/failed suite must not look green or allow merge.
7. Push a substantive edit to the same PR and verify a **new** automatic run on the
   new source revision. Preserve PR, execution, check, and trigger-activity links.
8. Update README coverage from actual generated tests and add the verified live URL,
   entry PR link, and actual run evidence. Planned cases remain explicitly planned.
9. Verify Discord membership/badge and X follow under the entrant's real handles.
   Read the actual submission-channel template and check for an existing entry.
10. Prepare one final Discord entry with PR, live URL, suite account/name and team.
    Obtain the entrant's eligibility/rights acknowledgements before submission.
    Send only one entry in the required channel and verify its message link.

## Complete rule audit

Source text: the entrant's supplied rules, checked against the
[official event page](https://www.testsprite.com/hackathon-s4) on 2026-10-19.
Dates/changes must also be checked in the server's pinned announcements.

| Rule | Required proof / disposition | Current state |
| --- | --- | --- |
| 1 Eligibility | X follow and Discord membership with badge | Discord membership/username observed; entrant confirms badge and X @RubarAren follow |
| 2 Single entry | Check channel for an existing entry, submit once | No entry sent by this agent |
| 3 Team | List every member | Entrant confirmed Rubar, solo |
| 4 Portal + GitHub App | Portal-generated suite, same-account App, in-window PR with authentic result | Core portal 10/10; same-account App scoped to Frostcut; active PR trigger and required checks; latest PR results linked above |
| 5 Public app throughout build | Reachable URL, version evidence, continued uptime | Production and PR preview verified Oct 19 at 9fbecb8; earlier uptime unproven |
| 6 Public repo/materials | Public source, README app/live URL/actual coverage, proper channel template | Public repo/live/README and real suites verified; channel submission pending |
| 7 Account match | Submission account equals suite-generation and App account | Portal email verified; same account generated both projects and connected the App |
| 8 CLI bonus | Optional separate genuine issue/fix/test/PR, checkbox, handle and maintainer merge | Not entered; not required for the project track |
| 9 Marketing rights | Entrant understands submission permits credited marketing use | Entrant acknowledgement required at submission |
| 10 Prize payment | Winner handles organizer's legitimate payout request privately | Conditional on winning; no payment or financial data supplied |
| 11 Final judging | Human judges decide | Cannot be completed or promised by an agent |
| 12 Age/region | Entrant confirms legal age and payout eligibility | Entrant confirmation pending; do not invent age/region |
| 13 Originality/IP | Entrant has rights; preserve third-party licenses/attributions | Existing notices preserved; entrant acknowledgement pending |
| 14 CLI contribution terms | Apache-2.0/original contribution if entering bonus | Conditional; no bonus contribution claimed |
| 15 Conduct | No prohibited/deceptive content; follow community rules | No fake tests, participants, results, votes, or engagement |
| 16 Disqualification | One entry, matching account, public repo and real PR checks | Must finish the outstanding evidence before claiming eligibility |
| 17 Privacy | Only required entrant details in the actual authorized submission | Email omitted from public files |
| 18 Changes/cancellation | Recheck official announcements before entry | Official rules/discussion read Oct 19; deadline unchanged; Season 4 submission channel inaccessible |
| 19 Governing terms | Entrant reviews applicable event terms | Acknowledgement at final submission; no legal eligibility claim |
| 20 Account/credits | Same account; real balance; credit form only when depleted | Free plan/150 credits verified; entrant reports filling form; no duplicate boost requested |
| 21 Scoring/Creator Picks | Quality 40, autonomous tests 40, innovation 20; authentic engagement only | Actual core/file coverage, automatic trigger and strict required checks; no score or recognition claimed |

The [credit boost form](https://docs.google.com/forms/d/e/1FAIpQLSf5F0r-16l5RkBbnHaYEYaDAbacZ4wESjbPyyXygjd7Ny_WWg/viewform)
was inspected: it requires **completely depleted** credits, Discord username,
TestSprite email and acknowledgement. Do not submit a duplicate or attest depletion
without the real balance. Its form window is separate from the project deadline.

## Deadlines and evidence still needed

- Project entry: **October 22, 2026, 23:59 Pacific**. At the published date's PDT
  offset this is **October 23, 08:59 Europe/Warsaw**. Confirm Discord announcements.
- Optional CLI contribution window: October 29, 23:59 Pacific. PR open/out of draft;
  merge and substantive-improvement decisions remain with maintainers/judges.
- Preserve evidence: production and PR source revisions, Vercel deployment, entry PR,
  portal project/suite/runs, genuine GitHub check/comment, required-check rules,
  automatic rerun on a new revision, Discord membership/badge/final message.

## Honest deployment boundaries

FrostCut's media, captions, edits and models run in the browser. The optional
YouTube URL importer uses a local Python/yt-dlp helper in Vite's server plugin;
Static hosting cannot run that server. This hosting does not provide a fake remote
downloader. Local file import remains the core path, and the hosted suite must
describe this limitation. Model downloads/inference require explicit user actions;
they are not started during site loading or by the basic PR suite.

Reference: [TestSprite GitHub integration](https://docs.testsprite.com/web-portal/integrations/github-integration),
[Vite public base](https://vite.dev/guide/build.html#public-base-path),
[Vercel project configuration](https://vercel.com/docs/project-configuration).

## Hosting constraint found during setup

GitHub's Pages API inherits the owner's `rubar.me` domain. HTTPS requests to
`https://rubar.me/Frostcut` returned a Vercel 404 on 2026-10-19. Do not edit the
personal site's domain, DNS or root repository to host this project. The entrant
explicitly chose a separate free Vercel project instead. The temporary empty
Frostcut Pages setup was removed; no working Pages site was deployed.

Local checks: the public-asset path test passed (162 ms), hosted metadata test
passed (491 ms), and source type-check passed. No local production build, model
or media/render job ran. The full unit suite/build ran in GitHub Actions;
the first run passed as linked above. No TestSprite run has been substituted for it.
