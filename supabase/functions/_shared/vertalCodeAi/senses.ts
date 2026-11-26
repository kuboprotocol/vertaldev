// VERTAL Code AI · Sentidos (lógica pura, sem Deno; rede injetada → testável no Vitest).
//
//   Vertal Decide  → decisões tipadas rápidas (noul / choice / score) com probabilidades, formato /v1/systemone.
//                    Própria (GPU, modelo de decisão aberto) → reserva paga via OpenRouter Decisions API.
//   Vertal Visão   → foto de produto: Decide classifica na hora, o modelo multimodal próprio descreve.
//                    Também decide quadro a quadro (quadros amostrados NO NAVEGADOR; nada é gravado).
//   Vertal Ouvir   → áudio curto: transcreve e entende (multimodal próprio → reserva paga).
//   Vertal Novela  → novelinha de ~2 min (pipeline próprio assíncrono; ver infra/vertal-gpu-modal/vertal_novela.py).
//
// Liga/desliga: só existe com VERTAL_CODE_AI_MEDIA_ENABLED=true E a URL própria configurada
// (VERTAL_OWN_DECIDE_URL / VERTAL_OWN_OMNI_URL / VERTAL_OWN_NOVELA_URL, com _TOKEN, de preferência dentro do
// segredo JSON VERTAL_GPU_CONFIG). Sem a URL, a ação responde 404 como "desligado". As reservas pagas só entram com
// VERTAL_CODE_AI_ALLOW_PAID=true. Nomes de fornecedor/modelo ficam só aqui no servidor; a tela mostra nomes Vertal.

import type { VcaEnv } from "./router.ts";

const truthy = (v: string | undefined) => /^(1|true|yes|on|sim)$/i.test((v ?? "").trim());
const httpsBase = (v: string | undefined) => {
  const s = (v ?? "").trim().replace(/\/+$/, "");
  return /^https:\/\//i.test(s) ? s : "";
};

export type SensesFeature = "decide" | "vision" | "hear" | "novela";

export interface OwnEndpoint {
  url: string;
  token: string;
}

export interface SensesConfig {
  media: boolean;
  allowPaid: boolean;
  decide: OwnEndpoint | null;
  omni: OwnEndpoint | null;
  novela: OwnEndpoint | null;
  openrouterKey: string;
  /** Modelo de decisão da reserva paga (Decisions API do OpenRouter). */
  jevModel: string;
  /**
   * Decisões COM imagem na própria? Padrão: não (medido em 26/11: ~15 s por foto na própria quente vs ~0,3 s na
   * reserva; texto na própria ~0,2 s). Sem ALLOW_PAID a própria é usada mesmo assim. VERTAL_OWN_DECIDE_IMAGES=true liga.
   */
  decideImagesOwn: boolean;
  /** Modelo multimodal barato da reserva paga (OpenRouter chat). */
  visionFallbackModel: string;
}

function endpoint(env: VcaEnv, name: "DECIDE" | "OMNI" | "NOVELA"): OwnEndpoint | null {
  const url = httpsBase(env[`VERTAL_OWN_${name}_URL`]);
  const token = (env[`VERTAL_OWN_${name}_TOKEN`] ?? "").trim();
  return url && token ? { url, token } : null;
}

export function sensesConfig(env: VcaEnv): SensesConfig {
  return {
    media: truthy(env.VERTAL_CODE_AI_MEDIA_ENABLED),
    allowPaid: truthy(env.VERTAL_CODE_AI_ALLOW_PAID),
    decide: endpoint(env, "DECIDE"),
    omni: endpoint(env, "OMNI"),
    novela: endpoint(env, "NOVELA"),
    openrouterKey: (env.OPENROUTER_API_KEY ?? "").trim(),
    jevModel: (env.VERTAL_OWN_DECIDE_FALLBACK_MODEL ?? "").trim() || "typesafe/jev-1.14",
    decideImagesOwn: truthy(env.VERTAL_OWN_DECIDE_IMAGES),
    visionFallbackModel: (env.VERTAL_OWN_OMNI_FALLBACK_MODEL ?? "").trim() || "google/gemini-3.1-flash-lite",
  };
}

/** A função só existe se a mídia estiver ligada e o endpoint próprio do recurso estiver configurado. */
export function isSensesFeatureOn(cfg: SensesConfig, f: SensesFeature): boolean {
  if (!cfg.media) return false;
  if (f === "decide") return !!cfg.decide;
  if (f === "novela") return !!cfg.novela;
  return !!cfg.omni; // vision / hear
}

