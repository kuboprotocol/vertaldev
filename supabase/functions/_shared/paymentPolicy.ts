/**
 * Vertal Chat — regra de quem pode movimentar dinheiro e quando.
 *
 * Regras fixadas pelo dono (LOGBOOK do task virtual-chat-assistant, decisão aceita):
 *  1. Pagamento só por pedido do DONO. Cliente de canal nunca dispara pagamento.
 *  2. Toda execução exige confirmação do dono mostrando valor e destinatário.
 *  3. Há limite diário por dono. Acima dele, exige uma confirmação extra.
 *  4. Chaves de API nunca ficam em texto de pasta ou nota (ver containsSecret).
 *
 * Função pura, sem I/O: roda na edge function e nos testes (src/lib/payments/policy.ts re-exporta).
 */

export type PaymentActor = "owner" | "customer" | "agent";

export interface PaymentRequest {
  actor: PaymentActor;
  amountMinor: number;
  currency: string;
  /** Total já pago/recebido hoje pelo dono, em centavos da mesma moeda. */
  spentTodayMinor: number;
  dailyLimitMinor: number;
  /** Confirmação normal do dono para este valor e destinatário. */
  confirmed: boolean;
  /** Confirmação extra, exigida quando o valor passa do limite diário. */
  extraConfirmed: boolean;
}

export type PaymentDecision =
  | { status: "allow" }
  | { status: "needs_confirmation" }
  | { status: "needs_extra_confirmation" }
  | { status: "deny"; reason: "customer_cannot_pay" | "invalid_amount" | "invalid_currency" };

export const DEFAULT_DAILY_LIMIT_MINOR = 50_000; // 500,00 na moeda base, premissa; o dono configura

export function evaluatePaymentRequest(req: PaymentRequest): PaymentDecision {
  if (req.actor === "customer") return { status: "deny", reason: "customer_cannot_pay" };
  if (!Number.isInteger(req.amountMinor) || req.amountMinor <= 0) return { status: "deny", reason: "invalid_amount" };
  if (!/^[A-Z]{3}$/.test(req.currency)) return { status: "deny", reason: "invalid_currency" };

  if (!req.confirmed) return { status: "needs_confirmation" };

  const overLimit = req.spentTodayMinor + req.amountMinor > req.dailyLimitMinor;
  if (overLimit && !req.extraConfirmed) return { status: "needs_extra_confirmation" };

  return { status: "allow" };
}

/**
 * Texto da confirmação que o dono vê antes de autorizar. Mostra valor e destinatário,
 * como exige a regra 2. Valor formatado em centavos com separador decimal.
 */
export function buildConfirmationText(input: { amountMinor: number; currency: string; recipient: string; description?: string }): string {
  const value = (input.amountMinor / 100).toFixed(2).replace(".", ",");
  const base = `Confirmar pagamento de ${value} ${input.currency} para ${input.recipient}`;
  return input.description ? `${base} (${input.description})?` : `${base}?`;
}

const SECRET_PATTERNS: RegExp[] = [
  /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{10,}/, // chaves Stripe
  /\bwhsec_[A-Za-z0-9]{10,}/, // segredo de webhook
  /\bAKIA[0-9A-Z]{16}\b/, // chave AWS
  /\bghp_[A-Za-z0-9]{20,}\b/, // token GitHub
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/, // token Slack
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

/** true se o texto parece conter uma chave ou token. Usado antes de salvar nota ou pasta. */
export function containsSecret(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text));
}
