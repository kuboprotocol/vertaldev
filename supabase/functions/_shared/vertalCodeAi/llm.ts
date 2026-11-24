// VERTAL Code AI — chamada à cadeia de modelos (grátis primeiro, com fallback).
// Compartilhado pela tela (vertal-code-ai), pela API de desenvolvedores
// (vertal-ai-api) e pelo agente de operação (vertal-code-ai-admin).
// Sem Deno: só fetch global, testável no Vitest com fetch falso.
import { type Backend, type ReasoningEffort, reasoningParams, type ResolvedBackend, shouldFallback } from "./models.ts";
import type { ChatMessage } from "./protocol.ts";

export class ChainError extends Error {
  constructor(message: string, readonly status: number, readonly attempts: string[]) {
    super(message);
  }
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  /** true quando o provedor não informou e estimamos (≈ 4 caracteres por token). */
  estimated: boolean;
}

export interface ChainResult<T> {
  value: T;
  raw: string;
  backend: ResolvedBackend;
  attempts: number;
  usage: Usage;
  finishReason: string;
}

export interface ChainOptions<T> {
  chain: ResolvedBackend[];
  messages: ChatMessage[];
  effort: ReasoningEffort;
  parse: (raw: string) => T;
  /** Chamado só quando um backend pago respondeu (antes de devolver). */
  onPaid?: (b: Backend, usage: Usage) => Promise<void>;
  budgetMs?: number;
  perBackendTimeoutMs?: number;
  /** Limite de saída pedido (o menor entre este e o do backend). */
  maxTokens?: number;
  temperature?: number;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}

export function textOnly(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) =>
    typeof m.content === "string"
      ? m
      : { role: m.role, content: m.content.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("\n") },
  );
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function messagesText(messages: ChatMessage[]): string {
  return messages.map((m) => (typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "[imagem]")).join(" "))).join("\n");
}

export function readUsage(data: unknown, messages: ChatMessage[], raw: string): Usage {
  const u = (data as { usage?: Record<string, unknown> } | null)?.usage;
  const p = Number(u?.prompt_tokens);
  const c = Number(u?.completion_tokens);
  if (Number.isFinite(p) && Number.isFinite(c) && p >= 0 && c >= 0) return { promptTokens: p, completionTokens: c, estimated: false };
  return { promptTokens: estimateTokens(messagesText(messages)), completionTokens: estimateTokens(raw), estimated: true };
}

/**
 * Tenta a cadeia em ordem: erro HTTP, timeout, resposta vazia ou parse inválido
 * passam para o próximo backend. Nunca expõe o nome do backend na mensagem de erro.
 */
export async function callChain<T>(o: ChainOptions<T>): Promise<ChainResult<T>> {
  const f = o.fetchImpl ?? fetch;
  const log = o.log ?? ((m: string) => console.warn(m));
  const deadline = Date.now() + (o.budgetMs ?? 130_000);
  const errors: string[] = [];
  let attempts = 0;
  for (const b of o.chain) {
    const left = deadline - Date.now();
    if (left < 10_000) break;
    attempts++;
    const body: Record<string, unknown> = {
      model: b.model,
      messages: b.vision ? o.messages : textOnly(o.messages),
      temperature: o.temperature ?? 0.2,
      max_tokens: Math.min(b.maxTokens, o.maxTokens ?? b.maxTokens),
      ...reasoningParams(b, o.effort),
    };
    const headers: Record<string, string> = { "Content-Type": "application/json", ...(b.headers ?? {}) };
    if (b.key) headers.Authorization = `Bearer ${b.key}`;
    try {
      const r = await f(b.url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.min(o.perBackendTimeoutMs ?? 90_000, left - 5000)),
      });
      if (!r.ok) {
        errors.push(`${b.name}:${r.status}`);
        log(`[vertal-code-ai] ${b.name} HTTP ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
        if (shouldFallback(r.status)) continue;
        break;
      }
      const data = await r.json();
      const content = data?.choices?.[0]?.message?.content;
      const raw = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: { text?: string }) => c?.text ?? "").join("") : "";
      if (!raw.trim()) {
        errors.push(`${b.name}:vazio`);
        continue;
      }
      let value: T;
      try {
        value = o.parse(raw);
      } catch {
        errors.push(`${b.name}:parse`);
        continue;
      }
      const usage = readUsage(data, o.messages, raw);
      if (b.cost === "paid" && o.onPaid) await o.onPaid(b, usage);
      return { value, raw, backend: b, attempts, usage, finishReason: String(data?.choices?.[0]?.finish_reason ?? "stop") };
    } catch (e) {
      if (e instanceof ChainError) throw e;
      const name = e instanceof Error ? e.name : "";
      if (name !== "TimeoutError" && name !== "AbortError" && name !== "TypeError") throw e;
      errors.push(`${b.name}:${name === "TypeError" ? "rede" : "timeout"}`);
    }
  }
  log(`[vertal-code-ai] cadeia esgotada: ${errors.join(", ") || "vazia"}`);
  if (!o.chain.length) throw new ChainError("Nenhum modelo do VERTAL Code AI está configurado neste servidor.", 503, errors);
  throw new ChainError("Os modelos estão ocupados ou no limite de hoje. Tente de novo em alguns minutos ou escolha outro perfil.", 503, errors);
}
