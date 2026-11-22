// Pagamentos do Vertal Navigator: paywall/assinatura/checkout com aprovação inline no chat.
//
// Regras duras (pedido do Laércio, 22/11):
//   * Nada é pago sem o toque explícito do usuário no cartão (nunca pelo que o modelo diz).
//   * Uma aprovação = um pagamento, naquele total exato e moeda. Se o total mudar até o
//     clique, o navd pergunta de novo (paymentRecheck).
//   * Padrão: SEMPRE PERGUNTAR. "Automatizar tudo" é opt-in explícito (toque no cartão do
//     chat ou nas configurações), com teto por pagamento e/ou por loja num período; acima
//     do teto, com total que mudou, assinatura recorrente (salvo opt-in) ou leitura sem
//     confiança → pergunta. Toda ação automática vai para a auditoria cifrada e vira recibo no chat.
//   * Cartão: guardado no Cofre (kubo_secrets, AES-GCM) como WALLET_CARD_<final>, bound_to
//     "vertal-wallet" — nunca casa com host nenhum no fill_secret; só o fluxo de pagamento
//     (fill_payment_card) usa, digitado pelo navd. O número nunca vai ao modelo, a log ou à auditoria.
//   * Vertal Vibe Pay: adaptador atrás de flag (VertalPayAdapter). Sem API pronta, nada aparece;
//     saldo nunca é inventado.
//
// Núcleo puro (sem Deno/DOM): Worker, front-end (Vitest) e edge functions.
import { normalizeText, type CheckoutSummary, type MoneyValue } from "./navigatorCore.ts";

// ─── Assinatura / paywall ────────────────────────────────────────────────
export type BillingPeriod = "semanal" | "mensal" | "trimestral" | "semestral" | "anual";

export interface SubscriptionInfo {
  recurring: boolean;
  period?: BillingPeriod;
  /** Frase da página sobre renovação/cancelamento/teste grátis (como a página diz, até 240 caracteres). */
  renewalTerms?: string;
}

const PERIOD_RULES: Array<[BillingPeriod, RegExp]> = [
  ["semanal", /\b(por semana|semanal(mente)?|\/\s?semana|per week|weekly|\/\s?wk)\b/],
  ["trimestral", /\b(trimestral(mente)?|por trimestre|quarterly|every 3 months|a cada 3 meses)\b/],
  ["semestral", /\b(semestral(mente)?|por semestre|every 6 months|a cada 6 meses)\b/],
  ["anual", /\b(por ano|anual(mente)?|\/\s?ano|per year|yearly|annual(ly)?|\/\s?yr|ao ano)\b/],
  ["mensal", /\b(por mes|mensal(mente)?|\/\s?mes|per month|monthly|\/\s?mo|ao mes|mes a mes)\b/],
];
const RECURRING_HINT = /\b(assinatura|assine|assinar|plano|renova|renovacao|recorrente|cobranca recorrente|subscription|subscribe|renews?|renewal|auto-?renew|recurring|billed)\b/;
const TERMS_HINT = /\b(renova|renovacao|renovad[ao]|cancele (quando|a qualquer)|cancelar a qualquer|cancel anytime|renews?|renewal|auto-?renew|teste gratis|periodo de teste|free trial|trial|cobrad[oa] (automaticamente|a cada)|billed (monthly|annually|yearly|every))\b/;

/** Lê da página se é assinatura (recorrente), o período e os termos de renovação. */
export function detectSubscription(pageText: unknown): SubscriptionInfo {
  const lines = String(pageText ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 400);
  const hay = normalizeText(lines.join(" \n "));
  let period: BillingPeriod | undefined;
  for (const [p, re] of PERIOD_RULES) {
    if (re.test(hay)) {
      period = p;
      break;
    }
  }
  const termsLine = lines.find((l) => TERMS_HINT.test(normalizeText(l)));
  const recurring = !!period || (RECURRING_HINT.test(hay) && !!termsLine);
  return {
    recurring,
    ...(period ? { period } : {}),
    ...(termsLine ? { renewalTerms: termsLine.replace(/\s+/g, " ").slice(0, 240) } : {}),
  };
}

// ─── Uma aprovação = um pagamento no total exato ─────────────────────────
export interface ApprovedAmount {
  cents: number;
  currency: MoneyValue["currency"];
  store?: string;
}

export type RecheckResult = { ok: true } | { ok: false; reason: "total_changed" | "currency_changed" | "unreadable" | "merchant_changed" };

/**
 * Logo antes do clique (depois do toque do usuário), o navd lê a página de novo. Só segue se
 * o total lido for o MESMO que o usuário aprovou (mesma moeda, mesma loja). Qualquer dúvida → pergunta de novo.
 */
