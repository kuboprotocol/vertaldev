// ============================================================
// Edge Function: stripe-connect-webhook
// Eventos de contas conectadas (endpoint Stripe com connect=true).
//
//   account.updated                          -> espelha status em connected_accounts
//   checkout.session.completed               -> wallet_charges: paid (se pago)
//   checkout.session.async_payment_succeeded -> wallet_charges: paid
//   checkout.session.async_payment_failed    -> wallet_charges: failed
//   checkout.session.expired                 -> wallet_charges: expired
//   payout.paid | payout.failed | payout.canceled -> bank_transactions (saques do Vertal Vibe Bank)
//
// Segredo de assinatura: STRIPE_CONNECT_WEBHOOK_SECRET (diferente do
// STRIPE_WEBHOOK_SECRET do endpoint da plataforma).
// URL: https://<ref>.supabase.co/functions/v1/stripe-connect-webhook (verify_jwt = false)
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@^2";
import Stripe from "npm:stripe@^14";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function accountStatus(a: Stripe.Account) {
  const req = a.requirements;
  return {
    charges_enabled: a.charges_enabled ?? false,
    payouts_enabled: a.payouts_enabled ?? false,
    details_submitted: a.details_submitted ?? false,
    requirements_disabled_reason: req?.disabled_reason ?? null,
    requirements_due: Array.from(new Set([...(req?.past_due ?? []), ...(req?.currently_due ?? [])])),
    status_synced_at: new Date().toISOString(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const webhookSecret = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("stripe-connect-webhook: STRIPE_CONNECT_WEBHOOK_SECRET not configured");
    return json({ error: "not_configured" }, 500);
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) return json({ error: "missing_signature" }, 400);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), sig, webhookSecret);
  } catch (err) {
    return json({ error: `invalid_signature: ${(err as Error).message}` }, 400);
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    switch (event.type) {
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const { error } = await db.from("connected_accounts")
          .update(accountStatus(account)).eq("stripe_account_id", account.id);
        if (error) throw error;
        break;
      }

      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.source !== "wallet") break;
        let status: "paid" | "failed" | "expired" | null = null;
        if (event.type === "checkout.session.expired") status = "expired";
        else if (event.type === "checkout.session.async_payment_failed") status = "failed";
        else if (session.payment_status === "paid") status = "paid";
        if (!status) break; // completed mas aguardando pagamento assíncrono
        const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
        const { error } = await db.from("wallet_charges").update({
          status,
          payment_intent_id: pi,
          paid_at: status === "paid" ? new Date(event.created * 1000).toISOString() : null,
        }).eq("checkout_session_id", session.id).neq("status", "paid");
        if (error) throw error;
        break;
      }

      case "payout.paid":
      case "payout.failed":
      case "payout.canceled": {
        const po = event.data.object as Stripe.Payout;
        const status = event.type === "payout.paid" ? "paid" : event.type === "payout.failed" ? "failed" : "canceled";
        const { error } = await db.from("bank_transactions").update({
          status,
          failure_reason: po.failure_message ?? null,
          settled_at: status === "paid" ? new Date(event.created * 1000).toISOString() : null,
        }).eq("provider", "stripe").eq("provider_ref", po.id);
        if (error) throw error;
        break;
      }

      default:
        console.log(`stripe-connect-webhook: unhandled ${event.type} (${event.id})`);
    }
  } catch (err) {
    console.error("stripe-connect-webhook error:", event.type, event.id, err);
    return json({ error: "processing_failed" }, 500);
  }

  return json({ received: true });
});
