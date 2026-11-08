// Vertal Model Router: escolhe o modelo certo para cada pedido do agente.
//
//   pedido → (tipo de tarefa, complexidade) → nota de cada modelo disponível
//          → o melhor custo-benefício + reservas, com o motivo em português
//
// Princípios:
//  1. Só entra quem tem chave configurada na plataforma.
//  2. Cada modelo tem uma nota por tipo de tarefa (1–5). Pedido complexo exige
//     nota mínima mais alta; pedido simples aceita o mais barato que resolve bem.
//  3. A política decide o peso do custo: "economy" pesa muito, "quality" quase nada.
//  4. Aprende com os erros: falhas recentes (ai_gateway_runs) derrubam a nota.
//  5. Transparência: a escolha e o motivo aparecem para o dev; o mesmo modelo
//     segue a tarefa inteira e só troca se o provedor falhar (e isso também aparece).
//
// Sem Deno e sem rede: testável no Vitest. As notas são uma tabela inicial,
// sobrescrevível por env (VIBE_MODEL_OVERRIDES, JSON), para ajustar sem deploy.

// Tipos repetidos de propósito (iguais aos do aiGateway.ts): este módulo não pode
// importar o gateway, que usa Deno e npm:, porque também roda no front-end e no Vitest.
export type TaskKind =
  | "chat"
  | "classify"
  | "docs"
  | "marketing"
  | "code"
  | "debug"
  | "plan"
  | "architecture"
  | "complex";
export type Tier = "flash" | "pro";

export type ModelApi = "openai" | "anthropic";
export type ModelPolicy = "economy" | "balanced" | "quality";

export interface ModelProfile {
  /** Identificador estável no Vertal (também é o nome do provedor nos registros). */
  id: string;
  label: string;
  api: ModelApi;
  url: string;
  /** Variável de ambiente com a chave. Sem ela, o modelo não entra. */
  keyEnv: string;
  /** Env que sobrescreve o ID de modelo do provedor (eles renomeiam com frequência). */
  modelEnv?: string;
  model: string;
  /** USD por 1M de tokens. */
  priceIn: number;
  priceOut: number;
  /** Nota por tipo de tarefa (1–5). Ausente = nota geral. */
  quality: Partial<Record<TaskKind, number>>;
  general: number;
  /** Responde JSON estrito de forma confiável (o agente de código depende disso). */
  reliableJson: boolean;
  /** Multiplicador de créditos cobrados do usuário em relação ao modelo base. */
  creditMultiplier: number;
  /** Só entra na política "quality" (caro demais para o dia a dia). */
  premium?: boolean;
}

export const MODEL_CATALOG: ModelProfile[] = [
  {
    id: "deepseek-chat",
    label: "DeepSeek Chat",
    api: "openai",
    url: "https://api.deepseek.com/chat/completions",
    keyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_MODEL_FLASH",
    model: "deepseek-chat",
    priceIn: 0.27,
    priceOut: 1.1,
    quality: { code: 3.5, debug: 3.2, chat: 3.5, docs: 3.5, classify: 4, marketing: 3.3, plan: 3, architecture: 3, complex: 3 },
    general: 3.4,
    reliableJson: true,
    creditMultiplier: 1,
  },
  {
    id: "deepseek-reasoner",
    label: "DeepSeek Reasoner",
    api: "openai",
    url: "https://api.deepseek.com/chat/completions",
    keyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_MODEL_PRO",
    model: "deepseek-reasoner",
    priceIn: 0.55,
    priceOut: 2.19,
    quality: { code: 4, debug: 4.2, plan: 4.1, architecture: 4, complex: 4, chat: 3.2 },
    general: 3.8,
    reliableJson: true,
    creditMultiplier: 1,
  },
  {
    id: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    api: "anthropic",
    url: "https://api.anthropic.com/v1/messages",
    keyEnv: "ANTHROPIC_API_KEY",
    model: "claude-haiku-5-5",
    priceIn: 0.1,
    priceOut: 0.5,
    quality: { code: 3.8, debug: 3.6, chat: 4, docs: 4, classify: 4.3, marketing: 4, plan: 3.5, architecture: 3.4, complex: 3.4 },
    general: 3.8,
    reliableJson: true,
    creditMultiplier: 1,
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    api: "anthropic",
    url: "https://api.anthropic.com/v1/messages",
    keyEnv: "ANTHROPIC_API_KEY",
    model: "claude-sonnet-5-5",
    priceIn: 2,
    priceOut: 10,
    quality: { code: 4.7, debug: 4.6, chat: 4.5, docs: 4.5, marketing: 4.5, plan: 4.6, architecture: 4.6, complex: 4.6 },
    general: 4.6,
    reliableJson: true,
    creditMultiplier: 3,
  },
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    api: "anthropic",
    url: "https://api.anthropic.com/v1/messages",
    keyEnv: "ANTHROPIC_API_KEY",
    model: "claude-opus-5-5",
    priceIn: 4,
    priceOut: 20,
    quality: { code: 4.9, debug: 4.9, plan: 4.9, architecture: 4.9, complex: 4.9, chat: 4.6 },
    general: 4.8,
    reliableJson: true,
    creditMultiplier: 5,
    premium: true,
  },
  {
    id: "groq-llama-3.3-70b",
    label: "Llama 3.3 70B (Groq)",
    api: "openai",
    url: "https://api.groq.com/openai/v1/chat/completions",
    keyEnv: "GROQ_API_KEY",
    model: "llama-3.3-70b-versatile",
    priceIn: 0.59,
    priceOut: 0.79,
    quality: { chat: 3.3, classify: 3.6, marketing: 3.3, docs: 3, code: 2.6, debug: 2.4 },
    general: 2.8,
    reliableJson: false,
    creditMultiplier: 1,
  },
];

