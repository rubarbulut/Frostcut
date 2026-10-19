import { describe, expect, it } from 'vitest';
import {
  applyRadialDistortion,
  computeHomography,
  computeVignette,
  identityMat3,
  invertMat3,
  transformPoint,
  type Point2D,
  type Quad,
} from './geometric-transform';

describe('geometric transform and optical engine', () => {
  it('identifies identity matrix transformation', () => {
    const id = identityMat3();
    const p: Point2D = { x: 0.35, y: 0.75 };
    const res = transformPoint(id, p);
    expect(res.x).toBeCloseTo(p.x, 5);
    expect(res.y).toBeCloseTo(p.y, 5);
  });

  it('computes corner pin homography between two quads accurately', () => {
    const srcQuad: Quad = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];

    // Arbitrary perspective distortion (e.g. tilted trapezoid/quad)
    const dstQuad: Quad = [
      { x: 0.1, y: 0.2 },
      { x: 0.9, y: 0.15 },
      { x: 0.85, y: 0.8 },
      { x: 0.15, y: 0.85 },
    ];

    const H = computeHomography(srcQuad, dstQuad);
    expect(H).not.toBeNull();

    if (H) {
      for (let i = 0; i < 4; i++) {
        const transformed = transformPoint(H, srcQuad[i]);
        expect(transformed.x).toBeCloseTo(dstQuad[i].x, 3);
        expect(transformed.y).toBeCloseTo(dstQuad[i].y, 3);
      }
    }
  });

  it('inverts 3x3 homography matrix cleanly for backward texture sampling', () => {
    const srcQuad: Quad = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const dstQuad: Quad = [
      { x: 0.2, y: 0.1 },
      { x: 0.8, y: 0.2 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.8 },
    ];

    const H = computeHomography(srcQuad, dstQuad)!;
    const invH = invertMat3(H)!;
    expect(invH).not.toBeNull();

    // Transforming dst point by invH should map back to src point
    for (let i = 0; i < 4; i++) {
      const mappedBack = transformPoint(invH, dstQuad[i]);
      expect(mappedBack.x).toBeCloseTo(srcQuad[i].x, 3);
      expect(mappedBack.y).toBeCloseTo(srcQuad[i].y, 3);
    }
  });

  it('applies radial barrel and pincushion lens distortion', () => {
    const center: Point2D = { x: 0.5, y: 0.5 };
    const p: Point2D = { x: 0.8, y: 0.8 };

    // Barrel distortion (k1 < 0) contracts peripheral distance
    const barrel = applyRadialDistortion(p, center, -0.2, 0);
    const origDist = Math.hypot(p.x - center.x, p.y - center.y);
    const barrelDist = Math.hypot(barrel.x - center.x, barrel.y - center.y);
    expect(barrelDist).toBeLessThan(origDist);

    // Pincushion distortion (k1 > 0) expands peripheral distance
    const pincushion = applyRadialDistortion(p, center, 0.2, 0);
    const pinDist = Math.hypot(pincushion.x - center.x, pincushion.y - center.y);
    expect(pinDist).toBeGreaterThan(origDist);
  });

  it('computes vignette falloff centered at frame center', () => {
    const center: Point2D = { x: 0.5, y: 0.5 };
    // Center has 100% brightness
    expect(computeVignette(center, center, 0.5)).toBeCloseTo(1.0, 4);

    // Corner has dimmed brightness
    const corner: Point2D = { x: 0.95, y: 0.95 };
    expect(computeVignette(corner, center, 0.5)).toBeLessThan(1.0);
  });
});
