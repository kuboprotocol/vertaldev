// VERTAL Code AI — tabela de preços em créditos (configurável, nunca fixa no código).
//
// Duas superfícies:
//  • Dentro do Vertal (Vibe Code / VERTAL Code AI / Vertal Chat): preço de varejo
//    em créditos INTEIROS por ação (planejar, construir, sandbox), por classe de custo.
//  • API de desenvolvedores (/v1/chat/completions): preço FRACIONÁRIO por token.
//    A conta é feita em microcréditos (1 crédito = 1.000.000 µc); o saldo do
//    desenvolvedor (inteiro, subscriptions.edits_*) é debitado quando a fração
//    acumulada passa de 1 crédito ("carry"), com idempotência por pedido.
//
// Os padrões vêm do custo real do modelo + sobrecusto de infraestrutura, vezes a
// margem, convertidos pelo valor de referência do crédito. Tudo pode ser trocado
// por env (VERTAL_CODE_AI_PRICING, JSON parcial) sem deploy de código.
// Módulo puro: Vitest, navegador e edge function.
import type { CostClass } from "./models.ts";

export const MICRO = 1_000_000;

export interface TokenPrice {
  /** Custo real do provedor, USD por 1M de tokens (referência para o padrão). */
  underlyingUsdInPerM: number;
  underlyingUsdOutPerM: number;
  /** Preço final, créditos por 1M de tokens. Se ausente, é derivado do custo real. */
  creditsInPerM?: number;
  creditsOutPerM?: number;
}

export interface PricingConfig {
  version: string;
  /** Valor de referência de 1 crédito em USD (o menor preço pago por crédito nos planos). */
  usdPerCredit: number;
  /** Margem sobre o custo real (1.5 = +50%). */
  margin: number;
  /** Sobrecusto de infraestrutura (edge, banda, logs), USD por 1M de tokens. */
  infraUsdPerM: number;
  /** Taxa fixa por pedido da API, em créditos (cobre o roteamento e a cobrança). */
  apiRequestFeeCredits: number;
  /** Preço por token na API, por classe de custo do backend que respondeu. */
  api: Record<Exclude<CostClass, "custom">, TokenPrice>;
  /** Varejo dentro do Vertal, créditos inteiros por ação. */
  inApp: {
    plan: Record<CostClass, number>;
    build: Record<CostClass, number>;
    /** Rodadas de auto-correção: incluídas no "build" quando 0. */
    fixRound: Record<CostClass, number>;
    sandboxRun: number;
  };
  /** Limites padrão de uma chave nova (créditos por mês, pedidos por minuto). */
  keyDefaults: { monthlyCapCredits: number; rpm: number; maxTokens: number };
}

/**
 * Padrões sugeridos (24/11/2026). Raciocínio na docs/VERTAL-CODE-AI.md:
 *  - crédito de referência US$ 0,03 (Starter: US$ 4,99 / ~150 créditos no mês ≈ US$ 0,033);
 *  - grátis: custo de modelo zero, só infra (US$ 0,05/M) — preço baixo de propósito;
 *  - servidor próprio: VM Ampere paga (4 OCPU/24 GB ≈ US$ 0,04/h a ~6 tok/s ≈ US$ 1,85/M de saída);
 *  - pago: tabela pública do provedor no dia (confira antes de ligar).
 */
export const DEFAULT_PRICING: PricingConfig = {
  version: "2026-11-24",
  usdPerCredit: 0.03,
  margin: 1.5,
  infraUsdPerM: 0.05,
  apiRequestFeeCredits: 0.001,
  api: {
    free: { underlyingUsdInPerM: 0, underlyingUsdOutPerM: 0 },
    self_hosted: { underlyingUsdInPerM: 0.2, underlyingUsdOutPerM: 1.85 },
    paid: { underlyingUsdInPerM: 0.27, underlyingUsdOutPerM: 1.1 },
  },
  inApp: {
    plan: { free: 0, self_hosted: 0, custom: 0, paid: 1 },
    build: { free: 1, self_hosted: 1, custom: 0, paid: 4 },
    fixRound: { free: 0, self_hosted: 0, custom: 0, paid: 2 },
    sandboxRun: 0,
  },
  keyDefaults: { monthlyCapCredits: 100, rpm: 20, maxTokens: 8192 },
};

function isNum(v: unknown, min = 0): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min;
}

function mergeDeep<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const cur = out[k];
    if (cur && typeof cur === "object" && !Array.isArray(cur)) out[k] = mergeDeep(cur, v);
    else if (k in out ? typeof v === typeof cur : typeof v === "number") out[k] = v;
  }
  return out as T;
}

/** Valida a tabela: número negativo, margem < 1 ou crédito ≤ 0 derrubam para o padrão. */
export function validatePricing(p: PricingConfig): string[] {
  const errs: string[] = [];
  if (!isNum(p.usdPerCredit) || p.usdPerCredit <= 0) errs.push("usdPerCredit deve ser > 0");
  if (!isNum(p.margin, 1)) errs.push("margin deve ser ≥ 1 (nunca vender abaixo do custo)");
  if (!isNum(p.infraUsdPerM)) errs.push("infraUsdPerM inválido");
  if (!isNum(p.apiRequestFeeCredits)) errs.push("apiRequestFeeCredits inválido");
  for (const [cls, tp] of Object.entries(p.api)) {
    for (const k of ["underlyingUsdInPerM", "underlyingUsdOutPerM", "creditsInPerM", "creditsOutPerM"] as const) {
      if (tp[k] !== undefined && !isNum(tp[k])) errs.push(`api.${cls}.${k} inválido`);
    }
  }
  for (const group of ["plan", "build", "fixRound"] as const) {
    for (const [cls, v] of Object.entries(p.inApp[group])) if (!isNum(v) || !Number.isInteger(v)) errs.push(`inApp.${group}.${cls} deve ser inteiro ≥ 0`);
  }
  if (!isNum(p.inApp.sandboxRun) || !Number.isInteger(p.inApp.sandboxRun)) errs.push("inApp.sandboxRun deve ser inteiro ≥ 0");
  return errs;
}

