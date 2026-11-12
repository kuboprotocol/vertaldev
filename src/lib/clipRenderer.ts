// Vertal Clips renderer — everything that touches the browser: audio extraction for transcription,
// frame drawing (reframe + animated captions + hook title) shared by the live preview and the export,
// and the real-time MediaRecorder export. Runs on the client, so cutting costs Vertal nothing per clip.
import {
  CLIP_ASPECTS, TRANSCRIBE_SAMPLE_RATE, captionPages, chunkPlan, cropRect, emojiFor, encodeWav, focusAt, mixDown, pageAt,
  type CaptionPage, type ClipAspectKey, type FocusKey, type Word,
} from "./clipEngine";
import { pickMimeType, wrapText } from "./videoComposer";

// ---------------------------------------------------------------- audio extraction

export interface AudioChunk {
  offset: number;
  /** Encodes this chunk's WAV on demand, so a long video never holds every chunk in memory at once. */
  blob: () => Blob;
}

/** Decodes the file's audio track at 16 kHz and slices it into mono WAV chunks for Whisper. */
export async function extractAudioChunks(file: Blob, chunkSec: number): Promise<{ duration: number; chunks: AudioChunk[] }> {
  const Offline = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Offline) throw new Error("audio_unsupported");
  const ctx = new Offline(1, 1, TRANSCRIBE_SAMPLE_RATE);
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    throw new Error("file_too_large_for_browser");
  }
  let audio: AudioBuffer;
  try {
    audio = await ctx.decodeAudioData(bytes);
  } catch {
    throw new Error("no_audio_track");
  }
  if (!audio.length || !audio.duration) throw new Error("no_audio_track");
  // Keep only references to the decoded channels; the mono mix is built per chunk.
  const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
  const rate = audio.sampleRate;
  const chunks = chunkPlan(audio.duration, chunkSec).map(({ start, end }) => ({
    offset: start,
    blob: () => new Blob([encodeWav(mixDown(channels, Math.floor(start * rate), Math.min(audio.length, Math.floor(end * rate))), rate)], { type: "audio/wav" }),
  }));
  return { duration: audio.duration, chunks };
}

// ---------------------------------------------------------------- caption styles

export const CAPTION_STYLES = {
  viral: { label: "Viral", desc: "Caixa alta, palavra ativa em amarelo" },
  neon: { label: "Neon", desc: "Palavra ativa em destaque verde" },
  kubo: { label: "Kubo Gold", desc: "Dourado premium da marca" },
  minimal: { label: "Minimal", desc: "Limpa, estilo podcast" },
} as const;
export type CaptionStyleKey = keyof typeof CAPTION_STYLES;

export type FrameLayout = "fill" | "fit";

export interface FrameOptions {
  aspect: ClipAspectKey;
  layout: FrameLayout;
  /** Horizontal framing (0 = left, 1 = right) used by the "fill" layout. */
  focusX: number;
  /** Auto-reframe track (Vertal Track); when set it overrides focusX over time. */
  focusTrack?: FocusKey[];
  /** Pops a matching emoji above the caption for keywords (money → 💰, AI → 🤖…). */
  emojis?: boolean;
  captionStyle: CaptionStyleKey;
  captions: boolean;
  /** Hook text shown at the top during the first seconds. */
  hookTitle?: string;
  progressBar: boolean;
  watermark: boolean;
}

export interface FrameState {
  /** Absolute time in the source video. */
  t: number;
  clipStart: number;
  clipEnd: number;
  pages: CaptionPage[];
}

