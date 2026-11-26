// VERTAL Code AI · executor da cadeia de modelos (tira o callChain de dentro da edge function para
// poder testar no Vitest com um fetch falso). Sem Deno: rede, ambiente e relógio vêm de fora.
//
// Regras (iguais às de antes, com três ajustes de 26/11/2026):
//   • LLM própria (modelo com `budget`) só entra se couber no orçamento e sem comer o tempo da reserva;
//     se falhar (erro, tempo, JSON ruim), a cadeia segue para o próximo modelo.
//   • [novo] Prazo do 1º token desde o ENVIO quando budget.firstTokenFromStart (GPU serverless a frio):
//     ninguém espera mais que firstTokenMs (60 s na GPU) sem a reserva entrar.
//   • [novo] Saída pedida à própria limitada ao contexto dela (selfHostedOutputTokens); sem espaço, pula.
//   • [novo] 400/413/422 da própria é problema DESTE pedido (ex.: contexto): pula, sem castigar os
//     próximos pedidos com o intervalo de espera.

import { type ModelReply, parseVcaTurn } from "./core.ts";
import {
  estimateCostUsd,
  estimateTokens,
  publicModelInfo,
  requestBody,
  retailCredits,
  selfHostedOutputTokens,
  shouldFallback,
  type VcaChatMessage,
  type VcaEffort,
  type VcaEnv,
  type VcaModel,
  withinSelfHostedBudget,
} from "./router.ts";

/** LLM própria que falhou por erro/tempo fica de fora por este tempo (por isolate). */
export const SELF_HOSTED_COOLDOWN_MS = 60_000;
/** Tempo que sempre sobra para a reserva (grátis/paga) depois de tentar a LLM própria. */
export const FALLBACK_RESERVE_MS = 45_000;

export interface ChainCallOptions {
  json: boolean;
  maxTokens: number;
  effort: VcaEffort;
  /** Instante (ms, Date.now()) em que o pedido inteiro precisa terminar. */
  deadline: number;
}

export interface ChainRunnerDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  env: VcaEnv;
  /** Intervalo de espera da LLM própria (id → até quando fica de fora). Compartilhado entre pedidos. */
  cooldown: Map<string, number>;
  log?: (msg: string) => void;
  warn?: (msg: string) => void;
}

/** Lê o streaming OpenAI-compatível; `onFirst` é chamado no 1º pedaço com texto. */
async function readStream(r: Response, onFirst: () => void): Promise<string> {
  const reader = r.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  let gotFirst = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return out;
      try {
        const piece = JSON.parse(data)?.choices?.[0]?.delta?.content;
        if (typeof piece === "string" && piece) {
          if (!gotFirst) {
            gotFirst = true;
            onFirst();
          }
          out += piece;
        }
      } catch {
        /* pedaço parcial */
      }
    }
  }
  return out;
}

/** Erros de um pedido específico (não do servidor): não castigam os próximos pedidos. */
const requestScoped = (status: number) => status === 400 || status === 413 || status === 422;

