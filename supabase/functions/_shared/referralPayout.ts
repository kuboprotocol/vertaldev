// Indique e Ganhe → Vertal Vibe Pay: I/O (Supabase, Stripe, ASAAS).
//
//   recordReferralCommission  -> chamada pelo stripe-webhook a cada compra paga
//   processCommission         -> transfere / libera uma comissão
//   sweepReferralCommissions  -> varredura (cron diário e ativação de conta)
//   handleChargeRefunded      -> estorno do indicado reduz/anula a comissão
//
// Regras puras em referralCommission.ts.

import type Stripe from "npm:stripe@^14";
import type { SupabaseClient } from "npm:@supabase/supabase-js@^2";
import { asaasConfigured, asaasEnv, asaasRoot, mapTransferStatus } from "./asaas.ts";
import {
  availableAt, commissionAfterRefund, INFLIGHT, ledgerRef, ledgerStatusFor, nextStep,
  REFERRAL_HOLD_DAYS, REFERRAL_LABEL, REFERRAL_PAYOUT_CURRENCY,
  type AsaasDest, type CommissionState, type CommissionStatus, type StripeDest,
} from "./referralCommission.ts";

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export function referralHoldDays(): number {
  const v = Number(Deno.env.get("REFERRAL_HOLD_DAYS") ?? "");
  return Number.isFinite(v) && v >= 0 && v <= 120 ? Math.floor(v) : REFERRAL_HOLD_DAYS;
}

const asaasPayoutsEnabled = () => (Deno.env.get("REFERRAL_ASAAS_PAYOUTS_ENABLED") ?? "true").toLowerCase() !== "false";

export interface Settlement {
  chargeId: string | null;
  amountMinor: number | null;   // valor bruto liquidado (moeda da plataforma)
  currency: string | null;
  availableOn: Date | null;
}

/** Valor liquidado no saldo da plataforma (converte USD → BRL pelo câmbio do Stripe). */
export async function resolveSettlement(
  stripe: Stripe,
  ref: { paymentIntent?: string | null; invoice?: string | null; charge?: string | null },
): Promise<Settlement> {
  const empty: Settlement = { chargeId: null, amountMinor: null, currency: null, availableOn: null };
  try {
    let chargeId = ref.charge ?? null;
    if (!chargeId && ref.paymentIntent) {
      const pi = await stripe.paymentIntents.retrieve(ref.paymentIntent);
      chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null;
    }
    if (!chargeId && ref.invoice) {
      const inv = await stripe.invoices.retrieve(ref.invoice);
      const c = (inv as Row).charge;
      chargeId = typeof c === "string" ? c : c?.id ?? null;
      if (!chargeId && (inv as Row).payment_intent) {
        const piId = typeof (inv as Row).payment_intent === "string" ? (inv as Row).payment_intent : (inv as Row).payment_intent.id;
        const pi = await stripe.paymentIntents.retrieve(piId);
        chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null;
      }
    }
    if (!chargeId) return empty;
    const charge = await stripe.charges.retrieve(chargeId, { expand: ["balance_transaction"] });
    const bt = charge.balance_transaction as Stripe.BalanceTransaction | string | null;
    if (!bt || typeof bt === "string") return { ...empty, chargeId };
    return {
      chargeId,
      amountMinor: bt.amount,
      currency: bt.currency,
      availableOn: bt.available_on ? new Date(bt.available_on * 1000) : null,
    };
  } catch (e) {
    console.warn("referral: settlement lookup failed", (e as Error).message);
    return empty;
  }
}

/**
 * Registra a comissão (5%) e a linha no extrato do Vibe Pay, de forma
 * idempotente por sessão/fatura (source_ref), e tenta pagar na hora.
 * Nunca lança: o pagamento do indicado já foi aplicado antes disto.
 */