const HOOK_SECONDS = 3.5;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawVideo(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, W: number, H: number, o: FrameOptions, t: number) {
  const vw = v.videoWidth || W;
  const vh = v.videoHeight || H;
  if (o.layout === "fill") {
    const fx = o.focusTrack?.length ? focusAt(o.focusTrack, t, o.focusX) : o.focusX;
    const { sx, sy, sw, sh } = cropRect(vw, vh, W, H, fx, 0.5);
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, W, H);
    return;
  }
  // "fit": blurred, zoomed copy as background + the full frame centered on top.
  const bg = cropRect(vw, vh, W, H, 0.5, 0.5);
  ctx.save();
  ctx.filter = "blur(28px) brightness(0.55)";
  ctx.drawImage(v, bg.sx, bg.sy, bg.sw, bg.sh, -40, -40, W + 80, H + 80);
  ctx.restore();
  const scale = Math.min(W / vw, H / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(v, 0, 0, vw, vh, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

function drawCaption(ctx: CanvasRenderingContext2D, page: CaptionPage, t: number, W: number, H: number, style: CaptionStyleKey) {
  const base = Math.min(W, H);
  const upper = style === "viral" || style === "neon";
  const size = Math.round(base * (style === "minimal" ? 0.058 : 0.078));
  ctx.font = `${style === "minimal" ? 700 : 900} ${size}px Montserrat, Inter, "Arial Black", sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  const tokens = page.words.map((w) => (upper ? w.word.toUpperCase() : w.word).replace(/[,;:]$/, ""));
  const space = ctx.measureText(" ").width;
  const widths = tokens.map((s) => ctx.measureText(s).width);
  // Wrap tokens into lines that fit 86% of the width.
  const lines: number[][] = [[]];
  let lineW = 0;
  widths.forEach((w, i) => {
    if (lines[lines.length - 1].length && lineW + space + w > W * 0.86) {
      lines.push([]);
      lineW = 0;
    }
    lineW += (lineW ? space : 0) + w;
    lines[lines.length - 1].push(i);
  });

  const lh = size * 1.22;
  const y0 = H * (H > W ? 0.7 : 0.78) - ((lines.length - 1) * lh) / 2;
  lines.forEach((idxs, li) => {
    const total = idxs.reduce((a, i) => a + widths[i], 0) + space * (idxs.length - 1);
    let x = W / 2 - total / 2;
    const y = y0 + li * lh;
    idxs.forEach((i) => {
      const w = page.words[i];
      const active = t >= w.start && t < w.end + 0.05;
      const spoken = t >= w.start;
      const pop = active ? 1 + 0.12 * Math.max(0, 1 - (t - w.start) / 0.15) : 1;
      ctx.save();
      ctx.translate(x + widths[i] / 2, y);
      ctx.scale(pop, pop);
      ctx.translate(-widths[i] / 2, 0);
      if (style === "neon" && active) {
        ctx.fillStyle = "#22C55E";
        roundRect(ctx, -size * 0.18, -size * 0.62, widths[i] + size * 0.36, size * 1.24, size * 0.22);
        ctx.fill();
      }
      if (style === "minimal") {
        ctx.shadowColor = "rgba(0,0,0,0.85)";
        ctx.shadowBlur = size * 0.35;
        ctx.fillStyle = spoken ? "#FFFFFF" : "rgba(255,255,255,0.55)";
        ctx.fillText(tokens[i], 0, 0);
      } else {
        ctx.strokeStyle = "#000";
        ctx.lineWidth = size * 0.16;
        ctx.strokeText(tokens[i], 0, 0);
        if (style === "kubo") {
          const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
          g.addColorStop(0, active ? "#FFE8A3" : "#FFFFFF");
          g.addColorStop(1, active ? "#C9941A" : "#E5E5E5");
          ctx.fillStyle = g;
        } else {
          ctx.fillStyle = style === "viral" && active ? "#FACC15" : "#FFFFFF";
        }
        ctx.fillText(tokens[i], 0, 0);
      }
      ctx.restore();
      x += widths[i] + space;
    });
  });
}

function drawHook(ctx: CanvasRenderingContext2D, text: string, elapsed: number, W: number, H: number) {
  if (elapsed > HOOK_SECONDS) return;
  const alpha = Math.min(1, elapsed / 0.25, (HOOK_SECONDS - elapsed) / 0.4);
  const size = Math.round(Math.min(W, H) * 0.056);
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.font = `800 ${size}px Montserrat, Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const lines = wrapText(text, W * 0.8, (s) => ctx.measureText(s).width).slice(0, 3);
  const lh = size * 1.2;
  const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + size * 1.2;
  const boxH = lines.length * lh + size * 0.7;
  const y = H * 0.09 + (1 - Math.min(1, elapsed / 0.3)) * -size;
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  roundRect(ctx, W / 2 - boxW / 2, y, boxW, boxH, size * 0.3);
  ctx.fill();
  ctx.fillStyle = "#0A0A0A";
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y + size * 0.35 + i * lh));
  ctx.restore();
}

