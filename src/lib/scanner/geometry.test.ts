import { describe, expect, it } from 'vitest';
import { applyHomography, enhance, homography, insetQuad, otsuThreshold, outputSize, warpPerspective, type Quad, type RawImage } from './geometry';

const solid = (w: number, h: number, rgb: [number, number, number]): RawImage => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...rgb, 255], i * 4);
  return { data, width: w, height: h };
};

describe('homography', () => {
  it('maps the four corners exactly', () => {
    const src: Quad = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const dst: Quad = [{ x: 2, y: 1 }, { x: 12, y: 3 }, { x: 9, y: 14 }, { x: 1, y: 11 }];
    const H = homography(src, dst);
    src.forEach((p, i) => {
      const q = applyHomography(H, p.x, p.y);
      expect(q.x).toBeCloseTo(dst[i].x, 6);
      expect(q.y).toBeCloseTo(dst[i].y, 6);
    });
  });

  it('rejects degenerate corners', () => {
    const flat: Quad = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
    const rect: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    expect(() => homography(rect, flat)).toThrow();
  });
});

describe('outputSize', () => {
  it('uses the longer edges and caps the longest side', () => {
    const quad: Quad = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 3000 }, { x: 0, y: 3000 }];
    expect(outputSize(quad)).toEqual({ width: 800, height: 2400 });
    expect(outputSize(quad, 10000)).toEqual({ width: 1000, height: 3000 });
  });
});

describe('warpPerspective', () => {
  it('returns the same pixels for a full-frame quad', () => {
    const img = solid(20, 30, [200, 40, 10]);
    const out = warpPerspective(img, insetQuad(20, 30, 0), 20, 30);
    expect(out.width).toBe(20);
    expect(out.height).toBe(30);
    expect(Array.from(out.data.slice(0, 4))).toEqual([200, 40, 10, 255]);
  });

  it('fills outside the source with white', () => {
    const img = solid(10, 10, [0, 0, 0]);
    const far: Quad = [{ x: -50, y: -50 }, { x: -40, y: -50 }, { x: -40, y: -40 }, { x: -50, y: -40 }];
    const out = warpPerspective(img, far, 4, 4);
    expect(Array.from(out.data.slice(0, 4))).toEqual([255, 255, 255, 255]);
  });
});

describe('enhance', () => {
  it('turns color into gray', () => {
    const img = enhance(solid(2, 2, [255, 0, 0]), 'gray');
    expect(img.data[0]).toBe(img.data[1]);
    expect(img.data[1]).toBe(img.data[2]);
  });

  it('keeps color when mode is color', () => {
    const img = enhance(solid(2, 2, [255, 0, 0]), 'color');
    expect(Array.from(img.data.slice(0, 3))).toEqual([255, 0, 0]);
  });

  it('separates ink from paper in black-and-white mode', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 16; i++) {
      const v = i < 8 ? 30 : 230;
      data.set([v, v, v, 255], i * 4);
    }
    const out = enhance({ data, width: 4, height: 4 }, 'bw');
    const values = new Set<number>();
    for (let i = 0; i < 16; i++) values.add(out.data[i * 4]);
    expect([...values].sort()).toEqual([0, 255]);
    expect(out.data[0]).toBe(0);
    expect(out.data[15 * 4]).toBe(255);
  });

  it('otsu finds a cut between two clusters', () => {
    const g = new Uint8ClampedArray([10, 12, 14, 200, 210, 220]);
    const t = otsuThreshold(g);
    expect(t).toBeGreaterThanOrEqual(14);
    expect(t).toBeLessThan(200);
  });
});
