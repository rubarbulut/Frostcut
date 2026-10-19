import { useState, type ReactNode } from 'react';
import { ChevronRight, RotateCcw } from 'lucide-react';

export interface AEGroupProps {
  id?: string;
  title: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  hasFx?: boolean;
  fxEnabled?: boolean;
  onToggleFx?: (enabled: boolean) => void;
  onReset?: () => void;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AEGroup({
  title,
  icon,
  defaultOpen = true,
  hasFx = false,
  fxEnabled = true,
  onToggleFx,
  onReset,
  badge,
  children,
  className = '',
}: AEGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`ae-group ${open ? 'is-open' : 'is-collapsed'} ${className}`}>
      <div
        className="ae-group-header"
        onClick={() => setOpen(!open)}
      >
        <button
          type="button"
          className="ae-twirl-btn"
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
        >
          <ChevronRight size={12} className={`ae-twirl-icon ${open ? 'rotated' : ''}`} />
        </button>

        {hasFx && (
          <button
            type="button"
            className={`ae-fx-toggle ${fxEnabled ? 'enabled' : 'bypassed'}`}
            title={fxEnabled ? `Bypass ${title} (click to disable)` : `Enable ${title}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFx?.(!fxEnabled);
            }}
          >
            <span>fx</span>
          </button>
        )}

        <div className="ae-group-title-wrap">
          {icon && <span className="ae-group-icon">{icon}</span>}
          <span className="ae-group-title">{title}</span>
        </div>

        {badge && <span className="ae-group-badge">{badge}</span>}

        {onReset && (
          <button
            type="button"
            className="ae-group-reset-btn"
            title={`Reset all ${title} parameters`}
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
          >
            <RotateCcw size={11} />
          </button>
        )}
      </div>

      {open && <div className="ae-group-body">{children}</div>}
    </div>
  );
}
