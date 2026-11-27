// VERTAL AI API · voz clonada (marca branca) — parte pura (Vitest e edge function vertal-ai-api).
//
// O cliente da API (ex.: o app MusKAI) cria vozes dos PRÓPRIOS usuários finais, com atestado de consentimento
// obrigatório, e usa a voz para falar um texto ou cantar uma música. Tudo isolado por cliente da API (dono da
// chave) e, dentro dele, por usuário final (`end_user`).
//
// Preço (cobrança v2, atacado): NOSSO custo real de GPU (segundos de GPU que o motor mede × preço/hora da GPU)
// com piso por tipo, × 1,20, debitado dos créditos pré-pagos (US$0,03 cada); saldo zerado → 402.
// Desligado por padrão: VERTAL_OWN_VOICE_API_ENABLED (+ VERTAL_AI_API_ENABLED da API inteira).
import { VOICE_CONSENT_TEXT, VOICE_CONSENT_VERSION, VOICE_LIMITS, VOICE_SAMPLE_MIME, cleanVoiceName } from "../voiceClone.ts";

type Env = Record<string, string | undefined>;
const truthy = (v?: string) => /^(1|true|yes|on|sim)$/i.test((v ?? "").trim());
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const VOICE_API_LIMITS = {
  maxVoicesPerEndUser: VOICE_LIMITS.maxVoicesPerUser,
  maxVoicesPerCustomer: 500,
  minSampleSeconds: VOICE_LIMITS.minSampleSeconds,
  maxSampleSeconds: VOICE_LIMITS.maxSampleSeconds,
  maxSampleBytes: VOICE_LIMITS.maxSampleBytes,
  maxSongBytes: 40 * 1024 * 1024,
  maxTextChars: VOICE_LIMITS.maxTextChars,
  /** Trabalho parado além disso é dado como falho (nada é cobrado). */
  jobMaxMs: VOICE_LIMITS.jobMaxMs,
  /** Pior caso usado no teto de gasto ANTES de enviar (segundos de GPU). */
  worstGpuSeconds: { speak: 300, sing: 900 },
  resultTtlSeconds: 7 * 24 * 3600,
} as const;

/** Liga/desliga. Lista vazia = todos os clientes da API (quando ligado). */
export function voiceApiEnabledFor(env: Env, ownerId: string): boolean {
  if (!truthy(env.VERTAL_OWN_VOICE_API_ENABLED)) return false;
  const ids = (env.VERTAL_OWN_VOICE_API_USER_IDS ?? "").split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => UUID_RE.test(s));
  return !ids.length || ids.includes(ownerId.toLowerCase());
}

/** Preço/hora da GPU em USD (L4 ≈ 0,80; A10G ≈ 1,10). Sobrescrevível: VERTAL_OWN_VOICE_GPU_USD_HOUR='{"L4":0.8}'. */
export const DEFAULT_GPU_USD_HOUR: Record<string, number> = { L4: 0.8, A10G: 1.1, A10: 1.1, T4: 0.59, A100: 2.5, H100: 3.95 };

export function gpuUsdPerHour(env: Env, gpuName: string | null | undefined): number {
  let table = DEFAULT_GPU_USD_HOUR;
  try {
    const o = JSON.parse(env.VERTAL_OWN_VOICE_GPU_USD_HOUR ?? "");
    if (o && typeof o === "object") table = { ...DEFAULT_GPU_USD_HOUR, ...o };
  } catch { /* padrão */ }
  const name = (gpuName ?? "").toUpperCase();
  const hit = Object.keys(table).sort((a, b) => b.length - a.length).find((k) => name.includes(k.toUpperCase()));
  // GPU desconhecida: a mais cara das duas que o app pede (L4/A10G), para nunca cobrar abaixo do custo.
  return hit ? table[hit] : Math.max(table.L4 ?? 0.8, table.A10G ?? 1.1);
}

/** Nosso custo real de um trabalho em USD. */
export function voiceJobCostUsd(env: Env, gpuSeconds: unknown, gpuName: string | null | undefined): number {
  const s = typeof gpuSeconds === "number" && Number.isFinite(gpuSeconds) && gpuSeconds > 0 ? Math.min(gpuSeconds, 3600) : 0;
  return Math.round(((s / 3600) * gpuUsdPerHour(env, gpuName)) * 1e6) / 1e6;
}

// ─── consentimento (obrigatório para criar uma voz) ───────────────────────

export interface VoiceConsentAttestation {
  version: string;
  /** O usuário final aceitou o termo (o texto de GET /v1/voices/consent) no app do cliente. */
  accepted: true;
  /** A voz é do próprio usuário final, ou ele tem autorização por escrito do dono. */
  owner_confirmed: true;
  /** Nome de quem fala na amostra. */
  speaker_name: string;
  /** Quando o usuário final aceitou (ISO 8601). */
  accepted_at: string;
  /** Opcional: IP e navegador do usuário final no aceite; link de prova da autorização de terceiro. */
  end_user_ip?: string;
  end_user_agent?: string;
  authorization_url?: string;
}

export type ConsentCheck = { ok: true; value: VoiceConsentAttestation } | { ok: false; missing: string[] };

