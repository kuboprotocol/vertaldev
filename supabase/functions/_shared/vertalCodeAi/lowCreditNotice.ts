// VERTAL · aviso de crédito baixo (uma vez por ciclo de recarga).
//
// Quando o saldo cai a ≤ 30% (configurável) da última recarga, avisa UMA vez por recarga:
//   (a) aviso in-app no painel do Vertal Dev (linha em vertal_billing_notices — também é o "dedupe");
//   (b) e-mail para o endereço do cadastro (pelo caminho de e-mail que o repo já usa);
//   (c) nota/atividade no CRM do cliente, se ele conectou um no Vertal Fluxos (pula em silêncio se não).
// Idioma pt-BR ou inglês pelo locale da conta (padrão inglês). Nunca lança: falha de canal só é registrada.
// Módulo puro: todos os efeitos vêm por injeção (testes usam falsos; nunca mandam e-mail real).
import {
  type BillingConfig,
  type BillingLocale,
  type LowCreditDecision,
  lowCreditDecision,
  lowCreditMessage,
  type NoticeMessage,
  pickBillingLocale,
  type TopUp,
} from "./billing.ts";

export interface LowCreditAccount {
  email: string | null;
  name: string | null;
  /** Pistas de idioma em ordem de prioridade (config do app, cadastro, navegador…). */
  localeHints: Array<string | null | undefined>;
}

export interface LowCreditDeps {
  lastTopUp(userId: string): Promise<TopUp | null>;
  /** Já avisou neste ciclo? */
  alreadyNotified(userId: string, cycleKey: string): Promise<boolean>;
  /**
   * Grava o aviso in-app e reserva o ciclo (único por usuário+ciclo). false = outro pedido
   * reservou primeiro (corrida) ou a tabela não existe → não manda mais nada.
   */
  claim(userId: string, cycleKey: string, msg: NoticeMessage, meta: Record<string, unknown>): Promise<boolean>;
  account(userId: string): Promise<LowCreditAccount>;
  /** E-mail transacional. idempotencyKey impede envio duplo. */
  email?(to: string, msg: NoticeMessage, idempotencyKey: string): Promise<void>;
  /** Registra no CRM conectado. "skipped" quando não há CRM. */
  crm?(userId: string, msg: NoticeMessage): Promise<"logged" | "skipped">;
  /** Atualiza o resultado dos canais no aviso (opcional). */
  record?(userId: string, cycleKey: string, channels: Record<string, string>): Promise<void>;
  log?(m: string): void;
}

export interface LowCreditFlags {
  enabled: boolean;
  email: boolean;
  crm: boolean;
}

export interface LowCreditResult {
  status: "disabled" | "skipped" | "sent";
  decision?: LowCreditDecision;
  locale?: BillingLocale;
  channels?: { inApp: string; email: string; crm: string };
}

