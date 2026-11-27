// VERTAL · fluxo do e-mail de boas-vindas v2. PURO: recebe as dependências (usuário, log, envio) por injeção,
// então os testes rodam sem rede e sem mandar e-mail de verdade.
//
// Regras (pedido do Laércio, 2026-11-26):
//  - Uma vez por conta nova, DEPOIS do cadastro com e-mail confirmado (ou 1º login com Google, que já vem confirmado).
//  - Nunca dois e-mails de boas-vindas: se o "welcome" antigo ou o v2 já constar como enviado, não envia.
//  - Chave de idempotência fixa por usuário no provedor (vertal-welcome-<userId>) cobre corrida entre duas chamadas.
import {
  buildWelcomeEmail,
  firstNameFrom,
  WELCOME_TEMPLATES_SENT,
  WELCOME_V2_TEMPLATE,
  type WelcomeConfig,
  type WelcomeEmail,
} from "./welcomeEmail.ts";

export interface WelcomeUser {
  id: string;
  email: string | null;
  createdAt: string | null;
  /** auth.users.email_confirmed_at (Google/OAuth já chega preenchido). */
  emailConfirmedAt: string | null;
  meta: Record<string, unknown> | null;
}

export interface WelcomeSendInput {
  to: string;
  fromName: string;
  replyTo: string;
  email: WelcomeEmail;
  idempotencyKey: string;
  label: string;
}

export interface WelcomeDeps {
  /** Já existe envio com status "sent" deste destinatário em algum dos templates? */
  alreadySent(recipient: string, templates: readonly string[]): Promise<boolean>;
  send(input: WelcomeSendInput): Promise<{ sent: boolean; reason?: string }>;
  log(entry: { status: "sent" | "suppressed" | "failed"; recipient: string; error?: string }): Promise<void>;
  now(): number;
}

export type WelcomeOutcome =
  | { status: "sent" }
  | { status: "skipped"; reason: "no_email" | "awaiting_confirmation" | "account_not_new" | "already_sent" | "suppressed" }
  | { status: "failed"; error: string };

export function welcomeIdempotencyKey(userId: string): string {
  return `vertal-welcome-${userId}`;
}

export async function runWelcomeV2(cfg: WelcomeConfig, user: WelcomeUser, deps: WelcomeDeps): Promise<WelcomeOutcome> {
  if (!user.email) return { status: "skipped", reason: "no_email" };
  if (!user.emailConfirmedAt) return { status: "skipped", reason: "awaiting_confirmation" };

  const created = user.createdAt ? new Date(user.createdAt).getTime() : NaN;
  if (!Number.isFinite(created) || deps.now() - created > cfg.maxAccountAgeHours * 3_600_000) {
    return { status: "skipped", reason: "account_not_new" };
  }

  if (await deps.alreadySent(user.email, WELCOME_TEMPLATES_SENT)) return { status: "skipped", reason: "already_sent" };

  const email = buildWelcomeEmail({ firstName: firstNameFrom(user.meta), cfg });
  try {
    const r = await deps.send({
      to: user.email,
      fromName: cfg.fromName,
      replyTo: cfg.replyTo,
      email,
      idempotencyKey: welcomeIdempotencyKey(user.id),
      label: WELCOME_V2_TEMPLATE,
    });
    if (!r.sent) {
      await deps.log({ status: "suppressed", recipient: user.email });
      return { status: "skipped", reason: "suppressed" };
    }
    await deps.log({ status: "sent", recipient: user.email });
    return { status: "sent" };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await deps.log({ status: "failed", recipient: user.email, error });
    return { status: "failed", error };
  }
}
