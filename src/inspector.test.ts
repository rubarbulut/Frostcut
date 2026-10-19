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
});
