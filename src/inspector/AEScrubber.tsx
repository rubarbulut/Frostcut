import { useState, useRef, useEffect, type PointerEvent as ReactPointerEvent } from 'react';
import { RotateCcw } from 'lucide-react';
import { ScrubberGestureSession, commitTypedScrubberInput } from './scrubber-gesture';

export interface AEScrubberProps {
  label?: string;
  prefix?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  decimals?: number;
  defaultValue?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  onDragStart?: () => void;
  onDrag?: (value: number) => void;
  onDragEnd?: (finalValue: number) => void;
  onDragCancel?: () => void;
}

export function AEScrubber({
  label,
  prefix,
  value,
  min = -10000,
  max = 10000,
  step = 1,
  unit = '',
  decimals = 2,
  defaultValue,
  disabled = false,
  onChange,
  onDragStart,
  onDrag,
  onDragEnd,
  onDragCancel,
}: AEScrubberProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<ScrubberGestureSession | null>(null);
  const isCommittingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.destroy();
        sessionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!editing) {
      setDraft(String(Number(value.toFixed(decimals))));
    }
  }, [value, decimals, editing]);

  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  const formatDisplay = (v: number) => {
    if (Math.abs(v) < 1e-6) return '0';
    const rounded = Number(v.toFixed(decimals));
    return Number.isInteger(rounded) ? String(rounded) : rounded.toString();
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (disabled || editing) return;
    e.preventDefault();
    e.stopPropagation();

    setIsDragging(true);

    const session = new ScrubberGestureSession(
      e.clientX,
      {
        value,
        min,
        max,
        step,
        decimals,
        onDragStart,
        onDrag,
        onDragEnd: (finalVal) => {
          onDragEnd?.(finalVal);
        },
        onDragCancel: () => {
          onDragCancel?.();
        },
        onChange,
      },
      e.pointerId,
      e.currentTarget,
    );
    sessionRef.current = session;

    const onMove = (moveEv: PointerEvent) => {
      session.handleMove(moveEv.clientX, {
        shiftKey: moveEv.shiftKey,
        altKey: moveEv.altKey,
      });
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKeyDown);
      setIsDragging(false);
      sessionRef.current = null;
    };

    const onUp = () => {
      cleanup();
      session.handleUp();
    };

    const onCancel = () => {
      cleanup();
      session.handleCancel();
    };

    const onKeyDown = (keyEv: KeyboardEvent) => {
      if (keyEv.key === 'Escape') {
        keyEv.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKeyDown);
  };

  const commitEdit = () => {
    if (isCommittingRef.current) return;
    isCommittingRef.current = true;
    setEditing(false);
    const result = commitTypedScrubberInput(draft, value, {
      min,
      max,
      decimals,
      onChange,
    });
    if (!result.committed) {
      setDraft(String(Number(value.toFixed(decimals))));
    }
    queueMicrotask(() => {
      isCommittingRef.current = false;
    });
  };

  const isModified =
    defaultValue !== undefined &&
    Math.abs(value - defaultValue) > (step ? step / 10 : 0.001);

  return (
    <div
      className={`ae-scrubber ${isDragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''} ${
        isModified ? 'modified' : ''
      }`}
      title={label || `${prefix || ''} Drag to scrub value, click to type`}
    >
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          className="ae-scrubber-input"
          min={min}
          max={max}
          step={step}
          value={draft}
          autoFocus
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitEdit();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(false);
              setDraft(String(Number(value.toFixed(decimals))));
            }
          }}
          onFocus={(e) => e.target.select()}
        />
      ) : (
        <span
          className="ae-scrubber-val"
          onPointerDown={handlePointerDown}
          onClick={() => {
            if (!disabled) {
              setEditing(true);
            }
          }}
        >
          {prefix && <span className="ae-scrubber-prefix">{prefix}</span>}
          <span className="ae-scrubber-num">{formatDisplay(value)}</span>
          {unit && <span className="ae-scrubber-unit">{unit}</span>}
        </span>
      )}

      {defaultValue !== undefined && isModified && !disabled && !editing && (
        <button
          type="button"
          className="ae-scrubber-reset-btn"
          title={`Reset to default (${defaultValue}${unit})`}
          onClick={(e) => {
            e.stopPropagation();
            onChange(defaultValue);
          }}
        >
          <RotateCcw size={10} />
        </button>
      )}
    </div>
  );
}
