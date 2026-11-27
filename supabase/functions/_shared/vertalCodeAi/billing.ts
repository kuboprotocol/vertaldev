// VERTAL · cobrança v2 — preço = NOSSO custo real × markup (lucro por cima do custo).
//
// Substitui a fórmula antiga (custo + US$0,05) × 1,5. Tudo vem de config (padrões aqui,
// sobrescrita parcial por JSON em VERTAL_BILLING_CONFIG). O crédito continua US$0,03.
//
//  • VAREJO (cliente usando a IA dentro do Vertal Dev / Vibe Code / Vertal Chat):
//      chat simples, código, imagem, vídeo = custo × 1,69
//      clonagem de app                    = custo × 2,59 (+159%)
//      raspagem (scraping)                = custo × 5,50 (+450%)
//      grátis: N mensagens de chat simples por período (padrão 5 por dia, configurável)
//  • ATACADO / MARCA BRANCA (apps do cliente chamando a nossa IA, e a API fora do Vertal):
//      custo × 1,20 (taxa de 20%), debitado dos créditos pré-pagos do cliente;
//      clonagem e raspagem NÃO existem na marca branca (erro claro);
//      saldo zerado → 402 "credits_exhausted" até recarregar.
//  • PISO DE CUSTO: modelos próprios/grátis custam ~0 para nós; o custo considerado é
//    max(custo real, piso do tipo de pedido), então o preço nunca é zero (fora o grátis).
//
// Contas em microcréditos (1 crédito = 1.000.000 µc), arredondadas para cima; o débito
// inteiro acontece quando a fração acumulada passa de 1 crédito (mesmo "carry" da API).
// Módulo puro (Vitest, navegador e edge function). Nunca cita fornecedor.

export const MICRO = 1_000_000;

export type BillingKind = "chat" | "code" | "image" | "video" | "clone" | "scrape";
export type BillingChannel = "retail" | "wholesale";
export type FreePeriod = "day" | "week" | "month" | "lifetime";
export type BillingLocale = "pt-BR" | "en";

export const BILLING_KINDS: BillingKind[] = ["chat", "code", "image", "video", "clone", "scrape"];

export interface BillingConfig {
  version: string;
  /** Valor de referência de 1 crédito em USD. */
  usdPerCredit: number;
  /** Markup do varejo por tipo (1,69 = custo + 69%). */
  retailMarkup: Record<BillingKind, number>;
  /** Markup do atacado / marca branca (1,20 = custo + 20%). */
  wholesaleMarkup: number;
  /** Tipos que NÃO existem na marca branca. */
  wholesaleBlocked: BillingKind[];
  /** Piso do NOSSO custo por pedido, em USD (modelos próprios/grátis ~0). Sempre > 0. */
  floorUsd: Record<BillingKind, number>;
  /** Mensagens grátis do varejo. */
  freeAllowance: { count: number; period: FreePeriod; kinds: BillingKind[]; timeZone: string };
  /** Aviso de crédito baixo: dispara quando o saldo cai a ≤ thresholdRatio × última recarga. */
  lowCredit: { thresholdRatio: number; topUpReasons: string[] };
  /** Links usados nos avisos. */
  links: { topUp: string; usage: string };
}

/**
 * Padrões (26/11/2026, decisão do Laércio). Pisos: estimativa conservadora do nosso custo
 * de infraestrutura própria por pedido (VM + GPU sob demanda + banda), ver
 * docs/vertal-code-ai/BILLING-V2.md. Revisar quando a conta real do mês fechar.
 */
export const DEFAULT_BILLING: BillingConfig = {
  version: "2026-11-26",
  usdPerCredit: 0.03,
  retailMarkup: { chat: 1.69, code: 1.69, image: 1.69, video: 1.69, clone: 2.59, scrape: 5.5 },
  wholesaleMarkup: 1.2,
  wholesaleBlocked: ["clone", "scrape"],
  floorUsd: { chat: 0.0003, code: 0.002, image: 0.003, video: 0.05, clone: 0.02, scrape: 0.002 },
  freeAllowance: { count: 5, period: "day", kinds: ["chat"], timeZone: "UTC" },
  lowCredit: { thresholdRatio: 0.3, topUpReasons: ["credit_purchase"] },
  links: { topUp: "https://vertal.dev/pricing", usage: "https://vertal.dev/vertal-code-ai" },
};

