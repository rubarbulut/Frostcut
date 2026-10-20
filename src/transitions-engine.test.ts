import { describe, expect, it } from 'vitest';
import {
  computeTransitionProgress,
  defaultTransition,
  smoothstep,
  TRANSITION_SHADERS_GLSL,
} from './transitions-engine';

describe('video transition engine', () => {
  it('computes clamped transition progress correctly', () => {
    // Before transition start: progress is 0
    expect(computeTransitionProgress(1.0, 2.0, 1.0)).toBe(0);
    // At midpoint: progress is 0.5
    expect(computeTransitionProgress(2.5, 2.0, 1.0)).toBeCloseTo(0.5, 4);
    // At end: progress is 1.0
    expect(computeTransitionProgress(3.0, 2.0, 1.0)).toBe(1.0);
    // After transition: progress clamped to 1.0
    expect(computeTransitionProgress(4.0, 2.0, 1.0)).toBe(1.0);
  });

  it('evaluates smoothstep Hermite polynomial correctly', () => {
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 4);
    // Easing behavior: slow start
    expect(smoothstep(0, 1, 0.2)).toBeLessThan(0.2);
    // Fast end
    expect(smoothstep(0, 1, 0.8)).toBeGreaterThan(0.8);
  });

  it('creates valid default transition configs', () => {
    const dissolve = defaultTransition('cross-dissolve');
    expect(dissolve.type).toBe('cross-dissolve');
    expect(dissolve.duration).toBe(0.5);

    const whip = defaultTransition('whip-pan');
    expect(whip.direction).toBe('right');
  });

  it('contains valid GLSL transition function signatures', () => {
    expect(TRANSITION_SHADERS_GLSL).toContain('transitionCrossDissolve');
    expect(TRANSITION_SHADERS_GLSL).toContain('transitionLumaWipe');
    expect(TRANSITION_SHADERS_GLSL).toContain('transitionWhipPan');
    expect(TRANSITION_SHADERS_GLSL).toContain('transitionCrossZoom');
    expect(TRANSITION_SHADERS_GLSL).toContain('transitionGlitchSplit');
    expect(TRANSITION_SHADERS_GLSL).toContain('transitionDirectionalWipe');
  });

  it('detects abutting and overlapping project transitions correctly', async () => {
    const { findProjectTransitions, TransitionBlender } = await import('./visual-renderer');
    const { createProject, defaultProps } = await import('./model');

    const p = createProject();
    p.clips = [
      {
        id: 'c1',
        mediaId: 'm1',
        trackId: 'V1',
        start: 0,
        sourceStart: 0,
        sourceEnd: 5,
        properties: defaultProps,
      },
      {
        id: 'c2',
        mediaId: 'm2',
        trackId: 'V1',
        start: 5,
        sourceStart: 0,
        sourceEnd: 5,
        properties: defaultProps,
        transition: { type: 'whip-pan', duration: 0.5, direction: 'right' },
      },
    ];

    const transitions = findProjectTransitions(p);
    expect(transitions).toHaveLength(1);
    expect(transitions[0].clipFrom.id).toBe('c1');
    expect(transitions[0].clipTo.id).toBe('c2');
    expect(transitions[0].start).toBe(5);
    expect(transitions[0].end).toBe(5.5);
    expect(transitions[0].transition.type).toBe('whip-pan');

    // Test TransitionBlender instantiation and draw fallback
    const mockCtx = {
      clearRect: () => {},
      drawImage: () => {},
      globalAlpha: 1,
    };
    const mockCanvas = {
      width: 100,
      height: 100,
      getContext: (kind: string) => (kind === '2d' ? mockCtx : null),
    } as unknown as HTMLCanvasElement;

    const blender = new TransitionBlender(mockCanvas);
    expect(blender.canvas).toBeDefined();

    const c1 = mockCanvas;
    const c2 = mockCanvas;

    const res = blender.draw(c1, c2, 100, 100, 0.5, { type: 'whip-pan', duration: 0.5 });
    expect(res).toBe(blender.canvas);
    expect(res.width).toBe(100);
    expect(res.height).toBe(100);

    blender.dispose();
  });
});

