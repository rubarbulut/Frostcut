import { useState, useRef, useEffect, type PointerEvent as ReactPointerEvent } from 'react';
import { RotateCcw } from 'lucide-react';

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
  onDragEnd?: () => void;
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
  onDragEnd,
}: AEScrubberProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

    const startX = e.clientX;
    const startVal = value;
    setIsDragging(true);
    onDragStart?.();

    let lastVal = startVal;

    const onMove = (moveEv: PointerEvent) => {
      const dx = moveEv.clientX - startX;
      // Modifier keys: Shift = 5x faster, Alt = fine precision (0.1x)
      const speedMultiplier = moveEv.shiftKey ? 5 : moveEv.altKey ? 0.1 : 1;
      const deltaVal = dx * step * speedMultiplier;
      const nextVal = clamp(startVal + deltaVal);
      const quantized = Math.round(nextVal / step) * step;
      const finalVal = clamp(Number(quantized.toFixed(decimals + 1)));

      if (finalVal !== lastVal) {
        lastVal = finalVal;
        onChange(finalVal);
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setIsDragging(false);
      onDragEnd?.();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });
  };

  const commitEdit = () => {
    setEditing(false);
    const parsed = parseFloat(draft);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      onChange(clamp(Number(parsed.toFixed(decimals))));
    } else {
      setDraft(String(Number(value.toFixed(decimals))));
    }
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
