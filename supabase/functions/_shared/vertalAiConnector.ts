// Conector "Vertal AI" (o equivalente ao "Lovable AI" no Vertal Dev).
//
// Quando um app criado no Vertal Dev (Vibe Code, Vertal Chat, VERTAL Code AI) precisa de IA,
// o agente oferece o conector com um clique. Ativado, o projeto ganha UMA chave white-label
// (vtl_ai_…) escopada a ele, criada pela mesma lógica do /keys (mesma tabela, mesma cobrança:
// atacado nos créditos do dono, sem clonagem/raspagem, 402 com saldo zero), guardada cifrada no
// Cofre de segredos do dono e NUNCA no bundle do app. O app chama um proxy do projeto
// (…/vertal-ai-api/p/<ref>/v1/…), que troca o ref pela chave dentro do servidor.
//
// Módulo PURO: sem Deno, sem DOM, sem rede. Roda igual nas edge functions, no front
// (re-export em src/lib/vertalAiConnector.ts) e nos testes do Vitest.
//
// Desligado por padrão: VERTAL_AI_CONNECTOR_ENABLED (segredo avulso ou chave dentro do
// VERTAL_GPU_CONFIG) + allowlist VERTAL_AI_CONNECTOR_USER_IDS. Sem a lista, vale a de teste
// (CONNECTOR_TEST_USER_IDS: só o Laércio); "*" = todos (decisão do Laércio, não é o padrão).

type Env = Record<string, string | undefined>;

export const VERTAL_AI_CONNECTOR_SLUG = "vertal-ai";
export const VERTAL_AI_LABEL = "Vertal AI";
/** Nomes que o código do app (lado servidor) lê. */
export const VERTAL_AI_SECRET_API_KEY = "VERTAL_AI_API_KEY";
export const VERTAL_AI_SECRET_BASE_URL = "VERTAL_AI_BASE_URL";
/** Grupo do Cofre onde as chaves do conector aparecem. */
export const VERTAL_AI_VAULT_GROUP = "vertal-ai";
/** Arquivos determinísticos que o conector põe no app (o agente não pode sobrescrever). */
export const VERTAL_AI_PATHS = {
  client: "src/lib/vertalAi.ts",
  server: "supabase/functions/vertal-ai/index.ts",
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF_RE = /^vapp_[A-Za-z0-9_-]{24}$/;
const truthy = (v: string | undefined) => /^(1|true|yes|on|sim)$/i.test((v ?? "").trim());

// ---------------------------------------------------------------------------
// Configuração (flag + allowlist + padrões da chave)
// ---------------------------------------------------------------------------

const CONNECTOR_KEY = /^VERTAL_AI_(CONNECTOR_[A-Z_]+|API_ENABLED)$/;

/** Traz VERTAL_AI_CONNECTOR_* (e VERTAL_AI_API_ENABLED) de dentro do VERTAL_GPU_CONFIG. O segredo avulso vence. */
export function connectorEnvFrom(env: Env): Env {
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
    if (!CONNECTOR_KEY.test(k) || (out[k] ?? "").trim()) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = String(v);
    else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === "string").join(",");
  }
  return out;
}

export interface ConnectorConfig {
  enabled: boolean;
  /** A API white-label precisa estar no ar; sem ela o conector não liga. */
  apiEnabled: boolean;
  /** Ids de usuário liberados ("*" = todos). */
  userIds: string[];
  allUsers: boolean;
  /** Teto mensal padrão da chave do projeto, em créditos (null = sem teto; nunca é o padrão). */
  monthlyCapCredits: number;
  /** Pedidos por minuto da chave do projeto. */
  rpm: number;
  /** Libera /v1/videos na chave do projeto quando o app precisa de vídeo. */
  video: boolean;
  /** Base URL pública da API (sem barra no fim). */
  baseUrl: string;
  /** Origens aceitas no proxy do projeto (navegador). Vazio = qualquer origem. */
  allowedOrigins: string[];
}

/** Allowlist de teste quando VERTAL_AI_CONNECTOR_USER_IDS não está definida (a flag continua desligada por padrão). */
export const CONNECTOR_TEST_USER_IDS = ["5441b397-7be8-44fc-87e8-8057fdb79a0e"]; // Laércio

export const CONNECTOR_DEFAULTS = {
  monthlyCapCredits: 200,
  rpm: 20,
  baseUrlPath: "/functions/v1/vertal-ai-api",
  allowedOrigins: [
    "https://vertal.dev",
    "https://*.vertal.dev",
    "https://vertal.app",
    "https://*.vertal.app",
    "https://*.pages.dev",
    "https://*.e2b.app",
    "https://*.e2b.dev",
    "http://localhost:*",
    "http://127.0.0.1:*",
  ],
} as const;

function num(raw: string | undefined, def: number, min: number, max: number): number {
  const n = Number((raw ?? "").trim());
  return raw !== undefined && raw.trim() !== "" && Number.isFinite(n) && n >= min && n <= max ? n : def;
}

