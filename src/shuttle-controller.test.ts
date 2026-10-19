import { describe, it, expect, beforeEach } from 'vitest';
import {
  getNextForwardRate,
  getNextReverseRate,
  calculateFrameAccurateTime,
  quantizeToFrame,
  GopAwareReverseEngine,
  executeShuttleL,
  executeShuttleK,
  executeShuttleJ,
  executeStep,
  handleShuttleDeckKeyboard,
} from './shuttle-controller';
import { useEditor } from './store';
import { createProject, defaultProps } from './model';

describe('J-K-L Shuttle Deck & GOP-Aware Frame-Accurate Step Motor (PR #406)', () => {
  beforeEach(() => {
    const proj = createProject();
    proj.settings.fps = 30; // 30 FPS standard
    proj.clips = [
      {
        id: 'clip-1',
        mediaId: 'm1',
        start: 0,
        sourceStart: 0,
        sourceEnd: 10,
        trackId: 'V1',
        properties: defaultProps,
      },
    ];
    useEditor.getState().load(proj);
    useEditor.setState({ playhead: 5.0, playing: false, previewRate: 1 });
  });

  describe('J-K-L Shuttle Deck Controller', () => {
    it('L key steps 1x -> 2x -> 4x -> 8x and clamps at 8x', () => {
      expect(getNextForwardRate(1, false)).toBe(1); // paused -> 1x
      expect(getNextForwardRate(1, true)).toBe(2);  // 1x -> 2x
      expect(getNextForwardRate(2, true)).toBe(4);  // 2x -> 4x
      expect(getNextForwardRate(4, true)).toBe(8);  // 4x -> 8x
      expect(getNextForwardRate(8, true)).toBe(8);  // clamped at 8x
    });

    it('J key steps -1x -> -2x -> -4x -> -8x and clamps at -8x', () => {
      expect(getNextReverseRate(1, false)).toBe(-1);  // paused -> -1x
      expect(getNextReverseRate(-1, true)).toBe(-2);  // -1x -> -2x
      expect(getNextReverseRate(-2, true)).toBe(-4);  // -2x -> -4x
      expect(getNextReverseRate(-4, true)).toBe(-8);  // -4x -> -8x
      expect(getNextReverseRate(-8, true)).toBe(-8);  // clamped at -8x
    });

    it('Switches direction instantly between reverse and forward', () => {
      // If currently reverse, L switches directly to forward 1x
      expect(getNextForwardRate(-2, true)).toBe(1);
      // If currently forward, J switches directly to reverse -1x
      expect(getNextReverseRate(4, true)).toBe(-1);
    });

    it('executes L, K, J state transitions via store actions', () => {
      // 1. Initial: paused, rate 1
      executeShuttleL();
      expect(useEditor.getState().playing).toBe(true);
      expect(useEditor.getState().previewRate).toBe(1);

      // 2. Press L again: 2x
      executeShuttleL();
      expect(useEditor.getState().previewRate).toBe(2);

      // 3. Press L again: 4x
      executeShuttleL();
      expect(useEditor.getState().previewRate).toBe(4);

      // 4. Press L again: 8x
      executeShuttleL();
      expect(useEditor.getState().previewRate).toBe(8);

      // 5. Press K: Zero latency hard freeze
      executeShuttleK();
      expect(useEditor.getState().playing).toBe(false);
      expect(useEditor.getState().previewRate).toBe(1);

      // 6. Press J: Starts reverse -1x
      executeShuttleJ();
      expect(useEditor.getState().playing).toBe(true);
      expect(useEditor.getState().previewRate).toBe(-1);

      // 7. Press J again: -2x
      executeShuttleJ();
      expect(useEditor.getState().previewRate).toBe(-2);

      // 8. Press J again: -4x
      executeShuttleJ();
      expect(useEditor.getState().previewRate).toBe(-4);

      // 9. Hard freeze again
      executeShuttleK();
      expect(useEditor.getState().playing).toBe(false);
    });
  });

  describe('Frame-Accurate Step Motor & Mathematical Lock', () => {
    it('locks stepping mathematically to exact project FPS without drift', () => {
      const fps30 = 30;
      const initial = 1.0;

      // 1 frame forward: 1.0 + (1/30) = 1.033333
      const step1 = calculateFrameAccurateTime(initial, 1, fps30, 100);
      expect(step1).toBe(1.033333);

      // 1 frame backward: 1.033333 - (1/30) = 1.000000 exactly
      const stepBack = calculateFrameAccurateTime(step1, -1, fps30, 100);
      expect(stepBack).toBe(1.0);
    });

    it('locks correctly at 60 FPS (0.016667s)', () => {
      const fps60 = 60;
      const initial = 2.0;

      const step1 = calculateFrameAccurateTime(initial, 1, fps60, 100);
      expect(step1).toBe(2.016667);

      const stepBack = calculateFrameAccurateTime(step1, -1, fps60, 100);
      expect(stepBack).toBe(2.0);
    });

    it('guarantees zero drift over 100 back-and-forth steps', () => {
      const fps = 30;
      let time = 5.0;

      // Step forward 100 times
      for (let i = 0; i < 100; i++) {
        time = calculateFrameAccurateTime(time, 1, fps, 100);
      }

      // Step backward 100 times
      for (let i = 0; i < 100; i++) {
        time = calculateFrameAccurateTime(time, -1, fps, 100);
      }

      // Must be EXACTLY 5.0, not 5.000000000000001
      expect(time).toBe(5.0);
    });

    it('supports 5-frame hop-stepping with Alt key', () => {
      const fps = 30;
      const initial = 1.0;

      // 5 frames forward = 5 / 30 = 0.166667s
      const hopForward = calculateFrameAccurateTime(initial, 5, fps, 100);
      expect(hopForward).toBe(1.166667);

      // 5 frames backward = returns to 1.0
      const hopBackward = calculateFrameAccurateTime(hopForward, -5, fps, 100);
      expect(hopBackward).toBe(1.0);
    });

    it('clamps to boundaries (0 and total duration)', () => {
      const fps = 30;
      const clampedStart = calculateFrameAccurateTime(0.01, -5, fps, 10);
      expect(clampedStart).toBe(0);

      const clampedEnd = calculateFrameAccurateTime(9.99, 5, fps, 10);
      expect(clampedEnd).toBe(10);
    });

    it('performs frame stepping well under performance threshold (< 15 ms)', () => {
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        executeStep(1);
      }
      const elapsed = performance.now() - start;
      const perStep = elapsed / 100;
      // Per-step execution must be well below 15ms (typically < 0.1ms)
      expect(perStep).toBeLessThan(15);
    });
  });

  describe('GOP-Aware Reverse Engine', () => {
    it('computes reverse playhead and quantizes to frame grid', () => {
      const engine = new GopAwareReverseEngine();
      const current = 5.0;
      const elapsed = 0.033333; // 1 frame duration at 30 FPS
      const next = engine.computeNextReversePlayhead(current, elapsed, -1, 30);

      expect(next).toBeLessThan(current);
      const quantized = quantizeToFrame(next, 30);
      expect(quantized).toBe(4.966667);
    });

    it('throttles redundant seeks to protect video hardware decoder pipeline', () => {
      const engine = new GopAwareReverseEngine();
      const fps = 30;

      // First seek with significant difference: allowed
      expect(engine.shouldSeekVideoElement(4.5, 4.6, fps, -1)).toBe(true);

      // Sub-frame insignificant difference: throttled (false)
      expect(engine.shouldSeekVideoElement(4.502, 4.5, fps, -1)).toBe(false);
    });
  });

  describe('Keyboard Event Dispatcher', () => {
    it('handles L, K, J and Arrow keys cleanly', () => {
      let prevented = false;
      const preventDefault = () => { prevented = true; };

      // 1. Press 'L'
      expect(handleShuttleDeckKeyboard({ key: 'l', preventDefault })).toBe(true);
      expect(prevented).toBe(true);
      expect(useEditor.getState().playing).toBe(true);
      expect(useEditor.getState().previewRate).toBe(1);

      // 2. Press 'K'
      expect(handleShuttleDeckKeyboard({ key: 'k', preventDefault })).toBe(true);
      expect(useEditor.getState().playing).toBe(false);

      // 3. Press 'J'
      expect(handleShuttleDeckKeyboard({ key: 'j', preventDefault })).toBe(true);
      expect(useEditor.getState().playing).toBe(true);
      expect(useEditor.getState().previewRate).toBe(-1);

      // 4. Press ArrowRight (+1 frame)
      const prevPlayhead = useEditor.getState().playhead;
      expect(handleShuttleDeckKeyboard({ key: 'ArrowRight', preventDefault })).toBe(true);
      expect(useEditor.getState().playhead).toBeGreaterThan(prevPlayhead);

      // 5. Press ArrowLeft with Alt (+5 frame hop backward)
      const beforeHop = useEditor.getState().playhead;
      expect(handleShuttleDeckKeyboard({ key: 'ArrowLeft', altKey: true, preventDefault })).toBe(true);
      expect(useEditor.getState().playhead).toBeLessThan(beforeHop);
    });

    it('ignores input fields and modifier shortcuts like Ctrl+K', () => {
      const inputTarget = { tagName: 'INPUT', isContentEditable: false };
      expect(handleShuttleDeckKeyboard({ key: 'k', target: inputTarget })).toBe(false);

      // Ctrl+K (Split clip shortcut)
      expect(handleShuttleDeckKeyboard({ key: 'k', ctrlKey: true })).toBe(false);

      // Meta+Z (Undo)
      expect(handleShuttleDeckKeyboard({ key: 'z', metaKey: true })).toBe(false);
    });
  });
});
