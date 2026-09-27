import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Clip } from './model';
import { useEditor } from './store';
export function dragClipProperties(
  event: ReactPointerEvent,
  clip: Clip,
  label: string,
  change: (dx: number, dy: number) => Clip,
) {
  event.preventDefault();
  event.stopPropagation();
  const state = useEditor.getState(),
    snapshot = state.project;
  state.setPlaying(false);
  const startX = event.clientX,
    startY = event.clientY;
  let latest: Clip | undefined;
  const move = (e: PointerEvent) => {
    latest = change(e.clientX - startX, e.clientY - startY);
    useEditor.getState().setPreviewClip(latest);
  };
  const cleanup = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', key);
  };
  const cancel = () => {
    cleanup();
    useEditor.getState().setPreviewClip(undefined);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') cancel();
  };
  const up = () => {
    cleanup();
    useEditor.getState().setPreviewClip(undefined);
    if (latest)
      state.commit(
        { ...snapshot, clips: snapshot.clips.map((c) => (c.id === clip.id ? latest! : c)) },
        label,
      );
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up, { once: true });
  window.addEventListener('pointercancel', cancel, { once: true });
  window.addEventListener('keydown', key);
}
