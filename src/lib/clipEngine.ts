// Vertal Clips engine — pure logic for turning a long video's transcript into short viral clips.
// No DOM here: transcript merging, viral scoring, boundary snapping, caption paging, crop math and
// WAV encoding all live in this file so they are unit-testable and shared by the UI and renderer.

export interface Word {
  word: string;
  start: number;
  end: number;
}

export interface Segment {
  text: string;
  start: number;
  end: number;
}

export interface Transcript {
  words: Word[];
  segments: Segment[];
  duration: number;
  language?: string;
}

/** Score breakdown on a 0–10 scale, same axes the market uses (hook, flow, value, trend). */
export interface ClipScores {
  hook: number;
  flow: number;
  value: number;
  trend: number;
}

export interface Clip {
  id: string;
  start: number;
  end: number;
  title: string;
  hook: string;
  reason: string;
  /** Virality score 0–100. */
  score: number;
  scores: ClipScores;
  hashtags: string[];
  source: "ai" | "engine";
}

export interface ClipLengthRange {
  min: number;
  max: number;
}

export const CLIP_LENGTHS = {
  short: { label: "15–30s", min: 15, max: 30 },
  medium: { label: "30–60s", min: 30, max: 60 },
  long: { label: "60–90s", min: 60, max: 90 },
} as const;
export type ClipLengthKey = keyof typeof CLIP_LENGTHS;

/** Audio is sent to transcription in chunks of this length (16 kHz mono WAV ≈ 9.6 MB per chunk). */
export const TRANSCRIBE_CHUNK_SECONDS = 300;
export const TRANSCRIBE_SAMPLE_RATE = 16_000;

// ---------------------------------------------------------------- time helpers

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(r).padStart(2, "0")}`;
}

/** Accepts seconds (number or numeric string), "mm:ss", "hh:mm:ss" or "mm:ss.ms". */
export function parseTimestamp(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  const parts = t.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

// ---------------------------------------------------------------- transcript

/** Plans [start, end) audio chunks covering the whole duration. */
export function chunkPlan(duration: number, chunkSec = TRANSCRIBE_CHUNK_SECONDS): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (let s = 0; s < duration; s += chunkSec) out.push({ start: s, end: Math.min(duration, s + chunkSec) });
  return out;
}

/** Joins per-chunk transcripts into one timeline by shifting each chunk by its offset. */
export function mergeTranscripts(parts: Array<{ offset: number; transcript: Partial<Transcript> }>, duration: number): Transcript {
  const words: Word[] = [];
  const segments: Segment[] = [];
  let language: string | undefined;
  for (const { offset, transcript } of [...parts].sort((a, b) => a.offset - b.offset)) {
    language ??= transcript.language;
    for (const w of transcript.words ?? []) {
      const word = String(w.word ?? "").trim();
      if (word) words.push({ word, start: w.start + offset, end: w.end + offset });
    }
    for (const s of transcript.segments ?? []) {
      const text = String(s.text ?? "").trim();
      if (text) segments.push({ text, start: s.start + offset, end: s.end + offset });
    }
  }
  // Whisper sometimes returns segments without word timestamps: synthesize evenly spaced words.
  if (!words.length) {
    for (const s of segments) {
      const tokens = s.text.split(/\s+/).filter(Boolean);
      const step = (s.end - s.start) / Math.max(1, tokens.length);
      tokens.forEach((word, i) => words.push({ word, start: s.start + i * step, end: s.start + (i + 1) * step }));
    }
  }
  return { words, segments, duration, language };
}

export function textBetween(t: Transcript, start: number, end: number): string {
  return t.segments
    .filter((s) => s.end > start && s.start < end)
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compact "[start-end] text" listing the LLM uses to choose clips. */
export function transcriptForPrompt(t: Transcript, maxChars = 60_000): string {
  let out = "";
  for (const s of t.segments) {
    const line = `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}\n`;
    if (out.length + line.length > maxChars) break;
    out += line;
  }
  return out;
}

// ---------------------------------------------------------------- viral scoring (in-house engine)

const HOOK_TERMS = [
  "segredo", "ninguém", "ninguem", "nunca", "pare", "erro", "verdade", "cuidado", "atenção", "atencao",
  "olha", "imagina", "sabia", "chocante", "absurdo", "inacreditável", "inacreditavel", "mentira", "polêmic",
  "secret", "nobody", "never", "stop", "mistake", "truth", "imagine", "insane", "crazy", "why", "how",
  "por que", "porque", "como", "o que", "você", "voce", "you",
];
const VALUE_TERMS = [
  "dica", "passo", "método", "metodo", "estratégia", "estrategia", "dinheiro", "resultado", "aprender",
  "funciona", "lucro", "vender", "crescer", "milhão", "milhões", "milhao", "ganhar", "simples", "fácil", "facil",
  "tip", "step", "method", "strategy", "money", "result", "learn", "works", "profit", "grow", "million",
];
const TREND_TERMS = [
  "ia", "inteligência artificial", "inteligencia artificial", "chatgpt", "ai", "cripto", "crypto", "bitcoin",
  "blockchain", "web3", "token", "viral", "tiktok", "instagram", "youtube", "startup", "bilhão", "bilhao",
];
const EMOTION_RE = /[!?]|haha|kkk|uau|nossa|caramba|meu deus|wow|omg/gi;

function countTerms(text: string, terms: string[]): number {
  const lower = ` ${text.toLowerCase()} `;
  return terms.reduce((n, term) => n + (lower.match(new RegExp(`[\\s,.!?¿¡"'(]${escapeRe(term)}`, "g"))?.length ?? 0), 0);
}
function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const clamp10 = (n: number) => Math.round(Math.max(0, Math.min(10, n)) * 10) / 10;

