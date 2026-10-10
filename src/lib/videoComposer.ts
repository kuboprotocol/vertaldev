// Browser-side video composer: images / AI clips + text + music → MP4 (or WebM) via canvas + MediaRecorder.
// Runs entirely on the client, so composition costs Vertal nothing per video.
import { VIDEO_ASPECTS, type VideoAspectKey, type VideoStyleKey } from "@/config/videoStudio";

export interface ComposerScene {
  /** Still image (animated with Ken Burns) or a generated clip. */
  kind: "image" | "video";
  src: string;
  caption?: string;
}

export interface ComposeOptions {
  scenes: ComposerScene[];
  style: VideoStyleKey;
  aspect: VideoAspectKey;
  /** Duration of each still image scene. */
  secondsPerImage: number;
  /** Headline / meme bottom text / music title. */
  title?: string;
  audioSrc?: string;
  watermark?: boolean;
  fps?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface ComposeResult {
  blob: Blob;
  mimeType: string;
  extension: "mp4" | "webm";
  durationSec: number;
}

const FADE = 0.5;
const MAX_CLIP_SECONDS = 10;
const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function pickMimeType(isSupported: (t: string) => boolean): string | null {
  return MIME_CANDIDATES.find((t) => isSupported(t)) ?? null;
}

export interface TimelineEntry {
  index: number;
  start: number;
  end: number;
}

/** Scenes overlap by FADE seconds so each transition is a crossfade. */
export function buildTimeline(durations: number[]): { entries: TimelineEntry[]; total: number } {
  const entries: TimelineEntry[] = [];
  let cursor = 0;
  durations.forEach((d, index) => {
    const start = index === 0 ? 0 : cursor - FADE;
    entries.push({ index, start, end: start + d });
    cursor = start + d;
  });
  return { entries, total: cursor };
}

/** Scene opacity at time t: fades in (except the first) and fades out (except the last). */
export function sceneAlpha(e: TimelineEntry, t: number, isFirst: boolean, isLast: boolean): number {
  if (t < e.start || t > e.end) return 0;
  let a = 1;
  if (!isFirst && t < e.start + FADE) a = Math.min(a, (t - e.start) / FADE);
  if (!isLast && t > e.end - FADE) a = Math.min(a, (e.end - t) / FADE);
  return Math.max(0, Math.min(1, a));
}

/** Ken Burns: alternates zoom-in / zoom-out with a gentle pan, progress p in [0,1]. */
export function kenBurns(index: number, p: number) {
  const zoomIn = index % 2 === 0;
  const scale = zoomIn ? 1 + 0.12 * p : 1.12 - 0.12 * p;
  const dir = index % 4 < 2 ? 1 : -1;
  return { scale, dx: dir * 0.04 * (p - 0.5), dy: -0.02 * (p - 0.5) };
}

export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next) <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

type Media = HTMLImageElement | HTMLVideoElement;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith("blob:") && !src.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.oncanplaythrough = () => resolve(v);
    v.onerror = () => reject(new Error("video_load_failed"));
    v.src = src;
    v.load();
  });
}

function drawCover(ctx: CanvasRenderingContext2D, m: Media, W: number, H: number, scale = 1, dx = 0, dy = 0) {
  const mw = m instanceof HTMLVideoElement ? m.videoWidth : m.naturalWidth;
  const mh = m instanceof HTMLVideoElement ? m.videoHeight : m.naturalHeight;
  if (!mw || !mh) return;
  const s = Math.max(W / mw, H / mh) * scale;
  const w = mw * s;
  const h = mh * s;
  ctx.drawImage(m, (W - w) / 2 + dx * W, (H - h) / 2 + dy * H, w, h);
}

function strokeText(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, lh: number) {
  lines.forEach((l, i) => {
    ctx.strokeText(l, x, y + i * lh);
    ctx.fillText(l, x, y + i * lh);
  });
}

interface OverlayCtx {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  t: number;
  total: number;
  caption: string;
  sceneProgress: number;
  title: string;
}

