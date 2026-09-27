# Local caption brand kits

Open **Creator tools → Brand kit**. Give the kit a name and choose **Create from
current style**. Its first example is the current sequence's caption appearance.
This works without loading, decoding or transcribing a video.

**Edit kit style** exposes typography, colors, size, spacing, placement, outline
and caption background controls. Animation and other captured settings can be
changed in the main caption panel, then captured as another approved example.
The sample illustrates text styling; use the editor preview to check final placement,
background and animation. Applying a kit never turns captions on or off.

## Learning and application

1. Open a project/sequence whose style you want to use as an example.
2. Choose the kit and **Approve current sequence as example**. Re-approving the
   same project/sequence replaces its existing example instead of adding votes.
3. Review the suggested style's matching example count and names. The most common
   complete style wins; ties use the most recent approval. This is a deterministic
   preference learned from approved examples, not a model trained on your footage.
4. Choose **Use learned style in kit** to replace the kit's current style. You can
   edit it further. Capturing an example alone does not overwrite manual kit edits.
5. Choose **Apply to current sequence**. The editor's Undo restores the previous
   project style. Other sequences, transcript text/timing, subtitle language,
   speaker identities, saved presets and media remain unchanged.

Speaker accent colors remain project-specific when "Use speaker colors for
accents" is enabled; turn that setting off for the kit's single accent color.
Style sizes are relative to video width, so a kit scales across resolutions.

## Storage and portability

- Up to 20 kits with 20 approved examples per kit. Profiles contain only caption
  settings and example project/sequence labels and identifiers; no footage or transcript.
- Kits live in browser local storage, independently from project files. Their
  applied style becomes ordinary project data and is saved with the project.
- **Export kit** downloads a `.frostcut-brand.json` backup. **Import kit** validates
  it and creates a new identity/name; it never overwrites an existing kit.
- Kits belong to the current browser origin. A different port/browser or cleared
  site data means a different library; import the backup there.
- Storage failures are shown and do not report a successful save. Deleting a kit
  does not change already-applied project styles; the latest deletion can be restored
  while this panel stays open. Export before clearing site data.

## Verification and remaining review

`src/brand-kits.test.ts`: 7 focused tests passed (358 ms); source type-check passed.
The tests verify canonical independent style copies, actual approved-example votes,
tie handling, re-approval, import validation, persistence, capacity limits and
unchanged target project content/preferences.

Browser review is deferred under the user's gaming constraint. Review later:

- Create a kit, edit its colors/spacing, switch projects and reopen it.
- Approve two matching examples and one different example; review the count,
  use the suggestion, apply it, then Undo.
- Export/import a kit, verify its new name, delete it and restore it.
- Check that blocked storage or malformed imports show an error.
- Check mobile tab navigation/layout. Run a production build once coordinated
  with the other agent's changes in the shared checkout.

No render or model run is required to review the brand-kit flow.
