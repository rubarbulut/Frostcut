import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyMeter, meterPercent, peakDb, samplePeak, updateMeter } from './audio-meter';
import { PreviewAudioOutput } from './preview-audio-output';

function audioContext() {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const input = { ...node(), gain: { value: 1 }, channelCount: 0, channelCountMode: '', channelInterpretation: '' };
  const splitter = node();
  const channels = [0.5, 1.25];
  const analysers = channels.map((_, i) => ({
    ...node(), fftSize: 0, smoothingTimeConstant: 0,
    getFloatTimeDomainData: vi.fn((samples: Float32Array) => {
      samples.fill(0);
      samples[1] = -channels[i];
    }),
  }));
  let next = 0;
  const ctx = {
    state: 'running', sampleRate: 48000, destination: {},
    createGain: vi.fn(() => input),
    createChannelSplitter: vi.fn(() => splitter),
    createAnalyser: vi.fn(() => analysers[next++]),
  };
  return { ctx, input, splitter, analysers, channels, context: ctx as unknown as AudioContext };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('actual preview audio sample metering', () => {
  it('reads silence, both sample signs and peaks beyond digital full scale', () => {
    expect(samplePeak(new Float32Array(16))).toBe(0);
    expect(samplePeak(new Float32Array([0.1, -0.75, 0.25]))).toBe(0.75);
    expect(samplePeak(new Float32Array([-1.5, 0.5]))).toBe(1.5);
    expect(peakDb(0.5)).toBeCloseTo(-6.0206);
    expect(peakDb(2)).toBeCloseTo(6.0206);
    expect(peakDb(0)).toBe(-Infinity);
    expect(meterPercent(0)).toBe(0);
    expect(meterPercent(0.001)).toBe(0);
    expect(meterPercent(1.5)).toBe(100);
  });

  it('has immediate attack, time-based release and a real overload hold', () => {
    const peak = updateMeter(emptyMeter(), { left: 0.5, right: 1.2 }, 1 / 30);
    expect(peak.left).toBe(0.5);
    expect(peak.right).toBe(1.2);
    expect(peak.clipHold).toBe(1);
    const release = updateMeter(peak, { left: 0, right: 0 }, 0.1);
    expect(release.left).toBeLessThan(peak.left);
    expect(release.peakLeft).toBeGreaterThan(release.left);
    expect(release.clipHold).toBeCloseTo(0.9);
    const twoSteps = updateMeter(updateMeter(peak, { left: 0, right: 0 }, 0.05), { left: 0, right: 0 }, 0.05);
    expect(twoSteps.left).toBeCloseTo(release.left);
    expect(twoSteps.peakRight).toBeCloseTo(release.peakRight);
  });

  it('connects a real master gain and separate analyser taps without adding a second audible output', () => {
    const f = audioContext(), output = new PreviewAudioOutput(f.context);
    expect(f.input.connect).toHaveBeenCalledExactlyOnceWith(f.ctx.destination);
    expect(f.ctx.createAnalyser).not.toHaveBeenCalled();
    expect(output.read()).toEqual({ left: 0.5, right: 1.25 });
    expect(f.input.connect).toHaveBeenLastCalledWith(f.splitter);
    expect(f.splitter.connect).toHaveBeenCalledWith(f.analysers[0], 0);
    expect(f.splitter.connect).toHaveBeenCalledWith(f.analysers[1], 1);
    expect(f.analysers[0].connect).not.toHaveBeenCalled();
    expect(f.analysers[1].connect).not.toHaveBeenCalled();
    expect(f.input.channelCountMode).toBe('explicit');
    expect(f.input.channelCount).toBe(2);
    output.setMuted(true);
    expect(f.input.gain.value).toBe(0);
    output.setMuted(false);
    expect(f.input.gain.value).toBe(1);
  });

  it('reuses sample buffers and responds to source changes, not elapsed-time jitter', () => {
    const f = audioContext(), output = new PreviewAudioOutput(f.context);
    output.read();
    f.channels[0] = 0; f.channels[1] = 0.25;
    expect(output.read()).toEqual({ left: 0, right: 0.25 });
    expect(f.ctx.createAnalyser).toHaveBeenCalledTimes(2);
    const calls = f.analysers[0].getFloatTimeDomainData.mock.calls;
    expect(calls[1][0]).toBe(calls[0][0]);
    expect(calls[0][0].length).toBeGreaterThanOrEqual(f.ctx.sampleRate / 30);
    f.ctx.state = 'suspended';
    expect(output.read()).toBeNull();
    expect(f.analysers[0].getFloatTimeDomainData).toHaveBeenCalledTimes(2);
    f.ctx.state = 'running';
    expect(output.read()).toEqual({ left: 0, right: 0.25 });
  });

  it('keeps playback connected and reports unavailable if metering fails', () => {
    const f = audioContext();
    f.ctx.createAnalyser.mockImplementation(() => { throw new Error('Not supported'); });
    const output = new PreviewAudioOutput(f.context, true);
    expect(output.read()).toBeNull();
    expect(output.read()).toBeNull();
    expect(f.ctx.createAnalyser).toHaveBeenCalledOnce();
    expect(f.input.disconnect).not.toHaveBeenCalledWith(f.ctx.destination);
    expect(f.input.gain.value).toBe(0);
  });

  it('persists mute before audio creation, notifies subscribers and rejects partial fallback readings', async () => {
    vi.resetModules();
    const f = audioContext();
    vi.stubGlobal('AudioContext', class { constructor() { return f.context; } });
    const bus = await import('./preview-audio-output');
    const listener = vi.fn(), unsubscribe = bus.subscribePreviewAudio(listener);
    bus.setPreviewMuted(true);
    expect(bus.previewMuteSnapshot()).toBe(true);
    expect(f.ctx.createGain).not.toHaveBeenCalled();
    bus.ensurePreviewAudioOutput();
    expect(f.input.gain.value).toBe(0);
    bus.setPreviewMuted(false);
    expect(f.input.gain.value).toBe(1);
    expect(listener).toHaveBeenCalledTimes(2);
    const fallback = {} as HTMLMediaElement;
    bus.setUnmeteredPreview(fallback, true);
    expect(bus.readPreviewPeaks()).toBeNull();
    bus.setUnmeteredPreview(fallback, false);
    expect(bus.readPreviewPeaks()).toEqual({ left: 0.5, right: 1.25 });
    unsubscribe();
    bus.setPreviewMuted(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('tracks actual active media across main/proposed previews and stops after the final route leaves', async () => {
    vi.resetModules();
    const bus = await import('./preview-audio-output');
    const main = {} as HTMLMediaElement, proposed = {} as HTMLMediaElement;
    const listener = vi.fn(), unsubscribe = bus.subscribePreviewAudio(listener);
    expect(bus.previewAudioActiveSnapshot()).toBe(false);
    bus.setPreviewAudioActive(main, true);
    expect(bus.previewAudioActiveSnapshot()).toBe(true);
    bus.setPreviewAudioActive(proposed, true);
    bus.setPreviewAudioActive(main, false);
    expect(bus.previewAudioActiveSnapshot()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    bus.setPreviewAudioActive(proposed, false);
    expect(bus.previewAudioActiveSnapshot()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