/** Tabela efetiva: padrão + sobrescrita por env. Sobrescrita inválida é ignorada inteira. */
export function loadPricing(raw: string | undefined): { pricing: PricingConfig; errors: string[] } {
  if (!raw) return { pricing: DEFAULT_PRICING, errors: [] };
  try {
    const merged = mergeDeep(DEFAULT_PRICING, JSON.parse(raw));
    const errors = validatePricing(merged);
    return errors.length ? { pricing: DEFAULT_PRICING, errors } : { pricing: merged, errors: [] };
  } catch {
    return { pricing: DEFAULT_PRICING, errors: ["VERTAL_CODE_AI_PRICING não é JSON válido"] };
  }
}

/** Créditos por 1M de tokens (entrada e saída) para uma classe. */
export function creditsPerM(p: PricingConfig, cls: CostClass): { inPerM: number; outPerM: number } {
  const tp = p.api[cls === "custom" ? "free" : cls];
  const derive = (usd: number) => ((usd + p.infraUsdPerM) * p.margin) / p.usdPerCredit;
  return {
    inPerM: tp.creditsInPerM ?? round6(derive(tp.underlyingUsdInPerM)),
    outPerM: tp.creditsOutPerM ?? round6(derive(tp.underlyingUsdOutPerM)),
  };
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Custo de um pedido da API em microcréditos (inteiro, arredondado para cima). */
export function apiCostMicro(p: PricingConfig, cls: CostClass, promptTokens: number, completionTokens: number): number {
  const { inPerM, outPerM } = creditsPerM(p, cls);
  const pt = Math.max(0, Math.floor(promptTokens));
  const ct = Math.max(0, Math.floor(completionTokens));
  // créditos/M × tokens = créditos × 1e6 / 1e6 → em µc: créditos/M × tokens.
  const micro = inPerM * pt + outPerM * ct + p.apiRequestFeeCredits * MICRO;
  return Math.ceil(micro - 1e-9);
}

/** Pior caso de um pedido (para checar saldo e teto antes de chamar o modelo). */
export function apiMaxCostMicro(p: PricingConfig, cls: CostClass, promptTokens: number, maxTokens: number): number {
  return apiCostMicro(p, cls, promptTokens, maxTokens);
}

/** A classe mais cara que a cadeia pode usar (define o pior caso). */
export function worstClass(classes: CostClass[]): CostClass {
  const order: CostClass[] = ["paid", "self_hosted", "custom", "free"];
  return order.find((c) => classes.includes(c)) ?? "free";
}

/**
 * Acumula a fração: débito inteiro quando passa de 1 crédito.
 * Invariante: débitos × 1e6 + carryFinal = carryInicial + custo.
 */
export function settleCarry(carryMicro: number, costMicro: number): { debitCredits: number; carryMicro: number } {
  if (!Number.isInteger(carryMicro) || !Number.isInteger(costMicro) || carryMicro < 0 || costMicro < 0) {
    throw new Error("valores de microcrédito devem ser inteiros ≥ 0");
  }
  const total = carryMicro + costMicro;
  const debit = Math.floor(total / MICRO);
  return { debitCredits: debit, carryMicro: total - debit * MICRO };
}

export interface SpendCheckInput {
  balanceCredits: number;
  carryMicro: number;
  maxCostMicro: number;
  keySpentMicroThisMonth: number;
  keyMonthlyCapCredits: number | null;
}

export type SpendCheck = { ok: true } | { ok: false; status: 402 | 429; code: "insufficient_credits" | "spend_cap_reached"; message: string };

/** Antes de chamar o modelo: há saldo para o pior caso? O teto mensal da chave comporta? */
export function checkSpend(i: SpendCheckInput): SpendCheck {
  const { debitCredits } = settleCarry(i.carryMicro, i.maxCostMicro);
  if (debitCredits > i.balanceCredits) {
    return { ok: false, status: 402, code: "insufficient_credits", message: "Créditos insuficientes na conta Vertal desta chave." };
  }
  if (i.keyMonthlyCapCredits !== null && i.keySpentMicroThisMonth + i.maxCostMicro > i.keyMonthlyCapCredits * MICRO) {
    return { ok: false, status: 429, code: "spend_cap_reached", message: "Esta chave atingiu o teto de gasto do mês." };
  }
  return { ok: true };
}

export type InAppAction = "plan" | "build" | "fixRound" | "sandboxRun";

/** Preço de varejo (créditos inteiros) de uma ação dentro do Vertal. */
export function inAppCredits(p: PricingConfig, action: InAppAction, cls: CostClass): number {
  if (action === "sandboxRun") return p.inApp.sandboxRun;
  return p.inApp[action][cls] ?? 0;
}

/** Linhas para a página de preços / docs (créditos por 1M tokens, 4 casas). */
export function priceSheet(p: PricingConfig): Array<{ cls: string; inPerM: number; outPerM: number; usdInPerM: number; usdOutPerM: number }> {
  return (Object.keys(p.api) as Array<keyof PricingConfig["api"]>).map((cls) => {
    const { inPerM, outPerM } = creditsPerM(p, cls);
    return { cls, inPerM: Math.round(inPerM * 1e4) / 1e4, outPerM: Math.round(outPerM * 1e4) / 1e4, usdInPerM: round6(inPerM * p.usdPerCredit), usdOutPerM: round6(outPerM * p.usdPerCredit) };
  });
}
