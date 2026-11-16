// Vertal Chat: orquestrador v2, parte pura.
//
// Decide QUANDO vale pagar pelo modelo de raciocínio (tier "pro"), conserta a
// saída JSON do modelo antes de desistir, diz quais ações podem rodar em
// paralelo e mantém o contexto dos resultados de ferramentas sob controle.
//
// Puro (sem Deno/DOM nem npm:): roda na edge function `creative-router`, no
// navegador (useVertalChat) e no Vitest.

import { classifyComplexity } from "./complexity.ts";
import type { AgentAction, ToolResult } from "./chatAgent.ts";

export type AgentTier = "flash" | "pro";

export const ORCHESTRATOR_LIMITS = {
  /** Resultados de ferramentas mantidos entre rodadas (antes 8). */
  maxToolResults: 12,
  /** Orçamento total (caracteres) dos resultados enviados ao modelo numa rodada. */
  toolResultsBudgetChars: 36_000,
  /** Piso por resultado: mesmo com muitos, cada um mantém o essencial. */
  minToolResultChars: 900,
  /** Rodadas extras para o agente corrigir uma ferramenta que falhou. */
  maxRepairRounds: 1,
  /** Ações só de leitura rodando juntas. */
  maxParallelActions: 4,
  /** Tarefas independentes do plano rodando juntas. */
  maxParallelPlanTasks: 3,
  /** Tokens de saída por tier (o "pro" pensa antes de responder e precisa de folga). */
  maxTokens: { flash: 3_500, pro: 8_000 } as Record<AgentTier, number>,
} as const;

// ─── Roteamento de modelo ────────────────────────────────────────────────

const ARCHITECTURE_RE = /arquitetur|architecture|\bstack\b|modelagem de dados|database schema|microsservi|microservice|escalabilidade|system design/i;
const CODE_RE = /\bfunction\s+\w+\s*\(|=>\s*\{|\bclass\s+\w+|\bimport\s+[\w{]|<\/?[a-z]+[^>]*>/i;
const STEP_WORDS_RE = /\b(depois|em seguida|ent[aã]o|por fim|finalmente|al[eé]m disso|tamb[eé]m|then|after that|finally)\b/gi;

/**
 * Pedido complexo = vale o modelo de raciocínio na primeira rodada (é quando
 * o agente decide se monta um plano). Heurística barata, sem chamada extra.
 */
export function isComplexRequest(text: string): boolean {
  const t = (text ?? "").trim();
  if (t.length < 40) return false;
  if (classifyComplexity(t) === "pro") return true; // palavras de refatoração/migração ou texto longo
  if (ARCHITECTURE_RE.test(t)) return true;
  if (t.includes("```") || (CODE_RE.test(t) && t.length > 160)) return true; // bloco de código colado
  // Pedido de várias etapas: lista numerada/marcadores ou muitos conectores de sequência.
  const listItems = t.split("\n").filter((l) => /^\s*(\d+[.)]|[-*•])\s+\S/.test(l)).length;
  if (listItems >= 3 && t.length > 120) return true;
  const steps = (t.match(STEP_WORDS_RE) ?? []).length;
  return steps >= 3 && t.length > 300;
}

export interface TierDecision {
  tier: AgentTier;
  reason: "default" | "complex_request" | "plan_synthesis";
}

/**
 * Tier da rodada. O padrão é "flash" (barato); o "pro" só entra onde paga:
 * a síntese final do plano e a primeira rodada de um pedido complexo
 * (quando nasce o plano). Execução de tarefas e rodadas de ferramenta ficam no flash.
 */
export function chooseAgentTier(input: {
  lastUserText: string;
  firstRound: boolean;
  planPhase?: "execute" | "final";
  /** Interruptor (env VERTAL_CHAT_ESCALATION=off): tudo no flash. */
  escalation?: boolean;
}): TierDecision {
  if (input.escalation === false) return { tier: "flash", reason: "default" };
  if (input.planPhase === "final") return { tier: "pro", reason: "plan_synthesis" };
  if (!input.planPhase && input.firstRound && isComplexRequest(input.lastUserText)) {
    return { tier: "pro", reason: "complex_request" };
  }
  return { tier: "flash", reason: "default" };
}

export const otherTier = (tier: AgentTier): AgentTier => (tier === "pro" ? "flash" : "pro");

// ─── Conserto da saída JSON ──────────────────────────────────────────────

export type JsonRepair = "ok" | "repaired" | "truncated";

/** Primeiro objeto JSON balanceado a partir de `start` (respeita strings e escapes). */
function balancedObject(text: string, start: number): { slice: string; complete: boolean } {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return { slice: text.slice(start, i + 1), complete: true };
    }
  }
  return { slice: text.slice(start), complete: false };
}

/** Fecha um JSON cortado no meio (saída que bateu no limite de tokens). */
export function closeTruncatedJson(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const c of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") stack.pop();
  }
  let out = text;
  if (inString) out = out.replace(/\\$/, "") + '"';
  out = out.replace(/[\s,]+$/, "");
  if (/:\s*$/.test(out)) out += "null";
  return out + stack.reverse().join("");
}

