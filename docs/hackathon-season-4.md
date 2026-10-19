# TestSprite Season 4: FrostCut entry and evidence

Owner: Rubar, solo entrant. Repository: https://github.com/rubarbulut/Frostcut.
Account email and private account details belong in the actual submission, not this
public repository. This is a preparation/evidence record, **not a submitted entry**.

## Current implementation

- GitHub's repository API confirmed the repository is public on 2026-10-19.
- User selected free **Vercel Hobby** hosting. The new `rubar/frostcut` project
  serves https://frostcut.vercel.app/ (HTTP 200 verified). Its initial `main`
  deployment is 66ea8dd and does not yet contain the isolation/metadata changes;
  publish the prepared PR source before claiming complete runtime verification.
- [PR #1](https://github.com/rubarbulut/Frostcut/pull/1) opened 2026-10-19 and
  [quality run 39246105008](https://github.com/rubarbulut/Frostcut/actions/runs/39246105008)
  passed: 229 tests in 37 files (6.72 s), hosted metadata test, and production build.
- The actual TestSprite account matches the entrant's provided email. Profile
  name is Rubar; Free plan shows 150 credits before generation. No trial/upgrade
  was accepted. The suite and TestSprite GitHub App remain outstanding.
- The entrant saved the Vercel GitHub App selection for Frostcut. The repo then
  appeared in Vercel's import list. Existing personal-site selection was retained.
- `.github/workflows/quality.yml` runs real unit checks, metadata checks and a
  production build on GitHub. Vercel's GitHub integration will deploy the app and
  independent PR previews; no publishing token is placed in this repository.
- `build:hosted` records the real Vercel/CI source revision in `_deployment.json`.
  scripts/verify-deployment.mjs checks that revision and runtime/demo/font/model
  assets over HTTPS, and requires the actual document isolation headers.
- Asset URLs respect Vite's public base. `vercel.json` preserves the existing
  COOP/COEP headers directly; no new service worker or host shim is bundled.
- Nested-sequence work stays separately on `codex/nested-sequences` (73396b1).
  It is incomplete and is not included in this entry's public editor as finished.

GitHub CI/Vercel is **not the TestSprite integration**. No local test result,
hand-authored plan, green build, or readiness document proves a generated portal
suite, GitHub App installation, or a real TestSprite PR result.

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
| 1 Eligibility | X follow and Discord membership with badge | Handles/access and actual verification pending |
| 2 Single entry | Check channel for an existing entry, submit once | No entry sent by this agent |
| 3 Team | List every member | Entrant confirmed Rubar, solo |
| 4 Portal + GitHub App | Portal-generated suite, same-account App, in-window PR with authentic result | Account verified, PR #1 open; no generated suite/TestSprite result yet |
| 5 Public app throughout build | Reachable URL, version evidence, continued uptime | Vercel app HTTP 200 on Oct 19; runtime update pending, earlier uptime unproven |
| 6 Public repo/materials | Public source, README app/live URL/actual coverage, proper channel template | Public repo verified; live/tests/submission still pending |
| 7 Account match | Submission account equals suite-generation and App account | Portal email verified; use this same account for pending generation/App steps |
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
| 18 Changes/cancellation | Recheck official announcements before entry | Website read; server announcements still need access |
| 19 Governing terms | Entrant reviews applicable event terms | Acknowledgement at final submission; no legal eligibility claim |
| 20 Account/credits | Same account; real balance; credit form only when depleted | Free plan/150 credits verified; entrant reports filling form; no duplicate boost requested |
| 21 Scoring/Creator Picks | Quality 40, autonomous tests 40, innovation 20; authentic engagement only | Coverage/PR integration being built; no score or recognition claimed |

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
or media/render job ran. The full unit suite/build will run in GitHub Actions;
the first run passed as linked above. No TestSprite run has been substituted for it.