export function sensesStatus(cfg: SensesConfig): Record<SensesFeature, boolean> {
  return {
    decide: isSensesFeatureOn(cfg, "decide"),
    vision: isSensesFeatureOn(cfg, "vision"),
    hear: isSensesFeatureOn(cfg, "hear"),
    novela: isSensesFeatureOn(cfg, "novela"),
  };
}

// ───────────────────────────── Vertal Decide ─────────────────────────────

export type DecisionQuestion =
  | { type: "noul"; instructions: string }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };
export type DecisionQuestions = Record<string, DecisionQuestion>;

export interface DecisionAnswer {
  type: "noul" | "choice" | "score";
  noul?: number;
  choice?: string;
  score?: number;
  probabilities?: Record<string, number>;
  confidence?: number;
}

export interface DecideResult {
  answers: Record<string, DecisionAnswer>;
  source: "own" | "fallback";
  ms: number;
  costUsd: number;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface SensesDeps {
  fetch: FetchLike;
  now?: () => number;
  /** Prazo por chamada (ms). Padrão 25 s para decidir, 90 s para descrever/ouvir. */
  timeoutMs?: number;
}

export const DATA_URL_IMAGE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
export const DATA_URL_AUDIO = /^data:audio\/(webm|ogg|mpeg|mp3|mp4|m4a|wav|x-wav|aac);(codecs=[\w.]+;)?base64,[A-Za-z0-9+/=]+$/;
export const MAX_IMAGE_DATA_URL = 8_000_000;
export const MAX_AUDIO_DATA_URL = 6_000_000;
export const MAX_FRAMES = 24;

/** Valida perguntas do formato /v1/systemone (1–16 perguntas; choice/score com 2–30 opções). */
export function validQuestions(q: unknown): DecisionQuestions | null {
  if (!q || typeof q !== "object" || Array.isArray(q)) return null;
  const entries = Object.entries(q as Record<string, unknown>);
  if (entries.length < 1 || entries.length > 16) return null;
  const out: DecisionQuestions = {};
  for (const [k, v] of entries) {
    if (!/^[A-Za-z0-9_]{1,40}$/.test(k) || !v || typeof v !== "object") return null;
    const x = v as Record<string, unknown>;
    const instructions = typeof x.instructions === "string" ? x.instructions.trim().slice(0, 600) : "";
    if (!instructions) return null;
    if (x.type === "noul") out[k] = { type: "noul", instructions };
    else if (x.type === "choice" && x.criteria && typeof x.criteria === "object" && !Array.isArray(x.criteria)) {
      const c = Object.entries(x.criteria as Record<string, unknown>).filter(([, d]) => typeof d === "string");
      if (c.length < 2 || c.length > 30) return null;
      out[k] = { type: "choice", instructions, criteria: Object.fromEntries(c.map(([a, d]) => [a.slice(0, 40), String(d).slice(0, 300)])) };
    } else if (x.type === "score" && Array.isArray(x.criteria)) {
      const c = x.criteria.filter((d): d is string => typeof d === "string");
      if (c.length < 2 || c.length > 10) return null;
      out[k] = { type: "score", instructions, criteria: c.map((d) => d.slice(0, 300)) };
    } else return null;
  }
  return out;
}

/** Normaliza as respostas (aceita o envelope /v1/systemone de qualquer provedor). */
export function normalizeAnswers(raw: unknown, questions: DecisionQuestions): Record<string, DecisionAnswer> | null {
  const a = (raw as { answers?: unknown })?.answers;
  if (!a || typeof a !== "object") return null;
  const out: Record<string, DecisionAnswer> = {};
  for (const [k, q] of Object.entries(questions)) {
    const x = (a as Record<string, Record<string, unknown>>)[k];
    if (!x || typeof x !== "object") return null;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10_000) / 10_000 : undefined);
    const probs = x.probabilities && typeof x.probabilities === "object"
      ? Object.fromEntries(Object.entries(x.probabilities as Record<string, unknown>).map(([p, v]) => [p, num(v) ?? 0]))
      : undefined;
    if (q.type === "noul") {
      const n = num(x.noul);
      if (n === undefined) return null;
      out[k] = { type: "noul", noul: n, probabilities: probs };
    } else if (q.type === "choice") {
      if (typeof x.choice !== "string" || !(x.choice in q.criteria)) return null;
      out[k] = { type: "choice", choice: x.choice, probabilities: probs, confidence: num(x.confidence) };
    } else {
      const s = num(x.score);
      if (s === undefined) return null;
      out[k] = { type: "score", score: s, probabilities: probs, confidence: num(x.confidence) };
    }
  }
  return out;
}

