import { describe, expect, it } from 'vitest';
import { clampStudioLayout, defaultStudioLayout } from './studio-layout';

describe('studio panel dimensions', () => {
  it('keeps valid user dimensions without changing their object', () => {
    const input = { project: 280, inspector: 310, timeline: 300 };
    expect(clampStudioLayout(input, 1440, 700)).toEqual(input);
    expect(input).toEqual({ project: 280, inspector: 310, timeline: 300 });
  });
  it('recovers from corrupt preference data', () => {
    expect(
      clampStudioLayout({ project: NaN, inspector: Infinity, timeline: 'wrong' }, 1280, 600),
    ).toEqual(defaultStudioLayout);
    expect(clampStudioLayout(null, 1280, 600)).toEqual(defaultStudioLayout);
  });
  it('preserves space for the composition on a narrow display', () => {
    const result = clampStudioLayout({ project: 900, inspector: 900, timeline: 900 }, 1000, 600);
    expect(result.project + result.inspector + 300 + 12).toBeLessThanOrEqual(1000);
    expect(result.timeline).toBe(410);
  });
  it('keeps both panels and a usable preview when the display shrinks', () => {
    const result = clampStudioLayout({ project: 440, inspector: 420, timeline: 900 }, 780, 420);
    expect(result.project).toBeGreaterThanOrEqual(200);
    expect(result.inspector).toBeGreaterThanOrEqual(240);
    expect(result.project + result.inspector + 312).toBeLessThanOrEqual(780);
    expect(result.timeline).toBe(230);
  });
  it('allows a wider project panel in Focus without overwriting Inspector preference', () => {
    const result = clampStudioLayout(
      { project: 420, inspector: 280, timeline: 200 },
      900,
      500,
      false,
    );
    expect(result.project).toBe(420);
    expect(result.inspector).toBe(280);
  });
});
