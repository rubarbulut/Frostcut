import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Columns3, Maximize2, RotateCcw } from 'lucide-react';
import { resetStudioLayout } from './studio-layout';

type Action = { label: string; shortcut?: string; run: () => void; disabled?: boolean };
export function StudioMenu({
  onNew,
  onOpen,
  onImport,
  onSave,
  onUndo,
  onRedo,
  onShortcuts,
  onInspectorChange,
  inspectorOpen,
  canUndo,
  canRedo,
  busy,
}: {
  onNew: () => void;
  onOpen: () => void;
  onImport: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onShortcuts: () => void;
  onInspectorChange: (value: boolean) => void;
  inspectorOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
}) {
  const [open, setOpen] = useState<string>();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const menus: Record<string, Action[]> = {
    File: [
      { label: 'Import recording…', run: onImport, disabled: busy },
      { label: 'New project…', run: onNew, disabled: busy },
      { label: 'Open project…', run: onOpen, disabled: busy },
      { label: 'Save project backup', shortcut: 'Ctrl S', run: onSave },
    ],
    Edit: [
      { label: 'Undo', shortcut: 'Ctrl Z', run: onUndo, disabled: !canUndo || busy },
      { label: 'Redo', shortcut: 'Ctrl Shift Z', run: onRedo, disabled: !canRedo || busy },
    ],
    View: [
      {
        label: inspectorOpen ? 'Hide Inspector' : 'Show Inspector',
        run: () => onInspectorChange(!inspectorOpen),
      },
      { label: 'Default workspace', run: () => onInspectorChange(true) },
      { label: 'Focus workspace', run: () => onInspectorChange(false) },
      { label: 'Reset panel layout', run: resetStudioLayout },
    ],
    Help: [{ label: 'Keyboard shortcuts', shortcut: '?', run: onShortcuts }],
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: globalThis.PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(undefined);
    };
    window.addEventListener('pointerdown', outside);
    return () => window.removeEventListener('pointerdown', outside);
  }, [open]);
  function keys(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(undefined);
      trigger.current?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const items = Array.from(
      root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
    );
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }
  return (
    <div
      className="studio-menu-bar"
      ref={root}
      onKeyDown={keys}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(undefined);
      }}
    >
      <nav className="studio-app-menus" aria-label="Editor menu">
        {Object.entries(menus).map(([name, actions]) => (
          <div className="studio-menu-anchor" key={name}>
            <button
              aria-haspopup="menu"
              aria-expanded={open === name}
              onClick={(event) => {
                trigger.current = event.currentTarget;
                setOpen(open === name ? undefined : name);
              }}
            >
              {name}
            </button>
            {open === name && (
              <div role="menu" aria-label={`${name} menu`} className="studio-menu-popover">
                {actions.map((action) => (
                  <button
                    role="menuitem"
                    key={action.label}
                    disabled={action.disabled}
                    onClick={() => {
                      setOpen(undefined);
                      action.run();
                    }}
                  >
                    {action.label}
                    <kbd>{action.shortcut}</kbd>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
      <span className="studio-workspace-caption">Workspace</span>
      <div className="studio-workspace-options" aria-label="Workspace view">
        <button aria-pressed={inspectorOpen} onClick={() => onInspectorChange(true)}>
          <Columns3 size={12} />
          Default
        </button>
        <button aria-pressed={!inspectorOpen} onClick={() => onInspectorChange(false)}>
          <Maximize2 size={12} />
          Focus
        </button>
        <button
          aria-label="Reset panel layout"
          title="Reset panel layout"
          onClick={resetStudioLayout}
        >
          <RotateCcw size={12} />
        </button>
      </div>
    </div>
  );
}