function drawOverlay(style: VideoStyleKey, o: OverlayCtx) {
  const { ctx, W, H, t, total, caption, sceneProgress, title } = o;
  const base = Math.min(W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";

  if (style === "meme") {
    const size = Math.round(base * 0.085);
    ctx.font = `900 ${size}px Anton, Impact, "Arial Black", sans-serif`;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = size * 0.16;
    const measure = (s: string) => ctx.measureText(s).width;
    if (caption) strokeText(ctx, wrapText(caption.toUpperCase(), W * 0.9, measure), W / 2, H * 0.04, size * 1.05);
    if (title) {
      const lines = wrapText(title.toUpperCase(), W * 0.9, measure);
      strokeText(ctx, lines, W / 2, H * 0.96 - lines.length * size * 1.05, size * 1.05);
    }
    return;
  }

  if (style === "music") {
    if (title && t < 2) {
      const a = t < 1.5 ? 1 : (2 - t) / 0.5;
      ctx.fillStyle = `rgba(0,0,0,${0.45 * a})`;
      ctx.fillRect(0, 0, W, H);
      const size = Math.round(base * 0.09);
      ctx.font = `800 ${size}px Orbitron, Inter, sans-serif`;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      const lines = wrapText(title, W * 0.85, (s) => ctx.measureText(s).width);
      lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - (lines.length * size) / 2 + i * size * 1.1));
    }
    if (caption) {
      const size = Math.round(base * 0.055);
      ctx.font = `700 ${size}px Inter, sans-serif`;
      const lines = wrapText(caption, W * 0.86, (s) => ctx.measureText(s).width);
      const y0 = H * 0.8 - (lines.length * size * 1.2) / 2;
      const reveal = Math.min(1, sceneProgress * 1.6);
      lines.forEach((l, i) => {
        const y = y0 + i * size * 1.2;
        ctx.lineWidth = size * 0.18;
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.strokeText(l, W / 2, y);
        ctx.fillText(l, W / 2, y);
        const w = ctx.measureText(l).width;
        ctx.save();
        ctx.beginPath();
        ctx.rect(W / 2 - w / 2, y, w * reveal, size * 1.2);
        ctx.clip();
        ctx.fillStyle = "#F5C542";
        ctx.fillText(l, W / 2, y);
        ctx.restore();
      });
    }
    return;
  }

  if (style === "promo") {
    if (title) {
      const size = Math.round(base * 0.07);
      ctx.font = `800 ${size}px Orbitron, Inter, sans-serif`;
      const lines = wrapText(title, W * 0.84, (s) => ctx.measureText(s).width);
      const boxH = lines.length * size * 1.15 + size * 0.8;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, H * 0.06, W, boxH);
      ctx.fillStyle = "#C9941A";
      ctx.fillRect(W * 0.08, H * 0.06 + boxH - size * 0.2, W * 0.84, size * 0.08);
      ctx.fillStyle = "#fff";
      lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.06 + size * 0.4 + i * size * 1.15));
    }
    if (caption) {
      const size = Math.round(base * 0.048);
      ctx.font = `600 ${size}px Inter, sans-serif`;
      const lines = wrapText(caption, W * 0.8, (s) => ctx.measureText(s).width);
      const boxH = lines.length * size * 1.25 + size;
      const slide = Math.min(1, sceneProgress * 4);
      const x = W * 0.06 - (1 - slide) * W;
      ctx.fillStyle = "rgba(201,148,26,0.92)";
      ctx.fillRect(x, H * 0.78, W * 0.88, boxH);
      ctx.fillStyle = "#000";
      lines.forEach((l, i) => ctx.fillText(l, x + W * 0.44, H * 0.78 + size * 0.5 + i * size * 1.25));
    }
    return;
  }

  // story: Reels-style subtitles with a typing effect
  const text = [caption, t > total - 2.5 ? title : ""].filter(Boolean).join(" — ");
  if (!text) return;
  const size = Math.round(base * 0.05);
  ctx.font = `700 ${size}px Inter, sans-serif`;
  const shown = text.slice(0, Math.ceil(text.length * Math.min(1, sceneProgress * 2.2)));
  const lines = wrapText(shown, W * 0.82, (s) => ctx.measureText(s).width);
  const lh = size * 1.3;
  const y0 = H * 0.72;
  lines.forEach((l, i) => {
    const w = ctx.measureText(l).width;
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(W / 2 - w / 2 - size * 0.4, y0 + i * lh - size * 0.12, w + size * 0.8, lh);
    ctx.fillStyle = "#fff";
    ctx.fillText(l, W / 2, y0 + i * lh);
  });
}