export async function runChain(
  chain: VcaModel[],
  messages: VcaChatMessage[],
  opts: ChainCallOptions,
  deps: ChainRunnerDeps,
): Promise<ModelReply> {
  const e = deps.env;
  const failures: string[] = [];
  const inputTokens = estimateTokens(messages);
  for (let i = 0; i < chain.length; i++) {
    const m = chain[i];
    const left = opts.deadline - Date.now();
    if (left < 8_000) break;
    const budget = m.budget;
    let maxTokens = opts.maxTokens;
    if (budget) {
      // LLM própria: só pedidos que cabem, com tempo, e sem comer o tempo da reserva.
      if ((deps.cooldown.get(m.id) ?? 0) > Date.now()) {
        failures.push(`${m.id}:cooldown`);
        continue;
      }
      const ownLeft = Math.min(budget.totalMs, left - FALLBACK_RESERVE_MS);
      if (!withinSelfHostedBudget(m, inputTokens, ownLeft)) {
        failures.push(`${m.id}:skip(${inputTokens}tok)`);
        continue;
      }
      maxTokens = selfHostedOutputTokens(m, inputTokens, opts.maxTokens);
      if (maxTokens <= 0) {
        failures.push(`${m.id}:skip(ctx ${inputTokens}tok)`);
        continue;
      }
    }
    const timeout = budget
      ? Math.min(budget.totalMs, left - FALLBACK_RESERVE_MS)
      : Math.min(left - 3_000, m.provider === "ollama" ? 240_000 : 90_000);
    const key = (e[m.keyEnv] ?? "").trim();
    const abort = new AbortController();
    const totalTimer = setTimeout(() => abort.abort(new DOMException("timeout", "TimeoutError")), timeout);
    let firstTimer: ReturnType<typeof setTimeout> | undefined;
    const armFirst = (ms: number) => {
      firstTimer = setTimeout(() => abort.abort(new DOMException("first token timeout", "TimeoutError")), ms);
    };
    const clearFirst = () => {
      if (firstTimer !== undefined) clearTimeout(firstTimer);
      firstTimer = undefined;
    };
    // GPU serverless: o relógio do 1º token começa no envio (a máquina pode estar subindo a frio).
    if (budget?.firstTokenFromStart) armFirst(Math.min(budget.firstTokenMs, timeout));
    try {
      const reqBody = requestBody(m, messages, { effort: opts.effort, json: opts.json, maxTokens });
      const r = await deps.fetch(m.url, {
        method: "POST",
        signal: abort.signal,
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
          ...(m.provider === "openrouter" ? { "HTTP-Referer": "https://vertal.dev", "X-Title": "VERTAL Code AI" } : {}),
        },
        body: JSON.stringify(m.provider === "openrouter" ? { ...reqBody, usage: { include: true } } : reqBody),
      });
      if (!r.ok) {
        failures.push(`${m.id}:${r.status}`);
        await r.body?.cancel().catch(() => {});
        if (budget && !requestScoped(r.status)) deps.cooldown.set(m.id, Date.now() + SELF_HOSTED_COOLDOWN_MS);
        if (budget || shouldFallback(r.status)) continue;
        break;
      }
      let content: unknown;
      let usage: unknown = {};
      if (reqBody.stream === true && r.body) {
        // Sem "desde o envio": o relógio do 1º token começa agora, na chegada dos cabeçalhos (como antes).
        if (budget && !budget.firstTokenFromStart) armFirst(budget.firstTokenMs);
        else if (!budget) armFirst(timeout);
        content = await readStream(r, clearFirst);
      } else {
        const d = await r.json();
        content = d?.choices?.[0]?.message?.content;
        usage = d?.usage ?? {};
      }
      clearFirst();
      if (typeof content !== "string" || !content.trim()) {
        failures.push(`${m.id}:empty`);
        continue;
      }
      // LLM própria: se não entregou o JSON pedido, a reserva tenta (sem gastar um turno).
      if (budget && opts.json && parseVcaTurn(content).retry) {
        failures.push(`${m.id}:bad_json`);
        continue;
      }
      const u = usage as { prompt_tokens?: number; completion_tokens?: number; cost?: number };
      const costUsd = typeof u.cost === "number"
        ? u.cost
        : estimateCostUsd(m, u.prompt_tokens ?? inputTokens, u.completion_tokens ?? Math.ceil(content.length / 3.5));
      deps.log?.(
        `[vertal-code-ai] ok ${m.id} (${m.provider}/${m.model}) in=${inputTokens} tokens=${JSON.stringify(usage)} ` +
          `cost_usd=${costUsd.toFixed(6)} retail_credits=${retailCredits(costUsd)} (cobrança desligada)` +
          (failures.length ? ` after=${failures.join(",")}` : ""),
      );
      const info = publicModelInfo(m);
      return { content, label: info.label, cost: info.cost, fellBack: failures.some((f) => !f.includes(":skip(")) };
    } catch (err) {
      failures.push(`${m.id}:${err instanceof Error ? err.name : "err"}`);
      if (budget) deps.cooldown.set(m.id, Date.now() + SELF_HOSTED_COOLDOWN_MS);
    } finally {
      clearFirst();
      clearTimeout(totalTimer);
    }
  }
  deps.warn?.(`[vertal-code-ai] chain failed: ${failures.join(",")}`);
  throw new Error("vca_all_models_failed");
}
