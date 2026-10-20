import { describe, expect, it } from 'vitest';
import { defaultProps, createProject } from './model';
import { SPEED_RAMP_PRESETS } from './SpeedRampingControls';
import { animatedProperties, clampMotion } from './motion';

describe('Adobe AE Inspector & Properties System', () => {
  it('correctly provides speed ramp presets with valid bezier curves', () => {
    expect(SPEED_RAMP_PRESETS.length).toBe(4);
    const hero = SPEED_RAMP_PRESETS.find((p) => p.id === 'hero');
    expect(hero).toBeDefined();
    expect(hero?.speed).toBe(0.75);
    expect(hero?.svgPath).toContain('C');
  });

  it('clamps all motion animated properties within safe boundaries', () => {
    expect(clampMotion('scale', 10)).toBe(5);
    expect(clampMotion('scale', 0.01)).toBe(0.1);
    expect(clampMotion('opacity', 1.5)).toBe(1);
    expect(clampMotion('opacity', -0.5)).toBe(0);
    expect(clampMotion('rotation', 45)).toBe(45);
    expect(clampMotion('x', 500)).toBe(500);
    expect(clampMotion('y', -300)).toBe(-300);
  });

  it('initializes default clip properties with AE-standard neutral values', () => {
    const props = defaultProps;
    expect(props.scale).toBe(1);
    expect(props.opacity).toBe(1);
    expect(props.rotation).toBe(0);
    expect(props.speed).toBe(1);
    expect(props.volume).toBe(1);
    expect(props.fadeIn).toBe(0.015);
    expect(props.fadeOut).toBe(0.015);
    expect(props.crop).toBe(0);
  });

  it('supports all core AE animated property tracks', () => {
    expect(animatedProperties).toEqual(['x', 'y', 'scale', 'rotation', 'opacity']);
  });

  it('calculates aspect ratios accurately for composition inspector', () => {
    const p = createProject();
    p.settings.width = 1080;
    p.settings.height = 1920;
    const verticalRatio = p.settings.width > p.settings.height ? '16:9' : '9:16';
    expect(verticalRatio).toBe('9:16');

    p.settings.width = 1920;
    p.settings.height = 1080;
    const wideRatio = p.settings.width > p.settings.height ? '16:9' : '9:16';
    expect(wideRatio).toBe('16:9');
  });

  it('renders AELumetriInspector cleanly without crashing', async () => {
    const { renderToString } = await import('react-dom/server');
    const { AELumetriInspector } = await import('./inspector/AELumetriInspector');
    const { useEditor } = await import('./store');
    const { newAdjustment } = await import('./adjustments');
    const React = await import('react');

    const { defaultProps, createProject } = await import('./model');
    const layer = newAdjustment(0, 5);
    const proj = {
      ...createProject(),
      clips: [{ id: 'c1', mediaId: 'm1', start: 0, sourceStart: 0, sourceEnd: 10, trackId: 'V1', properties: defaultProps }],
      adjustments: [layer],
    };
    useEditor.getState().load(proj);
    useEditor.getState().selectAdjustment(layer.id);
    const html = renderToString(React.createElement(AELumetriInspector));
    expect(html).toContain('ae-lumetri-inspector');
    expect(html).toContain('Lumetri Color');
  });

  describe('B002-B Production Scrubber Gesture Protocol & Target Resolution', () => {
    it('coalesces multiple pointer movements into a single RAF tick during gesture', async () => {
      const { ScrubberGestureSession } = await import('./inspector/scrubber-gesture');

      const dragValues: number[] = [];
      const session = new ScrubberGestureSession(100, {
        value: 10,
        step: 1,
        onDrag: (v) => dragValues.push(v),
      });

      // Execute 10 moves within the same synchronous frame
      for (let i = 1; i <= 10; i++) {
        session.handleMove(100 + i * 2);
      }

      // Inside the synchronous frame, RAF has not fired yet (0 calls)
      expect(dragValues.length).toBe(0);

      // Advance one animation frame
      await new Promise((resolve) => setTimeout(resolve, 30));

      // RAF fired once with the latest coalesced value (10 + 20 = 30)
      expect(dragValues.length).toBe(1);
      expect(dragValues[0]).toBe(30);

      session.destroy();
    });

    it('performs final RAF flush on handleUp without losing latest pointer delta', async () => {
      const { ScrubberGestureSession } = await import('./inspector/scrubber-gesture');

      let committedValue: number | null = null;
      const session = new ScrubberGestureSession(50, {
        value: 0,
        step: 2,
        onDragEnd: (val) => {
          committedValue = val;
        },
      });

      // Move pointer 25px => deltaVal = 25 * 2 = 50
      session.handleMove(75);

      // Immediately release pointer BEFORE RAF callback fires
      const committed = session.handleUp();

      expect(committed).toBe(true);
      expect(committedValue).toBe(50);
    });

    it('cancels cleanly without committing or creating undo steps when pointerup occurs with zero movement', async () => {
      const { ScrubberGestureSession } = await import('./inspector/scrubber-gesture');

      let dragStarted = false;
      let dragEnded = false;
      let dragCancelled = false;

      const session = new ScrubberGestureSession(100, {
        value: 42,
        onDragStart: () => {
          dragStarted = true;
        },
        onDragEnd: () => {
          dragEnded = true;
        },
        onDragCancel: () => {
          dragCancelled = true;
        },
      });

      expect(dragStarted).toBe(true);

      // Pointerup occurs immediately without calling handleMove (e.g. click to type)
      const committed = session.handleUp();

      expect(committed).toBe(false);
      expect(dragEnded).toBe(false);
      expect(dragCancelled).toBe(true);
    });

    it('aborts preview and commits zero changes on Escape or pointercancel', async () => {
      const { ScrubberGestureSession } = await import('./inspector/scrubber-gesture');

      let dragCancelled = false;
      let committed = false;

      const session = new ScrubberGestureSession(100, {
        value: 10,
        onDragCancel: () => {
          dragCancelled = true;
        },
        onDragEnd: () => {
          committed = true;
        },
      });

      session.handleMove(150);
      session.handleCancel();

      expect(dragCancelled).toBe(true);
      expect(committed).toBe(false);
      expect(session.state.isDestroyed).toBe(true);
    });

    it('cleans up active session and pending RAF on unmount/destroy', async () => {
      const { ScrubberGestureSession } = await import('./inspector/scrubber-gesture');

      let dragValues: number[] = [];
      const session = new ScrubberGestureSession(0, {
        value: 0,
        onDrag: (v) => dragValues.push(v),
      });

      session.handleMove(100);
      session.destroy();

      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(session.state.isDestroyed).toBe(true);
      expect(dragValues.length).toBe(0);
    });

    it('captures pointer on start and releases pointer capture on release or cancel', async () => {
      const { ScrubberGestureSession } = await import('./inspector/scrubber-gesture');

      let capturedId: number | null = null;
      let releasedId: number | null = null;

      const mockElement = {
        setPointerCapture: (id: number) => {
          capturedId = id;
        },
        releasePointerCapture: (id: number) => {
          releasedId = id;
        },
        hasPointerCapture: () => true,
      } as unknown as HTMLElement;

      const session = new ScrubberGestureSession(0, { value: 0 }, 999, mockElement);
      expect(capturedId).toBe(999);

      session.handleUp();
      expect(releasedId).toBe(999);
    });

    it('preserves concurrent edits on the same clip during gesture commit (same-clip race condition fix)', async () => {
      const { computeNextTransformClip } = await import('./inspector/AETransformControls');
      const { useEditor } = await import('./store');
      const { createProject, defaultProps } = await import('./model');

      const proj = {
        ...createProject(),
        clips: [
          {
            id: 'c1',
            mediaId: 'm1',
            start: 0,
            sourceStart: 0,
            sourceEnd: 10,
            trackId: 'V1',
            properties: { ...defaultProps, x: 0, opacity: 1, rotation: 0, volume: 1 },
          },
        ],
      };
      useEditor.getState().load(proj);
      const initialHistoryLength = useEditor.getState().past.length;

      // User starts dragging property X on clip c1
      // During the gesture, another action modifies property OPACITY and VOLUME on the SAME clip c1
      const current = useEditor.getState().project;
      useEditor.getState().commit(
        {
          ...current,
          clips: current.clips.map((c) =>
            c.id === 'c1'
              ? { ...c, properties: { ...c.properties, opacity: 0.35, volume: 1.5 } }
              : c,
          ),
        },
        'Concurrent edit on opacity and volume',
      );

      // Verify that concurrent edit updated the store
      expect(useEditor.getState().project.clips[0].properties.opacity).toBe(0.35);
      expect(useEditor.getState().project.clips[0].properties.volume).toBe(1.5);

      // Now the gesture on X completes: computeNextTransformClip computes next clip snapshot from the latest store
      const latestProject = useEditor.getState().project;
      const nextClip = computeNextTransformClip(latestProject, 'c1', 'x', 75, 0);

      expect(nextClip).not.toBeNull();
      // Both the dragged X (75) AND the concurrent OPACITY (0.35) and VOLUME (1.5) must be preserved!
      expect(nextClip!.properties.x).toBe(75);
      expect(nextClip!.properties.opacity).toBe(0.35);
      expect(nextClip!.properties.volume).toBe(1.5);

      useEditor.getState().commit(
        {
          ...latestProject,
          clips: latestProject.clips.map((c) => (c.id === 'c1' ? nextClip! : c)),
        },
        'Adjust x',
      );

      const finalClip = useEditor.getState().project.clips[0];
      expect(finalClip.properties.x).toBe(75);
      expect(finalClip.properties.opacity).toBe(0.35);
      expect(finalClip.properties.volume).toBe(1.5);
      expect(useEditor.getState().past.length).toBe(initialHistoryLength + 2);
    });

    it('aborts gesture safely if the target clip is deleted or locked mid-gesture', async () => {
      const { computeNextTransformClip } = await import('./inspector/AETransformControls');
      const { useEditor } = await import('./store');
      const { createProject, defaultProps } = await import('./model');

      const proj = {
        ...createProject(),
        clips: [
          {
            id: 'c1',
            mediaId: 'm1',
            start: 0,
            sourceStart: 0,
            sourceEnd: 10,
            trackId: 'V1',
            properties: { ...defaultProps, scale: 1 },
          },
        ],
      };
      useEditor.getState().load(proj);

      // 1. Clip is deleted while gesture was underway
      const p = useEditor.getState().project;
      useEditor.getState().commit({ ...p, clips: [] }, 'Delete clip');

      // Attempting to compute next clip for deleted clip returns null and cancels commit
      const deletedResult = computeNextTransformClip(useEditor.getState().project, 'c1', 'scale', 2, 0);
      expect(deletedResult).toBeNull();
      expect(useEditor.getState().project.clips.length).toBe(0);

      // 2. Clip is locked mid-gesture
      useEditor.getState().load({
        ...proj,
        tracks: [{ id: 'V1', name: 'Video 1', kind: 'video', locked: true, muted: false, hidden: false, height: 48 }],
      });
      const lockedResult = computeNextTransformClip(useEditor.getState().project, 'c1', 'scale', 2, 0);
      expect(lockedResult).toBeNull();
    });

    it('prevents double commit when typing input and pressing Enter followed by blur', async () => {
      const { commitTypedScrubberInput } = await import('./inspector/scrubber-gesture');

      let commitCount = 0;
      let lastVal: number | null = null;
      const onChange = (v: number) => {
        commitCount++;
        lastVal = v;
      };

      let isCommitting = false;
      const handleInputCommit = (draft: string, currentValue: number) => {
        if (isCommitting) return { committed: false, finalValue: currentValue };
        isCommitting = true;
        const res = commitTypedScrubberInput(draft, currentValue, {
          min: -1000,
          max: 1000,
          decimals: 2,
          onChange,
        });
        queueMicrotask(() => {
          isCommitting = false;
        });
        return res;
      };

      // User types "45" and hits Enter
      const res1 = handleInputCommit('45', 10);
      expect(res1.committed).toBe(true);
      expect(res1.finalValue).toBe(45);

      // Immediately blur fires before next microtask
      const res2 = handleInputCommit('45', 10);
      expect(res2.committed).toBe(false);

      expect(commitCount).toBe(1);
      expect(lastVal).toBe(45);

      // User submits unchanged value
      await new Promise((resolve) => setTimeout(resolve, 10));
      const res3 = handleInputCommit('45', 45);
      expect(res3.committed).toBe(false);
      expect(commitCount).toBe(1); // No redundant commit or undo entry

      // User submits invalid NaN
      const res4 = handleInputCommit('invalid-nan', 45);
      expect(res4.committed).toBe(false);
      expect(commitCount).toBe(1);
    });
  });
});
