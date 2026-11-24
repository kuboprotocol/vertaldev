// VERTAL Code AI — catálogo de perfis e roteamento "grátis primeiro".
//
//   perfil escolhido (Auto, Código, Raciocínio, Rápido, Visão, Servidor próprio, Pro)
//     ─► cadeia de backends com chave configurada, nesta ordem:
//          1. camadas gratuitas legítimas (OpenRouter ":free", Gemini free tier, Groq free plan)
//          2. Ollama próprio (VERTAL_OLLAMA_URL), se existir
//          3. pago, só se VERTAL_CODE_AI_PAID_ENABLED=true
//     ─► o servidor tenta um por um (429/5xx/timeout/resposta vazia ─► próximo).
//
// A interface mostra só "VERTAL Code AI · <perfil>". Nomes de terceiros ficam aqui
// e em docs/VERTAL-CODE-AI.md. Módulo puro (sem Deno, sem rede): roda no Vitest
// e no navegador.

export type VcaiMode = "plan" | "build" | "fix";
export type ReasoningEffort = "off" | "low" | "medium" | "high";
export type CostClass = "free" | "self_hosted" | "paid" | "custom";
/** Como o backend recebe o esforço de raciocínio. */
export type ReasoningStyle = "openrouter" | "reasoning_effort" | "none";

export type ProfileId = "auto" | "codigo" | "raciocinio" | "rapido" | "visao" | "local" | "pro" | "custom";

export interface Backend {
  /** Nome interno estável (logs e testes). Nunca aparece na interface. */
  name: string;
  /** URL completa de /chat/completions (compatível com OpenAI). */
  url: string;
  model: string;
  /** Variáveis de ambiente aceitas para a chave, em ordem. Vazio = sem chave (Ollama aberto). */
  keyEnvs: string[];
  vision: boolean;
  reasoning: ReasoningStyle;
  cost: CostClass;
  /** Limite de saída pedido ao provedor. */
  maxTokens: number;
  /** Cabeçalhos extras (ex.: atribuição do OpenRouter). */
  headers?: Record<string, string>;
}

export interface ProfileInfo {
  id: ProfileId;
  /** Rótulo da interface (pt-BR, só marca Vertal). */
  label: string;
  description: string;
  cost: CostClass;
}

export const PROFILES: ProfileInfo[] = [
  { id: "auto", label: "VERTAL Code AI · Auto", description: "Escolhe sozinho o melhor modelo gratuito para planejar ou construir.", cost: "free" },
  { id: "codigo", label: "VERTAL Code AI · Código", description: "Focado em escrever e corrigir código.", cost: "free" },
  { id: "raciocinio", label: "VERTAL Code AI · Raciocínio", description: "Pensa mais antes de responder. Melhor para planos e bugs difíceis.", cost: "free" },
  { id: "rapido", label: "VERTAL Code AI · Rápido", description: "Respostas curtas e rápidas para ajustes pequenos.", cost: "free" },
  { id: "visao", label: "VERTAL Code AI · Visão", description: "Entende imagens: prints, telas e mockups anexados.", cost: "free" },
  { id: "local", label: "VERTAL Code AI · Servidor próprio", description: "Roda no servidor do Vertal. Sem limite diário, mais lento.", cost: "self_hosted" },
  { id: "pro", label: "VERTAL Code AI · Pro", description: "Modelo pago, mais forte. Consome créditos.", cost: "paid" },
];

const OR_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

const OR_KEYS = ["OPENROUTER_API_KEY", "NAVIGATOR_OPENROUTER_KEY"];
const GEMINI_KEYS = ["VERTAL_GEMINI_API_KEY", "GEMINI_API_KEY"];
const GROQ_KEYS = ["GROQ_API_KEY"];
const OR_HEADERS = { "HTTP-Referer": "https://vertal.dev", "X-Title": "VERTAL Code AI" };

function or(model: string, vision: boolean, maxTokens = 16000): Backend {
  return { name: `or:${model}`, url: OR_URL, model, keyEnvs: OR_KEYS, vision, reasoning: "openrouter", cost: "free", maxTokens, headers: OR_HEADERS };
}
function gemini(model: string, maxTokens = 16000): Backend {
  return { name: `gemini:${model}`, url: GEMINI_URL, model, keyEnvs: GEMINI_KEYS, vision: true, reasoning: "reasoning_effort", cost: "free", maxTokens };
}
function groq(model: string, reasoning: ReasoningStyle, maxTokens = 8000): Backend {
  return { name: `groq:${model}`, url: GROQ_URL, model, keyEnvs: GROQ_KEYS, vision: false, reasoning, cost: "free", maxTokens };
}

