// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any -- cliente Supabase sem tipos gerados nas edge functions */
// VERTAL · cobrança v2 em tempo de execução (Deno). Usa as tabelas/RPC propostas em
// docs/vertal-code-ai/proposed-migration-billing-v2.sql (NÃO aplicadas). Tudo atrás de flags
// desligadas; sem as tabelas, a cobrança v2 falha FECHADA (nada é cobrado, o pedido segue).
import {
  type BillingChannel,
  type BillingConfig,
  type BillingFlags,
  type BillingKind,
  freeAllowanceDecision,
  freeWindowKey,
  isPriceError,
  MICRO,
  priceRequest,
  summarizeUsage,
  type UsageRow,
} from "./billing.ts";
import { maybeNotifyLowCredit } from "./lowCreditNotice.ts";
import { makeLowCreditDeps } from "./lowCreditAdapters.ts";
import type { CrmEngine } from "./lowCreditNotice.ts";

export interface ChargeInput {
  userId: string;
  channel: BillingChannel;
  kind: BillingKind;
  costUsd: number;
  /** Único por pedido (idempotência do registro e do débito). */
  requestKey: string;
  meta?: Record<string, unknown>;
}

export interface ChargeOutcome {
  status: "free" | "charged" | "accrued" | "blocked" | "failed";
  code?: string;
  credits: number;
  debitedCredits: number;
  balanceAfter: number | null;
  markup: number | null;
  freeRemaining?: number;
}

export interface BillingRuntime {
  admin: any;
  cfg: BillingConfig;
  flags: BillingFlags;
  engine: CrmEngine | null;
  env: (k: string) => string | undefined;
  now?: () => Date;
}

/** Quantas mensagens grátis a conta já usou na janela atual. */
async function freeUsed(rt: BillingRuntime, userId: string, windowKey: string): Promise<number | null> {
  const { count, error } = await rt.admin
    .from("vertal_billing_ledger")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("free", true)
    .eq("free_window", windowKey);
  return error ? null : count ?? 0;
}

/** Registra o pedido no extrato e acumula/debita. Idempotente por requestKey. */
export async function chargeUsage(rt: BillingRuntime, i: ChargeInput): Promise<ChargeOutcome> {
  const price = priceRequest(rt.cfg, { channel: i.channel, kind: i.kind, costUsd: i.costUsd });
  if (isPriceError(price)) return { status: "blocked", code: price.code, credits: 0, debitedCredits: 0, balanceAfter: null, markup: null };

  // Grátis do varejo (só os tipos configurados). A RPC reconta sob trava, então duas abas
  // simultâneas não passam do limite; sem a tabela, nunca é grátis.
  let wantFree = false;
  let freeRemaining: number | undefined;
  let windowKey: string | null = null;
  if (rt.flags.freeAllowance && i.channel === "retail" && rt.cfg.freeAllowance.kinds.includes(i.kind)) {
    windowKey = freeWindowKey(rt.cfg.freeAllowance.period, (rt.now ?? (() => new Date()))(), rt.cfg.freeAllowance.timeZone);
    const used = await freeUsed(rt, i.userId, windowKey);
    if (used !== null) {
      const d = freeAllowanceDecision(rt.cfg, { channel: i.channel, kind: i.kind, usedInWindow: used });
      wantFree = d.free;
      freeRemaining = d.remainingAfter;
    }
  }

  const { data: rec, error } = await rt.admin.rpc("vertal_billing_record", {
    _user_id: i.userId,
    _channel: i.channel,
    _kind: i.kind,
    _request_key: i.requestKey,
    _cost_usd: price.costUsd,
    _billed_cost_usd: price.billedCostUsd,
    _floor_applied: price.floorApplied,
    _markup: price.markup,
    _credits_micro: price.micro,
    _free_requested: wantFree,
    _free_window: wantFree ? windowKey : null,
    _free_limit: rt.cfg.freeAllowance.count,
    _meta: { ...(i.meta ?? {}), pricing_version: rt.cfg.version },
  });
  if (error || !rec) {
    console.error("[billing] registro falhou (nada cobrado):", error?.message ?? "sem resposta");
    return { status: "failed", code: "metering_unavailable", credits: 0, debitedCredits: 0, balanceAfter: null, markup: price.markup };
  }
  if (rec.free === true) return { status: "free", credits: 0, debitedCredits: 0, balanceAfter: null, markup: price.markup, freeRemaining };
  const credits = price.micro / MICRO;

  const debit = Number(rec.debit_credits ?? 0);
  if (debit <= 0) return { status: "accrued", credits, debitedCredits: 0, balanceAfter: null, markup: price.markup };

  const { data: d, error: chErr } = await rt.admin.rpc("execute_atomic_credit_deduction", {
    _user_id: i.userId,
    _amount: debit,
    _reason: `vertal_billing:${i.channel}:${i.kind}`,
    _category: i.channel === "wholesale" ? "vertal_ai_api" : "vertal_code_ai",
    _metadata: { usage_id: rec.usage_id, kind: i.kind, markup: price.markup },
    _idempotency_key: `vbill-${rec.usage_id}`,
  });
  if (chErr || d?.success === false) {
    await rt.admin.from("vertal_billing_ledger").update({ charge_status: "owed" }).eq("id", rec.usage_id);
    return { status: "failed", code: "insufficient_credits", credits, debitedCredits: 0, balanceAfter: 0, markup: price.markup };
  }
  await rt.admin.from("vertal_billing_ledger").update({ charge_status: "charged" }).eq("id", rec.usage_id);
  const balanceAfter = typeof d?.balance_after === "number" ? d.balance_after : null;
  if (balanceAfter !== null) await notifyIfLow(rt, i.userId, balanceAfter);
  return { status: "charged", credits, debitedCredits: debit, balanceAfter, markup: price.markup };
}