export function paymentRecheck(approved: ApprovedAmount | null | undefined, fresh: Pick<CheckoutSummary, "total" | "store">): RecheckResult {
  if (!approved || !Number.isFinite(approved.cents) || approved.cents <= 0) return { ok: false, reason: "unreadable" };
  if (!fresh.total) return { ok: false, reason: "unreadable" };
  if (fresh.total.currency !== approved.currency) return { ok: false, reason: "currency_changed" };
  if (fresh.total.cents !== approved.cents) return { ok: false, reason: "total_changed" };
  if (approved.store && fresh.store && approved.store !== fresh.store) return { ok: false, reason: "merchant_changed" };
  return { ok: true };
}

/**
 * O usuário aprovou exatamente o que está no pedido? O cartão manda o total que mostrou;
 * se a página (o pedido pendente) já tem outro total, recusa e o cartão é atualizado.
 */
export function approvalMatchesPending(sent: { totalCents?: unknown; currency?: unknown }, pending: Pick<CheckoutSummary, "total">): boolean {
  if (!pending.total) return sent.totalCents === undefined || sent.totalCents === null;
  return Number(sent.totalCents) === pending.total.cents && String(sent.currency ?? "") === pending.total.currency;
}

// ─── "Automatizar tudo": pré-aprovação com teto ──────────────────────────
export interface PaymentPolicy {
  /** "always_ask" é o padrão. "preapproved" só com toque explícito (settings ou cartão do chat). */
  mode: "always_ask" | "preapproved";
  /** Teto por pagamento, em centavos. */
  perPaymentMaxCents: number;
  /** Teto por loja no período (0 = sem teto de período, só o por pagamento). */
  periodMaxCents?: number;
  periodDays?: number;
  /** Só estas lojas (host, ex.: "folha.uol.com.br"). Vazio = qualquer loja. */
  merchants?: string[];
  /** Assinatura recorrente entra no automático? Padrão: não (sempre pergunta). */
  allowRecurring?: boolean;
  currency?: MoneyValue["currency"];
}

export const ALWAYS_ASK: PaymentPolicy = { mode: "always_ask", perPaymentMaxCents: 0 };
/** Teto duro de um pagamento automático (o mesmo das configurações da fase 2). */
export const AUTO_PAY_CAP_CENTS = 100_000;
/** Teto duro do período por loja. */
export const AUTO_PAY_PERIOD_CAP_CENTS = 500_000;

const merchantKey = (s: unknown) => String(s ?? "").toLowerCase().replace(/^www\./, "").trim();

export function merchantMatches(allowed: string[] | undefined, store: unknown): boolean {
  if (!allowed || allowed.length === 0) return true;
  const st = merchantKey(store);
  if (!st) return false;
  return allowed.some((m) => {
    const k = merchantKey(m);
    return !!k && (st === k || st.endsWith(`.${k}`));
  });
}

export type AutoPayDecision = { auto: true; reason: "within_cap" } | { auto: false; reason: string };

/**
 * Paga sozinho? Só com pré-aprovação explícita, leitura confiável do total (rótulo de total),
 * moeda da política, loja permitida, dentro do teto por pagamento e do teto do período.
 */
export function autoPayDecision(
  policy: PaymentPolicy | null | undefined,
  summary: Pick<CheckoutSummary, "total" | "confidence" | "store">,
  opts: { spentInPeriodCents?: number; subscription?: SubscriptionInfo; totalChanged?: boolean } = {},
): AutoPayDecision {
  if (!policy || policy.mode !== "preapproved") return { auto: false, reason: "always_ask" };
  if (opts.totalChanged) return { auto: false, reason: "total_changed" };
  const cap = Math.min(Math.floor(policy.perPaymentMaxCents || 0), AUTO_PAY_CAP_CENTS);
  if (cap <= 0) return { auto: false, reason: "no_cap" };
  if (!summary.total || summary.confidence !== "high") return { auto: false, reason: "total_unreadable" };
  if (summary.total.currency !== (policy.currency ?? "BRL")) return { auto: false, reason: "currency" };
  if (summary.total.cents <= 0) return { auto: false, reason: "zero" };
  if (summary.total.cents > cap) return { auto: false, reason: "over_cap" };
  if (!merchantMatches(policy.merchants, summary.store)) return { auto: false, reason: "merchant" };
  if (opts.subscription?.recurring && !policy.allowRecurring) return { auto: false, reason: "recurring" };
  const periodCap = Math.min(Math.floor(policy.periodMaxCents || 0), AUTO_PAY_PERIOD_CAP_CENTS);
  if (periodCap > 0 && (opts.spentInPeriodCents ?? 0) + summary.total.cents > periodCap) return { auto: false, reason: "over_period_cap" };
  return { auto: true, reason: "within_cap" };
}

