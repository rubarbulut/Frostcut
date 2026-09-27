# Local editing preference memory

Open **Creator tools → Style memory** and enable **Learn from accepted edits**.
Learning is off initially. It records accepted Auto Cut options and caption styles
changed by an accepted AI edit. **Approve current caption style** records an explicit
style approval. Ordinary manual edits do not automatically train the memory.

This is preference counting from actual accepted settings. It does not train a
model, analyze footage, download models or make network requests.

## Recommendations

- Auto Cut shows remembered choices for the current goal and video format
  (portrait, landscape or square). **Use remembered choices** fills its setup form;
  the user still generates, previews and accepts the resulting edit separately.
- The Style memory panel suggests a caption profile for the current format.
  **Apply remembered caption style** is a normal undoable edit to that sequence.
  Applying a suggestion does not count as another training example by itself.
- At least two agreeing project/sequence votes are needed. Each project/sequence
  contributes its latest active vote for that preference and context. Repeated
  approvals in one sequence cannot dominate the result. The most common complete
  configuration wins; ties prefer the most recently approved configuration.
- Suggestions show their matching and total vote counts; caption suggestions
  also list supporting project names. Counts are evidence, not accuracy scores.
- **Dismiss** suppresses that exact suggested configuration. **Show dismissed
  suggestions** clears dismissals. No suggested settings are applied automatically.

## Undo and persistence

Actual editor history entries carry observation identifiers. Undo and Revert AI
mark the corresponding observations undone; Redo restores them without duplicates.
An earlier accepted choice in the same sequence can become the active vote again.
Manual caption approvals are independent decisions, rather than project edits.

Turning learning off stops new observations but retains existing preferences.
**Forget** removes an individual observation. **Forget memory and turn learning off**
resets everything. Undo/Redo cannot recreate forgotten observations. Explicitly
importing an older backup can restore them.

The latest 100 observations are stored in browser local storage independently of
project files. They contain settings, project/sequence identifiers, project names
and decision dates. Media, transcript text and prompts are not included. Browser
origins (including different localhost ports) have separate memories.

**Export memory** and **Import memory** support JSON backup/merge. Imports validate
the schema, reject unsupported values and files over 1 MB, retain the current
learning switch, and preserve the current record when observation IDs collide.
Export a backup before resetting memory or clearing browser data.

Storage errors are visible. Project editing continues and the in-session memory
still follows Undo/Redo; **Retry saving memory** writes the latest state. An unreadable
saved memory requires an explicit reset before new recording to avoid silently
overwriting it. Separate open editor tabs do not synchronize this memory live.

## Verification and remaining review

Ten focused tests passed in a single worker (934 ms total), including actual editor
commit/undo/redo/revert integration, disabled/manual behavior, forgotten observations,
generation-time options snapshots, vote isolation, independent copies, import
validation and simulated storage failure/retry. Source type-check passed.

No model inference, media rendering, browser suite or production build was run for
this delivery while the user was gaming. Still review the following interactively:

1. Enable learning, accept matching Auto Cut choices in two projects, and apply
   the resulting setup suggestion. Check the editor preview before accepting.
2. Approve caption styles in two sequences; inspect, apply and undo the suggestion.
3. Undo/Redo and Revert AI should update the observation list. Forget a record,
   redo its edit and verify it remains forgotten.
4. Reload, export/import, dismiss/show and reset. Check keyboard and narrow layout.

Generalized content/style inference, analytics feedback and model fine-tuning are
not part of this preference-memory feature.
