// VERTAL Code AI · roteador "grátis primeiro".
//
//   pedido → (modo, esforço, precisa de visão?) → cadeia de modelos:
//     1. modelos grátis na nuvem (cota diária gratuita dos provedores)
//     2. servidor próprio Vertal (Ollama na nuvem, VERTAL_OLLAMA_URL) — sem cota, mais lento
//     3. modelos baratos pagos — SÓ se VERTAL_CODE_AI_ALLOW_PAID=true
//
// Módulo PURO (sem Deno, sem rede): roda no Vitest, no navegador e na edge function.
// É 100% aditivo: não usa nem altera o modelRouter.ts / llm.ts do Vibe Code.
//
// Marca: o usuário só vê `label` (nomes Vertal). `provider`/`model` ficam no servidor e nos logs.

export type VcaProvider = "openrouter" | "gemini" | "groq" | "ollama";
export type VcaCost = "free" | "self_hosted" | "paid";
export type VcaEffort = "auto" | "low" | "high" | "max";
export type VcaMode = "plan" | "build";

export interface VcaModel {
  /** Identificador estável no Vertal (aparece nos registros). */
  id: string;
  /** Nome visível ao usuário (sempre Vertal, nunca o nome do provedor). */
  label: string;
  provider: VcaProvider;
  /** Endpoint OpenAI-compatível /chat/completions. */
  url: string;
  /** Variável de ambiente com a chave ("" = sem chave, ex.: Ollama atrás de proxy com token próprio). */
  keyEnv: string;
  model: string;
  cost: VcaCost;
  vision: boolean;
  /** Contexto útil (tokens) que vamos usar — menor que o máximo do modelo de propósito. */
  context: number;
  /** Aceita response_format json_object. */
  jsonMode: boolean;
  /** Aceita reasoning effort (OpenRouter `reasoning.effort`). */
  reasoning: boolean;
  /** Pontos fortes: em qual esforço este modelo entra (ordem importa). */
  efforts: VcaEffort[];
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Catálogo padrão (verificado em 24/11/2026 em openrouter.ai/api/v1/models e
 * ai.google.dev/gemini-api/docs/pricing). A lista grátis muda com frequência:
 * sobrescreva sem deploy com VERTAL_CODE_AI_FREE_MODELS e a edge function ainda
 * descarta os que sumirem do catálogo ao vivo (reconcileFreeModels).
 */
export const VCA_FREE_CATALOG: VcaModel[] = [
  {
    id: "vca-code-free",
    label: "Vertal Livre · Código",
    provider: "openrouter",
    url: OPENROUTER_URL,
    keyEnv: "OPENROUTER_API_KEY",
    model: "particle-ai/particle-1:free",
    cost: "free",
    vision: true,
    context: 128_000,
    jsonMode: true,
    reasoning: true,
    efforts: ["auto", "low", "high"],
  },
  {
    id: "vca-reason-free",
    label: "Vertal Livre · Raciocínio",
    provider: "openrouter",
    url: OPENROUTER_URL,
    keyEnv: "OPENROUTER_API_KEY",
    model: "nvidia/nemotron-3-ultra-550b-a55b:free",
    cost: "free",
    vision: false,
    context: 128_000,
    jsonMode: false,
    reasoning: true,
    efforts: ["high", "max", "auto"],
  },
  {
    id: "vca-agent-free",
    label: "Vertal Livre · Agente",
    provider: "gemini",
    url: GEMINI_URL,
    keyEnv: "GEMINI_API_KEY",
    model: "gemini-4-hydrogen",
    cost: "free",
    vision: true,
    context: 200_000,
    jsonMode: true,
    reasoning: false,
    efforts: ["auto", "high", "max"],
  },
  {
    id: "vca-fast-free",
    label: "Vertal Livre · Rápido",
    provider: "gemini",
    url: GEMINI_URL,
    keyEnv: "GEMINI_API_KEY",
    model: "gemini-3.8-flash",
    cost: "free",
    vision: true,
    context: 200_000,
    jsonMode: true,
    reasoning: false,
    efforts: ["low", "auto"],
  },
  {
    id: "vca-multi-free",
    label: "Vertal Livre · Multimodal",
    provider: "openrouter",
    url: OPENROUTER_URL,
    keyEnv: "OPENROUTER_API_KEY",
    model: "google/gemma-4-31b-it:free",
    cost: "free",
    vision: true,
    context: 128_000,
    jsonMode: true,
    reasoning: true,
    efforts: ["auto", "low", "high"],
  },
  {
    id: "vca-vision-free",
    label: "Vertal Livre · Visão",
    provider: "openrouter",
    url: OPENROUTER_URL,
    keyEnv: "OPENROUTER_API_KEY",
    model: "nvidia/nemotron-3.5-super-vl:free",
    cost: "free",
    vision: true,
    context: 128_000,
    jsonMode: true,
    reasoning: true,
    efforts: ["auto", "low"],
  },
  {
    id: "vca-flash-free",
    label: "Vertal Livre · Relâmpago",
    provider: "groq",
    url: GROQ_URL,
    keyEnv: "GROQ_API_KEY",
    model: "openai/gpt-oss-120b",
    cost: "free",
    vision: false,
    // Plano grátis: 8K tokens/minuto. Só cabe pedido pequeno.
    context: 6_000,
    jsonMode: true,
    reasoning: false,
    efforts: ["low"],
  },
  {
    id: "vca-any-free",
    label: "Vertal Livre · Reserva",
    provider: "openrouter",
    url: OPENROUTER_URL,
    keyEnv: "OPENROUTER_API_KEY",
    // Roteador oficial do OpenRouter que escolhe um modelo grátis disponível.
    model: "openrouter/free",
    cost: "free",
    vision: true,
    context: 100_000,
    jsonMode: false,
    reasoning: false,
    efforts: ["auto", "low", "high", "max"],
  },
];

/** Modelo barato pago (US$0,05/US$0,20 por 1M tokens em 24/11/2026). Só com VERTAL_CODE_AI_ALLOW_PAID=true. */
export const VCA_PAID_CATALOG: VcaModel[] = [
  {
    id: "vca-turbo-paid",
    label: "Vertal Turbo",
    provider: "openrouter",
    url: OPENROUTER_URL,
    keyEnv: "OPENROUTER_API_KEY",
    model: "deepseek/deepseek-v4.1-flash",
    cost: "paid",
    vision: false,
    context: 128_000,
    jsonMode: true,
    reasoning: true,
    efforts: ["auto", "low", "high", "max"],
  },
];

export const DEFAULT_OLLAMA_MODEL = "qwen2.5-coder:7b";

export type VcaEnv = Record<string, string | undefined>;

const truthy = (v: string | undefined) => /^(1|true|yes|on|sim)$/i.test((v ?? "").trim());

/** VERTAL Code AI ligado no servidor? (padrão: desligado) */
export function isVcaEnabled(env: VcaEnv): boolean {
  return truthy(env.VERTAL_CODE_AI_ENABLED);
}

/** Lista de liberação: VERTAL_CODE_AI_USER_IDS="uuid1,uuid2". Vazia/ausente = sem restrição. */
export function vcaAllowedUserIds(env: VcaEnv): string[] | null {
  const ids = (env.VERTAL_CODE_AI_USER_IDS ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return ids.length ? ids : null;
}

/** Este usuário pode usar o VERTAL Code AI? (exige ligado + estar na lista, quando houver lista) */
export function isVcaUserAllowed(env: VcaEnv, userId: string | null | undefined): boolean {
  if (!isVcaEnabled(env)) return false;
  const ids = vcaAllowedUserIds(env);
  if (!ids) return true;
  return !!userId && ids.includes(userId.trim().toLowerCase());
}

/** Servidor próprio (Ollama na nuvem), se configurado. URL base sem /v1. */
export function selfHostedModel(env: VcaEnv): VcaModel | null {
  const raw = (env.VERTAL_OLLAMA_URL ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(raw)) return null;
  const base = raw.replace(/\/v1$/i, "");
  return {
    id: "vca-self-hosted",
    label: "Vertal Própria",
    provider: "ollama",
    url: `${base}/v1/chat/completions`,
    // Ollama não tem autenticação: o kit de deploy põe um proxy com token (VERTAL_OLLAMA_TOKEN).
    keyEnv: "VERTAL_OLLAMA_TOKEN",
    model: (env.VERTAL_OLLAMA_MODEL ?? "").trim() || DEFAULT_OLLAMA_MODEL,
    cost: "self_hosted",
    vision: false,
    // Em CPU, contexto grande = minutos de processamento. Mantemos pequeno.
    context: Number(env.VERTAL_OLLAMA_CONTEXT) > 0 ? Number(env.VERTAL_OLLAMA_CONTEXT) : 8_192,
    jsonMode: true,
    reasoning: false,
    efforts: ["auto", "low", "high", "max"],
  };
}

/** Lista grátis: VERTAL_CODE_AI_FREE_MODELS="id-openrouter-1,id-2" substitui só os modelos do OpenRouter. */
export function freeCatalog(env: VcaEnv): VcaModel[] {
  const override = (env.VERTAL_CODE_AI_FREE_MODELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!override.length) return VCA_FREE_CATALOG;
  const custom: VcaModel[] = override.map((model, i) => ({
    id: `vca-free-custom-${i + 1}`,
    label: `Vertal Livre · ${i + 1}`,
    provider: "openrouter",
    url: OPENROUTER_URL,
    keyEnv: "OPENROUTER_API_KEY",
    model,
    cost: "free",
    vision: false,
    context: 100_000,
    jsonMode: false,
    reasoning: false,
    efforts: ["auto", "low", "high", "max"],
  }));
  return [...custom, ...VCA_FREE_CATALOG.filter((m) => m.provider !== "openrouter")];
}

/**
 * Remove modelos grátis do OpenRouter que sumiram do catálogo ao vivo
 * (GET /api/v1/models). Sem lista ao vivo, mantém tudo.
 */
export function reconcileFreeModels(models: VcaModel[], liveIds: string[] | null | undefined): VcaModel[] {
  if (!liveIds || !liveIds.length) return models;
  const live = new Set(liveIds);
  return models.filter((m) => m.provider !== "openrouter" || m.model === "openrouter/free" || live.has(m.model));
}

export interface ChainOptions {
  effort: VcaEffort;
  needsVision?: boolean;
  /** Tokens estimados do pedido (descarta modelos com contexto pequeno). */
  promptTokens?: number;
  liveFreeIds?: string[] | null;
}

/**
 * Cadeia de modelos para um pedido. Só entra quem tem chave configurada.
 * Ordem: grátis (os do esforço pedido primeiro) → servidor próprio → pago (se liberado).
 * VERTAL_CODE_AI_PREFER_SELF_HOSTED=true põe o servidor próprio na frente.
 */
export function buildChain(env: VcaEnv, opts: ChainOptions): VcaModel[] {
  const hasKey = (m: VcaModel) => m.provider === "ollama" || !!(env[m.keyEnv] ?? "").trim();
  const fits = (m: VcaModel) =>
    (!opts.needsVision || m.vision) && (!opts.promptTokens || opts.promptTokens < m.context * 0.8);

  const free = reconcileFreeModels(freeCatalog(env), opts.liveFreeIds).filter((m) => hasKey(m) && fits(m));
  const rank = (m: VcaModel) => {
    const i = m.efforts.indexOf(opts.effort);
    return i === -1 ? 99 : i;
  };
  // Estável: dentro do mesmo rank, mantém a ordem do catálogo. O "Reserva" vai sempre por último entre os grátis.
  const freeSorted = free
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const ra = a.m.model === "openrouter/free" ? 100 : rank(a.m);
      const rb = b.m.model === "openrouter/free" ? 100 : rank(b.m);
      return ra - rb || a.i - b.i;
    })
    .map((x) => x.m)
    .filter((m) => m.model === "openrouter/free" || rank(m) < 99);