/** Pré-aprovação pedida no chat ("automatize tudo, pode pagar até R$ 50"): só vale com o toque (`confirmed: true`). */
export function parseAutomation(raw: unknown): { ok: true; data: Automation | null } | { ok: false; detail: string } {
  if (raw === undefined || raw === null) return { ok: true, data: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, detail: "automation" };
  const r = raw as Record<string, unknown>;
  if (r.confirmed !== true) return { ok: false, detail: "confirmation_required" };
  const per = r.paymentMaxCents === undefined ? 0 : Number(r.paymentMaxCents);
  const period = r.periodMaxCents === undefined ? 0 : Number(r.periodMaxCents);
  if (!Number.isInteger(per) || per < 0 || per > AUTO_PAY_CAP_CENTS) return { ok: false, detail: "payment_cap" };
  if (!Number.isInteger(period) || period < 0 || period > AUTO_PAY_PERIOD_CAP_CENTS) return { ok: false, detail: "period_cap" };
  const merchants = Array.isArray(r.merchants)
    ? r.merchants.filter((m): m is string => typeof m === "string" && /^[a-z0-9.-]{3,120}$/i.test(m)).slice(0, 10).map(merchantKey)
    : [];
  return { ok: true, data: { mode: "all", paymentMaxCents: per, periodMaxCents: period, merchants, allowRecurring: r.allowRecurring === true } };
}

export interface Automation {
  /** "all": logins/aprovações de envio do Cofre sem 2º consentimento; pagamentos só dentro do teto. */
  mode: "all";
  paymentMaxCents: number;
  periodMaxCents: number;
  merchants: string[];
  allowRecurring: boolean;
}

/** Política de pagamento desta tarefa: a pré-aprovação da tarefa (toque no chat) vence as configurações. */
export function effectivePolicy(
  settings: { autoApproveEnabled: boolean; autoApproveMaxCents: number; periodMaxCents?: number; periodDays?: number; merchants?: string[]; allowRecurring?: boolean } | null | undefined,
  automation: Automation | null | undefined,
): PaymentPolicy {
  if (automation && automation.paymentMaxCents > 0) {
    return {
      mode: "preapproved", perPaymentMaxCents: automation.paymentMaxCents, periodMaxCents: automation.periodMaxCents, periodDays: 30,
      merchants: automation.merchants, allowRecurring: automation.allowRecurring, currency: "BRL",
    };
  }
  if (settings?.autoApproveEnabled && settings.autoApproveMaxCents > 0) {
    return {
      mode: "preapproved", perPaymentMaxCents: settings.autoApproveMaxCents, periodMaxCents: settings.periodMaxCents ?? 0,
      periodDays: settings.periodDays ?? 30, merchants: settings.merchants ?? [], allowRecurring: !!settings.allowRecurring, currency: "BRL",
    };
  }
  return ALWAYS_ASK;
}

// ─── Cartão no Cofre ─────────────────────────────────────────────────────
export const WALLET_BOUND = "vertal-wallet";
export const WALLET_CARD_RE = /^WALLET_CARD_\d{4}(_\d{1,2})?$/;

export const isWalletSecret = (s: { env_key: string; bound_to: string | null }) => s.bound_to === WALLET_BOUND || WALLET_CARD_RE.test(s.env_key);

export function luhnOk(number: string): boolean {
  const d = number.replace(/\D/g, "");
  if (d.length < 12 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

export function cardBrand(number: string): string {
  const d = number.replace(/\D/g, "");
  if (/^4/.test(d)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(d)) return "Mastercard";
  if (/^3[47]/.test(d)) return "Amex";
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(d)) return "Elo";
  if (/^(606282|3841)/.test(d)) return "Hipercard";
  return "Cartão";
}

export interface CardData {
  number: string;
  expMonth: string;
  expYear: string;
  holder: string;
  zip: string;
  cvv?: string;
}

export type ParsedCard = { ok: true; data: CardData; saveCvv: boolean; save: boolean } | { ok: false; detail: string };

/** Valida o cartão do cartão seguro (Luhn, validade futura, CVV 3–4, titular, CEP/ZIP). */
export function parseCardInput(body: Record<string, unknown>, now = new Date()): ParsedCard {
  const number = String(body.number ?? "").replace(/[\s.-]/g, "");
  if (!/^\d{12,19}$/.test(number) || !luhnOk(number)) return { ok: false, detail: "number" };
  const exp = String(body.exp ?? "").replace(/\s/g, "");
  const m = /^(\d{1,2})\/?(\d{2}|\d{4})$/.exec(exp);
  if (!m) return { ok: false, detail: "exp" };
  const month = Number(m[1]);
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  if (month < 1 || month > 12) return { ok: false, detail: "exp" };
  const endOfMonth = new Date(Date.UTC(year, month, 1));
  if (endOfMonth.getTime() <= now.getTime() || year > now.getUTCFullYear() + 25) return { ok: false, detail: "expired" };
  const cvv = String(body.cvv ?? "").trim();
  const amex = /^3[47]/.test(number);
  if (cvv && !(amex ? /^\d{4}$/ : /^\d{3}$/).test(cvv)) return { ok: false, detail: "cvv" };
  const holder = String(body.holder ?? "").trim().replace(/\s+/g, " ");
  if (holder.length < 2 || holder.length > 80 || /[\d<>{}]/.test(holder)) return { ok: false, detail: "holder" };
  const zip = String(body.zip ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9 -]{3,10}$/.test(zip)) return { ok: false, detail: "zip" };
  return {
    ok: true,
    data: { number, expMonth: String(month).padStart(2, "0"), expYear: String(year), holder, zip, ...(cvv ? { cvv } : {}) },
    saveCvv: body.saveCvv === true && !!cvv,
    save: body.save !== false,
  };
}