export async function maybeNotifyLowCredit(
  cfg: BillingConfig,
  flags: LowCreditFlags,
  deps: LowCreditDeps,
  input: { userId: string; balanceCredits: number },
): Promise<LowCreditResult> {
  const log = deps.log ?? (() => {});
  if (!flags.enabled) return { status: "disabled" };
  try {
    const top = await deps.lastTopUp(input.userId);
    const pre = lowCreditDecision(cfg, { balanceCredits: input.balanceCredits, lastTopUp: top, alreadyNotified: false });
    if (!pre.notify || !pre.cycleKey) return { status: "skipped", decision: pre };
    const already = await deps.alreadyNotified(input.userId, pre.cycleKey);
    const decision = lowCreditDecision(cfg, { balanceCredits: input.balanceCredits, lastTopUp: top, alreadyNotified: already });
    if (!decision.notify || !decision.cycleKey) return { status: "skipped", decision };

    const acct = await deps.account(input.userId);
    const locale = pickBillingLocale(acct.localeHints);
    const msg = lowCreditMessage(locale, {
      name: acct.name,
      balance: input.balanceCredits,
      pct: decision.pct,
      link: cfg.links.topUp,
      usageLink: cfg.links.usage,
    });
    const claimed = await deps.claim(input.userId, decision.cycleKey, msg, { balance: input.balanceCredits, threshold: decision.thresholdCredits, topUpId: top?.id });
    if (!claimed) return { status: "skipped", decision: { ...decision, notify: false, reason: "already_notified" } };

    const channels = { inApp: "sent", email: "off", crm: "off" };
    if (flags.email && deps.email) {
      if (!acct.email) channels.email = "no_email";
      else {
        try {
          await deps.email(acct.email, msg, `vertal-low-credit-${input.userId}-${decision.cycleKey}`);
          channels.email = "sent";
        } catch (e) {
          channels.email = "failed";
          log(`[billing] aviso por e-mail falhou: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    if (flags.crm && deps.crm) {
      try {
        channels.crm = await deps.crm(input.userId, msg);
      } catch (e) {
        channels.crm = "failed";
        log(`[billing] aviso no CRM falhou: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    try {
      await deps.record?.(input.userId, decision.cycleKey, channels);
    } catch {
      /* registro é só histórico */
    }
    return { status: "sent", decision, locale, channels };
  } catch (e) {
    log(`[billing] aviso de crédito baixo falhou: ${e instanceof Error ? e.message : String(e)}`);
    return { status: "skipped" };
  }
}

// ─────────────── CRM via Vertal Fluxos (genérico, sem adivinhar campos) ───────────────

export interface CrmEngine {
  // deno-lint-ignore no-explicit-any
  call(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<{ status: number; data: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Ações candidatas por CRM, em ordem de preferência. */
export const CRM_NOTE_ACTIONS: Record<string, string[]> = {
  pipedrive: ["createActivity", "createNote"],
  hubspot: ["createNote", "createEngagement", "createTask"],
  salesforce: ["createTask", "createRecord"],
};

const TITLE_KEYS = ["subject", "title", "name", "taskSubject"];
const BODY_KEYS = ["note", "notes", "content", "body", "description", "activityNotes", "text", "comments"];

/**
 * Monta os parâmetros a partir dos argumentos que a ação declara. Se houver campo obrigatório
 * que não sabemos preencher, devolve null (e o CRM é pulado em silêncio).
 */
export function crmParams(args: Array<{ key: string; required?: boolean }>, msg: NoticeMessage): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const a of args) {
    if (TITLE_KEYS.includes(a.key)) out[a.key] = msg.subject;
    else if (BODY_KEYS.includes(a.key)) out[a.key] = msg.text;
  }
  if (!Object.keys(out).length) return null;
  if (args.some((a) => a.required && !(a.key in out))) return null;
  return out;
}

/** Registra o aviso no 1º CRM conectado que aceitar. Sem CRM → "skipped". */
export async function logNoticeToCrm(
  engine: CrmEngine | null,
  connections: Array<{ app_key: string; status: string; fluxos_connection_id: string | null }>,
  msg: NoticeMessage,
): Promise<"logged" | "skipped"> {
  if (!engine) return "skipped";
  for (const c of connections) {
    const candidates = CRM_NOTE_ACTIONS[c.app_key];
    if (!candidates || c.status !== "connected" || !c.fluxos_connection_id) continue;
    const def = await engine.call("GET", `/apps/${c.app_key}`);
    if (def.status !== 200) continue;
    const actions: Array<{ key: string; arguments?: Array<{ key: string; required?: boolean }> }> = def.data?.actions ?? [];
    for (const key of candidates) {
      const action = actions.find((a) => a.key === key);
      if (!action) continue;
      const params = crmParams((action.arguments ?? []).map((a) => ({ key: String(a.key), required: !!a.required })), msg);
      if (!params) continue;
      const r = await engine.call("POST", "/run", { appKey: c.app_key, kind: "action", key, connectionId: c.fluxos_connection_id, parameters: params });
      if (r.status === 200 && r.data?.ok !== false) return "logged";
    }
  }
  return "skipped";
}