export function loadConnectorConfig(envIn: Env): ConnectorConfig {
  const env = connectorEnvFrom(envIn);
  const rawIds = (env.VERTAL_AI_CONNECTOR_USER_IDS ?? "").trim();
  const ids = (rawIds || CONNECTOR_TEST_USER_IDS.join(",")).split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const supa = (env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const explicitBase = (env.VERTAL_AI_CONNECTOR_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const baseUrl = /^https:\/\//i.test(explicitBase) ? explicitBase : supa ? `${supa}${CONNECTOR_DEFAULTS.baseUrlPath}` : "";
  const origins = (env.VERTAL_AI_CONNECTOR_ALLOWED_ORIGINS ?? "").split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  return {
    enabled: truthy(env.VERTAL_AI_CONNECTOR_ENABLED),
    apiEnabled: truthy(env.VERTAL_AI_API_ENABLED),
    userIds: ids.filter((s) => UUID_RE.test(s)),
    allUsers: ids.includes("*"),
    monthlyCapCredits: Math.round(num(env.VERTAL_AI_CONNECTOR_MONTHLY_CAP_CREDITS, CONNECTOR_DEFAULTS.monthlyCapCredits, 1, 1_000_000)),
    rpm: Math.round(num(env.VERTAL_AI_CONNECTOR_RPM, CONNECTOR_DEFAULTS.rpm, 1, 600)),
    video: !/^(0|false|no|off|nao|não)$/i.test((env.VERTAL_AI_CONNECTOR_VIDEO ?? "").trim()),
    baseUrl,
    allowedOrigins: origins.length ? (origins.includes("*") ? [] : origins) : [...CONNECTOR_DEFAULTS.allowedOrigins],
  };
}

/** Conector ligado para este usuário? Flag + API no ar + allowlist (sem lista = só a de teste). */
export function connectorAllowed(cfg: ConnectorConfig, userId: string | null | undefined): boolean {
  if (!cfg.enabled || !cfg.apiEnabled || !cfg.baseUrl || !userId) return false;
  return cfg.allUsers || cfg.userIds.includes(userId.toLowerCase());
}

// ---------------------------------------------------------------------------
// Escopo (um projeto = uma chave) e nomes no Cofre
// ---------------------------------------------------------------------------

/** Projeto do Vertal Dev, ou "default" (pedidos sem projeto, ex.: delegados pelo Vertal Chat). */
export function connectorScope(projectId: unknown): string {
  return typeof projectId === "string" && UUID_RE.test(projectId) ? projectId.toLowerCase() : "default";
}

function scopeSuffix(scope: string): string {
  return scope === "default" ? "DEFAULT" : scope.replace(/-/g, "").slice(0, 12).toUpperCase();
}

/**
 * O Cofre tem UNIQUE(dono, env_key): cada projeto guarda as variáveis com um sufixo
 * (VERTAL_AI_API_KEY_P<12 hex>) e o servidor entrega ao app com o nome sem sufixo.
 */
export function vaultNamesFor(scope: string) {
  const s = scopeSuffix(scope);
  return {
    apiKey: `${VERTAL_AI_SECRET_API_KEY}_P${s}`,
    baseUrl: `${VERTAL_AI_SECRET_BASE_URL}_P${s}`,
    boundTo: `vertal-ai-p${s.toLowerCase()}`,
  };
}

/** Variáveis do projeto como o app as lê (nomes sem sufixo). */
export function projectEnvFromVault(scope: string, vault: Record<string, string>): Record<string, string> {
  const n = vaultNamesFor(scope);
  const out: Record<string, string> = {};
  if (vault[n.apiKey]) out[VERTAL_AI_SECRET_API_KEY] = vault[n.apiKey];
  if (vault[n.baseUrl]) out[VERTAL_AI_SECRET_BASE_URL] = vault[n.baseUrl];
  return out;
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Identificador PÚBLICO do proxy do projeto (não é a chave; sozinho não autentica fora do proxy). */
export function generateConnectorRef(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `vapp_${base64url(bytes)}`;
}

export function isConnectorRef(v: unknown): v is string {
  return typeof v === "string" && REF_RE.test(v);
}

export function proxyUrlFor(baseUrl: string, ref: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/p/${ref}`;
}

/** Metadados guardados em vertal_ai_api_keys.features (coluna jsonb que já existe). */
export interface ConnectorFeatures {
  video?: boolean;
  connector?: { kind: "project"; project: string; ref: string; label?: string };
}

export function connectorOf(features: unknown): ConnectorFeatures["connector"] | null {
  const c = (features as ConnectorFeatures | null | undefined)?.connector;
  if (!c || typeof c !== "object" || c.kind !== "project" || typeof c.project !== "string" || !isConnectorRef(c.ref)) return null;
  return c;
}

// ---------------------------------------------------------------------------
// Proxy do projeto: rotas liberadas e origem
// ---------------------------------------------------------------------------

/** /…/p/<ref>/v1/… → { ref, path: "/v1/…" }. Fora disso, null. */
export function matchProxyPath(path: string): { ref: string; path: string } | null {
  const m = path.match(/\/p\/(vapp_[A-Za-z0-9_-]{24})(\/v1\/[A-Za-z0-9/_.-]*)$/);
  return m ? { ref: m[1], path: m[2].replace(/\/+$/, "") } : null;
}

/**
 * Só o que um app de cliente precisa chamar do navegador. Gestão de chaves, criação de
 * voz clonada (exige termo de consentimento do usuário final) e qualquer rota nova ficam fora.
 */
export function proxyRouteAllowed(method: string, path: string): boolean {
  const m = method.toUpperCase();
  if (m === "GET" && path === "/v1/models") return true;
  if (m === "POST" && path === "/v1/chat/completions") return true;
  if (m === "POST" && path === "/v1/videos/generations") return true;
  if (m === "GET" && /^\/v1\/videos\/[A-Za-z0-9_.-]{10,400}$/.test(path)) return true;
  if (m === "POST" && path === "/v1/audio/speech") return true;
  if (m === "GET" && /^\/v1\/voice-jobs\/[A-Za-z0-9_.-]{6,400}$/.test(path)) return true;
  if (m === "GET" && (path === "/v1/voices" || path === "/v1/voices/languages")) return true;
  return false;
}

/** Origem do navegador aceita? Padrões com "*" no host e na porta. Sem lista = qualquer. Sem Origin (servidor) = aceita. */
export function originAllowed(origin: string | null | undefined, patterns: string[]): boolean {
  if (!patterns.length || !origin) return true;
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  return patterns.some((p) => {
    const m = p.match(/^(https?):\/\/([^/:]+)(?::(\d+|\*))?$/i);
    if (!m) return false;
    const [, proto, host, port] = m;
    if (o.protocol !== `${proto.toLowerCase()}:`) return false;
    if (port && port !== "*" && o.port !== port) return false;
    if (!port && o.port) return false;
    const h = host.toLowerCase();
    if (h.startsWith("*.")) return o.hostname.endsWith(h.slice(1)) && o.hostname.length > h.length - 1;
    return o.hostname === h;
  });
}

// ---------------------------------------------------------------------------
// Detecção: o app precisa de IA? Que tipo?
// ---------------------------------------------------------------------------

export interface AiNeeds {
  any: boolean;
  text: boolean;
  image: boolean;
  video: boolean;
  voice: boolean;
}

const AI_RE = /\b(ia|ai|a\.i\.|intelig[êe]ncia artificial|artificial intelligence|inteligencia artificial|llm|gpt|chat ?bot|chatbot|assistente (?:de|com) ia|ai assistant|copilot|gerad[oa]r?(?:es)? (?:de|com) (?:texto|imagem|imagens|v[íi]deos?|voz|[áa]udio|m[úu]sica)|text[- ]to[- ](?:video|speech|image)|tts)\b/i;
const VIDEO_RE = /\b(v[íi]deos?|videos?|clipes? com ia|text[- ]to[- ]video|anima[çc][ãa]o com ia)\b/i;
const IMAGE_RE = /\b(imagens?|images?|fotos? com ia|ilustra[çc](?:[ãa]o|[õo]es) com ia|text[- ]to[- ]image|logos? com ia)\b/i;
const VOICE_RE = /\b(voz|vozes|voice|narra[çc][ãa]o|narrador|locu[çc][ãa]o|text[- ]to[- ]speech|tts|falar o texto|ler em voz alta|dublagem)\b/i;
const TEXT_RE = /\b(chat ?bot|chatbot|assistente|resum\w+|summar\w+|tradu\w+|translat\w+|gerar? textos?|copy|reda[çc][ãa]o|responde\w*|perguntas e respostas|q&a|llm|gpt)\b/i;

/** Lê o pedido (e, se houver, o código gerado) e diz se e como o app usa IA. Sem IA, custo zero. */
export function detectAiNeeds(prompt: string, code = ""): AiNeeds {
  const text = `${prompt ?? ""}\n${code ?? ""}`;
  const codeUsesAi = /\b(openai|chat\/completions|anthropic|generativelanguage|replicate\.com|elevenlabs|stability\.ai)\b/i.test(code ?? "");
  const any = AI_RE.test(text) || codeUsesAi;
  if (!any) return { any: false, text: false, image: false, video: false, voice: false };
  const video = VIDEO_RE.test(text);
  const image = IMAGE_RE.test(text);
  const voice = VOICE_RE.test(text);
  const t = TEXT_RE.test(text) || (!video && !image && !voice);
  return { any: true, text: t, image, video, voice };
}

/** O Dev pediu, com todas as letras, outro provedor de IA? Aí o agente pode usar o que ele pediu. */
export function explicitlyAsksOtherProvider(prompt: string): boolean {
  return /\b(use|usar|usando|com a?|with|via|pela?)\s+(?:a\s+|o\s+|the\s+)?(?:api\s+(?:da|do|de)\s+)?(openai|chatgpt api|anthropic|claude api|gemini api|google ai studio|deepseek api|groq|openrouter|replicate|elevenlabs|stability)\b/i.test(prompt ?? "");
}

// ---------------------------------------------------------------------------
// Pedido do cliente (body.vertalAi) e estado para o agente
// ---------------------------------------------------------------------------

export interface VertalAiRequest {
  enabled: boolean;
}

export function parseVertalAiRequest(raw: unknown): VertalAiRequest {
  if (raw === true) return { enabled: true };
  const r = raw as { enabled?: unknown } | null | undefined;
  return { enabled: !!r && typeof r === "object" && r.enabled === true };
}

/** Conector ativo no projeto (vem do banco; nunca traz a chave). */
export interface ActiveConnector {
  keyId: string;
  ref: string;
  proxyUrl: string;
  video: boolean;
}

export type VertalAiState =
  | { mode: "off" }
  | { mode: "offer"; needs: AiNeeds }
  | { mode: "active"; needs: AiNeeds; connector: ActiveConnector };

/**
 * Decide o que o agente faz neste pedido. Flag desligada ou usuário fora da lista → "off"
 * (comportamento de antes, byte a byte). Ativo → prompt + arquivos. Precisa e não ativo → oferta.
 */
export function resolveVertalAiState(input: {
  cfg: ConnectorConfig;
  userId: string | null;
  prompt: string;
  active: ActiveConnector | null;
}): VertalAiState {
  if (!connectorAllowed(input.cfg, input.userId)) return { mode: "off" };
  const needs = detectAiNeeds(input.prompt);
  if (input.active) return { mode: "active", needs: needs.any ? needs : { ...needs, any: true, text: true }, connector: input.active };
  if (needs.any && !explicitlyAsksOtherProvider(input.prompt)) return { mode: "offer", needs };
  return { mode: "off" };
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

/** Regra curta para qualquer agente do Vertal (Vibe Code, Chat, VERTAL Code AI). */
export const VERTAL_AI_PREFERENCE_RULES =
  "IA dentro de apps: use SEMPRE a Vertal AI (conector \"Vertal AI\", ativado com um clique, compatível com OpenAI: texto em /v1/chat/completions, vídeo em /v1/videos/generations, voz em /v1/audio/speech). Nunca peça ao Dev para configurar variáveis de ambiente ou chaves de IA à mão e nunca sugira OpenAI, Anthropic, Gemini ou outros provedores, a menos que ele peça um deles explicitamente. A chave fica no servidor (Cofre), nunca no código do navegador.";

export const VERTAL_AI_OFFER_PROMPT =
  "\n\nIA neste app: o pedido usa IA. O conector \"Vertal AI\" ainda não está ativo neste projeto; o Dev ativa com um clique no cartão que aparece abaixo da sua resposta. " +
  "Nesta volta: monte as telas e a lógica do app SEM integrar outro provedor de IA e SEM ler variáveis de ambiente de chaves de IA; " +
  "não peça ao Dev para criar variáveis nem chaves; não liste OpenAI/Anthropic/Gemini nem nenhuma API de IA em \"requirements\". " +
  "Diga em \"summary\" que basta ativar a Vertal AI no cartão para a IA funcionar.";

export function formatVertalAiForPrompt(state: Extract<VertalAiState, { mode: "active" }>): string {
  const lines = [
    "\n\nIA neste app: o conector \"Vertal AI\" está ATIVO neste projeto (chave e cobrança já configuradas pelo Vertal, nada para o Dev configurar).",
    `Use SOMENTE o helper pronto \`${VERTAL_AI_PATHS.client}\` (já entra no projeto; NÃO crie nem edite esse arquivo, nem \`${VERTAL_AI_PATHS.server}\`). Ele exporta:`,
    "- `chat(messages, opts?)` → texto (Promise<string>); `chatStream` não existe, use `chat`.",
    "- `generateVideo({ prompt, durationSeconds? })` → Promise<{ id, videoUrl }> (cria o job em /v1/videos/generations e espera ficar pronto); `startVideo` e `getVideo` para controlar o progresso na tela.",
    "- `speak({ voiceId, input, language? })` → Promise<{ id, audioUrl }> (voz; só funciona se a voz estiver liberada para a conta).",
    "- `VertalAiError` com `status` (402 = sem créditos: mostre \"Créditos de IA esgotados\" de forma amigável; 429 = muitas requisições, tente de novo).",
    "Regras: nunca use fetch direto para outros provedores de IA, nunca leia OPENAI_API_KEY ou similares, nunca escreva chaves no código, nunca peça variáveis de ambiente. " +
      "Não liste APIs de IA em \"requirements\" (a Vertal AI já está conectada). Mostre estados de carregando/erro e desabilite o botão enquanto gera. " +
      "Geração de imagem ainda não está na Vertal AI: se o app pedir imagem, diga isso em \"message\" e não use outro provedor.",
  ];
  if (state.needs.video) lines.push("Este app gera VÍDEO: use `generateVideo` (ou `startVideo` + `getVideo` com barra de progresso), mostre o MP4 num <video controls> e um botão de download.");
  if (state.needs.voice) lines.push("Este app usa VOZ: use `speak` e toque o resultado num <audio controls>.");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Arquivos determinísticos do app
// ---------------------------------------------------------------------------

export function isVertalAiPath(path: string): boolean {
  const p = path.replace(/^\.?\//, "");
  return p === VERTAL_AI_PATHS.client || p === VERTAL_AI_PATHS.server;
}

export interface GeneratedFile {
  path: string;
  content: string;
  reason: string;
}

/**
 * Helper do navegador: fala com o PROXY do projeto (URL pública, sem chave). Pode ser trocado
 * pela função do próprio app (VITE_VERTAL_AI_PROXY_URL → …/functions/v1/vertal-ai) sem mudar o resto.
 * Edge function do app: para quem publica com backend próprio; lê VERTAL_AI_API_KEY/VERTAL_AI_BASE_URL do ambiente do servidor.
 */
export function buildVertalAiFiles(input: { proxyUrl: string }): GeneratedFile[] {
  const proxy = JSON.stringify(input.proxyUrl.replace(/\/+$/, ""));
  const client = `// Vertal AI — IA deste app (gerado pelo conector Vertal AI; não edite).
// Fala com o proxy do projeto: a chave fica no servidor do Vertal, nunca neste código.
// Compatível com OpenAI: texto (/v1/chat/completions), vídeo (/v1/videos) e voz (/v1/audio/speech).

const PROXY: string = (import.meta.env.VITE_VERTAL_AI_PROXY_URL as string | undefined) || ${proxy};

export type ChatRole = "system" | "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export class VertalAiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "VertalAiError";
  }
}

async function call<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(\`\${PROXY}\${path}\`, {
    method: init.method ?? "POST",
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } } & T;
  if (!res.ok) {
    const message = res.status === 402
      ? "Créditos de IA esgotados."
      : res.status === 429
        ? "Muitas requisições agora. Tente de novo em instantes."
        : data.error?.message ?? \`Falha na IA (\${res.status}).\`;
    throw new VertalAiError(message, res.status, data.error?.code);
  }
  return data;
}

/** Texto: devolve a resposta do modelo. */
export async function chat(messages: ChatMessage[], opts: { maxTokens?: number; temperature?: number; signal?: AbortSignal } = {}): Promise<string> {
  const data = await call<{ choices?: Array<{ message?: { content?: string } }> }>("/v1/chat/completions", {
    body: { model: "vertal-code-ai", messages, max_tokens: opts.maxTokens, temperature: opts.temperature },
    signal: opts.signal,
  });
  return data.choices?.[0]?.message?.content ?? "";
}

export interface VideoJob {
  id: string;
  status: "processing" | "completed" | "failed";
  video_url?: string;
  message?: string;
}

/** Vídeo: cria o job (202). Use getVideo para acompanhar. */
export async function startVideo(input: { prompt: string; durationSeconds?: number; imageUrl?: string; signal?: AbortSignal }): Promise<VideoJob> {
  return call<VideoJob>("/v1/videos/generations", {
    body: { prompt: input.prompt, duration_seconds: input.durationSeconds ?? 5, ...(input.imageUrl ? { image_url: input.imageUrl } : {}) },
    signal: input.signal,
  });
}

export async function getVideo(id: string, signal?: AbortSignal): Promise<VideoJob> {
  return call<VideoJob>(\`/v1/videos/\${encodeURIComponent(id)}\`, { method: "GET", signal });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Vídeo pronto: cria e espera (até ~15 min). */
export async function generateVideo(input: { prompt: string; durationSeconds?: number; imageUrl?: string; signal?: AbortSignal; onProgress?: (job: VideoJob) => void }): Promise<{ id: string; videoUrl: string }> {
  let job = await startVideo(input);
  for (let i = 0; i < 180 && job.status === "processing"; i++) {
    input.onProgress?.(job);
    await wait(5000);
    job = await getVideo(job.id, input.signal);
  }
  if (job.status !== "completed" || !job.video_url) throw new VertalAiError(job.message ?? "O vídeo não ficou pronto.", 502, "video_failed");
  return { id: job.id, videoUrl: job.video_url };
}

/** Voz: fala um texto com uma voz liberada para a conta. */
export async function speak(input: { voiceId: string; input: string; language?: string; signal?: AbortSignal }): Promise<{ id: string; audioUrl: string }> {
  let job = await call<{ id: string; status: string; audio_url?: string; message?: string }>("/v1/audio/speech", {
    body: { voice_id: input.voiceId, input: input.input, language: input.language ?? "auto" },
    signal: input.signal,
  });
  for (let i = 0; i < 120 && job.status !== "completed" && job.status !== "failed"; i++) {
    await wait(3000);
    job = await call(\`/v1/voice-jobs/\${encodeURIComponent(job.id)}\`, { method: "GET", signal: input.signal });
  }
  if (job.status !== "completed" || !job.audio_url) throw new VertalAiError(job.message ?? "O áudio não ficou pronto.", 502, "speech_failed");
  return { id: job.id, audioUrl: job.audio_url };
}
`;
  const server = `// Vertal AI — proxy do servidor deste app (gerado pelo conector Vertal AI; não edite).
// Para publicar com backend próprio: a chave vem do ambiente do SERVIDOR (VERTAL_AI_API_KEY e
// VERTAL_AI_BASE_URL, entregues pelo Cofre do Vertal) e nunca vai para o navegador.
// No front, aponte VITE_VERTAL_AI_PROXY_URL para .../functions/v1/vertal-ai.
const ALLOWED = new Set(["/v1/models", "/v1/chat/completions", "/v1/videos/generations", "/v1/audio/speech"]);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const key = Deno.env.get("VERTAL_AI_API_KEY");
  const base = (Deno.env.get("VERTAL_AI_BASE_URL") ?? "").replace(/\\/+$/, "");
  if (!key || !base) return Response.json({ error: { message: "Vertal AI não está ativo neste app.", code: "vertal_ai_inactive" } }, { status: 503, headers: cors });
  const path = new URL(req.url).pathname.replace(/^.*\\/vertal-ai/, "") || "/";
  const ok = ALLOWED.has(path) || /^\\/v1\\/(videos|voice-jobs)\\/[A-Za-z0-9_.-]+$/.test(path);
  if (!ok) return Response.json({ error: { message: "Rota não encontrada.", code: "not_found" } }, { status: 404, headers: cors });
  const upstream = await fetch(\`\${base}\${path}\`, {
    method: req.method,
    headers: { Authorization: \`Bearer \${key}\`, "Content-Type": "application/json" },
    body: req.method === "GET" ? undefined : await req.text(),
  });
  return new Response(upstream.body, { status: upstream.status, headers: { ...cors, "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" } });
});
`;
  return [
    { path: VERTAL_AI_PATHS.client, content: client, reason: "Vertal AI: helper de IA do app (texto, vídeo e voz) pelo proxy do projeto, sem chave no navegador" },
    { path: VERTAL_AI_PATHS.server, content: server, reason: "Vertal AI: proxy de servidor para publicar com backend próprio (chave só no ambiente do servidor)" },
  ];
}

// ---------------------------------------------------------------------------
// Requisitos (cartão "Para funcionar, esta aplicação precisa de …")
// ---------------------------------------------------------------------------

const OTHER_AI_SECRETS = new Set([
  "OPENAI_API_KEY", "VITE_OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_AI_API_KEY", "GEMINI_API_KEY", "VITE_GEMINI_API_KEY",
  "DEEPSEEK_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "REPLICATE_API_TOKEN", "ELEVENLABS_API_KEY", "STABILITY_API_KEY",
  "RUNWAY_API_KEY", "LUMA_API_KEY",
]);
const OTHER_AI_NAME = /\b(openai|anthropic|claude|gemini|google ai|deepseek|groq|openrouter|replicate|elevenlabs|stability|runway|luma)\b/i;

export interface RequirementLike {
  slug: string;
  label: string;
  kind: "connector" | "api";
  description: string;
  reason: string;
  secrets: string[];
  builtin: boolean;
  status: "needed" | "connected" | "dismissed";
  connectPath?: string;
}

/**
 * Com o conector em jogo (oferta ou ativo): tira os pedidos de chave de outros provedores de IA
 * (a menos que o Dev tenha pedido um deles) e, ativo, mostra "Vertal AI" como conectado.
 */
export function applyVertalAiToRequirements<T extends RequirementLike>(reqs: T[], state: VertalAiState, prompt: string): T[] {
  if (state.mode === "off") return reqs;
  const keepOthers = explicitlyAsksOtherProvider(prompt);
  const out: T[] = reqs.filter((r) => {
    if (keepOthers) return true;
    if (r.slug === VERTAL_AI_CONNECTOR_SLUG || r.slug === "ai-gateway") return false;
    if (r.secrets.some((s) => OTHER_AI_SECRETS.has(s))) return false;
    // A própria Vertal AI pedida como chave manual (VERTAL_API_KEY etc.): o conector cobre, nunca vira pedido de variável.
    if (r.secrets.some((s) => /^(?:VITE_|NEXT_PUBLIC_)?VERTAL_(?:AI_)?(?:API_KEY|API_URL|BASE_URL)$/.test(s))) return false;
    if (/^custom:.*vertal|vertal[\s-]*(?:ai|api)/i.test(`${r.slug} ${r.label}`)) return false;
    return !(r.slug.startsWith("custom:") && OTHER_AI_NAME.test(`${r.slug} ${r.label}`));
  });
  if (state.mode === "active") {
    out.unshift({
      slug: VERTAL_AI_CONNECTOR_SLUG,
      label: VERTAL_AI_LABEL,
      kind: "connector",
      description: "IA do app (texto, vídeo e voz) com cobrança nos seus créditos Vertal. Chave guardada no Cofre, nunca no código.",
      reason: "O app usa IA.",
      secrets: [],
      builtin: true,
      status: "connected",
      connectPath: "/keys",
    } as T);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ativação idempotente (um projeto, uma chave ativa)
// ---------------------------------------------------------------------------

export interface ConnectorKeyRow {
  id: string;
  created_at: string;
  features: unknown;
}

/** Acesso a dados injetado: a edge function liga no Supabase; os testes, num banco em memória. */
export interface ConnectorDeps {
  /** Chaves ATIVAS (revoked_at null, não expiradas) do dono com features.connector.project = scope. */
  findActiveKeys(ownerId: string, scope: string): Promise<ConnectorKeyRow[]>;
  /** Cria a chave pela MESMA lógica do /keys (limite de chaves, parseNewKey, hash). Devolve a chave inteira uma única vez. */
  createKey(ownerId: string, input: { name: string; monthlyCapCredits: number; rpm: number }, features: ConnectorFeatures): Promise<{ id: string; key: string }>;
  revokeKey(ownerId: string, keyId: string): Promise<void>;
  setFeatures(ownerId: string, keyId: string, features: ConnectorFeatures): Promise<void>;
  /** Grava (cria ou troca) um segredo do Cofre do dono, cifrado. Nunca loga o valor. */
  putSecret(ownerId: string, s: { envKey: string; name: string; boundTo: string; description: string; value: string }): Promise<void>;
  hasSecret(ownerId: string, envKey: string): Promise<boolean>;
  deleteSecret(ownerId: string, envKey: string): Promise<void>;
  newRef(): string;
}

export type EnsureResult =
  | { ok: true; created: boolean; keyId: string; ref: string; proxyUrl: string; video: boolean }
  | { ok: false; status: number; code: string; message: string };

function oldestFirst(rows: ConnectorKeyRow[]): ConnectorKeyRow[] {
  return [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

/**
 * Ativa (ou confirma) o conector do projeto. Idempotente:
 *  - já existe chave ativa com o segredo no Cofre → devolve a mesma, nada é criado;
 *  - duas chaves ativas (corrida de cliques) → fica a mais antiga, as outras são revogadas;
 *  - chave ativa mas o segredo sumiu do Cofre (a chave inteira não pode ser recuperada) → revoga e cria outra;
 *  - falha ao gravar no Cofre → a chave recém-criada é revogada (nada fica pela metade).
 * Cobrança: nenhuma aqui. O uso é cobrado pela API (mesmo caminho do /keys), uma vez por pedido.
 */
export async function ensureProjectConnector(
  deps: ConnectorDeps,
  input: { cfg: ConnectorConfig; ownerId: string; projectId: unknown; projectLabel?: string; needsVideo?: boolean },
): Promise<EnsureResult> {
  const { cfg, ownerId } = input;
  if (!connectorAllowed(cfg, ownerId)) return { ok: false, status: 404, code: "connector_disabled", message: "O conector Vertal AI ainda não está disponível para esta conta." };
  const scope = connectorScope(input.projectId);
  const names = vaultNamesFor(scope);
  const wantVideo = !!input.needsVideo && cfg.video;

  const reconcile = async (): Promise<ConnectorKeyRow | null> => {
    const [keep, ...extra] = oldestFirst(await deps.findActiveKeys(ownerId, scope));
    for (const r of extra) await deps.revokeKey(ownerId, r.id);
    return keep ?? null;
  };

  let row = await reconcile();
  if (row && !(await deps.hasSecret(ownerId, names.apiKey))) {
    await deps.revokeKey(ownerId, row.id);
    row = null;
  }

  if (row) {
    const c = connectorOf(row.features);
    if (!c) {
      // Linha sem metadados (não deveria acontecer): trata como inexistente.
      await deps.revokeKey(ownerId, row.id);
      row = null;
    } else {
      const f = (row.features ?? {}) as ConnectorFeatures;
      let video = f.video === true;
      if (wantVideo && !video) {
        await deps.setFeatures(ownerId, row.id, { ...f, video: true });
        video = true;
      }
      // Base URL pode ter mudado de config: regrava (barato, não é segredo de verdade).
      await deps.putSecret(ownerId, { envKey: names.baseUrl, name: `${VERTAL_AI_LABEL} · URL`, boundTo: names.boundTo, description: "Base URL da Vertal AI para este projeto.", value: cfg.baseUrl });
      return { ok: true, created: false, keyId: row.id, ref: c.ref, proxyUrl: proxyUrlFor(cfg.baseUrl, c.ref), video };
    }
  }

  const ref = deps.newRef();
  const label = (input.projectLabel ?? "").replace(/\s+/g, " ").trim().slice(0, 30) || (scope === "default" ? "projeto padrão" : `projeto ${scope.slice(0, 8)}`);
  const features: ConnectorFeatures = {
    ...(wantVideo ? { video: true } : {}),
    connector: { kind: "project", project: scope, ref, label },
  };
  let created: { id: string; key: string };
  try {
    created = await deps.createKey(ownerId, { name: `${VERTAL_AI_LABEL} · ${label}`.slice(0, 60), monthlyCapCredits: cfg.monthlyCapCredits, rpm: cfg.rpm }, features);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/limite de 10 chaves/i.test(msg)) return { ok: false, status: 409, code: "key_limit", message: "Você já tem 10 chaves ativas. Revogue uma em /keys para ativar a Vertal AI neste projeto." };
    return { ok: false, status: 503, code: "key_create_failed", message: "Não consegui criar a chave da Vertal AI agora. Nada foi cobrado." };
  }

  // Corrida: outro clique criou antes? Fica a mais antiga.
  const winner = await reconcile();
  if (winner && winner.id !== created.id) {
    const c = connectorOf(winner.features);
    if (c && (await deps.hasSecret(ownerId, names.apiKey))) {
      return { ok: true, created: false, keyId: winner.id, ref: c.ref, proxyUrl: proxyUrlFor(cfg.baseUrl, c.ref), video: (winner.features as ConnectorFeatures)?.video === true };
    }
  }

  try {
    await deps.putSecret(ownerId, { envKey: names.apiKey, name: `${VERTAL_AI_LABEL} · ${label}`.slice(0, 80), boundTo: names.boundTo, description: "Chave da Vertal AI deste projeto (criada pelo conector). Revogue em /keys.", value: created.key });
    await deps.putSecret(ownerId, { envKey: names.baseUrl, name: `${VERTAL_AI_LABEL} · URL`, boundTo: names.boundTo, description: "Base URL da Vertal AI para este projeto.", value: cfg.baseUrl });
  } catch {
    await deps.revokeKey(ownerId, created.id).catch(() => {});
    return { ok: false, status: 503, code: "vault_unavailable", message: "Não consegui guardar a chave no Cofre. A chave foi revogada e nada foi cobrado." };
  }
  return { ok: true, created: true, keyId: created.id, ref, proxyUrl: proxyUrlFor(cfg.baseUrl, ref), video: wantVideo };
}

/** Desativa: revoga a(s) chave(s) do projeto e apaga as variáveis do Cofre. */
export async function deactivateProjectConnector(deps: ConnectorDeps, input: { ownerId: string; projectId: unknown }): Promise<{ revoked: number }> {
  const scope = connectorScope(input.projectId);
  const rows = await deps.findActiveKeys(input.ownerId, scope);
  for (const r of rows) await deps.revokeKey(input.ownerId, r.id);
  const names = vaultNamesFor(scope);
  await deps.deleteSecret(input.ownerId, names.apiKey);
  await deps.deleteSecret(input.ownerId, names.baseUrl);
  return { revoked: rows.length };
}

// ---------------------------------------------------------------------------
// Cola com o motor do Vibe Code: tudo devolve "nada" quando o estado é "off"
// ---------------------------------------------------------------------------

/** Bloco extra do prompt do agente. "off" → "" (prompt idêntico ao de antes). */
export function vertalAiPromptBlock(state: VertalAiState): string {
  if (state.mode === "active") return formatVertalAiForPrompt(state);
  if (state.mode === "offer") return VERTAL_AI_OFFER_PROMPT;
  return "";
}

/** Arquivos determinísticos do conector. Só com o conector ativo. */
export function vertalAiFilesFor(state: VertalAiState): GeneratedFile[] {
  return state.mode === "active" ? buildVertalAiFiles({ proxyUrl: state.connector.proxyUrl }) : [];
}

// type (e não interface): o send() do vibe-code-agent recebe Record<string, unknown>.
export type VertalAiStep = {
  kind: "vertal_ai";
  status: "success" | "skipped" | "failed";
  title: string;
  detail?: string;
  vertalAi: { offer?: boolean; active?: boolean; created?: boolean; video?: boolean; needs?: AiNeeds };
};

/** Passos que o chat do Vibe Code mostra (cartão de oferta, conector ativado, helper adicionado). */
export function vertalAiSteps(state: VertalAiState, info: { state?: unknown; created?: boolean; error?: string } = {}): VertalAiStep[] {
  if (info.error) return [{ kind: "vertal_ai", status: "failed", title: "Vertal AI", detail: info.error, vertalAi: { offer: true } }];
  if (state.mode === "offer") {
    return [{
      kind: "vertal_ai",
      status: "skipped",
      title: "Este app usa IA. Ativar a Vertal AI?",
      detail: "Um clique: o projeto ganha a própria chave (guardada no Cofre, fora do código) e o uso sai dos seus créditos Vertal. Nada para configurar.",
      vertalAi: { offer: true, needs: state.needs },
    }];
  }
  if (state.mode === "active") {
    const out: VertalAiStep[] = [];
    if (info.created) {
      out.push({ kind: "vertal_ai", status: "success", title: "Vertal AI ativada neste projeto", detail: "Chave do projeto criada e guardada no Cofre. Revogue quando quiser em /keys.", vertalAi: { active: true, created: true, video: state.connector.video } });
    }
    out.push({
      kind: "vertal_ai",
      status: "success",
      title: "IA do app conectada à Vertal AI",
      detail: `${VERTAL_AI_PATHS.client} fala com o proxy do projeto; a chave nunca vai para o navegador.`,
      vertalAi: { active: true, video: state.connector.video },
    });
    return out;
  }
  return [];
}

/**
 * VERTAL Code AI: anexa a regra da Vertal AI ao PEDIDO (o prompt de sistema não muda), só com a
 * flag ligada para o usuário E o pedido falando de IA. Desligado = o mesmo pedido de sempre.
 */
export function withVertalAiHint(prompt: string, cfg: ConnectorConfig, userId: string | null | undefined): string {
  if (!connectorAllowed(cfg, userId) || !detectAiNeeds(prompt).any || explicitlyAsksOtherProvider(prompt)) return prompt;
  return `${prompt}\n\n[Vertal AI] ${VERTAL_AI_PREFERENCE_RULES} No código de servidor (edge function), leia ${VERTAL_AI_SECRET_API_KEY} e ${VERTAL_AI_SECRET_BASE_URL} do ambiente e chame ${"`${VERTAL_AI_BASE_URL}/v1/chat/completions`"} (modelo "vertal-code-ai") ou /v1/videos/generations; o navegador chama só essa função, nunca a API com a chave.`;
}