  const self = selfHostedModel(env);
  const selfList = self && fits(self) ? [self] : [];
  const paid = truthy(env.VERTAL_CODE_AI_ALLOW_PAID) ? VCA_PAID_CATALOG.filter((m) => hasKey(m) && fits(m)) : [];

  const ordered = truthy(env.VERTAL_CODE_AI_PREFER_SELF_HOSTED)
    ? [...selfList, ...freeSorted, ...paid]
    : [...freeSorted, ...selfList, ...paid];
  const seen = new Set<string>();
  return ordered.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
}

/** Erros que fazem a cadeia pular para o próximo modelo (cota, crédito, indisponível, timeout). */
export function shouldFallback(status: number | null): boolean {
  if (status === null) return true; // rede / timeout
  if (status === 429 || status === 402 || status === 408 || status === 409) return true;
  if (status >= 500) return true;
  // 400/404: modelo renomeado, parâmetro não aceito; 401/403: chave do provedor. Tenta o próximo.
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) return true;
  return false;
}

export interface VcaChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
}

/** Corpo OpenAI-compatível para um modelo da cadeia. */
export function requestBody(
  m: VcaModel,
  messages: VcaChatMessage[],
  opts: { effort: VcaEffort; json: boolean; maxTokens: number; temperature?: number },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: m.model,
    messages: m.vision ? messages : messages.map(stripImages),
    max_tokens: opts.maxTokens,
    temperature: opts.temperature ?? 0.2,
  };
  if (opts.json && m.jsonMode) body.response_format = { type: "json_object" };
  if (m.provider === "openrouter" && m.reasoning && opts.effort !== "auto") {
    body.reasoning = { effort: opts.effort === "max" ? "high" : opts.effort };
  }
  // Ollama: num_ctx fica no Modelfile do kit de deploy (a API compatível não recebe "options").
  if (m.provider === "ollama") body.stream = false;
  return body;
}

function stripImages(msg: VcaChatMessage): VcaChatMessage {
  if (typeof msg.content === "string") return msg;
  const text = msg.content
    .map((p) => (p.type === "text" ? p.text : "[imagem anexada omitida: modelo sem visão]"))
    .join("\n");
  return { ...msg, content: text };
}

/** O que o usuário vê sobre o modelo usado: só nome Vertal e se custou algo. */
export function publicModelInfo(m: VcaModel): { id: string; label: string; cost: VcaCost } {
  return { id: m.id, label: m.label, cost: m.cost };
}