/**
 * Backends gratuitos verificados em 24/11/2026 (ver docs/VERTAL-CODE-AI.md):
 *  - OpenRouter: lista pública /api/v1/models (sufixo ":free"); limite diário por conta.
 *  - Gemini API: "Free of charge" na página de preços para os Flash/2.5; dados usados para melhorar produtos.
 *  - Groq: Free Plan (gpt-oss-120b e qwen3.8-27b: 30 RPM, 1K RPD, 8K TPM).
 * Os IDs mudam com frequência: VERTAL_CODE_AI_MODELS (JSON) sobrescreve sem deploy de código,
 * e o servidor descarta IDs ":free" que sumiram da lista pública.
 */
export const FREE_BACKENDS = {
  orCoder: or("particle-ai/particle-1:free", true),
  orErnie: or("baidu/ernie-5.5-flash-preview:free", false),
  orUltra: or("nvidia/nemotron-3-ultra-550b-a55b:free", false),
  orLightning: or("nvidia/nemotron-3.5-lightning:free", false, 8000),
  orGemma: or("google/gemma-4-31b-it:free", true),
  orSuperVl: or("nvidia/nemotron-3.5-super-vl:free", true),
  orRouter: or("openrouter/free", true),
  geminiFlash: gemini("gemini-3.8-flash"),
  geminiPro: gemini("gemini-2.5-pro"),
  geminiLite: gemini("gemini-3.5-flash-lite", 8000),
  groqGptOss: groq("openai/gpt-oss-120b", "reasoning_effort"),
  groqQwen: groq("qwen/qwen3.8-27b", "none"),
} satisfies Record<string, Backend>;

export const PAID_BACKENDS: Backend[] = [
  { name: "paid:deepseek", url: DEEPSEEK_URL, model: "deepseek-chat", keyEnvs: ["DEEPSEEK_API_KEY"], vision: false, reasoning: "none", cost: "paid", maxTokens: 8000 },
  { ...or("qwen/qwen3-coder", false), name: "paid:or-qwen-coder", cost: "paid" },
];

const F = FREE_BACKENDS;
/** Ordem por perfil e modo. "plan" pede raciocínio; "build"/"fix" pedem código. */
const CHAINS: Record<Exclude<ProfileId, "local" | "pro" | "custom">, Record<VcaiMode, Backend[]>> = {
  auto: {
    plan: [F.orUltra, F.geminiPro, F.orErnie, F.groqGptOss, F.orCoder, F.orRouter],
    build: [F.orCoder, F.orErnie, F.geminiFlash, F.groqGptOss, F.orUltra, F.orRouter],
    fix: [F.orCoder, F.geminiFlash, F.orErnie, F.groqGptOss, F.orUltra, F.orRouter],
  },
  codigo: {
    plan: [F.orCoder, F.orErnie, F.geminiFlash, F.groqQwen, F.orRouter],
    build: [F.orCoder, F.orErnie, F.geminiFlash, F.groqQwen, F.orRouter],
    fix: [F.orCoder, F.orErnie, F.geminiFlash, F.groqQwen, F.orRouter],
  },
  raciocinio: {
    plan: [F.orUltra, F.geminiPro, F.groqGptOss, F.orErnie, F.orRouter],
    build: [F.orUltra, F.geminiPro, F.orCoder, F.groqGptOss, F.orRouter],
    fix: [F.orUltra, F.geminiPro, F.orCoder, F.groqGptOss, F.orRouter],
  },
  rapido: {
    plan: [F.groqGptOss, F.geminiLite, F.orLightning, F.orRouter],
    build: [F.groqQwen, F.groqGptOss, F.geminiLite, F.orLightning, F.orRouter],
    fix: [F.groqQwen, F.groqGptOss, F.geminiLite, F.orLightning, F.orRouter],
  },
  visao: {
    plan: [F.orGemma, F.geminiFlash, F.orSuperVl, F.orCoder, F.orRouter],
    build: [F.orCoder, F.orGemma, F.geminiFlash, F.orSuperVl, F.orRouter],
    fix: [F.orCoder, F.orGemma, F.geminiFlash, F.orSuperVl, F.orRouter],
  },
};

export type EnvGetter = (key: string) => string | undefined;

export function keyFor(b: Backend, env: EnvGetter): string | null {
  for (const k of b.keyEnvs) {
    const v = env(k)?.trim();
    if (v) return v;
  }
  return b.keyEnvs.length === 0 ? "" : null;
}

