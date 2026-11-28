// VERTAL AI API · vídeo (marca branca) — regras puras (sem rede), testadas em src/lib/vertalCodeAi/__tests__/videoApi.test.ts.
//
// Rotas (Authorization: Bearer vtl_ai_…):
//   POST /v1/videos/generations  {mode?:"ai"|"cover", prompt?, duration_seconds, audio_url?, image_url?, end_user?}
//                                → 202 {id, status:"processing", estimate}
//   GET  /v1/videos/{id}         status; pronto → video_url (7 dias) e o preço cobrado
//
// "ai"    = cenas geradas pela IA (motor próprio em GPU, o mesmo do "Vertal Vídeo"), em sequência até a duração,
//           com a música (audio_url) por baixo quando enviada.
// "cover" = capa parada + áudio (só CPU, ffmpeg) — quase sem custo.
//
// Trava de custo (fail closed): preço de atacado (custo real × 1,20) ≤ teto por minuto
// (VERTAL_VIDEO_API_MAX_USD_PER_MIN, padrão 0,30) × max(minutos, 1). O orçamento de GPU que vai ao motor sai
// desse teto, e o motor PARA de gerar cenas antes de passar dele; a cobrança usa o custo real medido e nunca
// passa do teto. Duração máxima VERTAL_VIDEO_API_MAX_SECONDS (padrão 300 = 5 min).
//
// Liga POR CHAVE (desligado por padrão): coluna vertal_ai_api_keys.features = {"video": true}
// (migração 20261128010000), ou VERTAL_VIDEO_API_ENABLED=true + VERTAL_VIDEO_API_KEY_IDS no VERTAL_GPU_CONFIG.
// VERTAL_VIDEO_API_ENABLED=false desliga para todas (interruptor geral).

type Env = Record<string, string | undefined>;

const truthy = (v: string | undefined) => /^(1|true|yes|on|sim)$/i.test((v ?? "").trim());
const falsy = (v: string | undefined) => /^(0|false|no|off|nao|não)$/i.test((v ?? "").trim());
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function num(v: string | undefined, d: number, min: number, max: number): number {
  const n = Number((v ?? "").trim().replace(",", "."));
  return (v ?? "").trim() !== "" && Number.isFinite(n) && n >= min && n <= max ? n : d;
}

export type VideoMode = "ai" | "cover";

export interface VideoApiConfig {
  maxSeconds: number;
  maxUsdPerMinute: number;
  wholesaleMarkup: number;
  gpuUsdPerHour: number;
  /** Estimativas (só para planejar quantas cenas cabem; a cobrança usa o medido). */
  coldStartGpuS: number;
  clipGpuS: number;
  clipSeconds: number;
  steps: number;
  maxClips: number;
  /** CPU do contêiner que baixa, espera a GPU e monta o MP4 (ffmpeg), em US$ por segundo. */
  cpuUsdPerSecond: number;
}

export function loadVideoApiConfig(env: Env, wholesaleMarkup = 1.2): VideoApiConfig {
  return {
    maxSeconds: Math.floor(num(env.VERTAL_VIDEO_API_MAX_SECONDS, 300, 1, 600)),
    maxUsdPerMinute: num(env.VERTAL_VIDEO_API_MAX_USD_PER_MIN, 0.3, 0.01, 100),
    wholesaleMarkup: wholesaleMarkup > 0 ? wholesaleMarkup : 1.2,
    // Modal L40S ≈ US$ 1,95/h (US$ 0,000542/s).
    gpuUsdPerHour: num(env.VERTAL_VIDEO_API_GPU_USD_HOUR, 1.95, 0.1, 20),
    coldStartGpuS: num(env.VERTAL_VIDEO_API_COLD_START_S, 90, 0, 900),
    clipGpuS: num(env.VERTAL_VIDEO_API_CLIP_GPU_S, 80, 5, 900),
    clipSeconds: Math.floor(num(env.VERTAL_VIDEO_API_CLIP_SECONDS, 5, 2, 5)),
    steps: Math.floor(num(env.VERTAL_VIDEO_API_STEPS, 16, 10, 50)),
    maxClips: Math.floor(num(env.VERTAL_VIDEO_API_MAX_CLIPS, 16, 1, 120)),
    // Modal: 1 núcleo (US$ 0,0000131/s) + 1 GiB (US$ 0,00000222/s), arredondado para cima.
    cpuUsdPerSecond: num(env.VERTAL_VIDEO_API_CPU_USD_PER_S, 0.000016, 0, 0.01),
  };
}

