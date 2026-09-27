# Parts, batch status and export destinations

## Where to find the controls

- **Creator tools → Parts**: select parts, preview numbered names, choose a starting
  number and digit padding, then apply. Numbering follows sequence order. The first
  sequence is unselected by default, but can be selected explicitly.
- In the same panel, choose a source part and copy its subtitle appearance to selected
  destinations. Font, colors, spacing, animation, caption grouping, position and safe
  area follow the source. Each destination retains its own text, timing, language,
  visibility and saved presets. The source is skipped. Both bulk actions are single
  undoable project edits, preserved by existing autosave and project save/open.
- **Batch export**: select all/clear, inspect total duration and estimated size, and
  follow each part's Waiting / Rendering / Rendered / Cancelled / Failed / Skipped
  state. Rendered means encoded in memory; it is not yet a saved file. ZIP packing
  and save completion are separate status messages. No changes to encoding quality.
- Batch preflight checks every selected part's linked media, nonempty timeline and
  basic export dimensions/frame rate before starting the first render. Missing files
  are listed by part and source name. The check is refreshed when media is relinked
  and repeated on the export click. It reads metadata only; codec/decode failures
  can still occur during rendering. Expand **Preview output filenames** to inspect
  the actual ZIP entry names, including numbering and sanitized characters.
- ZIP packing reports processed MB and completed files. It scans bounded 1 MB
  buffers, periodically yields to UI input/paint, and honors cancellation between
  chunks. MP4 bytes remain unchanged. UTF-8 filenames retain their extensions when
  shortened; names that collide after sanitizing or case folding get suffixes.
  Archive headers and the central directory now count toward the size limit, which
  is checked before scanning any file for its checksum.
- **Save location**, available before a batch render and on the single MP4 result:
  edit the output filename and optionally choose a folder. After rendering, click
  **Save ZIP/MP4 to folder**. Saving reuses the existing blob; it does not render again.
  Existing names receive a numbered copy. Output extensions and Windows reserved
  names are handled. Saving errors retain the render for a retry or browser download.
- The selected folder is remembered only for this open editor session, shared by
  single and batch export. Browser permission is required; the editor only displays
  the folder name, not an absolute filesystem path. The project file contains no
  folder handle. If directory picking is unavailable, normal browser downloads
  remain usable; the UI explains the browser's "Ask where to save" setting.

## Keyboard and computation

- Subtitle number inputs accept Enter to commit and Escape to discard the draft.
- Sequence renaming commits on Enter/blur instead of writing an autosave/history
  entry for every character. Escape cancels it.
- Creator tools tabs support Left/Right, Home/End and a single tab stop. Their tab
  and panel labels are connected for assistive technology.
- Batch summary and sequence views are memoized by project/selection. Progress
  messages no longer deep-clone the current timeline or recompute every duration
  and estimated size. This is a source-level optimization, not a measured speedup.

## Lightweight validation, 2026-09-27

The user allowed short checks while gaming. TypeScript `--noEmit --incremental false`
passed. A single-worker run of `sequence-tools`, `export-destination`, `sequences`
and `equal-parts` passed **18 tests in 1.24 seconds**. The file-save tests use tiny
blobs and simulated filesystem handles; they cover duplicate names, denied permission,
cancel, write failure, and successful close. Sequence tests cover stale selections,
latest active edits, independent styles, unchanged words and persistence.

No browser, model, media render, performance benchmark or production build was run.
Native folder permissions/writes and visible keyboard/layout behavior still need a
manual check. Later, try a short existing render, select a folder, save twice and
verify the numbered copy; deny/cancel the picker and verify browser download still
works. Try bulk edits followed by Undo and project save/open.

Follow-up: preflight/ZIP changes passed **13 tests in 951 ms** (`batch-plan`, `zip`,
`export-destination`, one worker at a time) and a fresh TypeScript check. Tests verify
inactive/missing audio sources, empty parts, filename preview parity, known CRC-32,
UTF-8 ZIP headers/directory and exact stored bytes. The cancellation case uses only
1 MB of synthetic bytes; the oversize case uses a size-only stand-in and allocates
no large media file. No renderer, model, browser, benchmark or build was started.
Runtime layout and progress responsiveness under an actual export remain unverified.

API references: [directory picker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker),
[write permissions](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/requestPermission),
[file write transactions](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createWritable).