const isNum = (v: unknown, min = 0): v is number => typeof v === "number" && Number.isFinite(v) && v >= min;

function mergeDeep<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (!(k in out)) continue;
    const cur = out[k];
    if (cur && typeof cur === "object" && !Array.isArray(cur)) out[k] = mergeDeep(cur, v);
    else if (Array.isArray(cur) ? Array.isArray(v) : typeof v === typeof cur) out[k] = v;
  }
  return out as T;
}

/** Valida a tabela. Qualquer erro derruba a sobrescrita inteira (volta ao padrão). */
export function validateBilling(c: BillingConfig): string[] {
  const errs: string[] = [];
  if (!isNum(c.usdPerCredit) || c.usdPerCredit <= 0) errs.push("usdPerCredit deve ser > 0");
  for (const k of BILLING_KINDS) {
    if (!isNum(c.retailMarkup[k], 1)) errs.push(`retailMarkup.${k} deve ser ≥ 1 (nunca abaixo do custo)`);
    if (!isNum(c.floorUsd[k]) || c.floorUsd[k] <= 0) errs.push(`floorUsd.${k} deve ser > 0 (preço nunca zero)`);
  }
  if (!isNum(c.wholesaleMarkup, 1)) errs.push("wholesaleMarkup deve ser ≥ 1");
  if (!c.wholesaleBlocked.every((k) => BILLING_KINDS.includes(k))) errs.push("wholesaleBlocked tem tipo desconhecido");
  const fa = c.freeAllowance;
  if (!isNum(fa.count) || !Number.isInteger(fa.count)) errs.push("freeAllowance.count deve ser inteiro ≥ 0");
  if (!["day", "week", "month", "lifetime"].includes(fa.period)) errs.push("freeAllowance.period inválido");
  if (!fa.kinds.every((k) => BILLING_KINDS.includes(k))) errs.push("freeAllowance.kinds tem tipo desconhecido");
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: fa.timeZone });
  } catch {
    errs.push("freeAllowance.timeZone inválido");
  }
  if (!isNum(c.lowCredit.thresholdRatio) || c.lowCredit.thresholdRatio <= 0 || c.lowCredit.thresholdRatio >= 1) {
    errs.push("lowCredit.thresholdRatio deve estar entre 0 e 1");
  }
  for (const [k, u] of Object.entries(c.links)) if (!/^https:\/\//.test(u)) errs.push(`links.${k} deve ser https`);
  return errs;
}

/** Tabela efetiva: padrão + sobrescrita (JSON parcial). Sobrescrita inválida é ignorada inteira. */
export function loadBilling(raw: string | undefined | null): { config: BillingConfig; errors: string[] } {
  const s = (raw ?? "").trim();
  if (!s) return { config: DEFAULT_BILLING, errors: [] };
  try {
    const merged = mergeDeep(DEFAULT_BILLING, JSON.parse(s));
    const errors = validateBilling(merged);
    return errors.length ? { config: DEFAULT_BILLING, errors } : { config: merged, errors: [] };
  } catch {
    return { config: DEFAULT_BILLING, errors: ["VERTAL_BILLING_CONFIG não é JSON válido"] };
  }
}

// ───────────────────────── flags (sem segredos novos) ─────────────────────────

type Env = Record<string, string | undefined>;
const truthy = (v: string | undefined) => /^(1|true|yes|on|sim)$/i.test((v ?? "").trim());

/**
 * O projeto Supabase está no teto de 100 segredos: as chaves de cobrança v2 moram dentro do
 * segredo JSON que já existe (VERTAL_GPU_CONFIG). Segredo avulso com o mesmo nome vence.
 * Aceita só estas chaves (inclui VERTAL_AI_API_ENABLED, o interruptor da API); nenhuma é ligada por padrão.
 */
