import { samplePeak, type StereoPeaks } from './audio-meter';

/** All preview clip gains feed one output; metering taps the actual stereo mix. */
export class PreviewAudioOutput {
  readonly input: GainNode;
  private meters?: { left: AnalyserNode; right: AnalyserNode; leftSamples: Float32Array; rightSamples: Float32Array };
  private meterFailed = false;
  constructor(readonly context: AudioContext, muted = false) {
    this.input = context.createGain();
    this.input.channelCount = 2;
    this.input.channelCountMode = 'explicit';
    this.input.channelInterpretation = 'speakers';
    this.input.connect(context.destination);
    this.setMuted(muted);
  }
  setMuted(muted: boolean) { this.input.gain.value = muted ? 0 : 1; }
  read(): StereoPeaks | null {
    if (this.context.state !== 'running' || this.meterFailed) return null;
    if (!this.meters) {
      let splitter: ChannelSplitterNode | undefined, left: AnalyserNode | undefined, right: AnalyserNode | undefined;
      try {
        splitter = this.context.createChannelSplitter(2);
        left = this.context.createAnalyser(); right = this.context.createAnalyser();
        // Cover a 30 Hz display interval, including higher sample-rate contexts.
        const size = Math.max(2048, Math.min(32768, 2 ** Math.ceil(Math.log2(this.context.sampleRate / 24))));
        left.fftSize = right.fftSize = size;
        left.smoothingTimeConstant = right.smoothingTimeConstant = 0;
        splitter.connect(left, 0); splitter.connect(right, 1);
        this.input.connect(splitter);
        this.meters = { left, right, leftSamples: new Float32Array(size), rightSamples: new Float32Array(size) };
      } catch {
        if (splitter) {
          try { this.input.disconnect(splitter); } catch { /* Tap may not have connected. */ }
          splitter.disconnect();
        }
        left?.disconnect(); right?.disconnect();
        this.meterFailed = true;
        return null;
      }
    }
    try {
      this.meters.left.getFloatTimeDomainData(this.meters.leftSamples);
      this.meters.right.getFloatTimeDomainData(this.meters.rightSamples);
      return { left: samplePeak(this.meters.leftSamples), right: samplePeak(this.meters.rightSamples) };
    } catch {
      this.meterFailed = true;
      return null;
    }
  }
}

let output: PreviewAudioOutput | undefined, muted = false;
const listeners = new Set<() => void>();
const unmetered = new Set<HTMLMediaElement>();
const playingMedia = new Set<HTMLMediaElement>();

export function ensurePreviewAudioOutput() {
  if (!output) output = new PreviewAudioOutput(new AudioContext(), muted);
  return output;
}
export const previewMuteSnapshot = () => muted;
export const previewAudioActiveSnapshot = () => playingMedia.size > 0;
export function subscribePreviewAudio(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setPreviewAudioActive(media: HTMLMediaElement, active: boolean) {
  const wasActive = previewAudioActiveSnapshot();
  if (active) playingMedia.add(media); else playingMedia.delete(media);
  if (wasActive !== previewAudioActiveSnapshot()) listeners.forEach((listener) => listener());
}
export function setPreviewMuted(value: boolean) {
  if (muted === value) return;
  muted = value;
  output?.setMuted(value);
  listeners.forEach((listener) => listener());
}
export function setUnmeteredPreview(media: HTMLMediaElement, active: boolean) {
  if (active) unmetered.add(media); else unmetered.delete(media);
}
export function readPreviewPeaks() {
  // Never report a partial mix as the master reading when native fallback is audible.
  return unmetered.size ? null : output?.read() ?? null;
}
