/**
 * Loading, rotating and exporting images for the creative image editor, entirely in the browser.
 * Images are loaded as same-origin blobs so the canvas is never "tainted" (a tainted canvas can't be exported).
 */

export type ExportFormat = "png" | "jpeg" | "webp";

export interface Adjustments {
  brightness: number; // %
  contrast: number; // %
  saturation: number; // %
}

export const NO_ADJUSTMENTS: Adjustments = { brightness: 100, contrast: 100, saturation: 100 };

export class ImageAccessError extends Error {}

function loadImage(src: string, crossOrigin?: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ImageAccessError("image_load_failed"));
    img.src = src;
  });
}

/**
 * Returns an object URL for the image. Remote images are fetched first; sites that don't allow it
 * (no CORS) can't be edited in the browser, so the caller asks the user to upload the file instead.
 */
export async function loadEditableSource(src: string): Promise<{ url: string; width: number; height: number }> {
  let blob: Blob;
  if (src.startsWith("blob:") || src.startsWith("data:")) {
    blob = await (await fetch(src)).blob();
  } else {
    let res: Response;
    try {
      res = await fetch(src, { mode: "cors" });
    } catch {
      throw new ImageAccessError("cors_blocked");
    }
    if (!res.ok) throw new ImageAccessError(`http_${res.status}`);
    blob = await res.blob();
  }
  if (blob.type && !blob.type.startsWith("image/")) throw new ImageAccessError("not_an_image");
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    return { url, width: img.naturalWidth, height: img.naturalHeight };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function toBlob(canvas: HTMLCanvasElement, format: ExportFormat, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("export_failed"))),
      `image/${format}`,
      format === "png" ? undefined : quality / 100,
    ),
  );
}

/** Rotates by a multiple of 90° and returns a new object URL with its size. */
export async function rotateSource(url: string, degrees: number): Promise<{ url: string; width: number; height: number }> {
  const img = await loadImage(url);
  const quarter = ((degrees % 360) + 360) % 360 / 90;
  const swap = quarter % 2 === 1;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? img.naturalHeight : img.naturalWidth;
  canvas.height = swap ? img.naturalWidth : img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((quarter * Math.PI) / 2);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  const blob = await toBlob(canvas, "png", 100);
  return { url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
}

export const cssFilter = (a: Adjustments) => `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturation}%)`;

const isNeutral = (a: Adjustments) => a.brightness === 100 && a.contrast === 100 && a.saturation === 100;

/**
 * Same math as the CSS filters, for browsers whose canvas has no `filter` (Safari before 18).
 * Order matches cssFilter: brightness, then contrast, then saturate.
 */
export function applyAdjustments(data: Uint8ClampedArray, a: Adjustments) {
  const b = a.brightness / 100, c = a.contrast / 100, s = a.saturation / 100;
  const m = [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
  ];
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * b, g = data[i + 1] * b, bl = data[i + 2] * b;
    r = (r - 127.5) * c + 127.5;
    g = (g - 127.5) * c + 127.5;
    bl = (bl - 127.5) * c + 127.5;
    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    bl = Math.min(255, Math.max(0, bl));
    data[i] = m[0] * r + m[1] * g + m[2] * bl;
    data[i + 1] = m[3] * r + m[4] * g + m[5] * bl;
    data[i + 2] = m[6] * r + m[7] * g + m[8] * bl;
  }
}

/** Output size: the crop's own size, or the requested width/height (one of them keeps the crop's proportion). */
export function outputSize(cropW: number, cropH: number, width?: number | null, height?: number | null) {
  if (width && height) return { width: Math.round(width), height: Math.round(height) };
  if (width) return { width: Math.round(width), height: Math.max(1, Math.round((width * cropH) / cropW)) };
  if (height) return { width: Math.max(1, Math.round((height * cropW) / cropH)), height: Math.round(height) };
  return { width: cropW, height: cropH };
}

export async function exportCrop(opts: {
  url: string;
  area: { x: number; y: number; width: number; height: number };
  size: { width: number; height: number };
  adjustments: Adjustments;
  format: ExportFormat;
  quality: number;
}): Promise<Blob> {
  const img = await loadImage(opts.url);
  const canvas = document.createElement("canvas");
  canvas.width = opts.size.width;
  canvas.height = opts.size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  const nativeFilter = typeof (ctx as { filter?: unknown }).filter === "string";
  if (opts.format === "jpeg") {
    ctx.fillStyle = "#fff"; // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (nativeFilter && !isNeutral(opts.adjustments)) ctx.filter = cssFilter(opts.adjustments);
  ctx.imageSmoothingQuality = "high";
  const { x, y, width, height } = opts.area;
  ctx.drawImage(img, x, y, width, height, 0, 0, canvas.width, canvas.height);
  if (!nativeFilter && !isNeutral(opts.adjustments)) {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyAdjustments(pixels.data, opts.adjustments);
    ctx.putImageData(pixels, 0, 0);
  }
  return toBlob(canvas, opts.format, opts.quality);
}

/** Starts a download for an object URL. The anchor must be in the DOM for Firefox, and the URL must stay alive. */
export function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Opens the system share sheet (on phones: "Salvar imagem" goes to the gallery). Returns false when unsupported. */
export async function shareImage(blob: Blob, filename: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.share || !nav.canShare?.({ files: [file] })) return false;
  try {
    await nav.share({ files: [file], title: filename });
  } catch (e) {
    if ((e as Error)?.name !== "AbortError") throw e;
  }
  return true;
}
