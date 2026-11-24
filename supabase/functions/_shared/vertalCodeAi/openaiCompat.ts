// VERTAL AI API — camada compatível com o formato de chat da OpenAI.
// Os modelos públicos são só nomes VERTAL; cada um aponta para um perfil interno
// (cadeia grátis primeiro). Módulo puro.
import type { ProfileId, ReasoningEffort } from "./models.ts";
import type { ChatMessage } from "./protocol.ts";

export interface PublicModel {
  id: string;
  profile: ProfileId;
  description: string;
}

export const PUBLIC_MODELS: PublicModel[] = [
  { id: "vertal-code-ai", profile: "auto", description: "Geral: escolhe o melhor modelo disponível." },
  { id: "vertal-code-ai-coder", profile: "codigo", description: "Focado em código." },
  { id: "vertal-code-ai-reasoning", profile: "raciocinio", description: "Pensa mais antes de responder." },
  { id: "vertal-code-ai-fast", profile: "rapido", description: "Respostas rápidas." },
  { id: "vertal-code-ai-vision", profile: "visao", description: "Entende imagens." },
];

export function modelsList(created: number) {
  return { object: "list", data: PUBLIC_MODELS.map((m) => ({ id: m.id, object: "model", created, owned_by: "vertal" })) };
}

export interface CompatRequest {
  model: PublicModel;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  stream: boolean;
  effort: ReasoningEffort;
  hasImages: boolean;
  user?: string;
}

export class CompatError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "invalid_request_error") {
    super(message);
  }
}

const MAX_MESSAGES = 200;
const MAX_CHARS = 400_000;

/** Valida e normaliza o corpo de /v1/chat/completions. Tools/funções ficam para a fase 2. */
export function parseChatRequest(body: unknown, maxTokensCap: number): CompatRequest {
  if (!body || typeof body !== "object") throw new CompatError("Corpo JSON inválido.");
  const b = body as Record<string, unknown>;
  const model = PUBLIC_MODELS.find((m) => m.id === b.model);
  if (!model) throw new CompatError(`Modelo desconhecido. Use um de: ${PUBLIC_MODELS.map((m) => m.id).join(", ")}.`, 404, "model_not_found");
  if (!Array.isArray(b.messages) || b.messages.length === 0) throw new CompatError("messages é obrigatório.");
  if (b.messages.length > MAX_MESSAGES) throw new CompatError("Mensagens demais.");
  if (b.tools !== undefined || b.functions !== undefined) throw new CompatError("tools/functions ainda não são suportados.", 400, "unsupported_parameter");
  let chars = 0;
  let hasImages = false;
  const messages: ChatMessage[] = b.messages.map((m) => {
    const r = (m ?? {}) as Record<string, unknown>;
    const role = r.role === "system" || r.role === "user" || r.role === "assistant" ? r.role : r.role === "developer" ? "system" : null;
    if (!role) throw new CompatError("role inválido (use system, user ou assistant).");
    if (typeof r.content === "string") {
      chars += r.content.length;
      return { role, content: r.content };
    }
    if (Array.isArray(r.content)) {
      const parts = r.content.map((p) => {
        const pp = (p ?? {}) as Record<string, unknown>;
        if (pp.type === "text" && typeof pp.text === "string") {
          chars += pp.text.length;
          return { type: "text" as const, text: pp.text };
        }
        const url = (pp.image_url as { url?: unknown } | undefined)?.url;
        if (pp.type === "image_url" && typeof url === "string" && /^(https:\/\/|data:image\/(png|jpe?g|webp|gif);base64,)/i.test(url)) {
          hasImages = true;
          chars += Math.min(url.length, 1000);
          return { type: "image_url" as const, image_url: { url } };
        }
        throw new CompatError("Parte de conteúdo não suportada.");
      });
      return { role, content: parts };
    }
    throw new CompatError("content inválido.");
  });
  if (chars > MAX_CHARS) throw new CompatError("Pedido grande demais.", 413);
  const requested = b.max_tokens ?? b.max_completion_tokens;
  const maxTokens = requested === undefined ? Math.min(2048, maxTokensCap) : Number(requested);
  if (!Number.isInteger(maxTokens) || maxTokens < 1) throw new CompatError("max_tokens inválido.");
  const temperature = b.temperature === undefined ? 0.7 : Number(b.temperature);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new CompatError("temperature inválido.");
  const effortRaw = b.reasoning_effort;
  const effort: ReasoningEffort = effortRaw === "low" || effortRaw === "medium" || effortRaw === "high" ? effortRaw : effortRaw === "minimal" || effortRaw === "none" ? "off" : "off";
  return {
    model,
    messages,
    maxTokens: Math.min(maxTokens, maxTokensCap),
    temperature,
    stream: b.stream === true,
    effort,
    hasImages,
    user: typeof b.user === "string" ? b.user.slice(0, 64) : undefined,
  };
}

export interface CompletionOut {
  id: string;
  model: string;
  created: number;
  content: string;
  finishReason: string;
  promptTokens: number;
  completionTokens: number;
  costCredits: number;
}

/** Resposta no formato OpenAI. Nenhum dado do provedor real vaza (id, modelo, fingerprint). */
export function completionResponse(o: CompletionOut) {
  return {
    id: o.id,
    object: "chat.completion",
    created: o.created,
    model: o.model,
    choices: [{ index: 0, message: { role: "assistant", content: o.content }, finish_reason: normalizeFinish(o.finishReason) }],
    usage: { prompt_tokens: o.promptTokens, completion_tokens: o.completionTokens, total_tokens: o.promptTokens + o.completionTokens },
    vertal: { cost_credits: o.costCredits },
  };
}

/** stream=true na fase 1: um único pedaço SSE com o texto inteiro + [DONE] (compatível com SDKs). */
export function completionSse(o: CompletionOut): string {
  const base = { id: o.id, object: "chat.completion.chunk", created: o.created, model: o.model };
  const chunks = [
    { ...base, choices: [{ index: 0, delta: { role: "assistant", content: o.content }, finish_reason: null }] },
    {
      ...base,
      choices: [{ index: 0, delta: {}, finish_reason: normalizeFinish(o.finishReason) }],
      usage: { prompt_tokens: o.promptTokens, completion_tokens: o.completionTokens, total_tokens: o.promptTokens + o.completionTokens },
    },
  ];
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
}

function normalizeFinish(r: string): string {
  return r === "length" || r === "content_filter" ? r : "stop";
}

export function errorBody(message: string, code: string, type = "invalid_request_error") {
  return { error: { message, type, code } };
}

/** Id de pedido estável para idempotência: Idempotency-Key do cliente ou um novo. */
export function requestIdFrom(headers: { get(name: string): string | null }, fallback: string): string {
  const k = headers.get("idempotency-key")?.trim() ?? "";
  return /^[A-Za-z0-9_.:-]{8,128}$/.test(k) ? k : fallback;
}