export const cardLast4 = (number: string) => number.replace(/\D/g, "").slice(-4);
export const walletCardName = (number: string) => `WALLET_CARD_${cardLast4(number)}`;
export const cardLabel = (c: Pick<CardData, "number">) => `${cardBrand(c.number)} •••• ${cardLast4(c.number)}`;

/** O que fica cifrado no Cofre (CVV só se o usuário marcar). */
export function cardVaultValue(c: CardData, saveCvv: boolean): string {
  return JSON.stringify({ v: 1, number: c.number, expMonth: c.expMonth, expYear: c.expYear, holder: c.holder, zip: c.zip, ...(saveCvv && c.cvv ? { cvv: c.cvv } : {}) });
}

export function parseCardVaultValue(raw: string): CardData | null {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    if (typeof j.number !== "string" || !luhnOk(j.number)) return null;
    return {
      number: j.number, expMonth: String(j.expMonth ?? ""), expYear: String(j.expYear ?? ""), holder: String(j.holder ?? ""), zip: String(j.zip ?? ""),
      ...(typeof j.cvv === "string" && j.cvv ? { cvv: j.cvv } : {}),
    };
  } catch {
    return null;
  }
}

/** Valores que o navd digita, por campo pedido (MM/AA para campo único de validade). */
export function cardFillValues(c: CardData, fields: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (f === "number") out.number = c.number;
    else if (f === "exp") out.exp = `${c.expMonth}/${c.expYear.slice(-2)}`;
    else if (f === "expMonth") out.expMonth = c.expMonth;
    else if (f === "expYear") out.expYear = c.expYear;
    else if (f === "cvv" && c.cvv) out.cvv = c.cvv;
    else if (f === "holder") out.holder = c.holder;
    else if (f === "zip") out.zip = c.zip;
  }
  return out;
}

export const CARD_FIELDS = ["number", "exp", "expMonth", "expYear", "cvv", "holder", "zip"] as const;

// ─── Vertal Vibe Pay (adaptador atrás de flag) ───────────────────────────
export interface VertalPayBalance {
  cents: number;
  currency: "BRL";
}

/**
 * Vertal Vibe Pay como fonte de pagamento. Hoje (22/11) o Pay está "em desenvolvimento" (#192) e não
 * existe API para pagar um checkout de terceiros: `canPay` é false e o cartão só mostra o saldo
 * quando a flag está ligada E o saldo veio de verdade da API. Nunca inventa saldo.
 */
export interface VertalPayAdapter {
  enabled: boolean;
  canPay: boolean;
  balance(): Promise<VertalPayBalance | null>;
}

export const DISABLED_VERTAL_PAY: VertalPayAdapter = { enabled: false, canPay: false, balance: async () => null };

/** Lê o saldo BRL do bank-overview da função `wallet` (totals[].availableMinor). */
export function vertalPayBalanceFrom(overview: unknown): VertalPayBalance | null {
  const totals = (overview as { totals?: unknown })?.totals;
  if (!Array.isArray(totals)) return null;
  const brl = totals.find((t) => (t as { currency?: unknown })?.currency === "BRL") as { availableMinor?: unknown } | undefined;
  const cents = Number(brl?.availableMinor);
  return Number.isInteger(cents) && cents >= 0 ? { cents, currency: "BRL" } : null;
}

/** Texto do cartão: "Você tem R$ X no Vertal Pay. Pagar R$ Y?" (só com saldo real). */
export function vertalPayLine(balance: VertalPayBalance | null, total: MoneyValue | null | undefined, fmt: (c: number) => string): string | null {
  if (!balance || !total || total.currency !== "BRL") return null;
  return `Você tem ${fmt(balance.cents)} no Vertal Pay. Pagar ${fmt(total.cents)}?`;
}
