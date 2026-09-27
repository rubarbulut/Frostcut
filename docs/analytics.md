# Learn from imported performance reports

Open **Creator tools → Analytics**. This feature compares real metrics supplied in
a CSV report with edit settings you explicitly link to the published video.
It does not connect an analytics account, manufacture metrics, train a model or
upload footage. No demo results are included in the application.

## Import a report

1. Export a report from your analytics service as UTF-8 CSV. One record must
   represent one video. Keep a stable video/content ID, views, and average
   percentage viewed. Title is optional. A header-only template is available.
2. Enter the platform, channel/account, audience/report group and report date
   range. These fields must match the report you exported. They form a comparison
   boundary; platforms, accounts, report groups and dates are never mixed.
3. Select comma, semicolon or tab delimiters and the decimal separator. Map the
   actual columns in your report. Localized headers work through manual mapping.
   Use plain numbers without thousands separators and percent units (72.5 means
   72.5%, not 0.725). Replay values above 100% are accepted up to 1000%.
4. Review the proposed rows. Missing or invalid metrics are errors, not zeroes.
   Duplicate IDs, known aggregate labels and malformed rows are listed as skipped.
   Uncheck any other aggregate or unwanted row before choosing **Import selected
   rows**. No saved data changes before this step.

The parser handles quoted fields, escaped quotes and embedded newlines. CSV is
limited to 1 MB, 100 columns and 300 nonempty video rows. Provenance includes the
source filename, SHA-256 of its original bytes, import time and CSV record number.
Record numbering counts the header and blank records; a quoted multiline field
belongs to one CSV record. The hash identifies the supplied file, not its authenticity.
Reading/hashing needs a secure browser context, including localhost.

## Link the published edit

Open the sequence that actually produced a reported video. Choose **Link current
edit**, review the captured project/sequence name, format, duration, base-track
clip count and caption style, then explicitly confirm it matches that video.
Links capture settings only. No media or transcript text is copied.

The snapshot stays fixed when that project is edited later. Replacing a link
requires another review. Unlinking keeps the source metrics; removing the record
removes its metrics and snapshot. Reimporting the same video/report updates its
metrics/provenance without replacing its linked edit or adding a duplicate vote.
A different period remains a separate report record.

Base-track clip counts use visible V1, or the lowest visible video track if V1 is
absent/hidden. Clips per minute are counts divided by timeline duration; this is
a simple edit-density descriptor, not a measured cut rhythm or motion statistic.
Timeline duration includes the full sequence, including any trailing audio.

## What learning means here

- Comparisons require linked videos from the selected report and current format
  with at least 100 views each. This filter is not a confidence/significance claim.
- Caption profiles and base-track clip density are compared within the current
  duration band: up to 30 seconds, over 30–60 seconds, over 1–3 minutes, or over
  3 minutes. Duration comparisons span these bands within the same format/report.
- Caption groups use the complete saved style plus enabled state. Density groups
  are up to 6, over 6–20 and over 20 base-track clips per minute.
- A candidate needs at least two videos in its group and two outside it. The
  qualifying group with the highest equal-video mean percentage viewed is compared
  against the rest. An observation is shown only if the mean difference is at
  least 1 percentage point. View counts do not weight this average.
- Each observation lists both groups' video IDs, titles, metrics and source records.
  It is an association in these imported observations, not causal evidence or a
  forecast. Topic, audience, distribution, video age and repeated/reused edits
  remain possible confounders. The app does not run significance tests or A/B tests.
- **Try these caption settings** makes an ordinary undoable project edit. Exact
  proposed settings are inspectable first. Duration/density observations are ideas
  for a future edit and do not alter timeline timing. Nothing is applied automatically.

Dismissals persist and can be cleared. Analytics comparisons do not become style
memory training examples automatically.

## Storage and verification

Up to 300 video/report records and 100 dismissals are stored in browser local
storage, independently of project files. JSON backup/merge supports up to 2 MB.
Current local records win backup ID collisions, including explicit unlinks.
Export a backup before clearing analytics or browser data. Different browser
origins/ports have separate libraries. Storage failures display an error and keep
the previous saved view; unreadable storage requires explicit reset/recovery.

Nine focused tests passed in one worker (333 ms total); source type-check passed.
Coverage includes CSV quoting/record provenance, missing/duplicate/aggregate
metrics, locale numbers and limits, immutable edit snapshots, report identity,
backup conflicts and storage failures, exact comparison arithmetic, minimum
samples, format/date/channel isolation, and duration/density grouping.

Browser import/link/apply/undo flows, a user-supplied report and production build
remain unverified while the user is gaming. No model, render or browser suite
was run. Review those flows and source-report reconciliation before closing
this P2 feature. OAuth analytics ingestion is not implemented; this is a usable
local file-import path and does not claim a connected account.
