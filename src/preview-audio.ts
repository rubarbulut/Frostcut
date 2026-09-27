import { useEffect, type RefObject } from 'react';

let context: AudioContext | undefined;
const routes = new WeakMap<
  HTMLMediaElement,
  { source: MediaElementAudioSourceNode; gain: GainNode }
>();

/** HTMLMediaElement.volume stops at 100%; use the same 0–200% gain as export. */
export function usePreviewAudio(
  ref: RefObject<HTMLVideoElement | null>,
  gain: number,
  playing: boolean,
) {
  useEffect(() => {
    const media = ref.current;
    if (!media) return;
    let route = routes.get(media);
    if (playing && !route && typeof AudioContext !== 'undefined') {
      try {
        context ??= new AudioContext();
        const source = context.createMediaElementSource(media);
        const gainNode = context.createGain();
        source.connect(gainNode);
        gainNode.connect(context.destination);
        route = { source, gain: gainNode };
        routes.set(media, route);
      } catch {
        // A browser without Web Audio can still preview at native volume.
      }
    }
    if (route) {
      route.source.connect(route.gain);
      route.gain.connect(context!.destination);
      media.volume = 1;
      route.gain.gain.value = gain;
      if (playing && context?.state === 'suspended') void context.resume().catch(() => {});
    } else media.volume = Math.min(1, gain);
  }, [ref, gain, playing]);
  useEffect(() => {
    const media = ref.current;
    return () => {
      const route = media && routes.get(media);
      route?.source.disconnect();
      route?.gain.disconnect();
    };
  }, [ref, playing]);
}
