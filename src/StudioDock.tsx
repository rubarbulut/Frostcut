import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent,
  type KeyboardEvent,
} from 'react';
import {
  clampStudioLayout,
  defaultStudioLayout,
  readStudioLayout,
  STUDIO_LAYOUT_KEY,
  STUDIO_LAYOUT_RESET,
  type StudioLayout,
} from './studio-layout';

type Divider = keyof StudioLayout;
type Drag = { axis: Divider; pointer: number; x: number; y: number; initial: StudioLayout };

export function StudioDock({
  children,
  timeline,
  inspectorOpen,
}: {
  children: ReactNode;
  timeline: ReactNode;
  inspectorOpen: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [layout, setLayout] = useState<StudioLayout>(() =>
    clampStudioLayout(readStudioLayout(), window.innerWidth, window.innerHeight - 120),
  );
  const current = useRef(layout);

  function update(value: unknown) {
    const rect = host.current?.getBoundingClientRect();
    const next = clampStudioLayout(
      value,
      rect?.width ?? window.innerWidth,
      rect?.height ?? window.innerHeight - 120,
      inspectorOpen,
    );
    current.current = next;
    setLayout(next);
    return next;
  }
  function persist() {
    try {
      localStorage.setItem(STUDIO_LAYOUT_KEY, JSON.stringify(current.current));
    } catch {
      /* Optional preference. */
    }
  }
  useEffect(() => {
    const resize = () => update(current.current);
    const reset = () => {
      drag.current = null;
      update(defaultStudioLayout);
    };
    const observer = new ResizeObserver(resize);
    if (host.current) observer.observe(host.current);
    window.addEventListener(STUDIO_LAYOUT_RESET, reset);
    resize();
    return () => {
      observer.disconnect();
      window.removeEventListener(STUDIO_LAYOUT_RESET, reset);
      drag.current = null;
    };
  }, [inspectorOpen]);

  function start(event: PointerEvent<HTMLDivElement>, axis: Divider) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      axis,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      initial: current.current,
    };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;
    const delta =
      active.axis === 'timeline'
        ? active.y - event.clientY
        : active.axis === 'inspector'
          ? active.x - event.clientX
          : event.clientX - active.x;
    update({ ...active.initial, [active.axis]: active.initial[active.axis] + delta });
  }
  function finish(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;
    if (!cancelled) move(event);
    drag.current = null;
    if (cancelled) update(active.initial);
    else persist();
  }
  function key(event: KeyboardEvent<HTMLDivElement>, axis: Divider) {
    if (event.key === 'Escape' && drag.current) {
      event.preventDefault();
      event.stopPropagation();
      const initial = drag.current.initial;
      drag.current = null;
      update(initial);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      event.stopPropagation();
      update({ ...current.current, [axis]: defaultStudioLayout[axis] });
      persist();
      return;
    }
    const direction =
      axis === 'project'
        ? { ArrowLeft: -1, ArrowRight: 1 }
        : axis === 'inspector'
          ? { ArrowLeft: 1, ArrowRight: -1 }
          : { ArrowUp: 1, ArrowDown: -1 };
    const delta = direction[event.key as keyof typeof direction];
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    update({
      ...current.current,
      [axis]: current.current[axis] + delta * (event.shiftKey ? 40 : 10),
    });
    persist();
  }
  const separator = (axis: Divider, label: string) => (
    <div
      className={`studio-splitter studio-splitter-${axis}`}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={axis === 'timeline' ? 'horizontal' : 'vertical'}
      aria-valuenow={layout[axis]}
      aria-valuemin={axis === 'timeline' ? 150 : axis === 'project' ? 200 : 240}
      aria-valuemax={
        axis === 'timeline'
          ? Math.max(layout.timeline, (host.current?.clientHeight ?? 600) - 190)
          : axis === 'project'
            ? 440
            : 420
      }
      aria-valuetext={`${layout[axis]} pixels`}
      title="Drag to resize · arrow keys adjust · Home resets"
      onPointerDown={(event) => start(event, axis)}
      onPointerMove={move}
      onPointerUp={(event) => finish(event)}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={() => {
        if (drag.current) {
          drag.current = null;
          persist();
        }
      }}
      onKeyDown={(event) => key(event, axis)}
      onDoubleClick={() => {
        update({ ...current.current, [axis]: defaultStudioLayout[axis] });
        persist();
      }}
    />
  );
  return (
    <div
      className="studio-dock"
      ref={host}
      style={
        {
          '--studio-project-width': `${layout.project}px`,
          '--studio-inspector-width': `${layout.inspector}px`,
          '--studio-timeline-height': `${layout.timeline}px`,
        } as CSSProperties
      }
    >
      <div className="editor-workspace">
        {children}
        {separator('project', 'Resize Project panel')}
        {inspectorOpen && separator('inspector', 'Resize Inspector panel')}
      </div>
      {separator('timeline', 'Resize timeline')}
      <div className="studio-timeline">{timeline}</div>
    </div>
  );
}