type StatePart = string | { type: "image_url"; image_url: { url: string } };

async function postJson(deps: SensesDeps, url: string, headers: Record<string, string>, body: unknown, timeoutMs: number) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await deps.fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: ac.signal });
    if (!r.ok) return { ok: false as const, status: r.status, data: null };
    return { ok: true as const, status: r.status, data: await r.json() };
  } catch {
    return { ok: false as const, status: 0, data: null };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Decide: própria primeiro; se falhar/estiver fria demais, a reserva paga (Decisions API do OpenRouter, mesmo
 * formato). Devolve null se nenhuma responder (quem chamou segue o caminho seguro padrão).
 */
export async function decide(cfg: SensesConfig, deps: SensesDeps, state: string | StatePart[], questions: DecisionQuestions): Promise<DecideResult | null> {
  const now = deps.now ?? Date.now;
  const t0 = now();
  const timeout = deps.timeoutMs ?? 25_000;
  const hasImage = Array.isArray(state) && state.some((p) => typeof p !== "string");
  const paidOk = cfg.allowPaid && !!cfg.openrouterKey;
  if (cfg.decide && (!hasImage || cfg.decideImagesOwn || !paidOk)) {
    const r = await postJson(deps, `${cfg.decide.url}/v1/systemone`, { Authorization: `Bearer ${cfg.decide.token}` }, { state, questions }, timeout);
    const answers = r.ok ? normalizeAnswers(r.data, questions) : null;
    if (answers) return { answers, source: "own", ms: now() - t0, costUsd: 0 };
  }
  if (paidOk) {
    const r = await postJson(deps, "https://openrouter.ai/api/alpha/decisions", {
      Authorization: `Bearer ${cfg.openrouterKey}`,
      "HTTP-Referer": "https://vertal.dev",
      "X-Title": "VERTAL Code AI",
    }, { model: cfg.jevModel, state, questions }, 15_000);
    const answers = r.ok ? normalizeAnswers(r.data, questions) : null;
    if (answers) {
      const cost = (r.data as { usage?: { cost?: unknown } })?.usage?.cost;
      return { answers, source: "fallback", ms: now() - t0, costUsd: typeof cost === "number" ? cost : 0 };
    }
  }
  return null;
}

// ───────────────────────────── Vertal Visão (produto) ─────────────────────────────

export const PRODUCT_CATEGORIES: Record<string, string> = {
  calcados: "Shoes, sneakers, sandals, boots",
  roupas: "Clothing, apparel and accessories like bags or belts",
  eletronicos: "Electronics, phones, computers, gadgets",
  casa: "Home, kitchen, furniture, decor, tools",
  beleza: "Beauty, cosmetics, perfume, personal care",
  alimentos: "Food and drinks",
  brinquedos: "Toys, games and baby items",
  esporte: "Sports, fitness and outdoor gear",
  veiculos: "Vehicles, auto parts and accessories",
  outros: "Something else",
};

export const PRODUCT_QUESTIONS: DecisionQuestions = {
  is_product: { type: "noul", instructions: "Is this a photo of a product someone could sell online?" },
  category: { type: "choice", instructions: "Which product category best fits the photo?", criteria: PRODUCT_CATEGORIES },
  photo_quality: {
    type: "score",
    instructions: "How good is this photo for an online store listing?",
    criteria: ["Unusable: blurry, dark or product not visible", "Acceptable but needs a better photo", "Good, ready to publish"],
  },
  unsafe: { type: "noul", instructions: "Does the image show nudity, weapons, drugs, or other content a marketplace would forbid?" },
};

/** Política de roteamento a partir das decisões (sem chamar modelo grande quando não precisa). */
export function productRoute(answers: Record<string, DecisionAnswer> | null): { describe: boolean; reason: string } {
  if (!answers) return { describe: true, reason: "no_decision" };
  if ((answers.unsafe?.noul ?? 0) >= 0.7) return { describe: false, reason: "unsafe" };
  if ((answers.is_product?.noul ?? 1) < 0.35) return { describe: false, reason: "not_product" };
  if ((answers.photo_quality?.score ?? 2) < 0.5) return { describe: false, reason: "photo_unusable" };
  return { describe: true, reason: "ok" };
}

export const PRODUCT_DESCRIBE_PROMPT =
  "Você ajuda lojistas brasileiros a anunciar. Olhe a foto e responda SÓ com JSON válido (sem markdown): " +
  '{"nome": "...", "tipo": "...", "caracteristicas": ["..."], "cores": ["..."], "estado": "novo|usado|indefinido", ' +
  '"preco_sugerido_brl": {"min": 0, "max": 0}, "titulo_anuncio": "...", "descricao_venda": "...", "tags": ["..."]}. ' +
  "Em português do Brasil. Não invente marca que não aparece na foto, nem promessas (lacrado, garantia, nota fiscal) que a foto não mostra. Faixa de preço realista no Brasil (estimativa).";

export interface ProductInfo {
  nome: string;
  tipo: string;
  caracteristicas: string[];
  cores: string[];
  estado: string;
  preco_sugerido_brl: { min: number; max: number } | null;
  titulo_anuncio: string;
  descricao_venda: string;
  tags: string[];
}

/** Extrai o JSON do produto (tolera cercas ``` e texto em volta). */
export function parseProductJson(text: string): ProductInfo | null {
  const t = (text ?? "").replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(t.slice(a, b + 1));
  } catch {
    return null;
  }
  const s = (v: unknown, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 120)).slice(0, 12) : []);
  const p = d.preco_sugerido_brl as Record<string, unknown> | undefined;
  const min = Number(p?.min);
  const max = Number(p?.max);
  const nome = s(d.nome, 120);
  if (!nome) return null;
  return {
    nome,
    tipo: s(d.tipo, 80),
    caracteristicas: arr(d.caracteristicas),
    cores: arr(d.cores),
    estado: s(d.estado, 20) || "indefinido",
    preco_sugerido_brl: Number.isFinite(min) && Number.isFinite(max) && max >= min && max > 0 ? { min: Math.round(min), max: Math.round(max) } : null,
    titulo_anuncio: s(d.titulo_anuncio, 120),
    descricao_venda: s(d.descricao_venda, 1500),
    tags: arr(d.tags),
  };
}