/** Aviso de crédito baixo (uma vez por recarga). Nunca lança. */
export async function notifyIfLow(rt: BillingRuntime, userId: string, balanceCredits: number) {
  return await maybeNotifyLowCredit(
    rt.cfg,
    { enabled: rt.flags.lowCredit, email: rt.flags.lowCreditEmail, crm: rt.flags.lowCreditCrm },
    makeLowCreditDeps(rt.admin, rt.cfg, { engine: rt.engine, env: rt.env }),
    { userId, balanceCredits },
  );
}

/** Extrato do próprio cliente (varejo + API), últimos `days` dias. */
export async function usageStatement(admin: any, userId: string, days = 30) {
  const since = new Date(Date.now() - Math.min(Math.max(days, 1), 365) * 86_400_000).toISOString();
  const [{ data: ledger, error: e1 }, { data: api, error: e2 }] = await Promise.all([
    admin.from("vertal_billing_ledger").select("channel, kind, credits_micro, markup, free, created_at").eq("user_id", userId).gte("created_at", since).limit(5000),
    admin.from("vertal_ai_usage").select("kind, cost_micro, markup, created_at").eq("owner_id", userId).gte("created_at", since).limit(5000),
  ]);
  const rows: UsageRow[] = [
    ...((ledger ?? []) as UsageRow[]),
    // Linhas da API sem v2 (sem kind/markup) entram como "code" sem markup conhecido.
    ...((api ?? []) as any[]).map((r) => ({ channel: "wholesale" as const, kind: r.kind ?? "code", cost_micro: r.cost_micro, markup: r.markup ?? null })),
  ];
  return { since, available: !e1 || !e2, ...summarizeUsage(rows) };
}

/** Avisos in-app do cliente (não lidos primeiro). */
export async function listNotices(admin: any, userId: string) {
  const { data, error } = await admin
    .from("vertal_billing_notices")
    .select("id, kind, title, body, locale, created_at, read_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  return error ? [] : data ?? [];
}

export async function markNoticeRead(admin: any, userId: string, id: unknown) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return false;
  const { error } = await admin.from("vertal_billing_notices").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
  return !error;
}