export function checkConsentAttestation(raw: unknown, now = Date.now()): ConsentCheck {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const missing: string[] = [];
  if (c.version !== VOICE_CONSENT_VERSION) missing.push(`consent.version (= "${VOICE_CONSENT_VERSION}")`);
  if (c.accepted !== true) missing.push("consent.accepted (= true)");
  if (c.owner_confirmed !== true) missing.push("consent.owner_confirmed (= true)");
  const speaker = typeof c.speaker_name === "string" ? c.speaker_name.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  if (speaker.length < 2) missing.push("consent.speaker_name");
  const at = typeof c.accepted_at === "string" ? Date.parse(c.accepted_at) : NaN;
  if (!Number.isFinite(at) || at > now + 5 * 60_000 || at < now - 365 * 24 * 3600_000) missing.push("consent.accepted_at (ISO 8601, last 12 months)");
  if (missing.length) return { ok: false, missing };
  const opt = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const url = opt(c.authorization_url, 500);
  return {
    ok: true,
    value: {
      version: VOICE_CONSENT_VERSION, accepted: true, owner_confirmed: true, speaker_name: speaker,
      accepted_at: new Date(at).toISOString(),
      ...(opt(c.end_user_ip, 64) ? { end_user_ip: opt(c.end_user_ip, 64) } : {}),
      ...(opt(c.end_user_agent, 300) ? { end_user_agent: opt(c.end_user_agent, 300) } : {}),
      ...(url && /^https:\/\//i.test(url) ? { authorization_url: url } : {}),
    },
  };
}

export function consentInfo() {
  return {
    version: VOICE_CONSENT_VERSION,
    text: VOICE_CONSENT_TEXT,
    required_fields: ["version", "accepted", "owner_confirmed", "speaker_name", "accepted_at"],
    optional_fields: ["end_user_ip", "end_user_agent", "authorization_url"],
    rule: "Show this text to the end user and record their explicit acceptance before creating the voice. Only the end user's own voice, or a voice they have written permission to clone. Never public figures without authorization.",
  };
}

// ─── entrada ─────────────────────────────────────────────────────────────

/** Id do usuário final no app do cliente (obrigatório: isola as vozes de cada pessoa). */
export function cleanEndUser(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^[A-Za-z0-9._:@-]{1,128}$/.test(s) ? s : null;
}

export function cleanVoiceApiName(v: unknown, fallback = "Voice"): string {
  return cleanVoiceName(v) || fallback;
}

export function sampleMimeOk(mime: string): boolean {
  return VOICE_SAMPLE_MIME.test(mime);
}

export function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav") || m.includes("wave")) return "wav";
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("aac")) return "aac";
  if (m.includes("flac")) return "flac";
  return "webm";
}

/** Tipo pelo nome do arquivo, quando o servidor de origem manda application/octet-stream. */
export function mimeFromName(name: string): string | null {
  const m = name.toLowerCase().match(/\.(mp3|wav|m4a|mp4|ogg|webm|aac|flac)(?:$|\?)/);
  if (!m) return null;
  return ({ mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", mp4: "audio/mp4", ogg: "audio/ogg", webm: "audio/webm", aac: "audio/aac", flac: "audio/flac" } as Record<string, string>)[m[1]];
}

/**
 * URL pública https para baixar áudio (amostra ou música). Recusa IP literal, localhost, redes internas,
 * credenciais na URL e portas fora de 443 (proteção contra SSRF).
 */
export function safeFetchUrl(raw: unknown): URL | null {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  if (u.port && u.port !== "443") return null;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":")) return null;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|svc|cluster\.local)$/.test(h)) return null;
  if (/(^|\.)metadata\.google\.internal$/.test(h)) return null;
  return u;
}

export type VoiceApiRoute =
  | { r: "consent" } | { r: "languages" } | { r: "genres" }
  | { r: "voices_list" } | { r: "voices_create" } | { r: "voices_delete"; id: string }
  | { r: "speech" } | { r: "sing" } | { r: "job"; id: string }
  | null;

/** Rotas de voz da API (o resto do caminho é tratado pelo index). */
export function matchVoiceRoute(method: string, path: string): VoiceApiRoute | "not_voice" {
  const m = path.match(/\/v1\/(voices(?:\/[^/]+)?|audio\/(?:speech|sing)|voice-jobs\/[^/]+|music\/genres)$/);
  if (!m) return "not_voice";
  const p = m[1];
  if (p === "voices/consent") return method === "GET" ? { r: "consent" } : null;
  if (p === "voices/languages") return method === "GET" ? { r: "languages" } : null;
  if (p === "music/genres") return method === "GET" ? { r: "genres" } : null;
  if (p === "voices") return method === "GET" ? { r: "voices_list" } : method === "POST" ? { r: "voices_create" } : null;
  if (p.startsWith("voices/")) {
    const id = p.slice(7);
    return method === "DELETE" && UUID_RE.test(id) ? { r: "voices_delete", id: id.toLowerCase() } : null;
  }
  if (p === "audio/speech") return method === "POST" ? { r: "speech" } : null;
  if (p === "audio/sing") return method === "POST" ? { r: "sing" } : null;
  const id = p.slice("voice-jobs/".length);
  return method === "GET" && UUID_RE.test(id) ? { r: "job", id: id.toLowerCase() } : null;
}
