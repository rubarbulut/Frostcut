import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';

export function useTimelineNavigation(
  body: RefObject<HTMLDivElement | null>,
  zoom: number,
  setZoom: (zoom: number) => void,
  hand: boolean,
) {
  const [panning, setPanning] = useState(false);
  const cleanup = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => cleanup.current?.(), []);
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const labels = el.querySelector('.track-labels')?.getBoundingClientRect().width ?? 0;
        const x = Math.max(0, event.clientX - el.getBoundingClientRect().left - labels);
        const time = (el.scrollLeft + x) / zoom;
        const next = Math.max(8, Math.min(240, zoom * Math.exp(-event.deltaY * 0.002)));
        setZoom(next);
        requestAnimationFrame(() => {
          el.scrollLeft = time * next - x;
        });
      } else if (event.shiftKey) {
        event.preventDefault();
        el.scrollLeft += event.deltaY || event.deltaX;
      }
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [body, zoom, setZoom]);
  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      event.button !== 1 &&
      !(hand && event.button === 0 && (event.target as Element).closest('.timeline-lanes'))
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    cleanup.current?.();
    const el = event.currentTarget,
      pointer = event.pointerId;
    const start = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop };
    el.setPointerCapture(pointer);
    setPanning(true);
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      el.scrollLeft = start.left - (e.clientX - start.x);
      el.scrollTop = start.top - (e.clientY - start.y);
    };
    const finish = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', finish);
      el.removeEventListener('pointercancel', finish);
      el.removeEventListener('lostpointercapture', finish);
      if (el.hasPointerCapture(pointer)) el.releasePointerCapture(pointer);
      setPanning(false);
      cleanup.current = undefined;
    };
    cleanup.current = finish;
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', finish);
    el.addEventListener('lostpointercapture', finish);
  };
  return { panning, startPan };
}
