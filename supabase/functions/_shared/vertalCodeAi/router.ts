// VERTAL Code AI · roteador "grátis primeiro".
//
//   pedido → (modo, esforço, precisa de visão?) → cadeia de modelos:
//     1. LLM própria Vertal (VERTAL_OLLAMA_URL e, opcional, VERTAL_OLLAMA_URL_2) — só para pedidos
//        que cabem no orçamento dela (contexto pequeno, tempo curto); senão pula
//     1b. Ollama Cloud (plano do Laércio; só se VERTAL_OLLAMA_CLOUD_URL/_KEY estiverem no VERTAL_GPU_CONFIG)
//     2. modelos grátis na nuvem (cota diária gratuita dos provedores)
//     3. modelos baratos pagos — SÓ se VERTAL_CODE_AI_ALLOW_PAID=true
//   VERTAL_CODE_AI_PREFER_SELF_HOSTED=false volta à ordem antiga (grátis → própria → pago).
//
// Módulo PURO (sem Deno, sem rede): roda no Vitest, no navegador e na edge function.
// É 100% aditivo: não usa nem altera o modelRouter.ts / llm.ts do Vibe Code.
//
// Marca: o usuário só vê `label` (nomes Vertal). `provider`/`model` ficam no servidor e nos logs.

export type VcaProvider = "openrouter" | "gemini" | "groq" | "ollama" | "ollama_cloud" | "deepseek" | "extra";
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
  /** Orçamento da LLM própria (CPU/GPU nossa): fora dele, a cadeia pula para o próximo. */
  budget?: VcaBudget;
  /** Teto de tokens de saída por pedido (protege o gasto em modelo pago). */
  maxOutputTokens?: number;
  /** Preço de tabela em US$ por 1M tokens (entrada/saída). Só para estimativa; não cobra nada. */
  price?: { in: number; out: number };
}