export interface ChatResult {
  text: string;
  source: "own" | "fallback";
  ms: number;
  costUsd: number;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

type ChatContent = string | Array<Record<string, unknown>>;

/** Multimodal: própria (OpenAI-compatível) → reserva paga barata. */
export async function multimodalChat(
  cfg: SensesConfig,
  deps: SensesDeps,
  messages: Array<{ role: string; content: ChatContent }>,
  opts: { maxTokens?: number; json?: boolean; fallbackMessages?: Array<{ role: string; content: ChatContent }> } = {},
): Promise<ChatResult | null> {
  const now = deps.now ?? Date.now;
  const t0 = now();
  const timeout = deps.timeoutMs ?? 90_000;
  const extract = (d: unknown) => {
    const c = (d as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
    return typeof c === "string" ? c : "";
  };
  if (cfg.omni) {
    const r = await postJson(deps, `${cfg.omni.url}/v1/chat/completions`, { Authorization: `Bearer ${cfg.omni.token}` }, {
      model: "vertal-omni",
      messages,
      max_tokens: opts.maxTokens ?? 900,
      temperature: 0.3,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }, timeout);
    const text = r.ok ? extract(r.data) : "";
    if (text) return { text, source: "own", ms: now() - t0, costUsd: 0, usage: (r.data as { usage?: ChatResult["usage"] })?.usage };
  }
  if (cfg.allowPaid && cfg.openrouterKey) {
    const r = await postJson(deps, "https://openrouter.ai/api/v1/chat/completions", {
      Authorization: `Bearer ${cfg.openrouterKey}`,
      "HTTP-Referer": "https://vertal.dev",
      "X-Title": "VERTAL Code AI",
    }, {
      model: cfg.visionFallbackModel,
      messages: opts.fallbackMessages ?? messages,
      max_tokens: opts.maxTokens ?? 900,
      temperature: 0.3,
      usage: { include: true },
    }, 60_000);
    const text = r.ok ? extract(r.data) : "";
    if (text) {
      const cost = (r.data as { usage?: { cost?: unknown } })?.usage?.cost;
      return { text, source: "fallback", ms: now() - t0, costUsd: typeof cost === "number" ? cost : 0 };
    }
  }
  return null;
}

/**
 * Áudio → parte de mensagem OpenAI (input_audio {data, format}), aceita pela própria e pela reserva.
 * O navegador já converte a gravação para WAV 16 kHz mono (formato que todo mundo lê).
 */
export function audioPart(dataUrl: string): Record<string, unknown> | null {
  const m = /^data:audio\/([\w.+-]+)(;codecs=[\w.]+)?;base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const fmt = m[1] === "mpeg" ? "mp3" : m[1] === "x-wav" ? "wav" : m[1];
  return { type: "input_audio", input_audio: { data: m[3], format: fmt } };
}

export const HEAR_PROMPT =
  "Transcreva o áudio em português do Brasil (texto fiel) e depois entenda o pedido. Responda SÓ com JSON válido: " +
  '{"transcricao": "...", "idioma": "pt-BR", "resumo": "...", "intencao": "...", "resposta": "..."} — "resposta" é uma ' +
  "resposta curta e útil para a pessoa, em português.";

export interface HearInfo {
  transcricao: string;
  idioma: string;
  resumo: string;
  intencao: string;
  resposta: string;
}

export function parseHearJson(text: string): HearInfo | null {
  const t = (text ?? "").replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) {
    const plain = t.trim();
    return plain ? { transcricao: plain.slice(0, 4000), idioma: "", resumo: "", intencao: "", resposta: "" } : null;
  }
  try {
    const d = JSON.parse(t.slice(a, b + 1)) as Record<string, unknown>;
    const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
    const transcricao = s(d.transcricao, 4000);
    if (!transcricao) return null;
    return { transcricao, idioma: s(d.idioma, 12), resumo: s(d.resumo, 600), intencao: s(d.intencao, 200), resposta: s(d.resposta, 1200) };
  } catch {
    return null;
  }
}

// ───────────────────────────── Custos (estimativa, cobrança DESLIGADA) ─────────────────────────────

/** Preço Modal por segundo de GPU (nov/2026), só para estimar. */
export const GPU_USD_PER_SECOND = { L4: 0.000222, A10G: 0.000306, L40S: 0.000542 } as const;

/** Custo ativo de uma chamada à GPU própria (sem a ociosidade de 120 s, que é rateada entre pedidos). */
export function ownGpuCostUsd(gpu: keyof typeof GPU_USD_PER_SECOND, ms: number): number {
  return Math.round(GPU_USD_PER_SECOND[gpu] * Math.max(0, ms) / 1000 * 1e6) / 1e6;
}

// ───────────────────────────── Vertal Novela ─────────────────────────────

export const NOVELA_VOICES = ["pf_dora", "pm_alex", "pm_santa"] as const;
export type NovelaVoice = typeof NOVELA_VOICES[number];
export const NOVELA_VOICE_LABEL: Record<NovelaVoice, string> = { pf_dora: "Voz feminina", pm_alex: "Voz masculina", pm_santa: "Voz masculina grave" };

export function novelaSubmitBody(input: { premise?: unknown; voice?: unknown; scenes?: unknown; clips?: unknown }): Record<string, unknown> | null {
  const premise = typeof input.premise === "string" ? input.premise.trim().slice(0, 1200) : "";
  if (premise.length < 8) return null;
  const voice = NOVELA_VOICES.includes(input.voice as NovelaVoice) ? input.voice : "pf_dora";
  const scenes = Math.max(4, Math.min(14, Number(input.scenes) || 12));
  const clips = Math.max(0, Math.min(3, Number(input.clips) || 0));
  return { premise, voice, scenes, clips };
}

/** Status do pipeline próprio → status público (sem nomes de modelo). */
export function novelaPublicStatus(d: unknown): { status: string; stage?: string; titulo?: string; seconds?: number; costUsd?: number } {
  const x = (d ?? {}) as Record<string, unknown>;
  const status = ["pending", "completed", "failed", "expired"].includes(String(x.status)) ? String(x.status) : "unknown";
  const out: { status: string; stage?: string; titulo?: string; seconds?: number; costUsd?: number } = { status };
  if (typeof x.stage === "string") out.stage = x.stage;
  if (typeof x.titulo === "string") out.titulo = x.titulo.slice(0, 80);
  if (typeof x.seconds === "number") out.seconds = x.seconds;
  const c = (x.cost as Record<string, unknown> | undefined)?.total_warm_usd;
  if (typeof c === "number") out.costUsd = c;
  return out;
}
