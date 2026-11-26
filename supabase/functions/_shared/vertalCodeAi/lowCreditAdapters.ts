// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any -- cliente Supabase sem tipos gerados nas edge functions */
// VERTAL · adaptadores de produção do aviso de crédito baixo (só Deno / edge functions).
//
// - Recarga: última linha positiva de credit_transactions com reason em lowCredit.topUpReasons
//   (o stripe-webhook grava "credit_purchase").
// - In-app + dedupe: tabela vertal_billing_notices (docs/vertal-code-ai/proposed-migration-billing-v2.sql,
//   NÃO aplicada). Sem a tabela, nada é enviado (sem dedupe não há aviso).
// - E-mail: mesmo caminho do repo (Lovable Email, remetente verificado notify.kubovibe.dev,
//   LOVABLE_API_KEY já existente). Sem a chave → canal "no_provider". Nada de segredo novo.
// - CRM: conexões do próprio cliente no Vertal Fluxos (fluxos_connections) via motor interno.
import { logEmailSend } from "../email-send-log.ts";
import type { BillingConfig } from "./billing.ts";
import { CRM_NOTE_ACTIONS, type CrmEngine, type LowCreditDeps, logNoticeToCrm } from "./lowCreditNotice.ts";

const SENDER_DOMAIN = "notify.kubovibe.dev";
const FROM_DOMAIN = "kubovibe.dev";

export function makeLowCreditDeps(admin: any, cfg: BillingConfig, opts: { engine: CrmEngine | null; env: (k: string) => string | undefined }): LowCreditDeps {
  return {
    async lastTopUp(userId) {
      const { data, error } = await admin
        .from("credit_transactions")
        .select("id, delta, created_at")
        .eq("user_id", userId)
        .gt("delta", 0)
        .in("reason", cfg.lowCredit.topUpReasons)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      return { id: String(data.id), credits: Number(data.delta) || 0, at: data.created_at };
    },
    async alreadyNotified(userId, cycleKey) {
      const { data, error } = await admin
        .from("vertal_billing_notices")
        .select("id")
        .eq("user_id", userId)
        .eq("kind", "low_credit")
        .eq("cycle_key", cycleKey)
        .maybeSingle();
      if (error) return true; // sem tabela/erro: não arrisca aviso repetido
      return !!data;
    },
    async claim(userId, cycleKey, msg, meta) {
      const { error } = await admin.from("vertal_billing_notices").insert({
        user_id: userId,
        kind: "low_credit",
        cycle_key: cycleKey,
        locale: msg.locale,
        title: msg.title,
        body: msg.text,
        meta,
      });
      return !error;
    },
    async account(userId) {
      const [{ data: u }, { data: prof }] = await Promise.all([
        admin.auth.admin.getUserById(userId),
        admin.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
      ]);
      const md = (u?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
      return {
        email: s(u?.user?.email),
        name: s(md.full_name) ?? s(md.name) ?? s(prof?.display_name) ?? null,
        localeHints: [s(md.vertal_lang), s(md.locale), s(md.language), s(md.lang)],
      };
    },
    async email(to, msg, idempotencyKey) {
      const apiKey = opts.env("LOVABLE_API_KEY");
      if (!apiKey) throw new Error("no_provider");
      const { sendLovableEmail } = await import("npm:@lovable.dev/email-js@0.1.0");
      try {
        await sendLovableEmail(
          {
            to,
            from: `Vertal <noreply@${FROM_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject: msg.subject,
            html: msg.html,
            text: msg.text,
            purpose: "transactional",
            label: "vertal_low_credit",
            idempotency_key: idempotencyKey,
          },
          { apiKey, sendUrl: opts.env("LOVABLE_SEND_URL") },
        );
        await logEmailSend(admin, { templateName: "vertal_low_credit", recipientEmail: to, status: "sent", metadata: { locale: msg.locale } });
      } catch (e) {
        await logEmailSend(admin, { templateName: "vertal_low_credit", recipientEmail: to, status: "failed", errorMessage: e instanceof Error ? e.message : String(e) });
        throw e;
      }
    },
    async crm(userId, msg) {
      const { data } = await admin
        .from("fluxos_connections")
        .select("app_key, status, fluxos_connection_id")
        .eq("user_id", userId)
        .in("app_key", Object.keys(CRM_NOTE_ACTIONS));
      if (!data?.length) return "skipped";
      return await logNoticeToCrm(opts.engine, data, msg);
    },
    async record(userId, cycleKey, channels) {
      await admin.from("vertal_billing_notices").update({ channels }).eq("user_id", userId).eq("kind", "low_credit").eq("cycle_key", cycleKey);
    },
    log: (m) => console.warn(m),
  };
}