export async function recordReferralCommission(
  db: Db,
  stripe: Stripe | null,
  input: {
    referredId: string;
    source: "subscription" | "renewal" | "credit_topup";
    sourceRef: string;
    amountMinor: number | null | undefined;
    currency: string | null | undefined;
    settlementRef?: { paymentIntent?: string | null; invoice?: string | null; charge?: string | null };
  },
): Promise<void> {
  if (!input.amountMinor || input.amountMinor <= 0) return;
  try {
    const st = stripe && input.settlementRef ? await resolveSettlement(stripe, input.settlementRef) : null;
    const hold = referralHoldDays();
    const avail = availableAt(new Date(), hold, st?.availableOn ?? null);
    const { data, error } = await db.rpc("record_affiliate_commission", {
      _referred_id: input.referredId,
      _source: input.source,
      _source_ref: input.sourceRef,
      _amount_cents: input.amountMinor,
      _currency: input.currency ?? "usd",
      _settled_minor: st?.amountMinor ?? null,
      _settled_currency: st?.currency ?? null,
      _charge_id: st?.chargeId ?? null,
      _available_at: avail.toISOString(),
    });
    if (error) { console.warn("affiliate commission failed:", error.message); return; }
    if (!(Number(data) > 0)) return;
    console.log(`💸 Affiliate commission ${data} (${input.source} ${input.sourceRef})`);
    const { data: row } = await db.from("affiliate_commissions").select("*").eq("source_ref", input.sourceRef).maybeSingle();
    if (row) await processCommission(db, stripe, row as Row);
  } catch (e) {
    console.warn("affiliate commission failed:", e);
  }
}

