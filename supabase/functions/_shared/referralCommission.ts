// Indique e Ganhe → Vertal Vibe Pay: regras puras (sem I/O), usadas pelas
// Edge Functions e pelos testes (vitest). O I/O fica em referralPayout.ts.
//
// Regra do programa (migration 20260927020000_affiliate_commissions.sql):
// quem indicou ganha 5% de tudo que o indicado pagar (planos, renovações e
// créditos). A comissão é calculada sobre o valor que o Stripe liquidou na
// conta da plataforma (BRL), não sobre o preço em USD da vitrine.

/** Taxa da comissão de afiliado. Igual a `_rate` em record_affiliate_commission. */
export const REFERRAL_RATE = 0.05;

/** Carência padrão antes de a comissão ficar disponível (janela de estorno). */
export const REFERRAL_HOLD_DAYS = 30;

/** Moeda em que a plataforma (conta Stripe BR) liquida e paga comissões. */
export const REFERRAL_PAYOUT_CURRENCY = "brl";

/** Prefixo do provider_ref da linha no extrato (bank_transactions). */
export const REFERRAL_LEDGER_PREFIX = "referral:";

/** Rótulo do extrato do Vibe Pay. */
export const REFERRAL_LABEL = "Indique e Ganhe";

export type CommissionStatus = "pending" | "approved" | "paid" | "void";
export type LedgerStatus = "pending" | "available" | "paid" | "refunded";
export type PayoutProvider = "stripe" | "asaas";

/** 5% arredondado para baixo, em unidades mínimas (centavos). */
export function commissionMinor(amountMinor: number, rate = REFERRAL_RATE): number {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return 0;
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  // Evita erro de ponto flutuante (ex.: 4999 * 0.05 = 249.95000000000002).
  return Math.floor(Math.round(amountMinor * rate * 1e6) / 1e6);
}

/**
 * Comissão depois de estorno: proporcional ao que sobrou da cobrança.
 * `settledMinor` é o valor liquidado (BRL) sobre o qual a comissão nasceu;
 * `chargeAmount`/`amountRefunded` vêm do charge do Stripe (na moeda dele).
 */
export function commissionAfterRefund(
  settledMinor: number,
  chargeAmount: number,
  amountRefunded: number,
  rate = REFERRAL_RATE,
): number {
  if (!(chargeAmount > 0) || !(settledMinor > 0)) return 0;
  const refunded = Math.min(Math.max(amountRefunded, 0), chargeAmount);
  const remainingSettled = Math.floor((settledMinor * (chargeAmount - refunded)) / chargeAmount);
  return commissionMinor(remainingSettled, rate);
}

/** Quando a comissão fica disponível: o maior entre a carência e a liberação do Stripe. */
export function availableAt(paidAt: Date, holdDays = REFERRAL_HOLD_DAYS, stripeAvailableOn?: Date | null): Date {
  const hold = new Date(paidAt.getTime() + Math.max(0, holdDays) * 86_400_000);
  if (stripeAvailableOn && stripeAvailableOn.getTime() > hold.getTime()) return stripeAvailableOn;
  return hold;
}

/** Status da comissão → status da linha no extrato do Vibe Pay. */
export function ledgerStatusFor(status: CommissionStatus): LedgerStatus {
  switch (status) {
    case "approved": return "available";
    case "paid": return "paid";
    case "void": return "refunded";
    default: return "pending";
  }
}

export interface StripeDest {
  stripeAccountId: string | null;
  country: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

export interface AsaasDest {
  walletId: string | null;
  status: string | null;
}

/** Conta Stripe Connect apta a receber transferência da plataforma BR. */
export function stripeEligible(s: StripeDest | null | undefined): boolean {
  return Boolean(
    s && s.stripeAccountId && String(s.country ?? "").toUpperCase() === "BR" && s.chargesEnabled && s.payoutsEnabled,
  );
}

/** Subconta ASAAS apta a receber transferência interna (walletId). */
export function asaasEligible(a: AsaasDest | null | undefined): boolean {
  return Boolean(a && a.walletId && a.status === "approved");
}

/**
 * Para onde vai o dinheiro: Stripe Connect (mesmo país, BRL) primeiro;
 * senão subconta ASAAS aprovada; senão fica no razão até o titular abrir conta.
 */
export function choosePayoutProvider(input: {
  currency: string;
  stripe?: StripeDest | null;
  asaas?: AsaasDest | null;
}): PayoutProvider | null {
  if (String(input.currency).toLowerCase() !== REFERRAL_PAYOUT_CURRENCY) return null;
  if (stripeEligible(input.stripe)) return "stripe";
  if (asaasEligible(input.asaas)) return "asaas";
  return null;
}

export interface CommissionState {
  status: CommissionStatus;
  commissionMinor: number;
  currency: string;
  availableAt: Date | null;
  payoutProvider: PayoutProvider | null;
  payoutRef: string | null;
}

export type NextStep =
  | { kind: "none" }
  | { kind: "mark_paid" }               // já transferido; carência passou
  | { kind: "transfer"; provider: PayoutProvider }
  | { kind: "check_asaas_transfer" }    // transferência ASAAS ainda pendente
  | { kind: "manual_review" }           // envio interrompido sem confirmação
  | { kind: "mark_available" }          // carência passou, sem conta para receber
  | { kind: "wait" };                   // ainda na carência

export const INFLIGHT = "inflight";

/**
 * Próximo passo de uma comissão.
 * - Stripe: transfere já (com source_transaction o Stripe só libera quando a
 *   cobrança liquida), e marca "paga" quando a carência passa.
 * - ASAAS: só transfere depois da carência (não dá para estornar depois).
 */
export function nextStep(
  s: CommissionState,
  dest: { stripe?: StripeDest | null; asaas?: AsaasDest | null },
  now: Date,
): NextStep {
  if (s.status === "paid" || s.status === "void" || s.commissionMinor <= 0) return { kind: "none" };
  const matured = !s.availableAt || s.availableAt.getTime() <= now.getTime();

  if (s.payoutProvider && s.payoutRef) {
    if (s.payoutRef === INFLIGHT) {
      // Stripe tem idempotência e busca por transfer_group: pode tentar de novo.
      return s.payoutProvider === "stripe" ? { kind: "transfer", provider: "stripe" } : { kind: "manual_review" };
    }
    if (s.payoutProvider === "stripe") return matured ? { kind: "mark_paid" } : { kind: "wait" };
    return { kind: "check_asaas_transfer" };
  }

  const provider = choosePayoutProvider({ currency: s.currency, ...dest });
  if (provider === "stripe") return { kind: "transfer", provider };
  if (!matured) return { kind: "wait" };
  if (provider === "asaas") return { kind: "transfer", provider };
  return s.status === "approved" ? { kind: "none" } : { kind: "mark_available" };
}

/** provider_ref da linha do extrato para uma compra (sessão/fatura do Stripe). */
export function ledgerRef(sourceRef: string): string {
  return `${REFERRAL_LEDGER_PREFIX}${sourceRef}`;
}