const POLICY_WEIGHTS: Record<ModelPolicy, { quality: number; cost: number }> = {
  economy: { quality: 1, cost: 1.4 },
  balanced: { quality: 2, cost: 1 },
  quality: { quality: 4, cost: 0.1 },
};

/** Nota mínima para entrar na disputa. Pedido "pro" (complexo) exige mais. */
const MIN_QUALITY: Record<Tier, number> = { flash: 3, pro: 4 };

export interface ModelHealth {
  ok: number;
  fail: number;
}

export interface RouteInput {
  kind: TaskKind;
  tier: Tier;
  policy: ModelPolicy;
  /** Variáveis de ambiente com chave configurada. */
  availableKeys: Set<string>;
  /** Saúde recente por id de modelo. */
  health?: Record<string, ModelHealth>;
  /** O agente de código precisa de JSON estrito. */
  needJson?: boolean;
  catalog?: ModelProfile[];
}

export interface RankedModel {
  profile: ModelProfile;
  score: number;
  quality: number;
  /** Custo típico de uma chamada (3 partes de entrada para 1 de saída), em USD por 1M. */
  typicalCost: number;
  failRate: number;
  reason: string;
}

export function qualityFor(p: ModelProfile, kind: TaskKind): number {
  return p.quality[kind] ?? p.general;
}

export function typicalCost(p: ModelProfile): number {
  return (p.priceIn * 3 + p.priceOut) / 4;
}

/**
 * Penalidade por falhas recentes (0 = saudável). Suavizada: uma falha isolada
 * pesa pouco, várias seguidas derrubam o modelo, e sucesso não vira bônus.
 */
export function failRate(h: ModelHealth | undefined): number {
  if (!h) return 0;
  return Math.max(0, (h.fail + 1) / (h.ok + h.fail + 4) - 0.25);
}

function explain(r: Omit<RankedModel, "reason">, input: RouteInput, cheapest: number, best: number): string {
  const parts: string[] = [];
  if (r.typicalCost <= cheapest * 1.05) parts.push("o mais barato");
  if (r.quality >= best - 0.05) parts.push("a melhor qualidade");
  if (!parts.length) parts.push("o melhor equilíbrio entre custo e qualidade");
  const job = input.tier === "pro" ? "tarefa complexa" : "tarefa do dia a dia";
  const health = r.failRate > 0.2 ? "; está instável, por isso tenho reservas" : "";
  return `${parts.join(" e ")} que resolve bem esta ${job} (${KIND_LABEL[input.kind]})${health}`;
}

const KIND_LABEL: Record<TaskKind, string> = {
  chat: "conversa",
  classify: "classificação",
  docs: "documentação",
  marketing: "marketing",
  code: "código",
  debug: "correção de erro",
  plan: "planejamento",
  architecture: "arquitetura",
  complex: "tarefa complexa",
};

/**
 * Ordena os modelos disponíveis do melhor para o pior para este pedido.
 * O primeiro é o escolhido; os seguintes são reservas se o provedor falhar.
 */
