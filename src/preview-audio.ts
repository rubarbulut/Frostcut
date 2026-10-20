import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import {
  ensurePreviewAudioOutput, previewMuteSnapshot, setPreviewAudioActive, setUnmeteredPreview, subscribePreviewAudio,
} from './preview-audio-output';
import { getMultiTrackAudioBus, type AudioBusTrackType } from './audio-bus';

export type { AudioBusTrackType };

export interface AudioRoute {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  high: BiquadFilterNode;
  low: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  connected: boolean;
  enhanced: boolean;
  role: AudioBusTrackType;
}

const routes = new WeakMap<HTMLMediaElement, AudioRoute>();

/** Exposed for inspection in tests and route verification */
export function getAudioRoute(media: HTMLMediaElement): AudioRoute | undefined {
  return routes.get(media);
}

/** Helper interface for Kaan to obtain track inputs directly */
export function getAudioBusTrackInput(role: AudioBusTrackType = 'voice'): GainNode {
  return getMultiTrackAudioBus().getTrackInput(role);
}

/**
 * Synchronizes audio routing for a given media element through MultiTrackAudioBus.
 * Used directly by usePreviewAudio and exportable for graph verification.
 */
export function syncPreviewAudioRoute(
  media: HTMLMediaElement,
  gain: number,
  playing: boolean,
  enhanced = false,
  role: AudioBusTrackType = 'voice',
  masterMuted = false,
): AudioRoute | undefined {
  const bus = getMultiTrackAudioBus();
  setPreviewAudioActive(media, playing);
  bus.notifySourceActive(media, playing);

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
      // Web Audio allows only ONE MediaElementSourceNode per HTMLMediaElement.
      const source = context.createMediaElementSource(media);
      route = { source, gain: gainNode, high, low, compressor, connected: false, enhanced, role };
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
      try { route.source.disconnect(); } catch {}
      try { route.gain.disconnect(); } catch {}
      route.connected = false;
      return route;
    }
    if (!route.connected || route.enhanced !== enhanced || route.role !== role) {
      try { route.source.disconnect(); } catch {}
      try { route.high.disconnect(); } catch {}
      try { route.low.disconnect(); } catch {}
      try { route.compressor.disconnect(); } catch {}
      try { route.gain.disconnect(); } catch {}
      if (enhanced)
        route.source
          .connect(route.high)
          .connect(route.low)
          .connect(route.compressor)
          .connect(route.gain);
      else route.source.connect(route.gain);

      // Connect clip gain to the MultiTrackAudioBus input for its role (voice, music, or sfx)
      const trackInput = bus.getTrackInput(role);
      route.gain.connect(trackInput);
      route.connected = true;
      route.enhanced = enhanced;
      route.role = role;
    }
    if (output.context.state === 'suspended') void output.context.resume().catch(() => {});
  } else media.volume = masterMuted ? 0 : Math.min(1, gain);
  return route;
}

/**
 * Cleans up and disconnects audio route for media element on unmount.
 */
export function cleanupPreviewAudioRoute(media: HTMLMediaElement) {
  setUnmeteredPreview(media, false);
  setPreviewAudioActive(media, false);
  try {
    getMultiTrackAudioBus().notifySourceActive(media, false);
  } catch {}
  const route = routes.get(media);
  if (route) {
    try { route.source.disconnect(); } catch {}
    try { route.gain.disconnect(); } catch {}
    try { route.high.disconnect(); } catch {}
    try { route.low.disconnect(); } catch {}
    try { route.compressor.disconnect(); } catch {}
    route.connected = false;
  }
}

/** HTMLMediaElement.volume stops at 100%; use the same 0–200% gain as export. */
export function usePreviewAudio(
  ref: RefObject<HTMLVideoElement | null>,
  gain: number,
  playing: boolean,
  enhanced = false,
  role: AudioBusTrackType = 'voice',
) {
  const masterMuted = useSyncExternalStore(subscribePreviewAudio, previewMuteSnapshot, previewMuteSnapshot);
  useEffect(() => {
    const media = ref.current;
    if (!media) return;
    syncPreviewAudioRoute(media, gain, playing, enhanced, role, masterMuted);
  }, [ref, gain, playing, enhanced, role, masterMuted]);

  useEffect(() => {
    const media = ref.current;
    return () => {
      if (media) cleanupPreviewAudioRoute(media);
    };
  }, [ref]);
}

