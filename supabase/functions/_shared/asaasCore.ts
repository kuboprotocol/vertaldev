/**
 * Asaas — construtores de requisição e validação. Função pura: não faz rede.
 *
 * Confirmado na referência oficial (docs.asaas.com):
 *  - Criar subconta: POST de subconta exige conta-pai CNPJ. Campos obrigatórios: name, email, cpfCnpj.
 *    A resposta traz apiKey e walletId; a apiKey não pode ser recuperada depois.
 *  - Cobrança: billingType ∈ {UNDEFINED, BOLETO, CREDIT_CARD, PIX}; value e dueDate obrigatórios;
 *    description até 500 caracteres.
 *
 * URLs base CONFIRMADAS em docs.asaas.com/docs/sandbox (sandbox e produção).
 * NÃO confirmado ainda: nome do cabeçalho de autenticação (a página carrega por JavaScript; ver TODO
 * em ASAAS_AUTH_HEADER). Não chamar a API real até confirmar.
 */

export type AsaasEnv = "sandbox" | "production";

/** URLs base confirmadas na documentação de sandbox. Chave de sandbox só funciona na URL de sandbox. */
export const ASAAS_BASE_URL: Record<AsaasEnv, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
};

/** TODO(confirmar): nome do cabeçalho com a chave. Não inventar: ler a doc de autenticação ou testar na sandbox. */
export const ASAAS_AUTH_HEADER: string | null = null;

export const ASAAS_BILLING_TYPES = ["UNDEFINED", "BOLETO", "CREDIT_CARD", "PIX"] as const;
export type AsaasBillingType = (typeof ASAAS_BILLING_TYPES)[number];

export type ValidationError =
  | "invalid_cpf"
  | "invalid_cnpj"
  | "parent_must_be_cnpj"
  | "name_required"
  | "invalid_email"
  | "invalid_value"
  | "invalid_due_date"
  | "invalid_billing_type"
  | "description_too_long";

export type Result<T> = { ok: true; body: T } | { ok: false; error: ValidationError };

/** Remove tudo que não é dígito. */
export function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/** Validação de CPF pelos dígitos verificadores. */
export function isValidCpf(raw: string): boolean {
  const d = digitsOnly(raw);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  for (let t = 9; t < 11; t++) {
    let sum = 0;
    for (let i = 0; i < t; i++) sum += Number(d[i]) * (t + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(d[t])) return false;
  }
  return true;
}

