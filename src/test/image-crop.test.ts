import { describe, it, expect } from 'vitest'
import { fitRect, moveRect, rectFromPoints, resizeRect, toPixels, MIN_CROP, type CropRect } from '@/lib/cropGeometry'
import { applyAdjustments, outputSize, NO_ADJUSTMENTS } from '@/lib/imageExport'

const close = (r: CropRect, e: CropRect) => {
  for (const k of ['x', 'y', 'w', 'h'] as const) expect(r[k]).toBeCloseTo(e[k], 6)
}
const inside = (r: CropRect) => {
  expect(r.x).toBeGreaterThanOrEqual(-1e-9)
  expect(r.y).toBeGreaterThanOrEqual(-1e-9)
  expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9)
  expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9)
}

describe('crop geometry', () => {
  const box = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }

  it('moves the box but never out of the image', () => {
    close(moveRect(box, 0.1, -0.1), { x: 0.35, y: 0.15, w: 0.5, h: 0.5 })
    close(moveRect(box, 1, 1), { x: 0.5, y: 0.5, w: 0.5, h: 0.5 })
    close(moveRect(box, -1, -1), { x: 0, y: 0, w: 0.5, h: 0.5 })
  })

  it('resizes freely from any handle, clamped to the image and a minimum size', () => {
    close(resizeRect(box, 'se', 0.1, 0.2), { x: 0.25, y: 0.25, w: 0.6, h: 0.7 })
    close(resizeRect(box, 'nw', -0.5, -0.5), { x: 0, y: 0, w: 0.75, h: 0.75 })
    close(resizeRect(box, 'e', -1, 0), { x: 0.25, y: 0.25, w: MIN_CROP, h: 0.5 })
    close(resizeRect(box, 'n', 0, 0.1), { x: 0.25, y: 0.35, w: 0.5, h: 0.4 })
  })

  it('keeps a fixed ratio, anchored on the opposite corner, inside the image', () => {
    const r = resizeRect(box, 'se', 0.2, 0, 1)
    close(r, { x: 0.25, y: 0.25, w: 0.7, h: 0.7 })
    const big = resizeRect(box, 'se', 5, 5, 1)
    close(big, { x: 0.25, y: 0.25, w: 0.75, h: 0.75 })
    const wide = resizeRect(box, 'e', 0.2, 0, 2)
    expect(wide.w / wide.h).toBeCloseTo(2, 6)
    expect(wide.y + wide.h / 2).toBeCloseTo(0.5, 6) // stays centered vertically
    inside(wide)
    const up = resizeRect(box, 'nw', -0.1, -0.1, 0.5)
    expect(up.w / up.h).toBeCloseTo(0.5, 6)
    expect(up.x + up.w).toBeCloseTo(0.75, 6)
    expect(up.y + up.h).toBeCloseTo(0.75, 6)
    inside(up)
  })

  it('draws a new box by dragging in any direction', () => {
    close(rectFromPoints({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.1 }), { x: 0.2, y: 0.1, w: 0.6, h: 0.6 })
    close(rectFromPoints({ x: 0.5, y: 0.5 }, { x: 2, y: -1 }), { x: 0.5, y: 0, w: 0.5, h: 0.5 })
    const sq = rectFromPoints({ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.3 }, 1)
    close(sq, { x: 0.2, y: 0.2, w: 0.4, h: 0.4 })
    const back = rectFromPoints({ x: 0.3, y: 0.9 }, { x: 0, y: 0.1 }, 1)
    expect(back.w).toBeCloseTo(back.h, 6)
    inside(back)
  })

  it('fits the largest centered box for a ratio and converts to pixels', () => {
    close(fitRect(), { x: 0, y: 0, w: 1, h: 1 })
    close(fitRect(2), { x: 0, y: 0.25, w: 1, h: 0.5 })
    close(fitRect(0.5), { x: 0.25, y: 0, w: 0.5, h: 1 })
    expect(toPixels({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 }, 1000, 500)).toEqual({ x: 100, y: 100, width: 500, height: 250 })
    expect(toPixels({ x: 0.999, y: 0, w: 0.5, h: 1 }, 1000, 500).width).toBe(1)
  })
})

describe('image export helpers', () => {
  it('output size keeps the crop proportion when only one side is given', () => {
    expect(outputSize(800, 400)).toEqual({ width: 800, height: 400 })
    expect(outputSize(800, 400, 400)).toEqual({ width: 400, height: 200 })
    expect(outputSize(800, 400, null, 100)).toEqual({ width: 200, height: 100 })
    expect(outputSize(800, 400, 1080, 1080)).toEqual({ width: 1080, height: 1080 })
  })

  it('pixel adjustments match the CSS filters (neutral, brightness, grayscale)', () => {
    const px = () => new Uint8ClampedArray([200, 100, 50, 255])
    const same = px()
    applyAdjustments(same, NO_ADJUSTMENTS)
    expect(Array.from(same)).toEqual([200, 100, 50, 255])
    const dark = px()
    applyAdjustments(dark, { brightness: 50, contrast: 100, saturation: 100 })
    expect(Array.from(dark)).toEqual([100, 50, 25, 255])
    const gray = px()
    applyAdjustments(gray, { brightness: 100, contrast: 100, saturation: 0 })
    expect(gray[0]).toBe(gray[1])
    expect(gray[1]).toBe(gray[2])
  })
})