export function rankModels(input: RouteInput): RankedModel[] {
  const catalog = input.catalog ?? MODEL_CATALOG;
  const weights = POLICY_WEIGHTS[input.policy];
  // Tarefa simples: o custo pesa mais (não faz sentido pagar caro por uma edição pontual).
  const costWeight = weights.cost * (input.tier === "flash" ? 1.5 : 1);
  const candidates = catalog.filter(
    (p) =>
      input.availableKeys.has(p.keyEnv) &&
      (!input.needJson || p.reliableJson) &&
      (!p.premium || input.policy === "quality"),
  );
  if (!candidates.length) return [];

  const min = MIN_QUALITY[input.tier];
  const strongEnough = candidates.filter((p) => qualityFor(p, input.kind) >= min);
  // Ninguém atinge a nota mínima: melhor usar o que há do que travar o dev.
  const pool = strongEnough.length ? strongEnough : candidates;

  const scored = pool.map((p) => {
    const quality = qualityFor(p, input.kind);
    const cost = typicalCost(p);
    const fr = failRate(input.health?.[p.id]);
    // Custo em escala logarítmica: 10x mais caro pesa como +1 ponto, não como 10.
    const score = quality * weights.quality - Math.log10(Math.max(cost, 0.01)) * costWeight - fr * 6;
    return { profile: p, score, quality, typicalCost: cost, failRate: fr };
  });
  scored.sort((a, b) => b.score - a.score || a.typicalCost - b.typicalCost);

  const cheapest = Math.min(...scored.map((s) => s.typicalCost));
  const best = Math.max(...scored.map((s) => s.quality));
  return scored.map((s) => ({ ...s, reason: explain(s, input, cheapest, best) }));
}

/**
 * Saúde por modelo a partir de ai_gateway_runs. Sucessos vêm de `model`;
 * falhas vêm das tentativas registradas ("<id>:<status>").
 */
export function healthFromRuns(
  rows: Array<{ status?: string | null; model?: string | null; attempts?: unknown }>,
  catalog: ModelProfile[] = MODEL_CATALOG,
): Record<string, ModelHealth> {
  const byModel = new Map(catalog.map((p) => [p.model, p.id]));
  const ids = new Set(catalog.map((p) => p.id));
  const out: Record<string, ModelHealth> = {};
  const bump = (id: string, key: keyof ModelHealth) => {
    out[id] ??= { ok: 0, fail: 0 };
    out[id][key]++;
  };
  for (const row of rows) {
    if (row.status === "ok" && row.model) {
      const id = byModel.get(row.model) ?? (ids.has(row.model) ? row.model : undefined);
      if (id) bump(id, "ok");
    }
    if (Array.isArray(row.attempts)) {
      for (const a of row.attempts) {
        if (typeof a !== "string") continue;
        const [name, result] = a.split(":");
        if (ids.has(name) && result !== "ok" && result !== "hit") bump(name, "fail");
      }
    }
  }
  return out;
}

export function parsePolicy(raw: string | undefined | null): ModelPolicy | "deepseek_only" {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "deepseek_only" || v === "economy" || v === "quality") return v;
  return "balanced";
}

/** Créditos cobrados: o custo base do tier vezes o peso do modelo escolhido. */
export function creditsFor(baseCredits: number, profile: ModelProfile | null | undefined): number {
  return Math.max(1, Math.ceil(baseCredits * (profile?.creditMultiplier ?? 1)));
}

/** Aplica ajustes de notas/preços vindos de env, sem deploy de código. */
export function applyOverrides(catalog: ModelProfile[], raw: string | undefined | null): ModelProfile[] {
  if (!raw) return catalog;
  let parsed: Record<string, Partial<ModelProfile>>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return catalog;
  }
  return catalog.map((p) => {
    const o = parsed?.[p.id];
    if (!o || typeof o !== "object") return p;
    return {
      ...p,
      ...(typeof o.priceIn === "number" ? { priceIn: o.priceIn } : {}),
      ...(typeof o.priceOut === "number" ? { priceOut: o.priceOut } : {}),
      ...(typeof o.general === "number" ? { general: o.general } : {}),
      ...(typeof o.creditMultiplier === "number" ? { creditMultiplier: o.creditMultiplier } : {}),
      ...(o.quality && typeof o.quality === "object" ? { quality: { ...p.quality, ...o.quality } } : {}),
    };
  });
}