const tryParse = (text: string): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch {
    return null;
  }
};

/**
 * Extrai o objeto JSON da resposta do modelo, mesmo dentro de ```json```,
 * com texto antes/depois, vírgula sobrando ou cortado no fim.
 */
export function repairAgentJson(raw: string): { value: Record<string, unknown>; repair: JsonRepair } | null {
  let text = (raw ?? "").trim();
  if (!text) return null;
  const direct = tryParse(text);
  if (direct) return { value: direct, repair: "ok" };

  const fence = /```(?:json|JSON)?\s*([\s\S]*?)(?:```|$)/.exec(text);
  if (fence && fence[1].includes("{")) text = fence[1].trim();
  const start = text.indexOf("{");
  if (start < 0) return null;

  const { slice, complete } = balancedObject(text, start);
  if (complete) {
    const parsed = tryParse(slice) ?? tryParse(slice.replace(/,\s*([}\]])/g, "$1"));
    if (parsed) return { value: parsed, repair: "repaired" };
    // Antigo comportamento: do primeiro "{" ao último "}".
    const end = text.lastIndexOf("}");
    const wide = end > start ? tryParse(text.slice(start, end + 1)) : null;
    if (wide) return { value: wide, repair: "repaired" };
    return null;
  }
  const closed = tryParse(closeTruncatedJson(slice));
  return closed ? { value: closed, repair: "truncated" } : null;
}

/** Último recurso: pega o texto de "reply" de um JSON quebrado. */
export function salvageReply(raw: string): string {
  const m = /"reply"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(raw ?? "");
  if (!m) return "";
  try {
    return (JSON.parse(`"${m[1].replace(/\\$/, "")}"`) as string).trim();
  } catch {
    return m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').trim();
  }
}

/** A resposta parece JSON (mesmo quebrado)? Então não pode virar texto cru na tela. */
export function looksLikeJson(raw: string): boolean {
  const t = (raw ?? "").trim().replace(/^```(?:json)?\s*/i, "");
  return t.startsWith("{") || /"reply"\s*:/.test(t);
}

// ─── Execução das ações ──────────────────────────────────────────────────

/**
 * Ações sem efeito colateral: só leem (busca, página, clima, horário, e-mails,
 * lista de memória/designs). Não pedem aprovação, não cobram, não abrem painel
 * nem criam artefato: podem rodar juntas.
 */
export function isParallelSafe(action: AgentAction): boolean {
  switch (action.tool) {
    case "web_search":
    case "web_read":
    case "weather":
    case "news_feed":
    case "news_weather":
    case "world_time":
    case "gmail_search":
      return true;
    case "memory":
      return action.op === "list";
    case "figcraft":
      return action.op === "list";
    default:
      return false;
  }
}

/**
 * Agrupa as ações na ordem original: leituras seguidas viram um grupo que roda
 * em paralelo; qualquer outra ação fica sozinha, na sua vez.
 */
export function groupActionsForExecution(actions: AgentAction[], maxParallel: number = ORCHESTRATOR_LIMITS.maxParallelActions): AgentAction[][] {
  const groups: AgentAction[][] = [];
  for (const action of actions) {
    const last = groups[groups.length - 1];
    if (isParallelSafe(action) && last && last.length < maxParallel && last.every(isParallelSafe)) last.push(action);
    else groups.push([action]);
  }
  return groups;
}

const NON_RETRYABLE_RE = /cr[eé]ditos?|sess[aã]o expirou|plano ativo|edi[cç][oõ]es do plano|n[aã]o autoriz|j[aá] foi processado|falta salvar no cofre|n[aã]o est[aá] conectad/i;

/** Vale dar ao agente uma rodada para corrigir esta falha (outro termo, outra URL…)? */
export function isRetryableFailure(result: ToolResult): boolean {
  return !result.ok && !NON_RETRYABLE_RE.test(result.summary);
}

/**
 * Mantém os resultados mais recentes e corta cada resumo para o total caber no
 * orçamento: com poucos resultados cada um vai inteiro (até o teto do contrato).
 */
export function budgetToolResults(
  results: ToolResult[],
  opts: { max?: number; totalChars?: number; perResultMax?: number } = {},
): ToolResult[] {
  const max = opts.max ?? ORCHESTRATOR_LIMITS.maxToolResults;
  const total = opts.totalChars ?? ORCHESTRATOR_LIMITS.toolResultsBudgetChars;
  const kept = results.slice(-max);
  if (kept.length === 0) return kept;
  const per = Math.max(ORCHESTRATOR_LIMITS.minToolResultChars, Math.floor(total / kept.length));
  const cap = Math.min(per, opts.perResultMax ?? Number.POSITIVE_INFINITY);
  return kept.map((r) => (r.summary.length > cap ? { ...r, summary: `${r.summary.slice(0, cap - 1)}…` } : r));
}
