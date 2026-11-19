// ============================================================
// Edge Function: asaas-webhook (VERTAL Bank)
// Recebe eventos do ASAAS das subcontas dos usuários (configurados na criação
// da subconta, ação `asaas-open` da função `wallet`).
//
//   PAYMENT_*                 -> bank_transactions (cobranças Pix/boleto/cartão/link)
//   TRANSFER_*                -> bank_transactions (Pix de saída)
//   ACCOUNT_STATUS_*          -> bank_asaas_accounts.status
//
// Autenticação: header `asaas-access-token` == ASAAS_WEBHOOK_TOKEN
// (comparação em tempo constante). Sem o secret, responde 503 e não processa.
// Idempotência: bank_webhook_events (provider = 'asaas', event_id = body.id).
// URL: https://<ref>.supabase.co/functions/v1/asaas-webhook (verify_jwt = false)
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@^2";
import { mapPaymentStatus, mapTransferStatus } from "../_shared/asaas.ts";

type Row = Record<string, any>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function safeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

const toCents = (v: unknown) => (v === undefined || v === null ? null : Math.round(Number(v) * 100));

/** externalReference "vb:<uuid>" -> uuid do usuário. */
function userFromRef(ref: unknown): string | null {
  const m = /^vb:([0-9a-f-]{36})$/i.exec(String(ref ?? ""));
  return m ? m[1] : null;
}

const BILLING_TO_METHOD: Record<string, string> = { PIX: "pix", BOLETO: "boleto", CREDIT_CARD: "card", DEBIT_CARD: "card" };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expected = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
  if (!expected) {
    console.error("asaas-webhook: ASAAS_WEBHOOK_TOKEN not configured");
    return json({ error: "not_configured" }, 503);
  }
  const got = req.headers.get("asaas-access-token") ?? "";
  if (!safeEqual(got, expected)) return json({ error: "unauthorized" }, 401);

  let body: Row;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const event = String(body.event ?? "");
  const eventId = String(body.id ?? `${event}:${body.payment?.id ?? body.transfer?.id ?? body.accountStatus?.id ?? ""}:${body.dateCreated ?? ""}`);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Idempotência: um mesmo evento só é processado uma vez.
  const { error: dupErr } = await db.from("bank_webhook_events").insert({ provider: "asaas", event_id: eventId, event_type: event });
  if (dupErr) {
    if ((dupErr as Row).code === "23505") return json({ received: true, duplicate: true });
    console.error("asaas-webhook: idempotency insert failed", dupErr.message);
    return json({ error: "storage_failed" }, 500);
  }

  try {
    if (event.startsWith("PAYMENT_") && body.payment) {
      const p = body.payment as Row;
      const status = mapPaymentStatus(event === "PAYMENT_DELETED" ? "DELETED" : p.status);
      const patch: Row = {
        status,
        net_minor: toCents(p.netValue),
        receipt_url: p.transactionReceiptUrl ?? null,
        settled_at: status === "paid" ? new Date().toISOString() : null,
      };
      const { data: updated, error } = await db.from("bank_transactions").update(patch)
        .eq("provider", "asaas").eq("provider_ref", String(p.id)).neq("status", "paid").select("id");
      if (error) throw error;

      // Pagamento nascido de um link de pagamento: cria a linha no extrato.
      if (!updated?.length) {
        const { data: exists } = await db.from("bank_transactions").select("id")
          .eq("provider", "asaas").eq("provider_ref", String(p.id)).maybeSingle();
        const userId = userFromRef(p.externalReference);
        let owner = userId;
        if (!owner && p.paymentLink) {
          const { data: link } = await db.from("bank_transactions").select("user_id")
            .eq("provider", "asaas").eq("provider_ref", String(p.paymentLink)).maybeSingle();
          owner = link?.user_id ?? null;
        }
        if (!exists && owner && Number(p.value) > 0) {
          const { error: insErr } = await db.from("bank_transactions").insert({
            user_id: owner, provider: "asaas", direction: "in",
            method: BILLING_TO_METHOD[String(p.billingType)] ?? "link",
            status, amount_minor: toCents(p.value), net_minor: toCents(p.netValue), currency: "brl",
            description: p.description ? String(p.description).slice(0, 200) : null,
            provider_ref: String(p.id), checkout_url: p.invoiceUrl ?? null,
            receipt_url: p.transactionReceiptUrl ?? null, due_date: p.dueDate ?? null,
            settled_at: status === "paid" ? new Date().toISOString() : null,
            metadata: { payment_link: p.paymentLink ?? null, billing_type: p.billingType ?? null },
          });
          if (insErr && (insErr as Row).code !== "23505") throw insErr;
        }
      }
    } else if (event.startsWith("TRANSFER_") && body.transfer) {
      const t = body.transfer as Row;
      const { error } = await db.from("bank_transactions").update({
        status: mapTransferStatus(t.status),
        failure_reason: t.failReason ?? null,
        receipt_url: t.transactionReceiptUrl ?? null,
        settled_at: t.status === "DONE" ? new Date().toISOString() : null,
      }).eq("provider", "asaas").eq("provider_ref", String(t.id));
      if (error) throw error;
    } else if (event.startsWith("ACCOUNT_STATUS_") && body.accountStatus) {
      const s = body.accountStatus as Row;
      const general = String(s.general ?? "");
      const status = general === "APPROVED" ? "approved"
        : general === "REJECTED" ? "rejected"
        : general === "AWAITING_APPROVAL" ? "awaiting_approval" : "pending";
      const { error } = await db.from("bank_asaas_accounts").update({
        status,
        status_detail: s,
        status_synced_at: new Date().toISOString(),
      }).eq("asaas_account_id", String(s.id));
      if (error) throw error;
    } else {
      console.log(`asaas-webhook: unhandled ${event} (${eventId})`);
    }
  } catch (err) {
    console.error("asaas-webhook error:", event, eventId, err);
    // Libera o evento para o reenvio do ASAAS processar de novo.
    await db.from("bank_webhook_events").delete().eq("provider", "asaas").eq("event_id", eventId);
    return json({ error: "processing_failed" }, 500);
  }

  return json({ received: true });
});