function drawWatermark(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const size = Math.round(Math.min(W, H) * 0.032);
  ctx.font = `700 ${size}px Inter, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = size * 0.12;
  ctx.strokeText("Feito com vertal.dev", W - size * 0.8, H - size * 0.8);
  ctx.fillText("Feito com vertal.dev", W - size * 0.8, H - size * 0.8);
}

export async function composeVideo(opts: ComposeOptions): Promise<ComposeResult> {
  if (!opts.scenes.length) throw new Error("no_scenes");
  if (typeof MediaRecorder === "undefined") throw new Error("media_recorder_unsupported");
  const mimeType = pickMimeType((t) => MediaRecorder.isTypeSupported(t));
  if (!mimeType) throw new Error("no_supported_video_format");

  const { width: W, height: H } = VIDEO_ASPECTS[opts.aspect];
  const fps = opts.fps ?? 30;
  const media: Media[] = await Promise.all(opts.scenes.map((s) => (s.kind === "video" ? loadVideo(s.src) : loadImage(s.src))));
  const durations = media.map((m) =>
    m instanceof HTMLVideoElement ? Math.min(MAX_CLIP_SECONDS, m.duration || opts.secondsPerImage) : opts.secondsPerImage,
  );
  const { entries, total } = buildTimeline(durations);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const stream = canvas.captureStream(fps);

  let audio: HTMLAudioElement | null = null;
  let audioCtx: AudioContext | null = null;
  let gain: GainNode | null = null;
  if (opts.audioSrc) {
    audio = new Audio();
    if (!opts.audioSrc.startsWith("blob:")) audio.crossOrigin = "anonymous";
    audio.src = opts.audioSrc;
    await new Promise<void>((res, rej) => {
      audio!.oncanplaythrough = () => res();
      audio!.onerror = () => rej(new Error("audio_load_failed"));
      audio!.load();
    });
    audioCtx = new AudioContext();
    const source = audioCtx.createMediaElementSource(audio);
    gain = audioCtx.createGain();
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(gain).connect(dest);
    dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  }

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((res) => (recorder.onstop = () => res()));

  const started = new Set<number>();
  let raf = 0;
  const cleanup = () => {
    cancelAnimationFrame(raf);
    media.forEach((m) => m instanceof HTMLVideoElement && m.pause());
    audio?.pause();
    void audioCtx?.close();
    stream.getTracks().forEach((tr) => tr.stop());
  };

  return new Promise<ComposeResult>((resolve, reject) => {
    const abort = () => {
      cleanup();
      if (recorder.state !== "inactive") recorder.stop();
      reject(new DOMException("aborted", "AbortError"));
    };
    opts.signal?.addEventListener("abort", abort, { once: true });

    const t0 = performance.now();
    const frame = () => {
      const t = (performance.now() - t0) / 1000;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);

      let active: TimelineEntry | null = null;
      entries.forEach((e, i) => {
        const a = sceneAlpha(e, t, i === 0, i === entries.length - 1);
        if (a <= 0) return;
        const m = media[e.index];
        const p = Math.min(1, (t - e.start) / (e.end - e.start));
        if (m instanceof HTMLVideoElement && !started.has(i)) {
          started.add(i);
          m.currentTime = 0;
          void m.play();
        }
        ctx.globalAlpha = a;
        if (m instanceof HTMLVideoElement) drawCover(ctx, m, W, H);
        else {
          const kb = kenBurns(e.index, p);
          drawCover(ctx, m, W, H, kb.scale, kb.dx, kb.dy);
        }
        ctx.globalAlpha = 1;
        if (a >= 0.5) active = e;
      });

      if (active) {
        const e = active as TimelineEntry;
        ctx.save();
        drawOverlay(opts.style, {
          ctx, W, H, t, total,
          caption: opts.scenes[e.index].caption?.trim() ?? "",
          sceneProgress: Math.min(1, (t - e.start) / (e.end - e.start)),
          title: opts.title?.trim() ?? "",
        });
        ctx.restore();
      }
      if (opts.watermark) drawWatermark(ctx, W, H);

      if (gain && audioCtx && t > total - 1.5) gain.gain.value = Math.max(0, (total - t) / 1.5);
      opts.onProgress?.(Math.min(1, t / total));

      if (t >= total) {
        cleanup();
        recorder.stop();
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    recorder.start(250);
    void audio?.play();
    raf = requestAnimationFrame(frame);

    stopped.then(() => {
      opts.signal?.removeEventListener("abort", abort);
      if (opts.signal?.aborted) return;
      const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
      resolve({ blob, mimeType, extension: mimeType.startsWith("video/mp4") ? "mp4" : "webm", durationSec: total });
    }, reject);
  });
}
