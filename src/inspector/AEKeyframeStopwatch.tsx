import { Diamond, ChevronLeft, ChevronRight } from 'lucide-react';

export interface AEKeyframeStopwatchProps {
  label: string;
  hasKeyframes: boolean;
  isOnKeyframe: boolean;
  canKeyframe: boolean;
  onToggle: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export function AEKeyframeStopwatch({
  label,
  hasKeyframes,
  isOnKeyframe,
  canKeyframe,
  onToggle,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
}: AEKeyframeStopwatchProps) {
  return (
    <div className={`ae-keyframe-stopwatch ${hasKeyframes ? 'has-track' : ''} ${isOnKeyframe ? 'on-frame' : ''}`}>
      {hasKeyframes && (
        <button
          type="button"
          className="ae-kf-nav-btn prev"
          disabled={!hasPrev || !canKeyframe}
          onClick={onPrev}
          title={`Previous ${label} keyframe`}
        >
          <ChevronLeft size={10} />
        </button>
      )}

      <button
        type="button"
        className={`ae-kf-diamond-btn ${isOnKeyframe ? 'active' : ''} ${hasKeyframes ? 'active-track' : ''}`}
        disabled={!canKeyframe}
        onClick={onToggle}
        title={
          !canKeyframe
            ? 'Playhead outside clip or track locked'
            : isOnKeyframe
              ? `Remove ${label} keyframe at playhead`
              : hasKeyframes
                ? `Add ${label} keyframe at playhead`
                : `Enable keyframing for ${label}`
        }
      >
        <Diamond
          size={11}
          fill={isOnKeyframe ? 'currentColor' : 'none'}
          strokeWidth={isOnKeyframe ? 0 : 2}
        />
      </button>

      {hasKeyframes && (
        <button
          type="button"
          className="ae-kf-nav-btn next"
          disabled={!hasNext || !canKeyframe}
          onClick={onNext}
          title={`Next ${label} keyframe`}
        >
          <ChevronRight size={10} />
        </button>
      )}
    </div>
  );
}
