# Timeline lookup without per-frame full scans

Main preview, proposed-edit preview and canvas export now build a static interval
index once for the current edit. It stores source clip references and interval
metadata, not decoded frames. Track draw order is resolved once. Each time query
prunes subtrees entirely before/after the playhead and sorts only the matching
clips into their original stable drawing order.

Preview retains the existing inclusive one-second mounting window before/after
a clip, including audio/hidden-track elements. Export retains half-open visual
clip intervals and excludes audio/hidden video tracks. No media timing, decoding,
effects, frame rate or encoding settings change.

Caption groups are also indexed once. The first matching group in original order
wins even when timings overlap; choosing the latest-starting group would change
the output. Proposed previews no longer rebuild all caption groups every frame.
Queries are stateless, so backwards seeking, loops and scrubbing are supported.
Project/sequence edits replace the memoized preview indexes.

Five focused tests passed in 346 ms using one worker; source type-check passed.
Tests compare actual project/index output against the previous scan for scrambled
clips, multiple tracks, variable speeds, gaps, overlaps, exact boundaries, caption
groups and backwards seeks. They also cover item identity, inclusive mounting
edges, disabled captions and construction-only range reads.

This removes inspected repeated lookup work. Actual playback/export speed and
memory have not been benchmarked. Browser review and real export remain pending
while the user is doing animation work; no render or model was started.
