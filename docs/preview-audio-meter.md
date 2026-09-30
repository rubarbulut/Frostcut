# Preview audio output and sample peaks

The transport meter now reads actual stereo audio samples from the shared preview
output. Clip gain, fades, ducking and optional voice processing feed that output
before metering. Both the main preview and proposed-edit preview register their
actual active media routes. Silence produces no invented movement.

The speaker button mutes/unmutes the shared preview output, including native-volume
fallback playback. This is session UI state; it does not modify the project,
export volume or editor history. The keyboard-accessible button exposes its pressed
state. Per-channel meters expose measured dBFS values and show unavailable status
when Web Audio metering cannot read the complete mix.

Web Audio analysers read time-domain samples, and their outputs can remain
unconnected. The implementation uses a splitter and two independent analyser taps
without adding another audible destination connection. See the
[W3C AnalyserNode specification](https://www.w3.org/TR/webaudio/#AnalyserNode).
The output is normalized to stereo using the browser's speaker channel mixing.

These are periodic sample peaks with display release/hold behavior, not integrated
LUFS, RMS or oversampled inter-sample true peaks. Values above full scale are
preserved for dBFS/overload indication; only the visual bar is capped. A 0 dBFS or
higher sample keeps the overload indicator visible for one second.

## Resource use and fallback

- The existing preview AudioContext is shared; no file decode, waveform cache,
  model, worker or additional video is created for metering.
- Analyser taps allocate lazily on the first reading. Their float buffers are
  reused. The buffer covers a 30 Hz display interval at the context's sample rate;
  delayed/background frames are not a continuous audio recording.
- Display sampling runs at most 30 times per second while preview media is active
  and unmuted. It stops in gaps, on pause, mute and unmount. It no longer subscribes
  to playhead changes or scans every timeline clip to infer volume.
- Meter setup/read failures preserve the audible master connection. Native fallback
  retains playback; the meter reports unavailable instead of a partial/fake mix.
- Route output connections are made when connecting/changing the processing chain,
  rather than on every gain/playhead update. Paused media routes disconnect.

## Evidence and remaining checks

Seven focused tests passed in 202 ms using one worker; source type-check passed.
They cover silence, negative/above-full-scale samples, dBFS and display release,
actual gain/tap connections, independent channels, buffer reuse, suspended contexts,
meter failures preserving playback, mute before audio initialization, subscriptions,
native-fallback readings and main/proposed-preview route lifecycle.

Mocks verify routing and numerical behavior; they do not prove actual browser
playback. Still required: listen/check mono and stereo source clips, simultaneous
mixes, silent clips, track mute, detached audio, fade/duck/enhance paths, source/proxy
switches, seek and route teardown, autoplay recovery, native fallback, and confirm
muting preview leaves the exported audio intact. These browser checks are deferred
while the user is doing animation work.
