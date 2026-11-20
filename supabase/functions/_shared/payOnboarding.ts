// Vertal Vibe Pay: cadastro único (uma tela, um envio) que abre as duas contas
// do titular: a subconta ASAAS (conta Brasil: Pix, boleto, saldo em reais) e a
// conta conectada Stripe Express (conta global), já preenchida com os mesmos
// dados para o Stripe pedir o mínimo no onboarding hospedado.
//
// Este arquivo é puro (sem Deno, sem DOM, sem npm): roda na Edge Function
// `wallet` (ação `pay-open`), no navegador (validação do formulário do /pay) e
// no Vitest (src/lib/bank/payOnboarding.test.ts). A orquestração recebe os
// provedores por injeção (`PayOpenDeps`), o que permite testar falha parcial e
// idempotência sem chamar ASAAS nem Stripe.

import { isValidCnpj, isValidCpf } from "./pixKeys.ts";

// ── Entrada ────────────────────────────────────────────────────────────────

export type CompanyType = "MEI" | "LIMITED" | "INDIVIDUAL" | "ASSOCIATION";
export const COMPANY_TYPES: { value: CompanyType; label: string }[] = [
  { value: "MEI", label: "MEI" },
  { value: "LIMITED", label: "Limitada (LTDA)" },
  { value: "INDIVIDUAL", label: "Individual (EI/SLU)" },
  { value: "ASSOCIATION", label: "Associação" },
];

export const BR_UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
  "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

/** O que o formulário envia (strings como digitadas; o servidor normaliza). */
export interface PayOpenInput {
  name: string;
  cpfCnpj: string;
  /** YYYY-MM-DD. Obrigatória para CPF. */
  birthDate?: string;
  email: string;
  mobilePhone: string;
  postalCode: string;
  address: string;
  addressNumber: string;
  complement?: string;
  /** Bairro. */
  province: string;
  city: string;
  /** UF, 2 letras. */
  state: string;
  /** Renda (CPF) ou faturamento (CNPJ) mensal em reais: número ou "5.000,00". */
  incomeValue: number | string;
  /** Obrigatório para CNPJ. */
  companyType?: CompanyType | "";
}

export type PayField = keyof PayOpenInput;

/** Dados validados e normalizados. */
export interface PayOpenData {
  personType: "FISICA" | "JURIDICA";
  name: string;
  firstName: string;
  lastName: string;
  cpfCnpj: string;
  birthDate: string | null;
  email: string;
  /** 11 dígitos (DDD + 9 + 8). */
  mobilePhone: string;
  /** +55DDDNÚMERO */
  phoneE164: string;
  postalCode: string;
  address: string;
  addressNumber: string;
  complement: string | null;
  province: string;
  city: string;
  state: string;
  incomeValue: number;
  companyType: CompanyType | null;
}

export interface PayFieldError { field: PayField; code: string }

export const PAY_FIELD_MESSAGES: Record<string, string> = {
  name_required: "Informe o nome completo ou a razão social",
  name_full: "Informe nome e sobrenome",
  name_too_long: "Nome muito longo (máx. 120 caracteres)",
  document_invalid: "CPF ou CNPJ inválido",
  birth_date_required: "Informe a data de nascimento",
  birth_date_invalid: "Data de nascimento inválida",
  birth_date_minor: "O titular precisa ter 18 anos ou mais",
  email_invalid: "E-mail inválido",
  phone_invalid: "Celular inválido: use DDD + número com 9 dígitos",
  postal_code_invalid: "CEP inválido",
  address_required: "Informe o endereço",
  address_number_required: "Informe o número",
  province_required: "Informe o bairro",
  city_required: "Informe a cidade",
  state_invalid: "UF inválida",
  income_invalid: "Informe a renda ou o faturamento mensal",
  company_type_required: "Escolha o tipo de empresa",
};

