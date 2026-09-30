import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import {
  ensurePreviewAudioOutput, previewMuteSnapshot, setPreviewAudioActive, setUnmeteredPreview, subscribePreviewAudio,
} from './preview-audio-output';

const routes = new WeakMap<
  HTMLMediaElement,
  {
    source: MediaElementAudioSourceNode;
    gain: GainNode;
    high: BiquadFilterNode;
    low: BiquadFilterNode;
    compressor: DynamicsCompressorNode;
    connected: boolean;
    enhanced: boolean;
  }
>();

/** HTMLMediaElement.volume stops at 100%; use the same 0–200% gain as export. */
export function usePreviewAudio(
  ref: RefObject<HTMLVideoElement | null>,
  gain: number,
  playing: boolean,
  enhanced = false,
) {
  const masterMuted = useSyncExternalStore(subscribePreviewAudio, previewMuteSnapshot, previewMuteSnapshot);
  useEffect(() => {
    const media = ref.current;
    if (!media) return;
    setPreviewAudioActive(media, playing);
    let route = routes.get(media);
    if (playing && !route && typeof AudioContext !== 'undefined') {
      try {
        const { context } = ensurePreviewAudioOutput();
        const gainNode = context.createGain();
        const high = context.createBiquadFilter(),
          low = context.createBiquadFilter(),
          compressor = context.createDynamicsCompressor();
        high.type = 'highpass';
        high.frequency.value = 80;
        low.type = 'lowpass';
        low.frequency.value = 8000;
        compressor.threshold.value = -18;
        compressor.ratio.value = 3;
        compressor.attack.value = 0.01;
        compressor.release.value = 0.1;
        compressor.knee.value = 6;
        // Allocate processing nodes before taking ownership of this element's audio.
        const source = context.createMediaElementSource(media);
        route = { source, gain: gainNode, high, low, compressor, connected: false, enhanced };
        routes.set(media, route);
      } catch {
        // A browser without Web Audio can still preview at native volume.
      }
    }
    setUnmeteredPreview(media, playing && !route);
    if (route) {
      const output = ensurePreviewAudioOutput();
      media.volume = 1;
      route.gain.gain.value = gain * (enhanced ? 1.5 : 1);
      if (!playing) {
        route.source.disconnect();
        route.gain.disconnect();
        route.connected = false;
        return;
      }
      if (!route.connected || route.enhanced !== enhanced) {
        route.source.disconnect();
        route.high.disconnect();
        route.low.disconnect();
        route.compressor.disconnect();
        route.gain.disconnect();
        if (enhanced)
          route.source
            .connect(route.high)
            .connect(route.low)
            .connect(route.compressor)
            .connect(route.gain);
        else route.source.connect(route.gain);
        route.gain.connect(output.input);
        route.connected = true;
        route.enhanced = enhanced;
      }
      if (output.context.state === 'suspended') void output.context.resume().catch(() => {});
    } else media.volume = masterMuted ? 0 : Math.min(1, gain);
  }, [ref, gain, playing, enhanced, masterMuted]);
  useEffect(() => {
    const media = ref.current;
    return () => {
      if (media) {
        setUnmeteredPreview(media, false);
        setPreviewAudioActive(media, false);
      }
      const route = media && routes.get(media);
      route?.source.disconnect();
      route?.gain.disconnect();
      if (route) {
        route.high.disconnect();
        route.low.disconnect();
        route.compressor.disconnect();
        route.connected = false;
      }
    };
  }, [ref, playing]);
}