const BILLING_KEY = /^VERTAL_(BILLING_[A-Z0-9_]+|LOW_CREDIT_[A-Z_]+|CODE_AI_CHARGE_ENABLED|AI_API_ENABLED)$/;
export function expandBillingEnv(env: Env): Env {
  const raw = (env.VERTAL_GPU_CONFIG ?? "").trim();
  if (!raw) return env;
  let cfg: unknown;
  try {
    cfg = JSON.parse(raw);
  } catch {
    return env;
  }
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return env;
  const out: Env = { ...env };
  for (const [k, v] of Object.entries(cfg as Record<string, unknown>)) {
    if (!BILLING_KEY.test(k) || (out[k] ?? "").trim()) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = String(v);
    else if (k === "VERTAL_BILLING_CONFIG" && v && typeof v === "object") out[k] = JSON.stringify(v);
  }
  return out;
}

export interface BillingFlags {
  /** Usa a tabela v2 (custo × markup). Desligado: o código antigo segue igual. */
  v2: boolean;
  /** Cobra de verdade no varejo (já existia; segue desligado). */
  retailCharge: boolean;
  /** Mensagens grátis do varejo. */
  freeAllowance: boolean;
  /** Aviso de crédito baixo (in-app). E-mail e CRM têm interruptores próprios. */
  lowCredit: boolean;
  lowCreditEmail: boolean;
  lowCreditCrm: boolean;
  /** Lista de contas (vazia = todas, quando o interruptor está ligado). */
  userIds: string[] | null;
}

export function billingFlags(env: Env): BillingFlags {
  const ids = (env.VERTAL_BILLING_USER_IDS ?? "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  return {
    v2: truthy(env.VERTAL_BILLING_V2_ENABLED),
    retailCharge: truthy(env.VERTAL_CODE_AI_CHARGE_ENABLED),
    freeAllowance: truthy(env.VERTAL_BILLING_FREE_ALLOWANCE_ENABLED),
    lowCredit: truthy(env.VERTAL_LOW_CREDIT_NOTICE_ENABLED),
    lowCreditEmail: truthy(env.VERTAL_LOW_CREDIT_EMAIL_ENABLED),
    lowCreditCrm: truthy(env.VERTAL_LOW_CREDIT_CRM_ENABLED),
    userIds: ids.length ? ids : null,
  };
}

/** v2 vale para esta conta? (interruptor + lista opcional) */
export function billingV2For(flags: BillingFlags, userId: string | null | undefined): boolean {
  if (!flags.v2) return false;
  return !flags.userIds || (!!userId && flags.userIds.includes(userId));
}

// ───────────────────────────────── preço ─────────────────────────────────

export interface PriceInput {
  channel: BillingChannel;
  kind: BillingKind;
  /** Nosso custo real do pedido em USD (0 para modelos próprios/grátis). */
  costUsd: number;
}

export interface PriceError {
  ok: false;
  status: 403;
  code: "feature_not_available_white_label";
  message: string;
}

/** Guarda de tipo (o tsconfig do app não estreita uniões por `ok` sem strictNullChecks). */
export function isPriceError(r: PriceResult): r is PriceError {
  return r.ok === false;
}

export type PriceResult =
  | {
    ok: true;
    channel: BillingChannel;
    kind: BillingKind;
    costUsd: number;
    floorUsd: number;
    floorApplied: boolean;
    /** max(custo real, piso) — base do preço. */
    billedCostUsd: number;
    markup: number;
    priceUsd: number;
    /** Créditos com 6 casas (informativo). */
    credits: number;
    /** Microcréditos, arredondados para cima (o que é debitado/acumulado). */
    micro: number;
  }
  | PriceError;

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function markupFor(c: BillingConfig, channel: BillingChannel, kind: BillingKind): number {
  return channel === "wholesale" ? c.wholesaleMarkup : c.retailMarkup[kind];
}

export function isBillingKind(v: unknown): v is BillingKind {
  return typeof v === "string" && (BILLING_KINDS as string[]).includes(v);
}

