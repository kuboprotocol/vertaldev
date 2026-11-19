// Cliente mínimo da API v3 do ASAAS (https://docs.asaas.com).
//
// Autenticação: header `access_token` com a chave da conta (raiz ou subconta).
// Ambientes:
//   ASAAS_ENV=sandbox    -> https://api-sandbox.asaas.com/v3   (padrão)
//   ASAAS_ENV=production -> https://api.asaas.com/v3
//
// Fica INERTE sem ASAAS_API_KEY: `asaasConfigured()` devolve false e qualquer
// chamada lança AsaasNotConfigured, que a função traduz em `asaas_not_configured`.
// A chave da conta raiz (ASAAS_API_KEY) só cria subcontas e lê a própria conta;
// tudo que é do usuário (clientes, cobranças, saldo, extrato, transferências)
// roda com a apiKey da subconta dele, cifrada em bank_asaas_accounts.

export class AsaasNotConfigured extends Error {
  constructor() { super("asaas_not_configured"); }
}

export class AsaasError extends Error {
  status: number;
  errors: { code?: string; description?: string }[];
  constructor(status: number, errors: { code?: string; description?: string }[]) {
    super(errors.map((e) => e.description || e.code).filter(Boolean).join("; ") || `asaas_http_${status}`);
    this.status = status;
    this.errors = errors;
  }
}

export type AsaasEnv = "sandbox" | "production";

export function asaasEnv(): AsaasEnv {
  return (Deno.env.get("ASAAS_ENV") ?? "sandbox").toLowerCase() === "production" ? "production" : "sandbox";
}

export function asaasBaseUrl(env: AsaasEnv = asaasEnv()) {
  return env === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

export function asaasConfigured() {
  return Boolean(Deno.env.get("ASAAS_API_KEY"));
}

type Query = Record<string, string | number | boolean | undefined | null>;

export async function asaasRequest<T = Record<string, unknown>>(
  apiKey: string | null | undefined,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  opts: { body?: unknown; query?: Query } = {},
): Promise<T> {
  if (!apiKey) throw new AsaasNotConfigured();
  const url = new URL(asaasBaseUrl() + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    method,
    headers: {
      "access_token": apiKey,
      "Content-Type": "application/json",
      "User-Agent": "VERTAL-Bank/1.0",
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const errors = Array.isArray(data.errors) ? data.errors as { code?: string; description?: string }[] : [];
    throw new AsaasError(res.status, errors.length ? errors : [{ code: `http_${res.status}` }]);
  }
  return data as T;
}

/** Cliente com a chave da conta raiz (só para criar subcontas / ler a conta-pai). */
export function asaasRoot() {
  const key = Deno.env.get("ASAAS_API_KEY");
  return <T = Record<string, unknown>>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, opts?: { body?: unknown; query?: Query }) =>
    asaasRequest<T>(key, method, path, opts);
}

/** Cliente com a chave de uma subconta. */
export function asaasAs(apiKey: string) {
  if (!asaasConfigured()) throw new AsaasNotConfigured();
  return <T = Record<string, unknown>>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, opts?: { body?: unknown; query?: Query }) =>
    asaasRequest<T>(apiKey, method, path, opts);
}

// ── Tipos e mapeamentos usados pelo Vertal Vibe Pay ────────────────────────────

export type AsaasBillingType = "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED";

/** Status de cobrança ASAAS -> status do extrato unificado. */
export function mapPaymentStatus(s: string | undefined): "pending" | "paid" | "failed" | "refunded" | "expired" | "canceled" {
  switch (s) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
      return "paid";
    case "OVERDUE":
      return "expired";
    case "REFUNDED":
    case "REFUND_REQUESTED":
    case "REFUND_IN_PROGRESS":
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "AWAITING_CHARGEBACK_REVERSAL":
      return "refunded";
    case "DELETED":
      return "canceled";
    default:
      return "pending";
  }
}

/** Status de transferência ASAAS -> status do extrato unificado. */
export function mapTransferStatus(s: string | undefined): "pending" | "paid" | "failed" | "canceled" {
  switch (s) {
    case "DONE": return "paid";
    case "FAILED": return "failed";
    case "CANCELLED": return "canceled";
    default: return "pending";
  }
}

/** Tipo de chave Pix do app -> pixAddressKeyType do ASAAS. */
export const PIX_KEY_TYPE_TO_ASAAS: Record<string, "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP"> = {
  cpf: "CPF", cnpj: "CNPJ", email: "EMAIL", phone: "PHONE", random: "EVP",
};

/** Eventos assinados no webhook de cada subconta. */
export const ASAAS_WEBHOOK_EVENTS = [
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_REFUNDED",
  "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
  "TRANSFER_CREATED",
  "TRANSFER_PENDING",
  "TRANSFER_IN_BANK_PROCESSING",
  "TRANSFER_DONE",
  "TRANSFER_FAILED",
  "TRANSFER_CANCELLED",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_PENDING",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_AWAITING_APPROVAL",
];

/** Data de hoje + n dias (YYYY-MM-DD) no fuso de São Paulo. */
export function dueDateIn(days: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}