/** Desligado por padrão. Liga por chave (features.video) ou pela lista no config; interruptor geral desliga tudo. */
export function videoApiEnabledFor(env: Env, key: { id: string; features?: unknown }): boolean {
  if (falsy(env.VERTAL_VIDEO_API_ENABLED)) return false;
  const f = key.features as { video?: unknown } | null | undefined;
  if (f && typeof f === "object" && f.video === true) return true;
  if (!truthy(env.VERTAL_VIDEO_API_ENABLED)) return false;
  const ids = (env.VERTAL_VIDEO_API_KEY_IDS ?? "").split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => UUID_RE.test(s));
  return ids.includes(key.id.toLowerCase());
}

export type VideoApiRoute = { r: "create" } | { r: "job"; id: string };

export function matchVideoRoute(method: string, path: string): VideoApiRoute | null | "not_video" {
  if (/\/v1\/videos\/generations$/.test(path)) return method === "POST" ? { r: "create" } : null;
  const m = path.match(/\/v1\/videos\/([A-Za-z0-9_.-]{10,400})$/);
  if (!m) return "not_video";
  return method === "GET" ? { r: "job", id: m[1] } : null;
}

/** Teto total de preço (US$) de um vídeo: teto/min × max(minutos, 1) — vídeo curto paga no máximo 1 minuto de teto. */
export function priceCapUsd(cfg: VideoApiConfig, seconds: number): number {
  return Math.round(cfg.maxUsdPerMinute * Math.max(seconds / 60, 1) * 1e6) / 1e6;
}

export interface VideoPlan {
  mode: VideoMode;
  seconds: number;
  clips: number;
  clipSeconds: number;
  steps: number;
  /** Orçamento de GPU (segundos de contêiner, contando a subida) que o motor não passa. */
  budgetGpuS: number;
  estimatedCostUsd: number;
  priceCapUsd: number;
}

export type PlanResult = { ok: true; plan: VideoPlan } | { ok: false; status: number; code: string; message: string };

/** Planeja o vídeo dentro da trava: quantas cenas cabem no orçamento de GPU que o teto de preço permite. */
export function planVideo(cfg: VideoApiConfig, mode: VideoMode, secondsRaw: unknown): PlanResult {
  const seconds = Number(secondsRaw);
  if (!Number.isInteger(seconds) || seconds < 1) return { ok: false, status: 400, code: "invalid_duration", message: "duration_seconds must be an integer ≥ 1." };
  if (seconds > cfg.maxSeconds) return { ok: false, status: 400, code: "video_too_long", message: `Max duration is ${cfg.maxSeconds} seconds.` };
  const cap = priceCapUsd(cfg, seconds);
  // CPU: baixar + montar (≈ 30 s + 0,5 s por segundo de vídeo) e, no "ai", esperar a GPU o tempo todo.
  const cpuFixedS = 30 + seconds * 0.5;
  if (mode === "cover") {
    const est = Math.round(cpuFixedS * cfg.cpuUsdPerSecond * 1e6) / 1e6;
    return { ok: true, plan: { mode, seconds, clips: 0, clipSeconds: 0, steps: 0, budgetGpuS: 0, estimatedCostUsd: est, priceCapUsd: cap } };
  }
  // Por segundo de GPU pagamos GPU + a CPU que espera junto.
  const perGpuS = cfg.gpuUsdPerHour / 3600 + cfg.cpuUsdPerSecond;
  const costCap = cap / cfg.wholesaleMarkup - cpuFixedS * cfg.cpuUsdPerSecond;
  const budgetGpuS = Math.floor(costCap / perGpuS);
  const want = Math.ceil(seconds / cfg.clipSeconds);
  const fit = Math.floor((budgetGpuS - cfg.coldStartGpuS) / cfg.clipGpuS);
  const clips = Math.min(want, cfg.maxClips, fit);
  if (clips < 1) {
    return { ok: false, status: 503, code: "video_cost_guard", message: "Video generation is above the cost cap right now. Nothing was charged." };
  }
  const est = (cfg.coldStartGpuS + clips * cfg.clipGpuS) * perGpuS + cpuFixedS * cfg.cpuUsdPerSecond;
  return {
    ok: true,
    plan: { mode, seconds, clips, clipSeconds: cfg.clipSeconds, steps: cfg.steps, budgetGpuS, estimatedCostUsd: Math.round(est * 1e6) / 1e6, priceCapUsd: cap },
  };
}