/** Validação de CNPJ pelos dígitos verificadores. */
export function isValidCnpj(raw: string): boolean {
  const d = digitsOnly(raw);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export interface CreateSubaccountInput {
  /** Conta que cria a subconta. Precisa ser CNPJ. */
  parentCpfCnpj: string;
  name: string;
  email: string;
  /** CPF ou CNPJ do dono da subconta. */
  cpfCnpj: string;
  loginEmail?: string;
  birthDate?: string; // YYYY-MM-DD, só para pessoa física
  companyType?: "MEI" | "LIMITED" | "INDIVIDUAL" | "ASSOCIATION";
  mobilePhone?: string;
}

export function buildCreateSubaccountBody(input: CreateSubaccountInput): Result<Record<string, unknown>> {
  if (!isValidCnpj(input.parentCpfCnpj)) return { ok: false, error: "parent_must_be_cnpj" };
  const name = input.name.trim();
  if (name.length === 0 || name.length > 120) return { ok: false, error: "name_required" };
  if (!isValidEmail(input.email)) return { ok: false, error: "invalid_email" };
  const owner = digitsOnly(input.cpfCnpj);
  if (owner.length === 11) {
    if (!isValidCpf(owner)) return { ok: false, error: "invalid_cpf" };
  } else if (!isValidCnpj(owner)) {
    return { ok: false, error: "invalid_cnpj" };
  }
  const body: Record<string, unknown> = { name, email: input.email.trim(), cpfCnpj: owner };
  if (input.loginEmail) body.loginEmail = input.loginEmail.trim();
  if (input.birthDate && owner.length === 11) body.birthDate = input.birthDate;
  if (input.companyType && owner.length === 14) body.companyType = input.companyType;
  if (input.mobilePhone) body.mobilePhone = digitsOnly(input.mobilePhone);
  return { ok: true, body };
}

export interface CreatePaymentInput {
  customerId: string;
  billingType: AsaasBillingType;
  /** Valor em reais, com até 2 casas. */
  valueBrl: number;
  /** YYYY-MM-DD */
  dueDate: string;
  description?: string;
}

export function buildCreatePaymentBody(input: CreatePaymentInput, today: string): Result<Record<string, unknown>> {
  if (!(ASAAS_BILLING_TYPES as readonly string[]).includes(input.billingType)) {
    return { ok: false, error: "invalid_billing_type" };
  }
  if (!Number.isFinite(input.valueBrl) || input.valueBrl <= 0 || Math.round(input.valueBrl * 100) !== input.valueBrl * 100) {
    return { ok: false, error: "invalid_value" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) || input.dueDate < today) {
    return { ok: false, error: "invalid_due_date" };
  }
  if (input.description && input.description.length > 500) return { ok: false, error: "description_too_long" };
  const body: Record<string, unknown> = {
    customer: input.customerId,
    billingType: input.billingType,
    value: Math.round(input.valueBrl * 100) / 100,
    dueDate: input.dueDate,
  };
  if (input.description) body.description = input.description;
  return { ok: true, body };
}

export interface ChargeDecisionInput {
  actor: "owner" | "customer" | "agent";
  customerId: string;
  billingType: AsaasBillingType;
  valueBrl: number;
  dueDate: string;
  description?: string;
  /** Confirmação do dono para este valor e destinatário (mostrada na tela antes). */
  confirmed: boolean;
  /** Confirmação extra, quando passa do limite diário. */
  extraConfirmed: boolean;
  spentTodayBrl: number;
  dailyLimitBrl: number;
  /** Data de hoje em YYYY-MM-DD, para validar vencimento. */
  today: string;
  /** Cabeçalho confirmado pela doc. null = ainda não confirmado: a chamada fica bloqueada. */
  authHeader: string | null;
}

export type ChargeDecision =
  | { status: "needs_confirmation" }
  | { status: "needs_extra_confirmation" }
  | { status: "deny"; reason: string }
  | { status: "blocked_auth_unconfirmed" }
  | { status: "ready"; body: Record<string, unknown> };

/**
 * Decide se a cobrança pode sair. Ordem: regra de quem paga e limite (paymentPolicy),
 * depois validação do body, depois cabeçalho de autenticação confirmado.
 * Valores em reais; a regra de centavos fica em paymentPolicy (convertido aqui).
 */
export function decideCharge(
  input: ChargeDecisionInput,
  policy: (req: {
    actor: "owner" | "customer" | "agent";
    amountMinor: number;
    currency: string;
    spentTodayMinor: number;
    dailyLimitMinor: number;
    confirmed: boolean;
    extraConfirmed: boolean;
  }) => { status: string; reason?: string },
): ChargeDecision {
  const built = buildCreatePaymentBody(
    { customerId: input.customerId, billingType: input.billingType, valueBrl: input.valueBrl, dueDate: input.dueDate, description: input.description },
    input.today,
  );
  if (!built.ok) return { status: "deny", reason: built.error };

  const verdict = policy({
    actor: input.actor,
    amountMinor: Math.round(input.valueBrl * 100),
    currency: "BRL",
    spentTodayMinor: Math.round(input.spentTodayBrl * 100),
    dailyLimitMinor: Math.round(input.dailyLimitBrl * 100),
    confirmed: input.confirmed,
    extraConfirmed: input.extraConfirmed,
  });
  if (verdict.status === "needs_confirmation") return { status: "needs_confirmation" };
  if (verdict.status === "needs_extra_confirmation") return { status: "needs_extra_confirmation" };
  if (verdict.status === "deny") return { status: "deny", reason: verdict.reason ?? "denied" };

  if (input.authHeader === null) return { status: "blocked_auth_unconfirmed" };
  return { status: "ready", body: built.body };
}
