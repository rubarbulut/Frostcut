# Edit-dependent preview audio plans

Main and proposed-edit video layers now memoize one audio plan for their current
project/clip snapshot. The plan contains the source/timeline audio window,
audibility, source-handle crossfades, fade timing, volume and a compiled ducking
envelope. Playhead updates only evaluate the gain at the requested time.

Previously each layer calculated neighbours/handles once for playback and again
inside audioGainAt, and each music gain evaluation rebuilt/sorted all transcript
speech ranges. The compiled ducking evaluator uses the same merged ranges and
attack/release values, with binary search to the next release boundary. It keeps
the exact minimum envelope at boundary overlaps, including floating-point edges.

Plans are rebuilt by React memoization when the project or clip/draft reference
changes. They do not survive a sequence switch, undo or project replacement. No
global project cache, decoded samples, AI inference or approximate time buckets
are used. Queries are stateless and support backwards seeking.

The existing uncached helpers and export audio filters retain their behavior.
Thirteen tests across plan, crossfade and audio-tool suites passed in 754 ms,
with one worker; source type-check passed. Five new plan tests compare gain
directly with the original helpers across seeks, exact edges, music ramps,
source-speed changes, track mute, detached audio and caption overrides. They
also prove range/neighbour/transcript scans stop after plan construction and
that new edit snapshots do not change earlier plans.

Actual browser playback and a measured performance benchmark remain pending while
the user is doing animation work. These checks establish numerical equivalence
and removed lookup work, not a measured percentage improvement.