export interface VcaBudget {
  /** Tempo máximo até o 1º pedaço da resposta (ms). */
  firstTokenMs: number;
  /** Tempo máximo total da chamada (ms). */
  totalMs: number;
  /** Maior entrada (tokens estimados) que ela aceita. */
  maxInputTokens: number;
  /** Teto de tokens de saída pedidos a ela. */
  maxOutputTokens: number;
  /**
   * true = o prazo do 1º token conta desde o ENVIO do pedido (inclui subir a máquina a frio e esperar
   * os cabeçalhos), não desde a chegada dos cabeçalhos. Padrão: true no 2º endpoint (GPU serverless,
   * que pode estar desligada), false no 1º (VM sempre ligada, comportamento de antes).
   */
  firstTokenFromStart?: boolean;
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

/** Modelos baratos pagos. Só com VERTAL_CODE_AI_ALLOW_PAID=true. Direto no provedor primeiro (chave DEEPSEEK_API_KEY). */
export const VCA_PAID_CATALOG: VcaModel[] = [
  {
    id: "vca-turbo-direct",
    label: "Vertal Turbo Direto",
    provider: "deepseek",
    url: "https://api.deepseek.com/chat/completions",
    keyEnv: "DEEPSEEK_API_KEY",
    model: "deepseek-chat",
    cost: "paid",
    vision: false,
    context: 64_000,
    jsonMode: true,
    reasoning: false,
    efforts: ["auto", "low", "high", "max"],
  },
  // Modelo barato pago via OpenRouter (US$0,05/US$0,20 por 1M tokens em 24/11/2026).
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

/** Orçamento padrão da LLM própria em CPU (VM Oracle): ~19 tok/s lendo, ~6 tok/s gerando (medido em 24/11/2026). */
export const DEFAULT_SELF_HOSTED_BUDGET: VcaBudget = {
  firstTokenMs: 20_000,
  totalMs: 75_000,
  maxInputTokens: 1_500,
  maxOutputTokens: 1_024,
};

export type VcaEnv = Record<string, string | undefined>;

const truthy = (v: string | undefined) => /^(1|true|yes|on|sim)$/i.test((v ?? "").trim());

/**
 * Config compacta da GPU própria num ÚNICO segredo (o projeto tem limite de 100 segredos):
 *   VERTAL_GPU_CONFIG='{"VERTAL_OLLAMA_URL_2":"https://…","VERTAL_OLLAMA_TOKEN_2":"…","VERTAL_OWN_IMAGE_URL":"…",…}'
 * Só aceita chaves do 2º endpoint próprio (VERTAL_OLLAMA_*_2, VERTAL_OLLAMA_2_FIRST_ABOVE_TOKENS) e de
 * imagem/vídeo próprios (VERTAL_OWN_IMAGE_* / VERTAL_OWN_VIDEO_*) e dos sentidos próprios (VERTAL_OWN_DECIDE_* /
 * VERTAL_OWN_OMNI_* / VERTAL_OWN_NOVELA_*) e do Ollama Cloud (VERTAL_OLLAMA_CLOUD_*). Segredo avulso com o
 * mesmo nome vence.
 * Nunca toca em liga/desliga, lista de liberação ou chaves de provedores.
 */
const GPU_CONFIG_KEY = /^VERTAL_(OLLAMA_[A-Z_]+_2|OLLAMA_2_FIRST_ABOVE_TOKENS|OLLAMA_CLOUD_[A-Z_]+|OWN_(IMAGE|VIDEO|DECIDE|OMNI|NOVELA)_[A-Z_]+)$/;
export function expandVcaEnv(env: VcaEnv): VcaEnv {
  const raw = (env.VERTAL_GPU_CONFIG ?? "").trim();
  if (!raw) return env;
  let cfg: unknown;
  try {
    cfg = JSON.parse(raw);
  } catch {
    return env;
  }
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return env;
  const out: VcaEnv = { ...env };
  for (const [k, v] of Object.entries(cfg as Record<string, unknown>)) {
    if (!GPU_CONFIG_KEY.test(k) || (out[k] ?? "").trim()) continue;
    if (typeof v === "string" || typeof v === "number") out[k] = String(v);
  }
  return out;
}

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

const num = (v: string | undefined, d: number) => (Number(v) > 0 ? Number(v) : d);

/**
 * Endpoint próprio n (1 ou 2), genérico: qualquer servidor OpenAI-compatível (Ollama na VM, GPU serverless…).
 * Trocar de máquina = trocar só os segredos. n=1: VERTAL_OLLAMA_URL/_TOKEN/_MODEL/_CONTEXT;
 * n=2: VERTAL_OLLAMA_URL_2/_TOKEN_2/_MODEL_2/_CONTEXT_2. Orçamento: VERTAL_OLLAMA_FIRST_TOKEN_MS,
 * _TOTAL_MS, _MAX_INPUT_TOKENS, _MAX_OUTPUT_TOKENS (com sufixo _2 para o segundo).
 */
function selfHostedAt(env: VcaEnv, n: 1 | 2): VcaModel | null {
  const sfx = n === 1 ? "" : "_2";
  const raw = (env[`VERTAL_OLLAMA_URL${sfx}`] ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(raw)) return null;
  const base = raw.replace(/\/v1$/i, "");
  const b = DEFAULT_SELF_HOSTED_BUDGET;
  return {
    id: n === 1 ? "vca-self-hosted" : "vca-self-hosted-2",
    label: n === 1 ? "Vertal Própria" : "Vertal Própria 2",
    provider: "ollama",
    url: `${base}/v1/chat/completions`,
    // O servidor fica atrás de um proxy com token (VERTAL_OLLAMA_TOKEN / _2).
    keyEnv: `VERTAL_OLLAMA_TOKEN${sfx}`,
    model: (env[`VERTAL_OLLAMA_MODEL${sfx}`] ?? "").trim() || DEFAULT_OLLAMA_MODEL,
    cost: "self_hosted",
    vision: false,
    // Em CPU, contexto grande = minutos de processamento. Mantemos pequeno.
    context: num(env[`VERTAL_OLLAMA_CONTEXT${sfx}`], 8_192),
    jsonMode: true,
    reasoning: false,
    efforts: ["auto", "low", "high", "max"],
    budget: {
      firstTokenMs: num(env[`VERTAL_OLLAMA_FIRST_TOKEN_MS${sfx}`], b.firstTokenMs),
      totalMs: num(env[`VERTAL_OLLAMA_TOTAL_MS${sfx}`], b.totalMs),
      maxInputTokens: num(env[`VERTAL_OLLAMA_MAX_INPUT_TOKENS${sfx}`], b.maxInputTokens),
      maxOutputTokens: num(env[`VERTAL_OLLAMA_MAX_OUTPUT_TOKENS${sfx}`], b.maxOutputTokens),
      // Só aparece quando ligado (o orçamento da VM continua idêntico ao de antes).
      ...(flag(env[`VERTAL_OLLAMA_FIRST_TOKEN_FROM_START${sfx}`], n === 2) ? { firstTokenFromStart: true } : {}),
    },
  };
}

/** Liga/desliga com padrão: vazio = padrão; "true/1/sim…" = true; "false/0/não…" = false. */
function flag(v: string | undefined, d: boolean): boolean {
  const t = (v ?? "").trim();
  if (!t) return d;
  if (truthy(t)) return true;
  if (/^(0|false|no|off|nao|não)$/i.test(t)) return false;
  return d;
}

/** Servidor próprio principal (VERTAL_OLLAMA_URL), se configurado. URL base sem /v1. */
export function selfHostedModel(env: VcaEnv): VcaModel | null {
  return selfHostedAt(env, 1);
}

/** Todos os endpoints próprios configurados, na ordem 1 → 2. */
export function selfHostedModels(env: VcaEnv): VcaModel[] {
  return [selfHostedAt(env, 1), selfHostedAt(env, 2)].filter((m): m is VcaModel => !!m);
}

/**
 * Ordem dos endpoints próprios para um pedido: 1 (VM) → 2 (GPU). Pedidos grandes demais para a VM
 * (> VERTAL_OLLAMA_2_FIRST_ABOVE_TOKENS; sem ele, > VERTAL_OLLAMA_MAX_INPUT_TOKENS da VM; sem os dois,
 * 3 000 tokens) vão primeiro ao 2º endpoint, que é o mais forte. Sem tamanho conhecido, mantém 1 → 2.
 * Vale para TODAS as opções de texto (Auto, Code, Livre, Turbo, Pro): a própria entra antes dos grátis
 * e dos pagos em buildChain e buildOptionChain.
 */
export function orderSelfHosted(env: VcaEnv, list: VcaModel[], promptTokens?: number): VcaModel[] {
  const above = num(env.VERTAL_OLLAMA_2_FIRST_ABOVE_TOKENS, num(env.VERTAL_OLLAMA_MAX_INPUT_TOKENS, 3_000));
  if (!promptTokens || promptTokens <= above) return list;
  return [...list.filter((m) => m.id === "vca-self-hosted-2"), ...list.filter((m) => m.id !== "vca-self-hosted-2")];
}

/** Estimativa barata de tokens (≈3,5 caracteres por token; imagem conta como 1 000). */
export function estimateTokens(messages: VcaChatMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    if (typeof m.content === "string") chars += m.content.length;
    else for (const p of m.content) chars += p.type === "text" ? p.text.length : 3_500;
  }
  return Math.ceil(chars / 3.5);
}

/**
 * Folga da estimativa de tokens (≈3,5 caracteres/token). Medido em 26/11/2026 com o tokenizer real do
 * Qwen2.5-Coder: texto em português ≈ 1,0–1,1× a estimativa; TS/JSON/CSS ≈ 1,3× em média (até 1,5× por
 * arquivo). Usada só para não estourar o contexto da LLM própria (estouro = erro 400 do servidor).
 */
export const VCA_TOKEN_SAFETY = 1.35;
/** Menor saída que vale a pena pedir à LLM própria; abaixo disso, pula para o próximo modelo. */
export const VCA_MIN_SELF_HOSTED_OUTPUT = 1_024;

/**
 * Tokens de saída a pedir à LLM própria sem estourar o contexto dela:
 *   min(pedido, teto do orçamento, contexto − entrada × folga − 256).
 * 0 = não cabe uma resposta útil (a cadeia pula este modelo em vez de tomar um 400).
 * Modelos sem orçamento: devolve o pedido (sem mudança).
 */
export function selfHostedOutputTokens(m: VcaModel, inputTokens: number, requested: number): number {
  if (!m.budget) return requested;
  const room = Math.floor(m.context - Math.ceil(inputTokens * VCA_TOKEN_SAFETY) - 256);
  const out = Math.min(requested, m.budget.maxOutputTokens, room);
  return out >= Math.min(VCA_MIN_SELF_HOSTED_OUTPUT, requested) ? out : 0;
}

/** A LLM própria aguenta esta chamada? (entrada pequena o bastante e tempo suficiente no prazo) */
export function withinSelfHostedBudget(m: VcaModel, inputTokens: number, msLeft = Infinity): boolean {
  if (!m.budget) return true;
  return inputTokens <= m.budget.maxInputTokens && msLeft >= m.budget.firstTokenMs + 5_000;
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
 * Ordem: LLM própria (se couber no orçamento dela) → grátis (os do esforço pedido primeiro) → pago (se liberado).
 * VERTAL_CODE_AI_PREFER_SELF_HOSTED=false põe a própria depois dos grátis.
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

  const selfList = orderSelfHosted(
    env,
    selfHostedModels(env).filter(
      (m) => fits(m) && (!opts.promptTokens || opts.promptTokens <= (m.budget?.maxInputTokens ?? Infinity)),
    ),
    opts.promptTokens,
  );
  const allowPaid = truthy(env.VERTAL_CODE_AI_ALLOW_PAID);
  const paid = allowPaid ? VCA_PAID_CATALOG.filter((m) => hasKey(m) && fits(m)) : [];
  // Provedor extra OpenAI-compatível (ex.: plano grátis de outro provedor), só se configurado por segredo.
  const extra = extraProviderModels(env).filter((m) => fits(m) && (m.cost !== "paid" || allowPaid));
  const extraFree = extra.filter((m) => m.cost !== "paid");
  const extraPaid = extra.filter((m) => m.cost === "paid");
  // Ollama Cloud (plano pago à parte, com créditos mensais): logo depois da própria, antes dos grátis.
  const cloud = ollamaCloudModels(env, { fastFirst: opts.effort === "low" }).filter(fits);

  // Padrão (decisão de 24/11/2026): LLM própria primeiro. "false" volta à ordem antiga.
  const selfFirst = !/^(0|false|no|off|nao|não)$/i.test((env.VERTAL_CODE_AI_PREFER_SELF_HOSTED ?? "").trim());
  const ordered = selfFirst
    ? [...selfList, ...cloud, ...freeSorted, ...extraFree, ...paid, ...extraPaid]
    : [...freeSorted, ...extraFree, ...selfList, ...cloud, ...paid, ...extraPaid];
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
    max_tokens: m.budget
      ? Math.min(opts.maxTokens, m.budget.maxOutputTokens)
      : m.maxOutputTokens
      ? Math.min(opts.maxTokens, m.maxOutputTokens)
      : opts.maxTokens,
    temperature: opts.temperature ?? 0.2,
  };
  if (opts.json && m.jsonMode) body.response_format = { type: "json_object" };
  if (m.provider === "openrouter" && m.reasoning && opts.effort !== "auto") {
    body.reasoning = { effort: opts.effort === "max" ? "high" : opts.effort };
  }
  // LLM própria: num_ctx fica no Modelfile do kit de deploy (a API compatível não recebe "options").
  // Com orçamento, vem em streaming para podermos cortar se o 1º token demorar.
  if (m.provider === "ollama") body.stream = !!m.budget;
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

// ───────────────────────────── Opções Vertal (famílias de modelos) ─────────────────────────────
//
// O usuário escolhe uma OPÇÃO Vertal (nunca o nome do provedor). Cada opção é uma cadeia:
//   LLM própria (pedido pequeno, igual ao "auto") → grátis da opção → pagos da opção (só com
//   VERTAL_CODE_AI_ALLOW_PAID=true) → reserva grátis (openrouter/free).
// "auto" continua exatamente igual (buildChain). Ids de modelo verificados em 24/11/2026 em
// openrouter.ai/api/v1/models; os grátis que sumirem do catálogo ao vivo são descartados.

export type VcaOption = "auto" | "code" | "livre" | "turbo" | "pro" | "imagem" | "video";
export const VCA_TEXT_OPTIONS: VcaOption[] = ["auto", "code", "livre", "turbo", "pro"];
export const VCA_MEDIA_OPTIONS: VcaOption[] = ["imagem", "video"];

export const VCA_OPTION_LABEL: Record<VcaOption, string> = {
  auto: "Vertal Auto",
  code: "Vertal Code",
  livre: "Vertal Livre",
  turbo: "Vertal Turbo",
  pro: "Vertal Pro",
  imagem: "Vertal Imagem",
  video: "Vertal Vídeo",
};

export function parseVcaOption(v: unknown): VcaOption {
  return typeof v === "string" && (Object.keys(VCA_OPTION_LABEL) as string[]).includes(v) ? (v as VcaOption) : "auto";
}

const orModel = (
  m: Omit<VcaModel, "provider" | "url" | "keyEnv" | "jsonMode" | "reasoning" | "efforts"> &
    Partial<Pick<VcaModel, "jsonMode" | "reasoning" | "efforts">>,
): VcaModel => ({
  provider: "openrouter",
  url: OPENROUTER_URL,
  keyEnv: "OPENROUTER_API_KEY",
  jsonMode: true,
  reasoning: false,
  efforts: ["auto", "low", "high", "max"],
  ...m,
});

/** Famílias novas. Preços em US$/1M tokens (tabela do OpenRouter em 24/11/2026). */
export const VCA_FAMILY_CATALOG: VcaModel[] = [
  // Grátis (cota diária gratuita do OpenRouter)
  orModel({ id: "vca-light-free", label: "Vertal Livre · Leve", model: "google/gemma-4-26b-a4b-it:free", cost: "free", vision: true, context: 128_000, reasoning: true, maxOutputTokens: 8_000, price: { in: 0, out: 0 } }),
  orModel({ id: "vca-omni-free", label: "Vertal Livre · Omni", model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", cost: "free", vision: true, context: 128_000, jsonMode: false, reasoning: true, maxOutputTokens: 8_000, price: { in: 0, out: 0 } }),
  orModel({ id: "vca-swift-free", label: "Vertal Livre · Ligeiro", model: "nvidia/nemotron-3.5-lightning:free", cost: "free", vision: false, context: 128_000, jsonMode: false, reasoning: true, maxOutputTokens: 8_000, price: { in: 0, out: 0 } }),
  // Pagos baratos
  orModel({ id: "vca-code-agile", label: "Vertal Code · Ágil", model: "qwen/qwen3-coder-30b-a3b-instruct", cost: "paid", vision: false, context: 128_000, maxOutputTokens: 8_000, price: { in: 0.07, out: 0.28 } }),
  orModel({ id: "vca-code-classic", label: "Vertal Code · Clássico", model: "qwen/qwen-2.5-coder-32b-instruct", cost: "paid", vision: false, context: 24_000, maxOutputTokens: 4_000, price: { in: 0.66, out: 1.0 } }),
  orModel({ id: "vca-code-pro", label: "Vertal Code · Pro", model: "moonshotai/kimi-k2.7-code", cost: "paid", vision: true, context: 200_000, reasoning: true, maxOutputTokens: 8_000, price: { in: 0.6, out: 3.0 } }),
  orModel({ id: "vca-pro", label: "Vertal Pro", model: "moonshotai/kimi-k2.6", cost: "paid", vision: true, context: 200_000, reasoning: true, maxOutputTokens: 8_000, price: { in: 0.65, out: 3.41 } }),
  orModel({ id: "vca-turbo-v4", label: "Vertal Turbo · Fluxo", model: "deepseek/deepseek-v4-flash", cost: "paid", vision: false, context: 200_000, reasoning: true, maxOutputTokens: 8_000, price: { in: 0.09, out: 0.18 } }),
  orModel({ id: "vca-open", label: "Vertal Aberto", model: "meta-llama/llama-4-maverick", cost: "paid", vision: true, context: 200_000, maxOutputTokens: 8_000, price: { in: 0.35, out: 1.0 } }),
  orModel({ id: "vca-open-lite", label: "Vertal Aberto · Leve", model: "meta-llama/llama-4-scout", cost: "paid", vision: true, context: 200_000, jsonMode: false, maxOutputTokens: 8_000, price: { in: 0.1, out: 0.3 } }),
];

/** Preço de tabela dos modelos que já existiam (só para estimativa). */
const KNOWN_PRICES: Record<string, { in: number; out: number }> = {
  "vca-turbo-direct": { in: 0.28, out: 0.42 },
  "vca-turbo-paid": { in: 0.14, out: 0.42 },
};

/** Ids (Vertal) de cada opção, na ordem: grátis da opção primeiro, depois pagos. */
export const VCA_OPTION_MODELS: Record<Exclude<VcaOption, "auto" | "imagem" | "video">, string[]> = {
  code: ["vca-code-free", "vca-multi-free", "vca-reason-free", "vca-code-agile", "vca-code-pro", "vca-turbo-direct", "vca-turbo-paid", "vca-code-classic"],
  livre: ["vca-multi-free", "vca-light-free", "vca-reason-free", "vca-vision-free", "vca-omni-free", "vca-swift-free", "vca-code-free", "vca-agent-free", "vca-fast-free", "vca-flash-free"],
  turbo: ["vca-turbo-direct", "vca-turbo-v4", "vca-turbo-paid", "vca-open", "vca-open-lite"],
  pro: ["vca-pro", "vca-code-pro", "vca-turbo-direct", "vca-turbo-paid"],
};

/** Todos os modelos de texto conhecidos (catálogo antigo + famílias novas), por id. */
export function allTextModels(env: VcaEnv): VcaModel[] {
  return [...VCA_FREE_CATALOG, ...VCA_FAMILY_CATALOG, ...VCA_PAID_CATALOG, ...extraProviderModels(env)];
}

/** Preço de tabela de um modelo (US$/1M tokens) ou null se desconhecido. */
export function modelPrice(m: VcaModel): { in: number; out: number } | null {
  if (m.cost === "free" || m.cost === "self_hosted") return { in: 0, out: 0 };
  return m.price ?? KNOWN_PRICES[m.id] ?? null;
}

/** Custo estimado em US$ de uma chamada. */
export function estimateCostUsd(m: VcaModel, inputTokens: number, outputTokens: number): number {
  const p = modelPrice(m);
  if (!p) return 0;
  return (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
}

/**
 * Preço de varejo em créditos (fórmula do config do VERTAL Code AI):
 *   (custo + US$0,05) × 1,5 ÷ US$0,03 por crédito. Só informativo: a cobrança segue DESLIGADA.
 */
export const VCA_RETAIL = { feeUsd: 0.05, markup: 1.5, usdPerCredit: 0.03 } as const;
export function retailCredits(costUsd: number): number {
  const c = ((Math.max(0, costUsd) + VCA_RETAIL.feeUsd) * VCA_RETAIL.markup) / VCA_RETAIL.usdPerCredit;
  return Math.round(c * 100) / 100;
}

/**
 * Provedor extra OpenAI-compatível por segredo (ex.: um plano grátis de outro provedor):
 *   VERTAL_EXTRA_PROVIDER_URL   base (…/v1) ou URL completa de /chat/completions
 *   VERTAL_EXTRA_PROVIDER_KEY   chave (Bearer)
 *   VERTAL_EXTRA_PROVIDER_MODELS  ids separados por vírgula (na ordem de preferência)
 *   VERTAL_EXTRA_PROVIDER_COST  "free" (padrão) ou "paid" (aí só entra com ALLOW_PAID)
 *   VERTAL_EXTRA_PROVIDER_CONTEXT  contexto útil (padrão 32 000)
 */
export function extraProviderModels(env: VcaEnv): VcaModel[] {
  const raw = (env.VERTAL_EXTRA_PROVIDER_URL ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(raw) || !(env.VERTAL_EXTRA_PROVIDER_KEY ?? "").trim()) return [];
  const url = /\/chat\/completions$/i.test(raw) ? raw : `${raw}/chat/completions`;
  const cost: VcaCost = /^paid$/i.test((env.VERTAL_EXTRA_PROVIDER_COST ?? "").trim()) ? "paid" : "free";
  return (env.VERTAL_EXTRA_PROVIDER_MODELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((model, i) => ({
      id: `vca-extra-${i + 1}`,
      label: `Vertal Parceiro · ${i + 1}`,
      provider: "extra" as const,
      url,
      keyEnv: "VERTAL_EXTRA_PROVIDER_KEY",
      model,
      cost,
      vision: false,
      context: num(env.VERTAL_EXTRA_PROVIDER_CONTEXT, 32_000),
      jsonMode: false,
      reasoning: false,
      efforts: ["auto", "low", "high", "max"] as VcaEffort[],
      maxOutputTokens: 8_000,
    }));
}

/**
 * Ollama Cloud (https://ollama.com, API OpenAI-compatível em /v1/chat/completions), configurado só pelo
 * VERTAL_GPU_CONFIG (sem segredo novo):
 *   VERTAL_OLLAMA_CLOUD_URL         base (https://ollama.com ou …/v1) ou URL completa de /chat/completions
 *   VERTAL_OLLAMA_CLOUD_KEY         chave (Bearer)
 *   VERTAL_OLLAMA_CLOUD_CODE_MODEL  modelo de código (padrão kimi-k2.7-code)
 *   VERTAL_OLLAMA_CLOUD_FAST_MODEL  modelo rápido p/ pedidos pequenos (padrão deepseek-v4.1-flash)
 *   VERTAL_OLLAMA_CLOUD_CONTEXT     contexto útil (padrão 128 000)
 *   VERTAL_OLLAMA_CLOUD_ENABLED     "false" desliga sem apagar a config
 * Ordem: código primeiro; rápido primeiro quando fastFirst (esforço "low" / Turbo).
 * É gasto do plano Ollama (créditos mensais) → cost "paid"; preços só para estimativa (tabela OpenRouter).
 */
export function ollamaCloudModels(env: VcaEnv, opts: { fastFirst?: boolean } = {}): VcaModel[] {
  const raw = (env.VERTAL_OLLAMA_CLOUD_URL ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(raw) || !(env.VERTAL_OLLAMA_CLOUD_KEY ?? "").trim()) return [];
  if (/^(0|false|no|off|nao|não)$/i.test((env.VERTAL_OLLAMA_CLOUD_ENABLED ?? "").trim())) return [];
  const url = /\/chat\/completions$/i.test(raw) ? raw : `${raw.replace(/\/v1$/i, "")}/v1/chat/completions`;
  const context = num(env.VERTAL_OLLAMA_CLOUD_CONTEXT, 128_000);
  const base = {
    provider: "ollama_cloud" as const,
    url,
    keyEnv: "VERTAL_OLLAMA_CLOUD_KEY",
    cost: "paid" as const,
    vision: false,
    context,
    jsonMode: true,
    reasoning: false,
    efforts: ["auto", "low", "high", "max"] as VcaEffort[],
    maxOutputTokens: 8_000,
  };
  const code: VcaModel = {
    ...base,
    id: "vca-ollama-code",
    label: "Vertal Nuvem · Código",
    model: (env.VERTAL_OLLAMA_CLOUD_CODE_MODEL ?? "").trim() || "kimi-k2.7-code",
    price: { in: 0.6, out: 3.0 },
  };
  const fast: VcaModel = {
    ...base,
    id: "vca-ollama-fast",
    label: "Vertal Nuvem · Rápido",
    model: (env.VERTAL_OLLAMA_CLOUD_FAST_MODEL ?? "").trim() || "deepseek-v4.1-flash",
    price: { in: 0.14, out: 0.42 },
  };
  return opts.fastFirst ? [fast, code] : [code, fast];
}

export interface OptionChainOptions extends ChainOptions {
  option: VcaOption;
  /** Fixa um modelo (id Vertal) da opção — útil para testar uma família. Ignorado se não estiver na opção. */
  modelId?: string | null;
}

/**
 * Cadeia de uma opção Vertal. "auto" = buildChain sem mudança nenhuma.
 * Demais: própria (se couber) → grátis da opção → pagos da opção (se liberado) → provedor extra → reserva grátis.
 */
export function buildOptionChain(env: VcaEnv, opts: OptionChainOptions): VcaModel[] {
  const option = opts.option;
  if (option === "auto" || option === "imagem" || option === "video") {
    const base = buildChain(env, opts);
    return pinModel(base, opts.modelId);
  }
  const hasKey = (m: VcaModel) => m.provider === "ollama" || !!(env[m.keyEnv] ?? "").trim();
  const fits = (m: VcaModel) =>
    (!opts.needsVision || m.vision) && (!opts.promptTokens || opts.promptTokens < m.context * 0.8);
  const allowPaid = truthy(env.VERTAL_CODE_AI_ALLOW_PAID);
  const byId = new Map(allTextModels(env).map((m) => [m.id, m]));
  const wanted = VCA_OPTION_MODELS[option].map((id) => byId.get(id)).filter((m): m is VcaModel => !!m);
  // O catálogo ao vivo só lista os grátis (":free"): a conferência vale só para eles, nunca para os pagos.
  const keepFree = new Set(reconcileFreeModels(wanted.filter((m) => m.cost !== "paid"), opts.liveFreeIds).map((m) => m.id));
  const live = wanted.filter((m) => m.cost === "paid" || keepFree.has(m.id));
  const usable = live.filter((m) => hasKey(m) && fits(m) && (m.cost !== "paid" || allowPaid));
  const free = usable.filter((m) => m.cost !== "paid");
  const paid = usable.filter((m) => m.cost === "paid");
  const selfList = orderSelfHosted(
    env,
    selfHostedModels(env).filter(
      (m) => fits(m) && (!opts.promptTokens || opts.promptTokens <= (m.budget?.maxInputTokens ?? Infinity)),
    ),
    opts.promptTokens,
  );
  const extra = extraProviderModels(env).filter((m) => fits(m) && (m.cost !== "paid" || allowPaid));
  const reserve = reconcileFreeModels(
    VCA_FREE_CATALOG.filter((m) => m.model === "openrouter/free"),
    opts.liveFreeIds,
  ).filter((m) => hasKey(m) && fits(m));
  // Ollama Cloud: depois da própria, antes dos grátis. Fora do "livre" (opção grátis; também é a cadeia
  // de coordenação/Decide, que nunca usa nada pago).
  const cloud = option === "livre"
    ? []
    : ollamaCloudModels(env, { fastFirst: opts.effort === "low" || option === "turbo" }).filter(fits);
  const selfFirst = !/^(0|false|no|off|nao|não)$/i.test((env.VERTAL_CODE_AI_PREFER_SELF_HOSTED ?? "").trim());
  const ordered = selfFirst
    ? [...selfList, ...cloud, ...free, ...extra.filter((m) => m.cost !== "paid"), ...paid, ...extra.filter((m) => m.cost === "paid"), ...reserve]
    : [...free, ...extra.filter((m) => m.cost !== "paid"), ...selfList, ...cloud, ...paid, ...extra.filter((m) => m.cost === "paid"), ...reserve];
  const seen = new Set<string>();
  const chain = ordered.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  return pinModel(chain, opts.modelId);
}

function pinModel(chain: VcaModel[], modelId: string | null | undefined): VcaModel[] {
  if (!modelId) return chain;
  const hit = chain.find((m) => m.id === modelId);
  return hit ? [hit] : chain;
}

// ───────────────────────────── Imagem e vídeo (desligado por padrão) ─────────────────────────────

export interface VcaMediaModel {
  id: string;
  label: string;
  kind: "image" | "video";
  model: string;
  /** Imagem: US$ por imagem (≈1 290 tokens de saída). Vídeo: US$ por segundo na resolução usada. */
  usdPerUnit: number;
  /** Vídeo: duração e resolução que pedimos (as mais baratas que o modelo aceita). */
  seconds?: number;
  resolution?: string;
  /** Vídeo: pede (ou não) áudio; ausente = padrão do modelo. Sem áudio é mais barato quando o modelo cobra à parte. */
  audio?: boolean;
  /** "own" = endpoint próprio em GPU (VERTAL_OWN_IMAGE_URL / VERTAL_OWN_VIDEO_URL); ausente = OpenRouter. */
  provider?: "openrouter" | "own";
  /** Endpoint próprio: URL base (sem barra final) e variável com o token Bearer. */
  url?: string;
  keyEnv?: string;
}

export const VCA_IMAGE_MODELS: VcaMediaModel[] = [
  { id: "vca-image", label: "Vertal Imagem", kind: "image", model: "google/gemini-3.1-flash-lite-image", usdPerUnit: 0.04 },
];

// Ordem trocada em 25/11/2026: o Omni 1.2 Flash estava com ~40% de disponibilidade no dia (job falhou no smoke test).
export const VCA_VIDEO_MODELS: VcaMediaModel[] = [
  { id: "vca-video", label: "Vertal Vídeo", kind: "video", model: "google/veo-3.1-lite", usdPerUnit: 0.03, seconds: 4, resolution: "720p", audio: false },
  { id: "vca-video-alt", label: "Vertal Vídeo · Reserva", kind: "video", model: "google/gemini-omni-1.2-flash", usdPerUnit: 0.023172, seconds: 4, resolution: "360p" },
];

/** Imagem/vídeo: exige VERTAL_CODE_AI_MEDIA_ENABLED=true, pago liberado e chave do OpenRouter. */
export function isVcaMediaEnabled(env: VcaEnv): boolean {
  return truthy(env.VERTAL_CODE_AI_MEDIA_ENABLED) && truthy(env.VERTAL_CODE_AI_ALLOW_PAID) &&
    !!(env.OPENROUTER_API_KEY ?? "").trim();
}

export function mediaCostUsd(m: VcaMediaModel): number {
  return m.kind === "video" ? m.usdPerUnit * (m.seconds ?? 4) : m.usdPerUnit;
}

/** Corpo do pedido de imagem (chat completions com saída de imagem). */
export function imageRequestBody(m: VcaMediaModel, prompt: string, images: string[] = []): Record<string, unknown> {
  const content = images.length
    ? [{ type: "text", text: prompt }, ...images.slice(0, 2).map((url) => ({ type: "image_url", image_url: { url } }))]
    : prompt;
  return { model: m.model, modalities: ["image", "text"], messages: [{ role: "user", content }], max_tokens: 2_000 };
}

/** Lê as imagens (data URL ou https) da resposta do OpenRouter. */
export function extractImages(resp: unknown): { images: string[]; text: string } {
  type Part = { type?: string; url?: string; image_url?: { url?: string } };
  type Msg = { content?: string | Part[]; images?: Part[] };
  const msg: Msg = (resp as { choices?: Array<{ message?: Msg }> } | null)?.choices?.[0]?.message ?? {};
  const images: string[] = [];
  for (const im of Array.isArray(msg.images) ? msg.images : []) {
    const url = im?.image_url?.url ?? im?.url;
    if (typeof url === "string" && (/^data:image\//.test(url) || /^https:\/\//.test(url))) images.push(url);
  }
  if (Array.isArray(msg.content)) {
    for (const p of msg.content) {
      const url = p?.image_url?.url;
      if (p?.type === "image_url" && typeof url === "string") images.push(url);
    }
  }
  const text = typeof msg.content === "string" ? msg.content : "";
  return { images, text };
}

/** Corpo do pedido de vídeo (API assíncrona POST /api/v1/videos). */
export function videoRequestBody(m: VcaMediaModel, prompt: string): Record<string, unknown> {
  return {
    model: m.model,
    prompt: prompt.slice(0, 2_000),
    duration: m.seconds ?? 4,
    resolution: m.resolution ?? "720p",
    aspect_ratio: "16:9",
    ...(typeof m.audio === "boolean" ? { generate_audio: m.audio } : {}),
  };
}

// ───────────────────────────── Imagem e vídeo próprios (GPU serverless, opcional) ─────────────────────────────
//
// Primeira opção de "Vertal Imagem" / "Vertal Vídeo" quando configurados por segredo; se falharem,
// a cadeia segue para os modelos de sempre (VCA_IMAGE_MODELS / VCA_VIDEO_MODELS).
//   VERTAL_OWN_IMAGE_URL / _TOKEN   POST {url}/generate {prompt,width,height,steps} → {image:"data:image/…"}
//   VERTAL_OWN_VIDEO_URL / _TOKEN   POST {url}/submit {prompt,seconds} → {id}; GET {url}/status?id=; GET {url}/result?id= (mp4)
//   VERTAL_OWN_IMAGE_COST (US$ por imagem) e VERTAL_OWN_VIDEO_COST (US$ por segundo): só estimativa.

/**
 * Prefixo dos jobs de vídeo do endpoint próprio (o resto é o id do provedor de sempre).
 * Só [A-Za-z0-9_-]: o job assinado (verifyJob) recusa qualquer outro caractere.
 */
export const VCA_OWN_JOB_PREFIX = "vcaown_";

function ownMediaAt(env: VcaEnv, kind: "image" | "video"): VcaMediaModel | null {
  const pre = kind === "image" ? "VERTAL_OWN_IMAGE" : "VERTAL_OWN_VIDEO";
  const url = (env[`${pre}_URL`] ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(url) || !(env[`${pre}_TOKEN`] ?? "").trim()) return null;
  return kind === "image"
    ? {
      id: "vca-image-own",
      label: "Vertal Imagem · Própria",
      kind,
      model: "vertal-image-gpu",
      usdPerUnit: num(env.VERTAL_OWN_IMAGE_COST, 0.003),
      provider: "own",
      url,
      keyEnv: `${pre}_TOKEN`,
    }
    : {
      id: "vca-video-own",
      label: "Vertal Vídeo · Própria",
      kind,
      model: "vertal-video-gpu",
      usdPerUnit: num(env.VERTAL_OWN_VIDEO_COST, 0.02),
      seconds: 4,
      resolution: "480p",
      provider: "own",
      url,
      keyEnv: `${pre}_TOKEN`,
    };
}

/** Modelos de imagem na ordem de tentativa: própria (se configurada) → os de sempre. */
export function imageModels(env: VcaEnv): VcaMediaModel[] {
  const own = ownMediaAt(env, "image");
  return own ? [own, ...VCA_IMAGE_MODELS] : [...VCA_IMAGE_MODELS];
}

/** Modelos de vídeo na ordem de tentativa: próprio (se configurado) → os de sempre. */
export function videoModels(env: VcaEnv): VcaMediaModel[] {
  const own = ownMediaAt(env, "video");
  return own ? [own, ...VCA_VIDEO_MODELS] : [...VCA_VIDEO_MODELS];
}

/** Corpo do pedido de imagem ao endpoint próprio (só texto → imagem, 1024 px). */
export function ownImageRequestBody(prompt: string): Record<string, unknown> {
  return { prompt: prompt.slice(0, 2_000), width: 1024, height: 1024, steps: 4, format: "jpeg" };
}

/** Corpo do pedido de vídeo ao endpoint próprio. */
export function ownVideoRequestBody(m: VcaMediaModel, prompt: string): Record<string, unknown> {
  return { prompt: prompt.slice(0, 1_500), seconds: m.seconds ?? 4 };
}

/** Lê a imagem devolvida pelo endpoint próprio ({image:"data:image/…;base64,…"}). */
export function extractOwnImage(resp: unknown): string | null {
  const img = (resp as { image?: unknown } | null)?.image;
  return typeof img === "string" && /^data:image\/(png|jpe?g|webp);base64,/.test(img) ? img : null;
}

/** Status do job próprio → status no formato que o app já entende. */
export function ownVideoStatus(resp: unknown): "pending" | "completed" | "failed" | "expired" {
  const s = (resp as { status?: unknown } | null)?.status;
  return s === "completed" || s === "failed" || s === "expired" ? s : "pending";
}