/** Ollama próprio (VERTAL_OLLAMA_URL), compatível com OpenAI em /v1/chat/completions. */
export function ollamaBackend(env: EnvGetter): Backend | null {
  const base = env("VERTAL_OLLAMA_URL")?.trim().replace(/\/+$/, "");
  if (!base || !/^https?:\/\//i.test(base)) return null;
  return {
    name: "ollama",
    url: base.endsWith("/chat/completions") ? base : `${base.replace(/\/v1$/, "")}/v1/chat/completions`,
    model: env("VERTAL_OLLAMA_MODEL")?.trim() || "qwen2.5-coder:7b",
    // Token opcional (proxy com Bearer na frente do Ollama). Sem token, chama sem Authorization.
    keyEnvs: env("VERTAL_OLLAMA_TOKEN") ? ["VERTAL_OLLAMA_TOKEN"] : [],
    vision: env("VERTAL_OLLAMA_VISION") === "true",
    reasoning: "none",
    cost: "self_hosted",
    maxTokens: Number(env("VERTAL_OLLAMA_MAX_TOKENS")) || 4096,
  };
}

export function paidEnabled(env: EnvGetter): boolean {
  return env("VERTAL_CODE_AI_PAID_ENABLED") === "true";
}

/** IDs ":free" configurados que ainda existem na lista pública do OpenRouter. */
export function reconcileFree(chain: Backend[], liveOpenRouterIds: Set<string> | null): Backend[] {
  if (!liveOpenRouterIds || liveOpenRouterIds.size === 0) return chain;
  return chain.filter((b) => !b.name.startsWith("or:") || b.model === "openrouter/free" || b.cost !== "free" || liveOpenRouterIds.has(b.model));
}

/**
 * Sobrescrita por env (VERTAL_CODE_AI_MODELS), ex.:
 *   {"auto.build":["or:qwen/qwen3-coder:free","gemini:gemini-3.8-flash"]}
 * Cada item é "<prefixo>:<modelo>" com prefixo or | gemini | groq.
 */
export function parseOverrides(raw: string | undefined): Partial<Record<string, Backend[]>> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return {};
    const out: Partial<Record<string, Backend[]>> = {};
    for (const [key, list] of Object.entries(obj)) {
      if (!Array.isArray(list)) continue;
      const backends = list
        .map((item) => (typeof item === "string" ? backendFromSpec(item) : null))
        .filter((b): b is Backend => !!b);
      if (backends.length) out[key] = backends;
    }
    return out;
  } catch {
    return {};
  }
}

export function backendFromSpec(spec: string): Backend | null {
  const i = spec.indexOf(":");
  if (i <= 0) return null;
  const prefix = spec.slice(0, i);
  const model = spec.slice(i + 1).trim();
  if (!model || model.length > 200) return null;
  if (prefix === "or") return or(model, /vl|vision|gemma|omni/i.test(model));
  if (prefix === "gemini") return gemini(model);
  if (prefix === "groq") return groq(model, /gpt-oss/.test(model) ? "reasoning_effort" : "none");
  return null;
}

export interface CustomProvider {
  /** Rótulo dado pelo próprio usuário. */
  label: string;
  /** Base compatível com OpenAI, ex.: https://api.exemplo.com/v1 */
  baseUrl: string;
  model: string;
  /** Nome da variável no Cofre de Segredos (ex.: MEU_PROVEDOR_KEY). Opcional. */
  keyEnv?: string;
  vision?: boolean;
}

const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.|\[?::1\]?|\[?f[cd][0-9a-f]{2}:|metadata\.google\.internal)/i;

/** Valida um provedor próprio: só https público (evita SSRF para a rede interna). */
export function validateCustomProvider(raw: unknown): { ok: true; provider: CustomProvider } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Provedor inválido." };
  const r = raw as Record<string, unknown>;
  const label = typeof r.label === "string" ? r.label.trim().slice(0, 60) : "";
  const model = typeof r.model === "string" ? r.model.trim() : "";
  const baseUrl = typeof r.baseUrl === "string" ? r.baseUrl.trim().replace(/\/+$/, "") : "";
  if (!label) return { ok: false, error: "Dê um nome ao provedor." };
  if (!model || model.length > 200) return { ok: false, error: "Informe o modelo." };
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return { ok: false, error: "URL base inválida." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "Use uma URL https." };
  if (url.username || url.password) return { ok: false, error: "Não coloque usuário ou senha na URL; use o Cofre de Segredos." };
  if (PRIVATE_HOST_RE.test(url.hostname) || url.hostname.endsWith(".internal") || url.hostname.endsWith(".local")) {
    return { ok: false, error: "Endereço interno não é permitido." };
  }
  let keyEnv: string | undefined;
  if (r.keyEnv !== undefined && r.keyEnv !== null && r.keyEnv !== "") {
    if (typeof r.keyEnv !== "string" || !/^[A-Z][A-Z0-9_]{1,63}$/.test(r.keyEnv)) {
      return { ok: false, error: "Nome da chave inválido: use LETRAS_MAIUSCULAS do Cofre de Segredos." };
    }
    keyEnv = r.keyEnv;
  }
  return { ok: true, provider: { label, baseUrl, model, keyEnv, vision: r.vision === true } };
}

