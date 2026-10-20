export interface ScrubberGestureOptions {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  onDragStart?: () => void;
  onDrag?: (value: number) => void;
  onDragEnd?: (finalValue: number) => void;
  onDragCancel?: () => void;
  onChange?: (value: number) => void;
}

const scheduleRaf =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb: FrameRequestCallback) => (setTimeout(cb, 16) as unknown as number);

const cancelRaf =
  typeof cancelAnimationFrame === 'function'
    ? cancelAnimationFrame
    : (id: number) => clearTimeout(id);

/**
 * Validates, clamps, and commits typed text input for scrubbers.
 * Returns true if a new valid value was committed, false if unchanged or invalid NaN.
 */
export function commitTypedScrubberInput(
  draft: string,
  currentValue: number,
  options: {
    min?: number;
    max?: number;
    decimals?: number;
    onChange: (value: number) => void;
  },
): { committed: boolean; finalValue: number } {
  const parsed = parseFloat(draft);
  if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
    const min = options.min ?? -10000;
    const max = options.max ?? 10000;
    const decimals = options.decimals ?? 2;
    const clamped = Math.max(min, Math.min(max, Number(parsed.toFixed(decimals))));
    if (clamped !== currentValue) {
      options.onChange(clamped);
      return { committed: true, finalValue: clamped };
    }
    return { committed: false, finalValue: currentValue };
  }
  return { committed: false, finalValue: currentValue };
}

/**
 * Production scrubber gesture session.
 * Manages RAF throttling, sub-pixel calculation, pointer capture,
 * final RAF flush on release, and zero-commit dismissal when pointerup occurs without movement.
 */
export class ScrubberGestureSession {
  private startX: number;
  private startVal: number;
  private lastVal: number;
  private pendingVal: number | null = null;
  private rafId: number | null = null;
  private hasMoved = false;
  private isDestroyed = false;
  private pointerId?: number;
  private targetElement?: HTMLElement | null;

  constructor(
    startX: number,
    private options: ScrubberGestureOptions,
    pointerId?: number,
    targetElement?: HTMLElement | null,
  ) {
    this.startX = startX;
    this.startVal = options.value;
    this.lastVal = options.value;
    this.pointerId = pointerId;
    this.targetElement = targetElement;

    if (pointerId !== undefined && targetElement?.setPointerCapture) {
      try {
        targetElement.setPointerCapture(pointerId);
      } catch {
        // Headless / non-browser fallback
      }
    }

    options.onDragStart?.();
  }

  handleMove(clientX: number, modifiers: { shiftKey?: boolean; altKey?: boolean } = {}) {
    if (this.isDestroyed) return;
    const dx = clientX - this.startX;
    if (Math.abs(dx) > 0) {
      this.hasMoved = true;
    }

    const speedMultiplier = modifiers.shiftKey ? 5 : modifiers.altKey ? 0.1 : 1;
    const step = this.options.step ?? 1;
    const decimals = this.options.decimals ?? 2;
    const min = this.options.min ?? -10000;
    const max = this.options.max ?? 10000;

    const deltaVal = dx * step * speedMultiplier;
    const rawVal = Math.max(min, Math.min(max, this.startVal + deltaVal));
    const quantized = Math.round(rawVal / step) * step;
    const finalVal = Math.max(min, Math.min(max, Number(quantized.toFixed(decimals + 1))));

    if (finalVal !== this.lastVal) {
      this.lastVal = finalVal;
      this.pendingVal = finalVal;
      if (this.rafId === null) {
        this.rafId = scheduleRaf(() => {
          this.rafId = null;
          if (this.pendingVal !== null && !this.isDestroyed) {
            if (this.options.onDrag) {
              this.options.onDrag(this.pendingVal);
            } else if (this.options.onChange) {
              this.options.onChange(this.pendingVal);
            }
          }
        });
      }
    }
  }

  handleUp(): boolean {
    if (this.isDestroyed) return false;
    this.cleanupCapture();

    // Final RAF flush: cancel any pending frame and flush immediately
    if (this.rafId !== null) {
      cancelRaf(this.rafId);
      this.rafId = null;
    }

    const wasMoved = this.hasMoved && this.pendingVal !== null && this.pendingVal !== this.startVal;
    const finalVal = wasMoved ? this.pendingVal! : this.startVal;

    this.isDestroyed = true;

    if (wasMoved) {
      if (this.options.onDragEnd) {
        this.options.onDragEnd(finalVal);
      } else if (this.options.onChange) {
        this.options.onChange(finalVal);
      }
      return true; // Value committed
    } else {
      // Released without movement: cancel draft preview, zero commit
      this.options.onDragCancel?.();
      return false; // No commit
    }
  }

  handleCancel() {
    if (this.isDestroyed) return;
    this.cleanupCapture();

    if (this.rafId !== null) {
      cancelRaf(this.rafId);
      this.rafId = null;
    }
    this.isDestroyed = true;
    this.options.onDragCancel?.();
  }

  destroy() {
    this.handleCancel();
  }

  private cleanupCapture() {
    if (this.pointerId !== undefined && this.targetElement?.releasePointerCapture) {
      try {
        if (this.targetElement.hasPointerCapture?.(this.pointerId)) {
          this.targetElement.releasePointerCapture(this.pointerId);
        }
      } catch {
        // Headless / non-browser fallback
      }
    }
  }

  get state() {
    return {
      startX: this.startX,
      startVal: this.startVal,
      lastVal: this.lastVal,
      pendingVal: this.pendingVal,
      hasMoved: this.hasMoved,
      isDestroyed: this.isDestroyed,
    };
  }
}

export const ScrubberGestureController = ScrubberGestureSession;
export type ScrubberGestureController = ScrubberGestureSession;