/** Pops the emoji of the latest spoken keyword on this caption page above the text. */
function drawEmoji(ctx: CanvasRenderingContext2D, page: CaptionPage, t: number, W: number, H: number) {
  const hit = [...page.words].reverse().find((w) => t >= w.start && emojiFor(w.word));
  if (!hit) return;
  const age = t - hit.start;
  const size = Math.round(Math.min(W, H) * 0.12);
  const pop = age < 0.18 ? 0.6 + (age / 0.18) * 0.55 : age < 0.3 ? 1.15 - ((age - 0.18) / 0.12) * 0.15 : 1;
  ctx.save();
  ctx.translate(W / 2, H * (H > W ? 0.7 : 0.78) - size * 1.25);
  ctx.rotate(Math.sin(age * 6) * 0.08);
  ctx.scale(pop, pop);
  ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emojiFor(hit.word)!, 0, 0);
  ctx.restore();
}

/** Draws one output frame. Used by the live preview and by the exporter, so preview == export. */
export function drawClipFrame(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, o: FrameOptions, s: FrameState) {
  const { width: W, height: H } = CLIP_ASPECTS[o.aspect];
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (video.readyState >= 2) drawVideo(ctx, video, W, H, o, s.t);

  if (o.captions) {
    const page = pageAt(s.pages, s.t);
    if (page) {
      drawCaption(ctx, page, s.t, W, H, o.captionStyle);
      if (o.emojis) drawEmoji(ctx, page, s.t, W, H);
    }
  }
  if (o.hookTitle) drawHook(ctx, o.hookTitle, s.t - s.clipStart, W, H);
  if (o.progressBar) {
    const p = Math.max(0, Math.min(1, (s.t - s.clipStart) / (s.clipEnd - s.clipStart)));
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(0, H - 10, W, 10);
    ctx.fillStyle = "#C9941A";
    ctx.fillRect(0, H - 10, W * p, 10);
  }
  if (o.watermark) {
    const size = Math.round(Math.min(W, H) * 0.03);
    ctx.font = `700 ${size}px Inter, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("vertal.dev", W - size, H - size * 1.4);
  }
}

// ---------------------------------------------------------------- export

export interface RenderClipOptions extends FrameOptions {
  src: string;
  start: number;
  end: number;
  words: Word[];
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Media unlocked inside the click handler (see `unlockExportMedia`); Safari blocks play() after awaits otherwise. */
  media?: ExportMedia;
}

export interface ExportMedia {
  video: HTMLVideoElement;
  audioCtx: AudioContext;
  /** Settles once the priming play()/pause() is over, so it can't pause the real recording. */
  primed: Promise<void>;
}

/**
 * Call synchronously inside the user's click, before any await: creates the export <video> and
 * AudioContext and primes playback so the browser's autoplay policy lets the export start later.
 */
export function unlockExportMedia(src: string): ExportMedia {
  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";
  video.src = src;
  const audioCtx = new AudioContext();
  void audioCtx.resume().catch(() => {});
  // Once the export starts playing for real (dataset.recording), the priming pause must not run.
  const primed = video.play().then(() => { if (!video.dataset.recording) video.pause(); }, () => {});
  return { video, audioCtx, primed };
}

export interface RenderResult {
  blob: Blob;
  extension: "mp4" | "webm";
  mimeType: string;
}

/** Waits for a media event, failing on an error event or after `timeoutMs` (some browsers never fire it). */
export function waitForMedia(el: HTMLMediaElement, event: string, timeoutMs = 15_000): Promise<void> {
  return new Promise((res, rej) => {
    const done = (fn: () => void) => () => {
      clearTimeout(timer);
      el.removeEventListener(event, ok);
      el.removeEventListener("error", bad);
      fn();
    };
    const ok = done(res);
    const bad = done(() => rej(new Error("video_load_failed")));
    const timer = setTimeout(done(() => rej(new Error("video_load_failed"))), timeoutMs);
    el.addEventListener(event, ok);
    el.addEventListener("error", bad);
  });
}

/**
 * Seeks and resolves once the frame is decoded. Setting currentTime to the value it already has
 * doesn't fire "seeked" in every browser, so a same-time seek is nudged by a few milliseconds.
 */
export async function seekMedia(el: HTMLMediaElement, t: number): Promise<void> {
  const same = Math.abs(el.currentTime - t) < 0.005;
  if (same && el.readyState >= 2) return;
  const seeked = waitForMedia(el, "seeked");
  el.currentTime = same ? t + 0.01 : t;
  await seeked;
}

/** Records the clip in real time (cut + reframe + captions) into an MP4 or WebM blob. */
export async function renderClip(o: RenderClipOptions): Promise<RenderResult> {
  if (typeof MediaRecorder === "undefined") throw new Error("media_recorder_unsupported");
  if (typeof HTMLCanvasElement.prototype.captureStream !== "function") throw new Error("media_recorder_unsupported");
  const mimeType = pickMimeType((t) => MediaRecorder.isTypeSupported(t));
  if (!mimeType) throw new Error("no_supported_video_format");

  const { width: W, height: H } = CLIP_ASPECTS[o.aspect];
  const { video, audioCtx, primed } = o.media ?? unlockExportMedia(o.src);
  const release = () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
    void audioCtx.close().catch(() => {});
  };
  try {
    if (video.readyState < 1) await waitForMedia(video, "loadedmetadata");
    await Promise.race([primed, new Promise((r) => setTimeout(r, 3000))]);
    video.pause();
    await seekMedia(video, o.start);
  } catch (e) {
    release();
    throw e;
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const stream = canvas.captureStream(30);

  // Route the source audio into the recording only (not to the speakers). A file without an
  // audio track still exports (silent) instead of failing.
  try {
    const dest = audioCtx.createMediaStreamDestination();
    audioCtx.createMediaElementSource(video).connect(dest);
    dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  } catch (e) {
    console.warn("[clipRenderer] audio routing failed, exporting without sound", e);
  }

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  } catch {
    stream.getTracks().forEach((tr) => tr.stop());
    release();
    throw new Error("no_supported_video_format");
  }
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const pages = captionPages(o.words, o.start, o.end);
  const state: FrameState = { t: o.start, clipStart: o.start, clipEnd: o.end, pages };
  let raf = 0;
  let finished = false;
  // Stop the recorder first and release the tracks only once it has flushed its last chunk.
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    video.pause();
    if (recorder.state !== "inactive") recorder.stop();
    else recorder.onstop?.(new Event("stop"));
  };

  return new Promise<RenderResult>((resolve, reject) => {
    let failure: unknown = null;
    const abort = () => {
      failure = new DOMException("aborted", "AbortError");
      finish();
    };
    o.signal?.addEventListener("abort", abort, { once: true });

    recorder.onstop = () => {
      o.signal?.removeEventListener("abort", abort);
      stream.getTracks().forEach((tr) => tr.stop());
      release();
      if (failure) return reject(failure);
      if (!chunks.length) return reject(new Error("export_empty"));
      resolve({
        blob: new Blob(chunks, { type: mimeType.split(";")[0] }),
        mimeType,
        extension: mimeType.startsWith("video/mp4") ? "mp4" : "webm",
      });
    };
    recorder.onerror = (e) => {
      failure = (e as unknown as { error?: unknown }).error ?? new Error("export_failed");
      finish();
    };

    const frame = () => {
      state.t = video.currentTime;
      drawClipFrame(ctx, video, o, state);
      o.onProgress?.(Math.min(1, (state.t - o.start) / (o.end - o.start)));
      if (state.t >= o.end || video.ended) return finish();
      raf = requestAnimationFrame(frame);
    };

    drawClipFrame(ctx, video, o, state);
    recorder.start(250);
    void audioCtx.resume().catch(() => {});
    video.dataset.recording = "1";
    video.play().then(
      () => { if (!finished) raf = requestAnimationFrame(frame); },
      (e: Error) => {
        failure = e?.name === "NotAllowedError" ? new Error("playback_blocked") : e;
        finish();
      },
    );
  });
}