const secs = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(v, 7200) : 0);

/** Custo real (US$) de um vídeo pronto: segundos de GPU e de CPU medidos pelo motor. */
export function videoCostUsd(cfg: VideoApiConfig, gpuSeconds: unknown, cpuSeconds: unknown = 0): number {
  return Math.round(((secs(gpuSeconds) / 3600) * cfg.gpuUsdPerHour + secs(cpuSeconds) * cfg.cpuUsdPerSecond) * 1e6) / 1e6;
}

/** Nunca cobra acima do teto: o motor respeita o orçamento, e a conta é cortada no teto por garantia. */
export function cappedCostUsd(cfg: VideoApiConfig, plan: Pick<VideoPlan, "priceCapUsd">, costUsd: number): number {
  return Math.round(Math.min(costUsd, plan.priceCapUsd / cfg.wholesaleMarkup) * 1e6) / 1e6;
}

// ─── id do trabalho (sem tabela nova): payload assinado com HMAC, amarrado à chave ───

export interface VideoJobClaims {
  /** id do job no motor (FunctionCall da Modal, "fc-…") */
  p: string;
  /** id da chave da API */
  k: string;
  m: VideoMode;
  s: number;
  /** teto de preço do pedido (US$) */
  c: number;
  /** criado em (epoch s) */
  t: number;
  /** end_user opcional do cliente */
  u?: string;
}

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

async function hmac(secret: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret || "vertal-video"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
  return b64url(sig).slice(0, 32);
}

export async function signVideoJob(secret: string, c: VideoJobClaims): Promise<string> {
  const body = b64url(new TextEncoder().encode(JSON.stringify(c)));
  return `vid_${body}.${await hmac(secret, `video:${body}`)}`;
}

export async function verifyVideoJob(secret: string, token: string, keyId: string): Promise<VideoJobClaims | null> {
  if (typeof token !== "string" || !token.startsWith("vid_") || token.length > 400) return null;
  const i = token.lastIndexOf(".");
  if (i <= 4) return null;
  const body = token.slice(4, i);
  if (!/^[A-Za-z0-9_-]+$/.test(body) || (await hmac(secret, `video:${body}`)) !== token.slice(i + 1)) return null;
  try {
    const c = JSON.parse(new TextDecoder().decode(fromB64url(body))) as VideoJobClaims;
    if (!c || c.k !== keyId || typeof c.p !== "string" || !/^fc-[A-Za-z0-9]+$/.test(c.p)) return null;
    return c;
  } catch {
    return null;
  }
}

export function cleanVideoPrompt(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 1500) : "";
}

/**
 * Lê VERTAL_VIDEO_API_* e o motor (VERTAL_OWN_VIDEO_URL/_TOKEN) do segredo JSON VERTAL_GPU_CONFIG
 * (o projeto está no limite de segredos). Segredo avulso com o mesmo nome vence.
 */
export function videoEnvFrom(env: Env): Env {
  const out: Env = { ...env };
  const raw = (env.VERTAL_GPU_CONFIG ?? "").trim();
  if (!raw) return out;
  let cfg: unknown;
  try {
    cfg = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return out;
  for (const [k, v] of Object.entries(cfg as Record<string, unknown>)) {
    if (!/^VERTAL_(VIDEO_API_[A-Z_]+|OWN_VIDEO_(URL|TOKEN))$/.test(k) || (out[k] ?? "").trim()) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = String(v);
  }
  return out;
}
