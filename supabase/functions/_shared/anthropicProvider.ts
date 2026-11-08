// Provedor Claude (Anthropic) para o Vertal AI Gateway, pelo SDK oficial.
//
// O gateway fala o formato de chat (system/user/assistant). Aqui ele vira o
// formato da Messages API: system separado, primeira mensagem sempre do
// usuário, sem mensagem final do assistente (prefill não é aceito).
// Não envia temperature (a API atual recusa); a profundidade vem de `effort`.
// Opus 5.5 e Sonnet 5.5 usam o fallback do servidor ("default") para recusas.
import Anthropic from "npm:@anthropic-ai/sdk@1";
import type { Msg, Usage } from "./aiGateway.ts";

export type Effort = "low" | "medium" | "high";

export interface AnthropicCall {
  key: string;
  model: string;
  messages: Msg[];
  maxTokens: number;
  json: boolean;
  effort: Effort;
  fetch?: typeof fetch;
}

export interface AnthropicOutcome {
  content: string;
  usage: Usage | null;
  servedModel: string;
}

/** Falha do provedor com o motivo que o gateway usa para decidir a reserva. */
export class ProviderCallError extends Error {
  constructor(message: string, readonly status: number | "network" | "refusal") {
    super(message);
  }
}

const SERVER_FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

type ApiMsg = { role: "user" | "assistant"; content: string };

/** Converte o chat do gateway para a Messages API. Puro, para teste. */
export function toAnthropicMessages(messages: Msg[], json: boolean): { system: string; messages: ApiMsg[] } {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const out: ApiMsg[] = [];
  for (const m of messages) {
    if (m.role === "system" || !m.content.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else out.push({ role: m.role, content: m.content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  while (out.length && out[out.length - 1].role !== "user") out.pop();
  const jsonRule = json ? "\n\nResponda somente com o objeto JSON pedido, sem nenhum texto fora dele." : "";
  return { system: system + jsonRule, messages: out };
}

export async function callAnthropic(call: AnthropicCall): Promise<AnthropicOutcome> {
  const client = new Anthropic({ apiKey: call.key, maxRetries: 0, timeout: 120_000, fetch: call.fetch });
  const { system, messages } = toAnthropicMessages(call.messages, call.json);
  if (!messages.length) throw new ProviderCallError("empty_conversation", 400);

  try {
    const base = {
      model: call.model,
      max_tokens: call.maxTokens,
      system,
      messages,
      output_config: { effort: call.effort },
    };
    const res = SERVER_FALLBACK_MODELS.has(call.model)
      ? await client.beta.messages.create({
          ...base,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        })
      : await client.beta.messages.create(base);

    if (res.stop_reason === "refusal") throw new ProviderCallError("refusal", "refusal");
    const content = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return {
      content,
      usage: { prompt_tokens: res.usage.input_tokens, completion_tokens: res.usage.output_tokens },
      servedModel: res.model,
    };
  } catch (err) {
    if (err instanceof ProviderCallError) throw err;
    if (err instanceof Anthropic.APIConnectionError) throw new ProviderCallError("network", "network");
    if (err instanceof Anthropic.APIError) throw new ProviderCallError(`anthropic_${err.status}`, err.status ?? "network");
    throw err;
  }
}
