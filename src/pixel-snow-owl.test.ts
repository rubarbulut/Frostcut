import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PixelSnowOwl } from './PixelSnowOwl';

describe('PixelSnowOwl component', () => {
  it('renders with default props as valid SVG markup', () => {
    const html = renderToString(React.createElement(PixelSnowOwl, {
      ariaLabel: 'FrostCut Pixel Art Snowy Owl',
      title: 'FrostCut Snowy Owl',
    }));
    expect(html).toContain('<svg');
    expect(html).toContain('viewBox="0 0 20 20"');
    expect(html).toContain('width="24"');
    expect(html).toContain('height="24"');
    expect(html).toContain('aria-label="FrostCut Pixel Art Snowy Owl"');
    expect(html).toContain('FrostCut Snowy Owl');
    expect(html).toContain('crispEdges');
  });

  it('renders custom size and eyeColor palettes', () => {
    const htmlCyan = renderToString(React.createElement(PixelSnowOwl, {
      size: 36,
      eyeColor: 'cyan',
    }));
    expect(htmlCyan).toContain('width="36"');
    expect(htmlCyan).toContain('height="36"');
    // Cyan iris color #00f0ff
    expect(htmlCyan).toContain('#00f0ff');

    const htmlGold = renderToString(React.createElement(PixelSnowOwl, {
      eyeColor: 'gold',
    }));
    // Gold iris color #f59e0b
    expect(htmlGold).toContain('#f59e0b');
  });

  it('renders happy closed eyelids when blinking is true', () => {
    const htmlBlinking = renderToString(React.createElement(PixelSnowOwl, {
      blinking: true,
    }));
    // Pupil rect #020617 should NOT be present when blinking
    expect(htmlBlinking).not.toContain('#020617');

    const htmlOpen = renderToString(React.createElement(PixelSnowOwl, {
      blinking: false,
    }));
    // Pupil rect #020617 should be present when open
    expect(htmlOpen).toContain('#020617');
  });

  it('supports different look directions without error', () => {
    for (const dir of ['left', 'right', 'up', 'down', 'center'] as const) {
      const html = renderToString(React.createElement(PixelSnowOwl, {
        lookDirection: dir,
      }));
      expect(html).toContain('<svg');
    }
  });
});
