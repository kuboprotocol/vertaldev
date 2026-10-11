/**
 * Geometry for the free crop box. Rects are fractions of the image (0..1), so they don't depend on
 * how big the image is drawn on screen. `ratio` is width/height in those fractions
 * (pixel aspect × naturalHeight / naturalWidth).
 */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const MIN_CROP = 0.04;
export const FULL_RECT: CropRect = { x: 0, y: 0, w: 1, h: 1 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Largest size that fits the image from an anchor. dir: +1 grows right/down, -1 left/up, 0 centered on the anchor. */
function maxExtent(anchor: number, dir: number) {
  if (dir > 0) return 1 - anchor;
  if (dir < 0) return anchor;
  return 2 * Math.min(anchor, 1 - anchor);
}

function place(anchor: number, dir: number, size: number) {
  if (dir > 0) return anchor;
  if (dir < 0) return anchor - size;
  return anchor - size / 2;
}

/** Builds a rect of the given ratio grown from an anchor, as large as wanted but never past the image. */
function fromAnchor(ax: number, ay: number, dirX: number, dirY: number, wantW: number, ratio: number): CropRect {
  const maxW = Math.min(maxExtent(ax, dirX), maxExtent(ay, dirY) * ratio);
  const minW = Math.min(maxW, Math.max(MIN_CROP, MIN_CROP * ratio));
  const w = clamp(wantW, minW, maxW);
  const h = w / ratio;
  return { x: place(ax, dirX, w), y: place(ay, dirY, h), w, h };
}

export function moveRect(r: CropRect, dx: number, dy: number): CropRect {
  return { ...r, x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h) };
}

export function resizeRect(r: CropRect, handle: Handle, dx: number, dy: number, ratio?: number): CropRect {
  let l = r.x, t = r.y, rt = r.x + r.w, b = r.y + r.h;
  if (handle.includes("e")) rt = clamp(rt + dx, l + MIN_CROP, 1);
  if (handle.includes("w")) l = clamp(l + dx, 0, rt - MIN_CROP);
  if (handle.includes("s")) b = clamp(b + dy, t + MIN_CROP, 1);
  if (handle.includes("n")) t = clamp(t + dy, 0, b - MIN_CROP);
  if (!ratio) return { x: l, y: t, w: rt - l, h: b - t };

  // With a fixed ratio the side opposite the handle stays put; edge handles keep the other axis centered.
  const dirX = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
  const dirY = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
  const ax = dirX > 0 ? r.x : dirX < 0 ? r.x + r.w : r.x + r.w / 2;
  const ay = dirY > 0 ? r.y : dirY < 0 ? r.y + r.h : r.y + r.h / 2;
  const freeW = rt - l, freeH = b - t;
  // Corners follow whichever axis the finger moved more.
  const byW = freeW, byH = freeH * ratio;
  const wantW = dirX && dirY ? (Math.abs(byW - r.w) >= Math.abs(byH - r.w) ? byW : byH) : dirX ? byW : byH;
  return fromAnchor(ax, ay, dirX, dirY, wantW, ratio);
}

/** A rect drawn by dragging from p0 to p1 (both clamped to the image). */
export function rectFromPoints(p0: { x: number; y: number }, p1: { x: number; y: number }, ratio?: number): CropRect {
  const x0 = clamp(p0.x, 0, 1), y0 = clamp(p0.y, 0, 1);
  const x1 = clamp(p1.x, 0, 1), y1 = clamp(p1.y, 0, 1);
  if (!ratio) return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
  const dirX = x1 >= x0 ? 1 : -1, dirY = y1 >= y0 ? 1 : -1;
  return fromAnchor(x0, y0, dirX, dirY, Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0) * ratio), ratio);
}

/** The largest centered rect with this ratio (or the whole image when free). */
export function fitRect(ratio?: number): CropRect {
  if (!ratio) return { ...FULL_RECT };
  const w = Math.min(1, ratio), h = w / ratio;
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/** Pixel area of a rect on an image of the given natural size. */
export function toPixels(r: CropRect, width: number, height: number) {
  const x = Math.round(r.x * width), y = Math.round(r.y * height);
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.round(r.w * width))),
    height: Math.max(1, Math.min(height - y, Math.round(r.h * height))),
  };
}
