// deno-lint-ignore-file no-explicit-any
// Starts a paid domain order: purchase or transfer. The Dev pays by card at Stripe Checkout;
// the IONOS order is placed only after the webhook confirms payment (see stripe-webhook).
//   POST { action: "purchase" | "transfer", domain, project_id?, auth_code? }  →  { url, order_id }
import Stripe from "npm:stripe@^14";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, sanitizeError } from "../_shared/cors.ts";
import { priceCents, tldOf, loadWholesaleCents } from "../_shared/domainOrders.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://kubovibe.dev";
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shown on the Stripe Checkout page, above the pay button. */
const SUBMIT_MESSAGE =
  "Domínios não podem ser reembolsados depois de registrados. Se o registro falhar, o valor é estornado automaticamente. O valor exibido é o total a pagar em USD.";

function j(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j(405, { error: "method_not_allowed" });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return j(503, { error: "payments_not_configured" });

    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return j(401, { error: "unauthorized" });

    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return j(401, { error: "unauthorized" });
    const user = userRes.user;

    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    if (action !== "purchase" && action !== "transfer") return j(400, { error: "invalid_action" });

    const domain = String(body?.domain ?? "").trim().toLowerCase();
    if (!DOMAIN_RE.test(domain)) return j(400, { error: "invalid_domain" });

    const authCode = String(body?.auth_code ?? "").trim();
    if (action === "transfer" && authCode.length < 4) return j(400, { error: "auth_code_required" });

    const projectId = typeof body?.project_id === "string" && UUID_RE.test(body.project_id) ? body.project_id : null;

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const tld = tldOf(domain);

    // Fail closed: no wholesale price for this TLD means no sale.
    const wholesale = await loadWholesaleCents(svc, tld);
    if (wholesale == null) return j(409, { error: "price_unavailable", tld });
    const price = priceCents(wholesale);

    const { data: order, error: orderErr } = await svc.from("kubo_domain_orders").insert({
      user_id: user.id,
      kind: action,
      domain,
      tld,
      project_id: projectId,
      wholesale_usd_cents: wholesale,
      price_cents: price,
      status: "awaiting_payment",
      auth_code: action === "transfer" ? authCode : null,
    }).select("id").single();
    if (orderErr || !order) return j(500, { error: sanitizeError(orderErr) });

    const stripe = new Stripe(stripeKey);
    const back = projectId ? `/builder/${projectId}/dominio` : "/domains";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: price,
          product_data: {
            name: action === "transfer" ? `Transferência: ${domain}` : `Registro: ${domain} (1 ano)`,
            description: "Parceiro Vertal - IONOS",
          },
        },
      }],
      custom_text: { submit: { message: SUBMIT_MESSAGE } },
      success_url: `${APP_URL}${back}?domain_order=${order.id}&status=success`,
      cancel_url: `${APP_URL}${back}?domain_order=${order.id}&status=cancelled`,
      client_reference_id: user.id,
      metadata: { kind: `domain_${action}`, order_id: order.id, supabase_user_id: user.id },
    });

    await svc.from("kubo_domain_orders").update({ stripe_session_id: session.id }).eq("id", order.id);

    return j(200, { url: session.url, order_id: order.id });
  } catch (e) {
    console.error("[domain-checkout] error:", e);
    return j(500, { error: sanitizeError(e) });
  }
});