export function customBackend(p: CustomProvider): Backend {
  const base = p.baseUrl.replace(/\/+$/, "");
  return {
    name: "custom",
    url: base.endsWith("/chat/completions") ? base : `${base}/chat/completions`,
    model: p.model,
    keyEnvs: p.keyEnv ? [p.keyEnv] : [],
    vision: !!p.vision,
    reasoning: "reasoning_effort",
    cost: "custom",
    maxTokens: 8000,
  };
}

export interface ChainOptions {
  profile: ProfileId;
  mode: VcaiMode;
  needsVision: boolean;
  env: EnvGetter;
  liveOpenRouterIds?: Set<string> | null;
  /** Backend do provedor próprio, já com a chave resolvida pelo servidor (fica em primeiro). */
  custom?: Backend | null;
}

export interface ResolvedBackend extends Backend {
  key: string;
}

/**
 * Cadeia final, só com quem tem chave: perfil ─► Ollama ─► pago (se ligado).
 * Pedido com imagem só vai para backends com visão (se nenhum tiver, a cadeia sem
 * visão volta e o servidor manda só o texto, avisando).
 */
export function buildChain(opts: ChainOptions, customKey?: string): ResolvedBackend[] {
  const { env } = opts;
  const overrides = parseOverrides(env("VERTAL_CODE_AI_MODELS"));
  const ollama = ollamaBackend(env);
  const paid = paidEnabled(env) ? PAID_BACKENDS : [];
  let base: Backend[];
  switch (opts.profile) {
    case "local":
      base = ollama ? [ollama] : [];
      break;
    case "pro":
      base = [...paid];
      break;
    case "custom":
      base = [];
      break;
    default: {
      const key = `${opts.profile}.${opts.mode}`;
      base = overrides[key] ?? CHAINS[opts.profile]?.[opts.mode] ?? CHAINS.auto[opts.mode];
    }
  }
  base = reconcileFree(base, opts.liveOpenRouterIds ?? null);

  // Rede de segurança: o perfil escolhido falhou inteiro ─► Auto grátis ─► Ollama ─► pago.
  const tail: Backend[] = [];
  if (opts.profile !== "local" && ollama) tail.push(ollama);
  if (opts.profile === "custom" || opts.profile === "pro") tail.unshift(...reconcileFree(CHAINS.auto[opts.mode], opts.liveOpenRouterIds ?? null));
  if (opts.profile === "local") tail.push(...reconcileFree(CHAINS.auto[opts.mode], opts.liveOpenRouterIds ?? null));
  if (opts.profile !== "pro") tail.push(...paid);

  const ordered = [...(opts.custom ? [opts.custom] : []), ...base, ...tail];
  const seen = new Set<string>();
  const out: ResolvedBackend[] = [];
  for (const b of ordered) {
    const id = `${b.url}|${b.model}`;
    if (seen.has(id)) continue;
    const key = b === opts.custom ? customKey ?? keyFor(b, env) : keyFor(b, env);
    if (key === null) continue;
    seen.add(id);
    out.push({ ...b, key });
  }
  if (opts.needsVision) {
    const vision = out.filter((b) => b.vision);
    if (vision.length) return vision;
  }
  return out;
}

/** Perfis que funcionam com as chaves deste servidor (para o seletor da interface). */
export function availableProfiles(env: EnvGetter): ProfileInfo[] {
  return PROFILES.filter((p) => {
    if (p.id === "pro") return paidEnabled(env) && PAID_BACKENDS.some((b) => keyFor(b, env) !== null);
    if (p.id === "local") return !!ollamaBackend(env);
    return buildChain({ profile: p.id, mode: "build", needsVision: false, env }).some((b) => b.cost === "free");
  });
}

export function isProfileId(v: unknown): v is ProfileId {
  return typeof v === "string" && (["auto", "codigo", "raciocinio", "rapido", "visao", "local", "pro", "custom"] as string[]).includes(v);
}

export function isEffort(v: unknown): v is ReasoningEffort {
  return v === "off" || v === "low" || v === "medium" || v === "high";
}

/** Parâmetros de raciocínio no formato de cada backend. */
export function reasoningParams(b: Backend, effort: ReasoningEffort): Record<string, unknown> {
  if (effort === "off") return b.reasoning === "openrouter" ? { reasoning: { exclude: true, effort: "low" } } : {};
  if (b.reasoning === "openrouter") return { reasoning: { effort, exclude: true } };
  if (b.reasoning === "reasoning_effort") return { reasoning_effort: effort };
  return {};
}

/**
 * Erros que justificam tentar o próximo backend: limite (429), créditos (402),
 * chave/modelo recusado (401/403/404), pedido que aquele backend não aceita (400/422)
 * e falha do provedor (5xx, 408). Qualquer erro HTTP passa para o próximo.
 */
export function shouldFallback(status: number): boolean {
  return status >= 400;
}