async function destinationsFor(db: Db, userId: string): Promise<{ stripe: StripeDest | null; asaas: AsaasDest | null }> {
  const [{ data: ca }, { data: aa }] = await Promise.all([
    db.from("connected_accounts").select("stripe_account_id, country, charges_enabled, payouts_enabled")
      .eq("user_id", userId).maybeSingle(),
    asaasConfigured()
      ? db.from("bank_asaas_accounts").select("wallet_id, status").eq("user_id", userId).eq("env", asaasEnv()).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    stripe: ca ? {
      stripeAccountId: (ca as Row).stripe_account_id ?? null,
      country: (ca as Row).country ?? null,
      chargesEnabled: Boolean((ca as Row).charges_enabled),
      payoutsEnabled: Boolean((ca as Row).payouts_enabled),
    } : null,
    asaas: aa && asaasPayoutsEnabled() ? { walletId: (aa as Row).wallet_id ?? null, status: (aa as Row).status ?? null } : null,
  };
}

function toState(r: Row): CommissionState {
  return {
    status: r.status as CommissionStatus,
    commissionMinor: Number(r.commission_cents ?? 0),
    currency: String(r.commission_currency ?? r.currency ?? "").toLowerCase(),
    availableAt: r.available_at ? new Date(r.available_at) : null,
    payoutProvider: r.payout_provider ?? null,
    payoutRef: r.payout_ref ?? null,
  };
}

/** Atualiza comissão e a linha do extrato juntas. */
async function updateCommission(db: Db, r: Row, patch: Row, ledgerPatch: Row = {}) {
  const now = new Date().toISOString();
  await db.from("affiliate_commissions").update({ ...patch, updated_at: now }).eq("id", r.id);
  const status = (patch.status ?? r.status) as CommissionStatus;
  const lp: Row = { status: ledgerStatusFor(status), updated_at: now, ...ledgerPatch };
  if (patch.payout_provider) lp.provider = patch.payout_provider;
  if (patch.status === "paid") lp.settled_at = now;
  if (r.bank_transaction_id) await db.from("bank_transactions").update(lp).eq("id", r.bank_transaction_id);
}

/** Reserva a comissão para um envio (evita dois envios concorrentes). */
async function claim(db: Db, r: Row, provider: "stripe" | "asaas"): Promise<boolean> {
  const q = db.from("affiliate_commissions")
    .update({ payout_provider: provider, payout_ref: INFLIGHT, last_attempt_at: new Date().toISOString(), payout_attempts: Number(r.payout_attempts ?? 0) + 1 })
    .eq("id", r.id).in("status", ["pending", "approved"]);
  const { data } = await (r.payout_ref === INFLIGHT && r.payout_provider === "stripe"
    ? q.eq("payout_ref", INFLIGHT)
    : q.is("payout_ref", null)).select("id");
  return Boolean(data?.length);
}

async function release(db: Db, r: Row, reason: string) {
  await db.from("affiliate_commissions").update({
    payout_provider: null, payout_ref: null, payout_error: reason.slice(0, 300), updated_at: new Date().toISOString(),
  }).eq("id", r.id).eq("payout_ref", INFLIGHT);
}

/** Executa o próximo passo de uma comissão. Nunca lança. */
export async function processCommission(db: Db, stripe: Stripe | null, r: Row, now = new Date()): Promise<string> {
  try {
    const dest = await destinationsFor(db, r.affiliate_id);
    const step = nextStep(toState(r), dest, now);
    const matured = !r.available_at || new Date(r.available_at).getTime() <= now.getTime();

    switch (step.kind) {
      case "none":
      case "wait":
        return step.kind;
      case "mark_available":
        await updateCommission(db, r, { status: "approved" }, { failure_reason: "Abra sua conta no Vertal Vibe Pay para receber" });
        return "available";
      case "mark_paid":
        await updateCommission(db, r, { status: "paid", paid_at: now.toISOString() }, { failure_reason: null });
        return "paid";
      case "manual_review":
        await db.from("affiliate_commissions").update({ payout_error: "asaas_transfer_unconfirmed_manual_review" }).eq("id", r.id);
        return "manual_review";
      case "check_asaas_transfer": {
        const t = await asaasRoot()<Row>("GET", `/transfers/${r.payout_ref}`);
        const st = mapTransferStatus(String(t.status));
        if (st === "paid") { await updateCommission(db, r, { status: "paid", paid_at: now.toISOString() }, { failure_reason: null }); return "paid"; }
        if (st === "failed" || st === "canceled") {
          await db.from("affiliate_commissions").update({ payout_provider: null, payout_ref: null, payout_error: `asaas_${st}: ${t.failReason ?? ""}`.slice(0, 300) }).eq("id", r.id);
          return "retry_later";
        }
        return "wait";
      }
      case "transfer": {
        if (step.provider === "stripe") {
          if (!stripe) return "no_stripe";
          if (!(await claim(db, r, "stripe"))) return "claimed_elsewhere";
          const acct = dest.stripe!.stripeAccountId!;
          const group = `referral_${r.id}`;
          try {
            const existing = await stripe.transfers.list({ transfer_group: group, limit: 1 });
            const tr = existing.data[0] ?? await stripe.transfers.create({
              amount: Number(r.commission_cents),
              currency: REFERRAL_PAYOUT_CURRENCY,
              destination: acct,
              transfer_group: group,
              ...(r.charge_id ? { source_transaction: r.charge_id } : {}),
              description: `Vertal ${REFERRAL_LABEL} (5%)`,
              metadata: { kind: "referral_commission", commission_id: r.id, source_ref: r.source_ref, affiliate_id: r.affiliate_id },
            }, { idempotencyKey: `referral-commission-${r.id}` });
            await updateCommission(db, r, {
              payout_provider: "stripe", payout_ref: tr.id, payout_error: null,
              ...(matured ? { status: "paid", paid_at: now.toISOString() } : {}),
            }, { failure_reason: null, metadata: { commission_id: r.id, transfer_id: tr.id, destination: acct } });
            return matured ? "paid" : "transferred";
          } catch (e) {
            await release(db, r, `stripe: ${(e as Error).message}`);
            if (matured && r.status !== "approved") await updateCommission(db, { ...r, payout_provider: null }, { status: "approved" });
            return "stripe_failed";
          }
        }
        // ASAAS: transferência interna da conta-pai para o walletId da subconta.
        const api = asaasRoot();
        const value = Number(r.commission_cents) / 100;
        const bal = await api<Row>("GET", "/finance/balance").catch(() => null);
        if (!bal || Number(bal.balance ?? 0) < value) {
          await db.from("affiliate_commissions").update({ payout_error: "asaas_platform_balance_insufficient" }).eq("id", r.id);
          if (r.status !== "approved") await updateCommission(db, r, { status: "approved" });
          return "asaas_no_funds";
        }
        if (!(await claim(db, r, "asaas"))) return "claimed_elsewhere";
        try {
          const t = await api<Row>("POST", "/transfers", {
            body: { value, walletId: dest.asaas!.walletId, description: `Vertal ${REFERRAL_LABEL} ${r.id}`.slice(0, 100) },
          });
          const st = mapTransferStatus(String(t.status));
          await updateCommission(db, r, {
            payout_provider: "asaas", payout_ref: String(t.id), payout_error: null,
            ...(st === "paid" ? { status: "paid", paid_at: now.toISOString() } : { status: "approved" }),
          }, { failure_reason: null, metadata: { commission_id: r.id, asaas_transfer_id: String(t.id) } });
          return st === "paid" ? "paid" : "transferred";
        } catch (e) {
          // Sem resposta confiável não dá para saber se saiu: libera só em erro 4xx.
          const status = Number((e as Row).status ?? 0);
          if (status >= 400 && status < 500) await release(db, r, `asaas: ${(e as Error).message}`);
          return "asaas_failed";
        }
      }
    }
  } catch (e) {
    console.warn("referral: process failed", r.id, (e as Error).message);
    return "error";
  }
}

/** Varre comissões abertas (todas ou de um usuário). */
export async function sweepReferralCommissions(db: Db, stripe: Stripe | null, opts: { userId?: string; limit?: number } = {}) {
  let q = db.from("affiliate_commissions").select("*")
    .in("status", ["pending", "approved"]).gt("commission_cents", 0)
    .order("created_at", { ascending: true }).limit(Math.min(opts.limit ?? 200, 500));
  if (opts.userId) q = q.eq("affiliate_id", opts.userId);
  const { data, error } = await q;
  if (error) { console.warn("referral sweep query failed", error.message); return { processed: 0, results: {} }; }
  const results: Record<string, number> = {};
  for (const r of (data ?? []) as Row[]) {
    const out = await processCommission(db, stripe, r);
    results[out] = (results[out] ?? 0) + 1;
  }
  return { processed: data?.length ?? 0, results };
}

/** Estorno (total/parcial) da compra do indicado: reduz ou anula a comissão. */
export async function handleChargeRefunded(db: Db, stripe: Stripe, charge: Stripe.Charge) {
  const { data } = await db.from("affiliate_commissions").select("*").eq("charge_id", charge.id);
  for (const r of (data ?? []) as Row[]) {
    if (r.status === "void") continue;
    const settled = Number(r.settled_amount_minor ?? r.amount_cents ?? 0);
    const newCommission = commissionAfterRefund(settled, charge.amount, charge.amount_refunded, Number(r.rate ?? 0.05));
    const current = Number(r.commission_cents ?? 0);
    if (newCommission >= current) continue;
    const delta = current - newCommission;
    const patch: Row = { commission_cents: newCommission, refunded_minor: Number(r.refunded_minor ?? 0) + delta };
    if (newCommission === 0) patch.status = "void";

    if (r.payout_provider === "stripe" && r.payout_ref && r.payout_ref !== INFLIGHT) {
      try {
        await stripe.transfers.createReversal(r.payout_ref, {
          amount: delta,
          metadata: { kind: "referral_commission_refund", commission_id: r.id, charge_id: charge.id },
        }, { idempotencyKey: `referral-reversal-${r.id}-${newCommission}` });
      } catch (e) {
        patch.payout_error = `reversal_failed: ${(e as Error).message}`.slice(0, 300);
      }
    } else if (r.payout_provider === "asaas" && r.payout_ref) {
      // Transferência ASAAS não tem estorno automático: fica para revisão.
      patch.payout_error = `asaas_clawback_due:${delta}`;
      delete patch.status;
      delete patch.commission_cents;
    }
    const ledger: Row = newCommission > 0 && patch.commission_cents !== undefined ? { amount_minor: newCommission } : {};
    await updateCommission(db, r, patch, ledger);
  }
}