/** Heuristic virality score. `opening` is the first sentence(s) — where the hook must live. */
export function scoreText(opening: string, full: string, durationSec: number): { score: number; scores: ClipScores } {
  const words = full.split(/\s+/).filter(Boolean).length;
  const per100 = 100 / Math.max(20, words);
  const pace = words / Math.max(1, durationSec); // words per second; 2.3–3.3 is the sweet spot

  const hook = clamp10(
    3 + countTerms(opening, HOOK_TERMS) * 1.6 + (/\?/.test(opening) ? 2 : 0) + (/\d/.test(opening) ? 1.2 : 0) +
      (opening.split(/\s+/).length <= 14 ? 1 : 0),
  );
  const flow = clamp10(10 - Math.abs(pace - 2.8) * 3 - (/[.!?…]["']?$/.test(full.trim()) ? 0 : 2));
  const value = clamp10(2.5 + countTerms(full, VALUE_TERMS) * per100 * 1.4 + (full.match(/\d+/g)?.length ?? 0) * per100 * 0.8);
  const trend = clamp10(2 + countTerms(full, TREND_TERMS) * per100 * 2 + (full.match(EMOTION_RE)?.length ?? 0) * per100 * 0.8);
  return { score: combineScores({ hook, flow, value, trend }), scores: { hook, flow, value, trend } };
}

/** Weighted 0–100 score: the hook decides most of a short's retention. */
export function combineScores(s: ClipScores): number {
  return Math.round((s.hook * 0.4 + s.flow * 0.2 + s.value * 0.25 + s.trend * 0.15) * 10);
}

function overlapRatio(a: { start: number; end: number }, b: { start: number; end: number }): number {
  const inter = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  return inter / Math.max(0.001, Math.min(a.end - a.start, b.end - b.start));
}

/** Greedy pick of the best non-overlapping clips. */
export function pickNonOverlapping<T extends { start: number; end: number; score: number }>(items: T[], count: number, maxOverlap = 0.25): T[] {
  const chosen: T[] = [];
  for (const c of [...items].sort((a, b) => b.score - a.score)) {
    if (chosen.length >= count) break;
    if (chosen.every((x) => overlapRatio(x, c) <= maxOverlap)) chosen.push(c);
  }
  return chosen.sort((a, b) => b.score - a.score);
}

function firstSentence(text: string): string {
  const m = text.match(/^(.{8,160}?[.!?…])(\s|$)/);
  return (m ? m[1] : text.split(/\s+/).slice(0, 14).join(" ")).trim();
}

function titleFrom(opening: string): string {
  const t = opening.replace(/[.!…]+$/, "").trim();
  return t.length > 70 ? `${t.slice(0, 67).trimEnd()}…` : t;
}

/**
 * The in-house engine: slides a window over sentence boundaries, scores every candidate with
 * `scoreText`, and keeps the best non-overlapping ones. Works offline — used as the fallback
 * when the AI is unavailable and to sanity-check AI output.
 */
export function findClips(t: Transcript, range: ClipLengthRange, count: number): Clip[] {
  const segs = t.segments;
  const candidates: Clip[] = [];
  for (let i = 0; i < segs.length; i++) {
    let j = i;
    while (j < segs.length && segs[j].end - segs[i].start < range.min) j++;
    for (; j < segs.length && segs[j].end - segs[i].start <= range.max; j++) {
      const start = segs[i].start;
      const end = segs[j].end;
      const full = segs.slice(i, j + 1).map((s) => s.text).join(" ");
      const opening = firstSentence(full);
      const { score, scores } = scoreText(opening, full, end - start);
      candidates.push({
        id: `e${i}-${j}`, start, end, score, scores,
        title: titleFrom(opening), hook: opening,
        reason: "Selecionado pelo motor Vertal: gancho forte no início e ritmo de fala ideal.",
        hashtags: [], source: "engine",
      });
    }
  }
  return pickNonOverlapping(candidates, count);
}

/** Moves start to the nearest sentence start and end to the nearest sentence end, within the range. */
export function snapToSentences(t: Transcript, start: number, end: number, range: ClipLengthRange): { start: number; end: number } {
  const segs = t.segments;
  if (!segs.length) {
    const s = Math.max(0, Math.min(start, t.duration - range.min));
    return { start: s, end: Math.min(t.duration, Math.max(end, s + range.min), s + range.max) };
  }
  const nearest = (vals: number[], target: number) => vals.reduce((b, v) => (Math.abs(v - target) < Math.abs(b - target) ? v : b), vals[0]);
  const s = nearest(segs.map((x) => x.start), start);
  const ends = segs.map((x) => x.end).filter((e) => e - s >= range.min * 0.8 && e - s <= range.max * 1.1);
  const e = ends.length ? nearest(ends, end) : Math.min(t.duration, s + Math.max(range.min, Math.min(range.max, end - start)));
  return { start: s, end: Math.max(e, s + 1) };
}

/** Validates the LLM's clips: real timestamps, snapped to sentences, scored, deduplicated. */
export function normalizeAiClips(raw: unknown, t: Transcript, range: ClipLengthRange, count: number): Clip[] {
  const list = Array.isArray(raw) ? raw : (raw as { clips?: unknown })?.clips;
  if (!Array.isArray(list)) return [];
  const out: Clip[] = [];
  list.forEach((r: Record<string, unknown>, i) => {
    const s0 = parseTimestamp(r?.start ?? r?.start_seconds);
    const e0 = parseTimestamp(r?.end ?? r?.end_seconds);
    if (s0 == null || e0 == null || e0 <= s0 || s0 >= t.duration) return;
    const { start, end } = snapToSentences(t, s0, Math.min(e0, t.duration), range);
    const full = textBetween(t, start, end);
    const local = scoreText(firstSentence(full), full, end - start);
    const ai = (r?.scores ?? {}) as Partial<Record<keyof ClipScores, unknown>>;
    const pick = (k: keyof ClipScores) => {
      const v = Number(ai[k]);
      return Number.isFinite(v) ? clamp10(v * 0.7 + local.scores[k] * 0.3) : local.scores[k];
    };
    const scores = { hook: pick("hook"), flow: pick("flow"), value: pick("value"), trend: pick("trend") };
    const title = String(r?.title ?? "").trim() || titleFrom(firstSentence(full));
    out.push({
      id: `a${i}-${Math.round(start)}`, start, end, scores, score: combineScores(scores),
      title: title.slice(0, 90), hook: String(r?.hook ?? "").trim() || firstSentence(full),
      reason: String(r?.reason ?? "").trim(),
      hashtags: (Array.isArray(r?.hashtags) ? r.hashtags : []).map((h) => `#${String(h).replace(/^#/, "").replace(/\s+/g, "")}`).filter((h) => h.length > 1).slice(0, 6),
      source: "ai",
    });
  });
  // Dedupe in the AI's own ranking order (its first pick of an overlapping pair wins), then sort by score.
  const kept: Clip[] = [];
  for (const c of out) if (kept.length < count && kept.every((k) => overlapRatio(k, c) <= 0.5)) kept.push(c);
  return kept.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------- captions

export interface CaptionPage {
  start: number;
  end: number;
  words: Word[];
}

/** Groups words into short on-screen pages (TikTok style), breaking on punctuation and pauses. */
export function captionPages(words: Word[], start: number, end: number, maxWords = 3, maxGap = 0.6): CaptionPage[] {
  const inside = words.filter((w) => w.end > start && w.start < end);
  const pages: CaptionPage[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) pages.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur });
    cur = [];
  };
  inside.forEach((w, i) => {
    const prev = inside[i - 1];
    if (cur.length && (cur.length >= maxWords || (prev && w.start - prev.end > maxGap))) flush();
    cur.push(w);
    if (/[.!?…,;:]$/.test(w.word)) flush();
  });
  flush();
  // Keep a page on screen until the next one starts so captions never flicker off mid-sentence.
  for (let i = 0; i < pages.length - 1; i++) {
    if (pages[i + 1].start - pages[i].end < 0.8) pages[i].end = pages[i + 1].start;
  }
  return pages;
}

export function pageAt(pages: CaptionPage[], t: number): CaptionPage | null {
  return pages.find((p) => t >= p.start && t < p.end) ?? null;
}

// ---------------------------------------------------------------- framing

export const CLIP_ASPECTS = {
  "9:16": { label: "9:16 Reels/TikTok", width: 1080, height: 1920 },
  "1:1": { label: "1:1 Feed", width: 1080, height: 1080 },
  "4:5": { label: "4:5 Instagram", width: 1080, height: 1350 },
  "16:9": { label: "16:9 YouTube", width: 1920, height: 1080 },
} as const;
export type ClipAspectKey = keyof typeof CLIP_ASPECTS;

/** Source rectangle that fills the destination aspect, panned horizontally/vertically by focus (0–1). */
export function cropRect(srcW: number, srcH: number, dstW: number, dstH: number, focusX = 0.5, focusY = 0.5) {
  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;
  let sw = srcW;
  let sh = srcH;
  if (srcAspect > dstAspect) sw = srcH * dstAspect;
  else sh = srcW / dstAspect;
  const sx = (srcW - sw) * Math.max(0, Math.min(1, focusX));
  const sy = (srcH - sh) * Math.max(0, Math.min(1, focusY));
  return { sx, sy, sw, sh };
}

// ---------------------------------------------------------------- audio

/** Encodes mono float samples as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

/** Credits a full run costs: one per transcription chunk plus one for the AI analysis. */
export function quoteClips(durationSec: number): { transcribe: number; analyze: number; total: number } {
  const transcribe = Math.max(1, Math.ceil(durationSec / TRANSCRIBE_CHUNK_SECONDS));
  return { transcribe, analyze: 1, total: transcribe + 1 };
}