/** Preço de um pedido. Nunca zero (piso); clonagem/raspagem recusadas na marca branca. */
export function priceRequest(c: BillingConfig, i: PriceInput): PriceResult {
  if (i.channel === "wholesale" && c.wholesaleBlocked.includes(i.kind)) {
    return {
      ok: false,
      status: 403,
      code: "feature_not_available_white_label",
      message: i.kind === "clone"
        ? "App cloning is not available through the Vertal API or white-label apps. / A clonagem de apps não está disponível na API Vertal nem em apps de marca branca."
        : "Scraping is not available through the Vertal API or white-label apps. / A raspagem de dados não está disponível na API Vertal nem em apps de marca branca.",
    };
  }
  const cost = isNum(i.costUsd) ? i.costUsd : 0;
  const floor = c.floorUsd[i.kind];
  const billed = Math.max(cost, floor);
  const markup = markupFor(c, i.channel, i.kind);
  const priceUsd = billed * markup;
  const micro = Math.ceil((priceUsd / c.usdPerCredit) * MICRO - 1e-6);
  return {
    ok: true,
    channel: i.channel,
    kind: i.kind,
    costUsd: round6(cost),
    floorUsd: floor,
    floorApplied: cost < floor,
    billedCostUsd: round6(billed),
    markup,
    priceUsd: round6(priceUsd),
    credits: round6(micro / MICRO),
    micro,
  };
}

/** Atalho do varejo em créditos (2 casas) — substitui o antigo retailCredits() (custo+0,05)×1,5. */
export function retailCreditsV2(costUsd: number, kind: BillingKind = "chat", c: BillingConfig = DEFAULT_BILLING): number {
  const r = priceRequest(c, { channel: "retail", kind, costUsd });
  return r.ok ? Math.round(r.credits * 100) / 100 : 0;
}

/** Acumula a fração: débito inteiro quando passa de 1 crédito (invariante: débitos×1e6 + carry = carry0 + custo). */
export function settleMicro(carryMicro: number, costMicro: number): { debitCredits: number; carryMicro: number } {
  if (!Number.isInteger(carryMicro) || !Number.isInteger(costMicro) || carryMicro < 0 || costMicro < 0) {
    throw new Error("microcréditos devem ser inteiros ≥ 0");
  }
  const total = carryMicro + costMicro;
  const debit = Math.floor(total / MICRO);
  return { debitCredits: debit, carryMicro: total - debit * MICRO };
}

// ─────────────────────────────── grátis ───────────────────────────────