export const onlyDigits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const clean = (s: unknown, max: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** "5.000,50" | "5000.5" | 5000.5 -> 5000.5 (NaN se inválido). */
export function parseBrlAmount(v: unknown): number {
  if (typeof v === "number") return v;
  let s = String(v ?? "").trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Celular BR: aceita +55, espaços, parênteses e hífen. Devolve 11 dígitos ou null. */
export function normalizeMobile(raw: unknown): string | null {
  let d = onlyDigits(raw);
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 11) return null;
  if (!/^[1-9][1-9]9\d{8}$/.test(d)) return null;
  return d;
}

function validDate(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

function ageOn(b: { y: number; m: number; d: number }, today: Date) {
  let age = today.getUTCFullYear() - b.y;
  const mm = today.getUTCMonth() + 1, dd = today.getUTCDate();
  if (mm < b.m || (mm === b.m && dd < b.d)) age--;
  return age;
}

// Os membros declaram os campos do outro como opcionais para o narrowing
// funcionar também no app (tsconfig sem strictNullChecks).
export type PayValidation =
  | { ok: true; data: PayOpenData; errors?: undefined }
  | { ok: false; errors: PayFieldError[]; data?: undefined };

/** Mesma regra no navegador e na Edge Function. */
export function validatePayOpen(raw: Partial<Record<PayField, unknown>>, opts: { today?: Date } = {}): PayValidation {
  const errors: PayFieldError[] = [];
  const err = (field: PayField, code: string) => errors.push({ field, code });
  const today = opts.today ?? new Date();

  const doc = onlyDigits(raw.cpfCnpj);
  const isPf = doc.length === 11;
  const isPj = doc.length === 14;
  if (!(isPf && isValidCpf(doc)) && !(isPj && isValidCnpj(doc))) err("cpfCnpj", "document_invalid");

  const name = clean(raw.name, 200);
  if (!name) err("name", "name_required");
  else if (name.length > 120) err("name", "name_too_long");
  else if (isPf && name.split(" ").length < 2) err("name", "name_full");

  let birthDate: string | null = null;
  const bd = String(raw.birthDate ?? "").trim();
  if (isPf || bd) {
    if (!bd) err("birthDate", "birth_date_required");
    else {
      const p = validDate(bd);
      if (!p || p.y < 1900 || ageOn(p, today) > 120 || ageOn(p, today) < 0) err("birthDate", "birth_date_invalid");
      else if (ageOn(p, today) < 18) err("birthDate", "birth_date_minor");
      else birthDate = bd;
    }
  }

  const email = String(raw.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email) || email.length > 100) err("email", "email_invalid");

  const mobilePhone = normalizeMobile(raw.mobilePhone);
  if (!mobilePhone) err("mobilePhone", "phone_invalid");

  const postalCode = onlyDigits(raw.postalCode);
  if (postalCode.length !== 8 || /^0{8}$/.test(postalCode)) err("postalCode", "postal_code_invalid");

  const address = clean(raw.address, 120);
  if (!address) err("address", "address_required");
  const addressNumber = clean(raw.addressNumber, 10);
  if (!addressNumber) err("addressNumber", "address_number_required");
  const province = clean(raw.province, 60);
  if (!province) err("province", "province_required");
  const city = clean(raw.city, 60);
  if (!city) err("city", "city_required");
  const state = String(raw.state ?? "").trim().toUpperCase();
  if (!(BR_UFS as readonly string[]).includes(state)) err("state", "state_invalid");
  const complement = clean(raw.complement, 60) || null;

  const incomeValue = parseBrlAmount(raw.incomeValue);
  if (!Number.isFinite(incomeValue) || incomeValue <= 0 || incomeValue > 1_000_000_000) err("incomeValue", "income_invalid");

  let companyType: CompanyType | null = null;
  if (isPj) {
    const ct = String(raw.companyType ?? "");
    if (!COMPANY_TYPES.some((c) => c.value === ct)) err("companyType", "company_type_required");
    else companyType = ct as CompanyType;
  }

  if (errors.length) return { ok: false, errors };
  const parts = name.split(" ");
  return {
    ok: true,
    data: {
      personType: isPf ? "FISICA" : "JURIDICA",
      name,
      firstName: parts[0],
      lastName: parts.slice(1).join(" ") || parts[0],
      cpfCnpj: doc,
      birthDate,
      email,
      mobilePhone: mobilePhone!,
      phoneE164: `+55${mobilePhone}`,
      postalCode,
      address,
      addressNumber,
      complement,
      province,
      city,
      state,
      incomeValue: Math.round(incomeValue * 100) / 100,
      companyType,
    },
  };
}

// ── Payloads dos provedores ────────────────────────────────────────────────

export interface AsaasWebhookConfig { url: string; email: string; authToken: string; events: string[] }

/** Corpo de POST /v3/accounts (criar subconta). */
export function asaasAccountPayload(d: PayOpenData, webhook?: AsaasWebhookConfig | null) {
  return {
    name: d.name,
    email: d.email,
    cpfCnpj: d.cpfCnpj,
    birthDate: d.personType === "FISICA" ? d.birthDate ?? undefined : undefined,
    companyType: d.personType === "JURIDICA" ? d.companyType ?? undefined : undefined,
    mobilePhone: d.mobilePhone,
    incomeValue: d.incomeValue,
    address: d.address,
    addressNumber: d.addressNumber,
    complement: d.complement ?? undefined,
    province: d.province,
    postalCode: d.postalCode,
    webhooks: webhook ? [{
      name: "Vertal Vibe Pay",
      url: webhook.url,
      email: webhook.email,
      enabled: true,
      interrupted: false,
      authToken: webhook.authToken,
      sendType: "SEQUENTIALLY",
      apiVersion: 3,
      events: webhook.events,
    }] : undefined,
  };
}

/**
 * Dados da conta conectada (Stripe Express, BR) preenchidos com o cadastro.
 * Express aceita pré-preenchimento antes do onboarding; o Stripe ainda pede no
 * link hospedado o que faltar (aceite dos termos, conta bancária, verificação).
 */
export function stripeAccountPrefill(d: PayOpenData) {
  const address = {
    line1: `${d.address}, ${d.addressNumber}`.slice(0, 200),
    line2: d.complement ? `${d.complement} - ${d.province}`.slice(0, 200) : d.province,
    postal_code: `${d.postalCode.slice(0, 5)}-${d.postalCode.slice(5)}`,
    city: d.city,
    state: d.state,
    country: "BR",
  };
  if (d.personType === "FISICA") {
    const [y, m, day] = (d.birthDate ?? "").split("-").map(Number);
    return {
      business_type: "individual" as const,
      individual: {
        first_name: d.firstName,
        last_name: d.lastName,
        email: d.email,
        phone: d.phoneE164,
        id_number: d.cpfCnpj,
        dob: { day, month: m, year: y },
        address,
      },
    };
  }
  return {
    business_type: "company" as const,
    company: {
      name: d.name,
      tax_id: d.cpfCnpj,
      phone: d.phoneE164,
      address,
    },
  };
}

export function stripeAccountCreateParams(d: PayOpenData, meta: { userId: string; platformCnpj: string }) {
  return {
    type: "express" as const,
    country: "BR",
    email: d.email,
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    ...stripeAccountPrefill(d),
    metadata: { supabase_user_id: meta.userId, platform_cnpj: meta.platformCnpj, source: "pay-open" },
  };
}

// ── Classificação de erros dos provedores ──────────────────────────────────

export type AsaasErrorKind = "email_in_use" | "document_in_use" | "validation" | "unavailable";

/** Erro do ASAAS (status + errors[].description) -> tipo. */
export function classifyAsaasError(e: { status?: number; errors?: { code?: string; description?: string }[]; message?: string }): AsaasErrorKind {
  const text = [e.message, ...(e.errors ?? []).map((x) => `${x.code ?? ""} ${x.description ?? ""}`)].join(" ").toLowerCase();
  const inUse = /já (está|esta) (em uso|cadastrad)|already (in use|exists|registered)|já existe/.test(text);
  if (inUse && /e-?mail/.test(text)) return "email_in_use";
  if (inUse && /(cpf|cnpj|documento)/.test(text)) return "document_in_use";
  if ((e.status ?? 0) >= 500 || !e.status) return "unavailable";
  return "validation";
}

export type StripeErrorKind = "connect_disabled" | "country_unsupported" | "validation" | "unavailable";

export function classifyStripeError(e: { type?: string; code?: string; message?: string; statusCode?: number }): StripeErrorKind {
  const msg = String(e.message ?? "").toLowerCase();
  if (/signed up for connect|connect.*not enabled|platform.*connect/.test(msg)) return "connect_disabled";
  if (/country|not supported in/.test(msg) && /support|available/.test(msg)) return "country_unsupported";
  if ((e.statusCode ?? 0) >= 500 || e.type === "StripeConnectionError" || e.type === "StripeAPIError") return "unavailable";
  return "validation";
}

// ── Status combinado ───────────────────────────────────────────────────────

export type AsaasState = "unavailable" | "none" | "pending" | "in_review" | "active" | "rejected";
export type StripeState = "unavailable" | "none" | "action_required" | "in_review" | "active" | "rejected";
export type PayOverall = "not_started" | "partial" | "action_required" | "in_review" | "active";
export type PayNextStep = "open" | "retry" | "stripe_onboarding" | "asaas_activation" | "wait" | "done";

export interface AsaasSnapshot { status: "pending" | "awaiting_approval" | "approved" | "rejected" }
export interface StripeSnapshot {
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  /** currently_due + past_due */
  requirementsDue: number;
  disabledReason: string | null;
}

export interface PayStatus {
  overall: PayOverall;
  asaas: AsaasState;
  stripe: StripeState;
  nextStep: PayNextStep;
  message: string;
}

export function asaasState(configured: boolean, a: AsaasSnapshot | null): AsaasState {
  if (!configured) return "unavailable";
  if (!a) return "none";
  return a.status === "approved" ? "active" : a.status === "awaiting_approval" ? "in_review" : a.status === "rejected" ? "rejected" : "pending";
}

export function stripeState(configured: boolean, s: StripeSnapshot | null): StripeState {
  if (!configured) return "unavailable";
  if (!s) return "none";
  if (s.disabledReason?.startsWith("rejected")) return "rejected";
  if (s.chargesEnabled && s.requirementsDue === 0) return "active";
  if (!s.detailsSubmitted || s.requirementsDue > 0) return s.chargesEnabled && s.detailsSubmitted ? "active" : "action_required";
  return "in_review";
}

export function combinePayStatus(
  flags: { asaasConfigured: boolean; stripeConfigured: boolean },
  asaas: AsaasSnapshot | null,
  stripe: StripeSnapshot | null,
): PayStatus {
  const a = asaasState(flags.asaasConfigured, asaas);
  const s = stripeState(flags.stripeConfigured, stripe);
  const avail = [a, s].filter((x) => x !== "unavailable");
  const base = { asaas: a, stripe: s };
  if (avail.length === 0) return { ...base, overall: "not_started", nextStep: "wait", message: "A conta digital ainda não foi ativada na plataforma." };
  if (avail.every((x) => x === "none")) return { ...base, overall: "not_started", nextStep: "open", message: "Abra sua conta: um cadastro só para a conta Brasil e a conta global." };
  if (avail.some((x) => x === "none")) {
    const missing = a === "none" ? "conta Brasil (ASAAS)" : "conta global (Stripe)";
    return { ...base, overall: "partial", nextStep: "retry", message: `Falta abrir a ${missing}. Tente de novo: o que já foi aberto não é duplicado.` };
  }
  if (s === "action_required" || s === "rejected") {
    return { ...base, overall: "action_required", nextStep: "stripe_onboarding", message: s === "rejected" ? "O Stripe recusou a conta global. Fale com o suporte." : "Falta concluir a verificação da conta global no Stripe." };
  }
  if (a === "pending" || a === "rejected") {
    return { ...base, overall: "action_required", nextStep: "asaas_activation", message: a === "rejected" ? "O ASAAS recusou a conta Brasil. Fale com o suporte." : "Conclua a ativação da conta Brasil pelo e-mail do ASAAS (senha e documentos)." };
  }
  if (avail.every((x) => x === "active")) return { ...base, overall: "active", nextStep: "done", message: "Conta ativa." };
  return { ...base, overall: "in_review", nextStep: "wait", message: "Cadastro enviado. ASAAS e Stripe estão analisando." };
}

// ── Orquestração (falha parcial + idempotência) ───────────────────────────

/** Erro de provedor já traduzido para o cliente. */
export interface ProviderFailure {
  ok: false;
  error: string;
  /** Mensagem em português para mostrar ao titular. */
  message: string;
  /** true = pode tentar de novo com os mesmos dados. */
  retryable: boolean;
}
interface NoFailure { error?: undefined; message?: undefined; retryable?: undefined }
export type AsaasOutcome =
  | ({ ok: true; created: boolean; recovered?: boolean; status: AsaasSnapshot["status"] } & NoFailure)
  | ProviderFailure
  | { ok: false; error: "asaas_not_configured"; message: string; retryable: false };
export type StripeOutcome =
  | ({ ok: true; created: boolean; accountId: string; onboardingUrl: string | null; snapshot: StripeSnapshot } & NoFailure)
  | ProviderFailure;

export interface OwnAsaasAccount { id: string; walletId: string; linkedToOtherUser: boolean }

export interface PayOpenDeps {
  asaas: null | {
    /** CONNECTOR_ENC_KEY utilizável (a apiKey da subconta só vem uma vez). */
    encryptionReady: () => boolean;
    getRow: () => Promise<AsaasSnapshot | null>;
    /** Subconta desta plataforma com o mesmo CPF/CNPJ ou e-mail (GET /accounts). */
    findOwn: (q: { cpfCnpj: string; email: string }) => Promise<OwnAsaasAccount | null>;
    /** Nova apiKey para subconta existente (POST /accounts/{id}/accessTokens); null se o ASAAS não liberar. */
    recoverKey: (accountId: string) => Promise<string | null>;
    create: (payload: ReturnType<typeof asaasAccountPayload>) => Promise<{ id: string; walletId: string; apiKey: string }>;
    store: (acct: { id: string; walletId: string; apiKey: string }) => Promise<void>;
    webhook: AsaasWebhookConfig | null;
  };
  stripe: null | {
    getExisting: () => Promise<string | null>;
    create: (params: ReturnType<typeof stripeAccountCreateParams>, idempotencyKey: string) => Promise<string>;
    /** Melhor esforço: completa dados de conta antiga ainda sem onboarding. */
    prefill: (accountId: string, prefill: ReturnType<typeof stripeAccountPrefill>) => Promise<void>;
    snapshot: (accountId: string) => Promise<StripeSnapshot>;
    onboardingLink: (accountId: string) => Promise<string>;
  };
  userId: string;
  platformCnpj: string;
  /** Hash curto e estável (ex.: sha256) para a chave de idempotência do Stripe. */
  hash: (s: string) => Promise<string>;
  log?: (msg: string, extra?: unknown) => void;
}

const ASAAS_MESSAGES: Record<string, string> = {
  asaas_not_configured: "A conta Brasil (ASAAS) ainda não foi ativada na plataforma.",
  pay_config_error: "Não conseguimos abrir a conta Brasil agora (configuração da plataforma). Nossa equipe já foi avisada; tente de novo mais tarde.",
  asaas_email_in_use: "Este e-mail já tem uma conta no ASAAS. Use outro e-mail para a conta Brasil.",
  asaas_document_in_use: "Este CPF/CNPJ já tem uma conta Brasil ligada a outro usuário do Vertal Dev. Fale com o suporte.",
  asaas_orphan: "Uma tentativa anterior chegou a criar sua conta Brasil no ASAAS, mas não terminou. Nossa equipe precisa liberá-la; fale com o suporte ou tente mais tarde.",
  asaas_validation: "O ASAAS recusou os dados",
  asaas_unavailable: "O ASAAS não respondeu. Tente de novo em alguns minutos.",
  asaas_store_failed: "A conta Brasil foi criada, mas não conseguimos salvá-la. Tente de novo.",
};

const STRIPE_MESSAGES: Record<string, string> = {
  stripe_not_configured: "A conta global (Stripe) ainda não foi ativada na plataforma.",
  stripe_connect_disabled: "A conta global ainda não foi liberada pelo Stripe para a plataforma. Nossa equipe já foi avisada.",
  stripe_country_unsupported: "O Stripe não abre conta global para este país pela plataforma.",
  stripe_validation: "O Stripe recusou os dados",
  stripe_unavailable: "O Stripe não respondeu. Tente de novo em alguns minutos.",
};

const fail = (error: string, retryable: boolean, detail?: string, table = ASAAS_MESSAGES): ProviderFailure => ({
  ok: false,
  error,
  message: detail ? `${table[error]}: ${detail}` : table[error],
  retryable,
});

export async function openAsaas(deps: PayOpenDeps, d: PayOpenData): Promise<AsaasOutcome> {
  const a = deps.asaas;
  if (!a) return { ok: false, error: "asaas_not_configured", message: ASAAS_MESSAGES.asaas_not_configured, retryable: false };
  const existing = await a.getRow();
  if (existing) return { ok: true, created: false, status: existing.status };
  // Sem chave de cifragem, a apiKey devolvida pelo ASAAS se perderia e a
  // subconta ficaria órfã (foi o que aconteceu em 2026-11-19). Não cria.
  if (!a.encryptionReady()) {
    deps.log?.("pay-open: CONNECTOR_ENC_KEY inválida; ASAAS não chamado");
    return fail("pay_config_error", true);
  }
  const storeWithRetry = async (acct: { id: string; walletId: string; apiKey: string }) => {
    try { await a.store(acct); } catch (e) {
      deps.log?.("pay-open: gravação da subconta falhou, repetindo", (e as Error).message);
      await a.store(acct);
    }
  };
  try {
    const own = await a.findOwn({ cpfCnpj: d.cpfCnpj, email: d.email });
    if (own) {
      if (own.linkedToOtherUser) return fail("asaas_document_in_use", false);
      const key = await a.recoverKey(own.id).catch(() => null);
      if (!key) {
        deps.log?.("pay-open: subconta órfã sem chave recuperável", own.id);
        return fail("asaas_orphan", false);
      }
      await storeWithRetry({ id: own.id, walletId: own.walletId, apiKey: key });
      return { ok: true, created: false, recovered: true, status: "pending" };
    }
    let created: { id: string; walletId: string; apiKey: string };
    try {
      created = await a.create(asaasAccountPayload(d, a.webhook));
    } catch (e) {
      const kind = classifyAsaasError(e as Record<string, never>);
      if (kind === "email_in_use") return fail("asaas_email_in_use", false);
      if (kind === "document_in_use") return fail("asaas_document_in_use", false);
      if (kind === "unavailable") return fail("asaas_unavailable", true);
      return fail("asaas_validation", false, (e as Error).message);
    }
    try {
      await storeWithRetry(created);
    } catch (e) {
      deps.log?.("pay-open: subconta criada mas não gravada", { id: created.id, err: (e as Error).message });
      return fail("asaas_store_failed", true);
    }
    return { ok: true, created: true, status: "pending" };
  } catch (e) {
    deps.log?.("pay-open: ASAAS falhou", (e as Error).message);
    return fail("asaas_unavailable", true);
  }
}

export async function openStripe(deps: PayOpenDeps, d: PayOpenData): Promise<StripeOutcome> {
  const s = deps.stripe;
  if (!s) return fail("stripe_not_configured", false, undefined, STRIPE_MESSAGES);
  try {
    let accountId = await s.getExisting();
    let created = false;
    if (!accountId) {
      const params = stripeAccountCreateParams(d, { userId: deps.userId, platformCnpj: deps.platformCnpj });
      // Mesmos dados -> mesma chave: clique duplo / retry não cria duas contas.
      const key = `vb-pay-open:${deps.userId}:${(await deps.hash(JSON.stringify(params))).slice(0, 24)}`;
      accountId = await s.create(params, key);
      created = true;
    }
    let snap = await s.snapshot(accountId);
    if (!created && !snap.detailsSubmitted) {
      try {
        await s.prefill(accountId, stripeAccountPrefill(d));
        snap = await s.snapshot(accountId);
      } catch (e) {
        deps.log?.("pay-open: prefill do Stripe ignorado", (e as Error).message);
      }
    }
    const needs = !snap.detailsSubmitted || snap.requirementsDue > 0;
    const onboardingUrl = needs ? await s.onboardingLink(accountId) : null;
    return { ok: true, created, accountId, onboardingUrl, snapshot: snap };
  } catch (e) {
    const kind = classifyStripeError(e as Record<string, never>);
    deps.log?.("pay-open: Stripe falhou", { kind, message: (e as Error).message });
    if (kind === "connect_disabled") return fail("stripe_connect_disabled", false, undefined, STRIPE_MESSAGES);
    if (kind === "country_unsupported") return fail("stripe_country_unsupported", false, undefined, STRIPE_MESSAGES);
    if (kind === "unavailable") return fail("stripe_unavailable", true, undefined, STRIPE_MESSAGES);
    return fail("stripe_validation", false, (e as Error).message, STRIPE_MESSAGES);
  }
}

export interface PayOpenResult {
  asaas: AsaasOutcome;
  stripe: StripeOutcome;
  status: PayStatus;
  /** Link do onboarding hospedado do Stripe, só se ainda faltar algo lá. */
  nextUrl: string | null;
}

/**
 * Abre as duas contas. Cada provedor é independente: a falha de um não
 * desfaz nem impede o outro, e cada passo pula o que já existe (idempotente).
 */
export async function runPayOpen(deps: PayOpenDeps, d: PayOpenData): Promise<PayOpenResult> {
  const [asaas, stripe] = await Promise.all([openAsaas(deps, d), openStripe(deps, d)]);
  const asaasSnap: AsaasSnapshot | null = asaas.ok ? { status: asaas.status } : null;
  const stripeSnap = stripe.ok ? stripe.snapshot : null;
  const status = combinePayStatus(
    { asaasConfigured: Boolean(deps.asaas), stripeConfigured: Boolean(deps.stripe) },
    asaasSnap,
    stripeSnap,
  );
  return { asaas, stripe, status, nextUrl: stripe.ok ? stripe.onboardingUrl : null };
}
