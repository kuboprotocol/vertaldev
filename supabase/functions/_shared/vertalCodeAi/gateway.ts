// VERTAL Code AI — chamada medida à cadeia grátis-primeiro do router.ts, para a
// API de desenvolvedores (vertal-ai-api) e o agente de operação (vertal-code-ai-admin).
// Diferença para o callChain da tela: devolve o USO (tokens) para a cobrança e a
// classe de custo de quem respondeu. Sem Deno: só fetch global (testável no Vitest).
import { requestBody, shouldFallback, type VcaChatMessage, type VcaEffort, type VcaModel } from "./router.ts";

export class GatewayError extends Error {
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

export interface GatewayResult<T> {
  value: T;
  raw: string;
  model: VcaModel;
  attempts: number;
  usage: Usage;
  finishReason: string;
}

export interface GatewayOptions<T> {
  chain: VcaModel[];
  env: Record<string, string | undefined>;
  messages: VcaChatMessage[];
  effort: VcaEffort;
  parse: (raw: string) => T;
  maxTokens: number;
  temperature?: number;
  json?: boolean;
  budgetMs?: number;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function messagesText(messages: VcaChatMessage[]): string {
  return messages.map((m) => (typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "[imagem]")).join(" "))).join("\n");
}

export function readUsage(data: unknown, messages: VcaChatMessage[], raw: string): Usage {
  const u = (data as { usage?: Record<string, unknown> } | null)?.usage;
  const p = Number(u?.prompt_tokens);
  const c = Number(u?.completion_tokens);
  if (Number.isFinite(p) && Number.isFinite(c) && p >= 0 && c >= 0) return { promptTokens: Math.floor(p), completionTokens: Math.floor(c), estimated: false };
  return { promptTokens: estimateTokens(messagesText(messages)), completionTokens: estimateTokens(raw), estimated: true };
}

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

/** Tira blocos de raciocínio/cercas e acha o primeiro objeto JSON balanceado. */
export function extractJson(raw: string): unknown {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1].trim().startsWith("{")) text = fence[1].trim();
  const start = text.indexOf("{");
  if (start < 0) throw new Error("resposta sem JSON");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error("JSON incompleto");
}

/**
 * Tenta a cadeia em ordem (erro HTTP com fallback, timeout, vazio, parse inválido → próximo).
 * A mensagem de erro nunca cita o provedor.
 */
export async function callMetered<T>(o: GatewayOptions<T>): Promise<GatewayResult<T>> {
  const f = o.fetchImpl ?? fetch;
  const log = o.log ?? ((m: string) => console.warn(m));
  const deadline = Date.now() + (o.budgetMs ?? 120_000);
  const errors: string[] = [];
  let attempts = 0;
  for (const m of o.chain) {
    const left = deadline - Date.now();
    if (left < 8_000) break;
    attempts++;
    const key = (o.env[m.keyEnv] ?? "").trim();
    try {
      const r = await f(m.url, {
        method: "POST",
        signal: timeoutSignal(Math.min(left - 3_000, m.provider === "ollama" ? 240_000 : 90_000)),
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
          ...(m.provider === "openrouter" ? { "HTTP-Referer": "https://vertal.dev", "X-Title": "VERTAL Code AI" } : {}),
        },
        body: JSON.stringify(requestBody(m, o.messages, { effort: o.effort, json: !!o.json, maxTokens: o.maxTokens, temperature: o.temperature })),
      });
      if (!r.ok) {
        errors.push(`${m.id}:${r.status}`);
        await r.body?.cancel().catch(() => undefined);
        if (shouldFallback(r.status)) continue;
        break;
      }
      const data = await r.json();
      const content = data?.choices?.[0]?.message?.content;
      const raw = typeof content === "string" ? content : "";
      if (!raw.trim()) {
        errors.push(`${m.id}:vazio`);
        continue;
      }
      let value: T;
      try {
        value = o.parse(raw);
      } catch {
        errors.push(`${m.id}:parse`);
        continue;
      }
      return { value, raw, model: m, attempts, usage: readUsage(data, o.messages, raw), finishReason: String(data?.choices?.[0]?.finish_reason ?? "stop") };
    } catch (e) {
      errors.push(`${m.id}:${e instanceof Error ? e.name : "erro"}`);
    }
  }
  log(`[vertal-code-ai] cadeia esgotada: ${errors.join(", ") || "vazia"}`);
  throw new GatewayError("Os modelos estão ocupados ou no limite de hoje. Tente de novo em alguns minutos.", 503, errors);
}