function ymd(now: Date, timeZone: string): { y: string; m: string; d: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** Chave da janela do grátis (ex.: "day:2026-11-26", "week:2026-11-23", "month:2026-11", "lifetime"). */
export function freeWindowKey(period: FreePeriod, now: Date, timeZone = "UTC"): string {
  if (period === "lifetime") return "lifetime";
  const { y, m, d } = ymd(now, timeZone);
  if (period === "month") return `month:${y}-${m}`;
  if (period === "day") return `day:${y}-${m}-${d}`;
  // semana começando na segunda-feira (no fuso configurado)
  const local = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const dow = (local.getUTCDay() + 6) % 7;
  local.setUTCDate(local.getUTCDate() - dow);
  return `week:${local.toISOString().slice(0, 10)}`;
}

/** Este pedido entra no grátis? Só varejo, só os tipos configurados, até `count` na janela. */
export function freeAllowanceDecision(
  c: BillingConfig,
  i: { channel: BillingChannel; kind: BillingKind; usedInWindow: number },
): { free: boolean; remainingAfter: number; limit: number } {
  const limit = c.freeAllowance.count;
  const used = Math.max(0, Math.floor(i.usedInWindow || 0));
  const eligible = i.channel === "retail" && c.freeAllowance.kinds.includes(i.kind) && used < limit;
  return { free: eligible, remainingAfter: Math.max(0, limit - used - (eligible ? 1 : 0)), limit };
}

// ───────────────────────────── saldo (atacado) ─────────────────────────────

const EXHAUSTED_MSG = {
  en: "Your Vertal credits have run out. AI requests are paused until you top up; your apps and data stay saved.",
  "pt-BR": "Seus créditos da Vertal acabaram. Os pedidos de IA ficam pausados até uma nova recarga; seus apps e dados continuam salvos.",
} as const;

/** Atacado/marca branca exige saldo positivo. Zerado → 402 claro até recarregar. */
export function wholesaleBalanceGate(
  balanceCredits: number,
  locale: BillingLocale = "en",
): { ok: true } | { ok: false; status: 402; code: "credits_exhausted"; message: string } {
  if (isNum(balanceCredits) && balanceCredits > 0) return { ok: true };
  return { ok: false, status: 402, code: "credits_exhausted", message: EXHAUSTED_MSG[locale] };
}

// ─────────────────────────── aviso de crédito baixo ───────────────────────────

export interface TopUp {
  id: string;
  credits: number;
  at?: string;
}

export interface LowCreditDecision {
  notify: boolean;
  reason: "no_topup" | "above_threshold" | "already_notified" | "below_threshold";
  cycleKey: string | null;
  thresholdCredits: number;
  pct: number;
}

/** Uma vez por ciclo de recarga: saldo ≤ limiar × última recarga, ainda não avisado neste ciclo. */
export function lowCreditDecision(
  c: BillingConfig,
  i: { balanceCredits: number; lastTopUp: TopUp | null; alreadyNotified: boolean },
): LowCreditDecision {
  const pct = Math.round(c.lowCredit.thresholdRatio * 100);
  if (!i.lastTopUp || !isNum(i.lastTopUp.credits) || i.lastTopUp.credits <= 0) {
    return { notify: false, reason: "no_topup", cycleKey: null, thresholdCredits: 0, pct };
  }
  const threshold = i.lastTopUp.credits * c.lowCredit.thresholdRatio;
  const cycleKey = `topup:${i.lastTopUp.id}`;
  if (i.balanceCredits > threshold) return { notify: false, reason: "above_threshold", cycleKey, thresholdCredits: threshold, pct };
  if (i.alreadyNotified) return { notify: false, reason: "already_notified", cycleKey, thresholdCredits: threshold, pct };
  return { notify: true, reason: "below_threshold", cycleKey, thresholdCredits: threshold, pct };
}

/** Idioma do aviso: primeira pista conhecida; pt* → pt-BR; qualquer outra → en; nada → en. */
export function pickBillingLocale(hints: Array<string | null | undefined>): BillingLocale {
  for (const h of hints) {
    const v = (h ?? "").trim().toLowerCase();
    if (!v || v === "auto") continue;
    return v.startsWith("pt") ? "pt-BR" : "en";
  }
  return "en";
}

export interface NoticeVars {
  name?: string | null;
  balance: number;
  pct?: number;
  link: string;
  usageLink: string;
}

export interface NoticeMessage {
  locale: BillingLocale;
  subject: string;
  /** Título curto para o aviso in-app. */
  title: string;
  text: string;
  html: string;
}

export function formatCredits(n: number, locale: BillingLocale): string {
  const v = Math.max(0, Math.floor(n * 100) / 100);
  return new Intl.NumberFormat(locale === "pt-BR" ? "pt-BR" : "en-US", { maximumFractionDigits: 2 }).format(v);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const cleanName = (n: string | null | undefined) => (n ?? "").replace(/[\r\n<>]/g, " ").trim().slice(0, 80);

/** Texto aprovado pelo Laércio (26/11/2026). Tom sério e claro, sem pressão. */
export function lowCreditMessage(locale: BillingLocale, v: NoticeVars): NoticeMessage {
  const name = cleanName(v.name);
  const bal = formatCredits(v.balance, locale);
  const pct = v.pct ?? 30;
  if (locale === "pt-BR") {
    const paras = [
      name ? `Olá, ${name}.` : "Olá.",
      `Restam ${bal} créditos na sua conta Vertal Dev, cerca de ${pct}% da sua última recarga.`,
      "Quando os créditos chegarem a zero, os recursos de IA da Vertal (chat, código, imagem, vídeo e a API) ficam pausados na sua conta até uma nova recarga. Seus projetos, aplicativos e dados continuam salvos e acessíveis.",
      `Para continuar sem interrupção, faça uma recarga em ${v.link}.`,
      `Se tiver dúvidas sobre seu consumo, veja o extrato em ${v.usageLink} ou responda este e-mail.`,
      "Equipe Vertal",
    ];
    return {
      locale,
      subject: "Seus créditos da Vertal estão acabando",
      title: "Seus créditos da Vertal estão acabando",
      text: paras.join("\n\n"),
      html: htmlOf(paras, [v.link, v.usageLink]),
    };
  }
  const paras = [
    name ? `Hi ${name},` : "Hi,",
    `you have ${bal} credits left in your Vertal Dev account, about ${pct}% of your last top-up.`,
    "When your credits reach zero, Vertal AI features (chat, code, image, video and the API) will pause on your account until you top up again. Your projects, apps and data stay saved and accessible.",
    `To keep working without interruption, top up at ${v.link}.`,
    `To review your usage, see ${v.usageLink} or reply to this email.`,
    "The Vertal team",
  ];
  return {
    locale,
    subject: "Your Vertal credits are running low",
    title: "Your Vertal credits are running low",
    text: paras.join("\n\n"),
    html: htmlOf(paras, [v.link, v.usageLink]),
  };
}

function htmlOf(paras: string[], links: string[]): string {
  const body = paras
    .map((p) => {
      let h = esc(p);
      for (const l of links) h = h.split(esc(l)).join(`<a href="${esc(l)}">${esc(l)}</a>`);
      return `<p style="margin:0 0 14px">${h}</p>`;
    })
    .join("");
  return `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111">${body}</div>`;
}

// ───────────────────────────── extrato do cliente ─────────────────────────────

export interface UsageRow {
  channel: BillingChannel;
  kind: BillingKind | string;
  credits_micro?: number | null;
  /** Linhas antigas da API (vertal_ai_usage) trazem cost_micro. */
  cost_micro?: number | null;
  markup?: number | null;
  free?: boolean | null;
  created_at?: string;
}

export interface UsageStatementLine {
  channel: BillingChannel;
  kind: string;
  requests: number;
  freeRequests: number;
  credits: number;
  /** Markup aplicado, em % sobre o custo (ex.: 69). null quando misto/desconhecido. */
  markupPct: number | null;
}

/** Extrato por tipo: créditos gastos e markup aplicado. Nunca mostra fornecedor nem custo bruto. */
export function summarizeUsage(rows: UsageRow[]): { lines: UsageStatementLine[]; totalCredits: number; requests: number } {
  const map = new Map<string, UsageStatementLine & { markups: Set<number> }>();
  let total = 0;
  for (const r of rows) {
    const key = `${r.channel}:${r.kind}`;
    const micro = Number(r.credits_micro ?? r.cost_micro ?? 0) || 0;
    const line = map.get(key) ?? { channel: r.channel, kind: String(r.kind), requests: 0, freeRequests: 0, credits: 0, markupPct: null, markups: new Set<number>() };
    line.requests++;
    if (r.free) line.freeRequests++;
    line.credits += micro / MICRO;
    if (isNum(r.markup)) line.markups.add(Math.round((r.markup - 1) * 10000) / 100);
    total += micro / MICRO;
    map.set(key, line);
  }
  const lines = [...map.values()]
    .map(({ markups, ...l }) => ({ ...l, credits: round6(l.credits), markupPct: markups.size === 1 ? [...markups][0] : null }))
    .sort((a, b) => b.credits - a.credits);
  return { lines, totalCredits: round6(total), requests: rows.length };
}

// ─────────────────────────────── tabela para docs ───────────────────────────────

/** Linhas da tabela de preços com um exemplo por categoria (custo de amostra em USD). */
export function priceTable(c: BillingConfig = DEFAULT_BILLING, sampleCostUsd: Partial<Record<BillingKind, number>> = {}) {
  const sample: Record<BillingKind, number> = { chat: 0.001, code: 0.01, image: 0.02, video: 0.4, clone: 0.05, scrape: 0.004, ...sampleCostUsd };
  const rows: Array<{ channel: BillingChannel; kind: BillingKind; markup: number | null; floorUsd: number; sampleCostUsd: number; priceUsd: number | null; credits: number | null; note?: string }> = [];
  for (const channel of ["retail", "wholesale"] as BillingChannel[]) {
    for (const kind of BILLING_KINDS) {
      const r = priceRequest(c, { channel, kind, costUsd: sample[kind] });
      if (isPriceError(r)) {
        rows.push({ channel, kind, markup: null, floorUsd: c.floorUsd[kind], sampleCostUsd: sample[kind], priceUsd: null, credits: null, note: r.code });
      } else {
        rows.push({ channel, kind, markup: r.markup, floorUsd: r.floorUsd, sampleCostUsd: sample[kind], priceUsd: r.priceUsd, credits: r.credits });
      }
    }
  }
  return rows;
}
