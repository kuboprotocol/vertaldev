// Vertal Track — auto-reframe for vertical clips. Samples the clip, finds where the speaker is and
// returns a smoothed horizontal focus track that the renderer follows. Uses the browser's native
// FaceDetector when it exists and, everywhere else, our own skin-tone + motion saliency, so it runs
// on the user's device with no model download and no per-clip cost.
import {
  CLIP_ASPECTS, centerToFocus, columnFocus, isSkin, smoothFocusTrack,
  type ClipAspectKey, type FocusKey,
} from "./clipEngine";

const SAMPLE_W = 128;
const SAMPLE_EVERY = 0.5;

interface NativeFace { boundingBox: DOMRectReadOnly }
interface NativeFaceDetector { detect(src: CanvasImageSource): Promise<NativeFace[]> }
type FaceDetectorCtor = new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => NativeFaceDetector;

function nativeDetector(): NativeFaceDetector | null {
  const Ctor = (globalThis as unknown as { FaceDetector?: FaceDetectorCtor }).FaceDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ fastMode: true, maxDetectedFaces: 4 });
  } catch {
    return null;
  }
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res, rej) => {
    const ok = () => { v.removeEventListener("error", bad); res(); };
    const bad = () => { v.removeEventListener("seeked", ok); rej(new Error("video_load_failed")); };
    v.addEventListener("seeked", ok, { once: true });
    v.addEventListener("error", bad, { once: true });
    v.currentTime = t;
  });
}

/** Per-column saliency: skin pixels (weighted to the upper body) plus motion against the previous sample. */
function saliencyColumns(data: Uint8ClampedArray, prev: Uint8ClampedArray | null, w: number, h: number): Float32Array {
  const cols = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    const rowWeight = y < h * 0.7 ? 1 : 0.4; // faces live in the upper part of the frame
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      let s = isSkin(r, g, b) ? 1 : 0;
      if (prev) s += Math.min(1, (Math.abs(r - prev[i]) + Math.abs(g - prev[i + 1]) + Math.abs(b - prev[i + 2])) / 120) * 0.6;
      cols[x] += s * rowWeight;
    }
  }
  return cols;
}

/** Picks the face to follow: the largest one (usually the active speaker in close-ups). */
function faceCenter(faces: NativeFace[], width: number): number | null {
  if (!faces.length) return null;
  const f = faces.reduce((a, b) => (b.boundingBox.width * b.boundingBox.height > a.boundingBox.width * a.boundingBox.height ? b : a));
  return (f.boundingBox.x + f.boundingBox.width / 2) / width;
}

export interface TrackOptions {
  src: string;
  start: number;
  end: number;
  aspect: ClipAspectKey;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export async function trackSubject(o: TrackOptions): Promise<FocusKey[]> {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = o.src;
  await new Promise<void>((res, rej) => {
    v.onloadedmetadata = () => res();
    v.onerror = () => rej(new Error("video_load_failed"));
  });

  const vw = v.videoWidth || 16;
  const vh = v.videoHeight || 9;
  const { width: W, height: H } = CLIP_ASPECTS[o.aspect];
  // Fraction of the source width the output crop keeps; ≥1 means no horizontal panning needed.
  const windowFrac = Math.min(1, (vh * (W / H)) / vw);
  if (windowFrac >= 0.98) return [{ t: o.start, x: 0.5 }];

  const sh = Math.max(1, Math.round((SAMPLE_W * vh) / vw));
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_W;
  canvas.height = sh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const detector = nativeDetector();

  const raw: Array<{ t: number; x: number | null }> = [];
  let prev: Uint8ClampedArray | null = null;
  const steps = Math.max(1, Math.ceil((o.end - o.start) / SAMPLE_EVERY));
  try {
    for (let k = 0; k <= steps; k++) {
      if (o.signal?.aborted) throw new DOMException("aborted", "AbortError");
      const t = Math.min(o.end, o.start + k * SAMPLE_EVERY);
      await seek(v, t);
      let center: number | null = null;
      if (detector) {
        try {
          center = faceCenter(await detector.detect(v), vw);
        } catch {
          center = null;
        }
      }
      ctx.drawImage(v, 0, 0, SAMPLE_W, sh);
      const data = ctx.getImageData(0, 0, SAMPLE_W, sh).data;
      if (center == null) center = columnFocus(saliencyColumns(data, prev, SAMPLE_W, sh), windowFrac);
      prev = data;
      raw.push({ t, x: center == null ? null : centerToFocus(center, windowFrac) });
      o.onProgress?.(k / steps);
    }
  } finally {
    v.removeAttribute("src");
    v.load();
  }
  return smoothFocusTrack(raw);
}
