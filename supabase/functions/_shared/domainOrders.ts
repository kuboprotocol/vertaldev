// deno-lint-ignore-file no-explicit-any
// Shared logic for paid domain orders (purchase and transfer).
// Money flow: the Dev pays at Stripe Checkout first; only after `checkout.session.completed`
// with payment_status "paid" do we order the domain at IONOS. If IONOS refuses, we refund.
import type Stripe from "npm:stripe@^14";

const IONOS_API = "https://api.hosting.ionos.com/domains/v1";
const RESELLER_API = "https://api.ionos.com/reseller/v2";

/** Resale markup over the IONOS wholesale price: 38%. */
export const MARKUP_PERCENT = 138;

/** Customer price in cents for a wholesale price in cents (rounds up to the cent). */
export function priceCents(wholesaleCents: number): number {
  return Math.ceil((wholesaleCents * MARKUP_PERCENT) / 100);
}

export function tldOf(domain: string): string {
  const parts = domain.toLowerCase().split(".");
  if (parts.length >= 3 && parts[parts.length - 2] === "com" && parts[parts.length - 1] === "br") return "com.br";
  return parts[parts.length - 1] ?? "";
}

export function buildIonosKey(): string {
  const key = (Deno.env.get("IONOS_API_KEY") ?? "").trim();
  const prefix = (Deno.env.get("IONOS_API_PREFIX") ?? "").trim();
  if (!key) return "";
  if (key.includes(".")) return key;
  if (prefix) return `${prefix}.${key}`;
  return key;
}

/** Wholesale price for a TLD in cents, or null when the price list has no row for it. */
export async function loadWholesaleCents(svc: any, tld: string): Promise<number | null> {
  const { data } = await svc.from("kubo_domain_prices").select("wholesale_usd_cents").eq("tld", tld).maybeSingle();
  return data?.wholesale_usd_cents ?? null;
}

async function ensureContract(svc: any, userId: string, email: string, apiKey: string) {
  const { data: existing } = await svc.from("kubo_ionos_contracts").select("*").eq("user_id", userId).maybeSingle();
  if (existing) return existing;

  const reseller_reference = `kubo_${userId.slice(0, 8)}`;
  let contract_id = `local_${userId.slice(0, 8)}`;
  let admin_id: string | null = null;
  try {
    const r = await fetch(`${RESELLER_API}/contracts`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Kubo ${email}`, resellerReference: reseller_reference }),
    });
    if (r.ok) contract_id = String(((await r.json()) as any)?.id ?? contract_id);
  } catch { /* keep the local id */ }

  const { data: inserted, error } = await svc.from("kubo_ionos_contracts").insert({
    user_id: userId, contract_id, admin_id, reseller_reference, plan: "starter",
  }).select().single();
  if (error) throw error;
  return inserted;
}

interface OrderRow {
  id: string;
  user_id: string;
  kind: "purchase" | "transfer";
  domain: string;
  tld: string;
  project_id: string | null;
  price_cents: number;
  auth_code: string | null;
  stripe_payment_intent: string | null;
}

/** Places the paid order at IONOS and records the domain. Throws if IONOS refuses. */
async function placeAtIonos(svc: any, order: OrderRow): Promise<void> {
  const apiKey = buildIonosKey();
  if (!apiKey) throw new Error("ionos_not_configured");

  const item = order.kind === "transfer"
    ? { domainName: order.domain, type: "transfer", authCode: order.auth_code, period: 1 }
    : { domainName: order.domain, period: 1, autoRenewal: true };

  const r = await fetch(`${IONOS_API}/domainorders`, {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify([item]),
  });
  const text = await r.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  if (!r.ok) throw new Error(`ionos_${r.status}: ${typeof body === "string" ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)}`);

  const first = Array.isArray(body) ? body[0] : body;
  const ionosRef = String(first?.id ?? first?.orderId ?? "");

  // Order accepted: clear the auth code now, before anything else can fail.
  await svc.from("kubo_domain_orders").update({
    status: "ordered", ionos_ref: ionosRef, auth_code: null, error: null, updated_at: new Date().toISOString(),
  }).eq("id", order.id);

  // From here on IONOS has the order. Local bookkeeping must NOT throw, or the caller would
  // refund a domain the Dev already has. Errors are logged for manual reconciliation.
  try {
    const { data: userRes } = await svc.auth.admin.getUserById(order.user_id);
    const contract = await ensureContract(svc, order.user_id, userRes?.user?.email ?? `${order.user_id}@kubo.local`, apiKey);
    const { error: domErr } = await svc.from("kubo_domains").insert({
      user_id: order.user_id,
      contract_id: contract.contract_id,
      ionos_domain_id: ionosRef,
      domain_name: order.domain,
      tld: order.tld,
      source: order.kind === "transfer" ? "transfer" : "purchase",
      status: order.kind === "transfer" ? "transferring" : "active",
      project_id: order.project_id,
      credits_spent: 0,
      ssl_status: "provisioning",
      metadata: { order_id: order.id, price_cents: order.price_cents, paid_by: "stripe" },
    });
    if (domErr) console.error("[domainOrders] domain row insert failed (reconcile):", order.id, domErr);
  } catch (e) {
    console.error("[domainOrders] local bookkeeping failed after IONOS accepted (reconcile):", order.id, e);
  }
}

/** Marks the order failed and refunds the card, so the Dev is never charged for a domain they did not get. */
async function failAndRefund(svc: any, stripe: Stripe, order: OrderRow, message: string) {
  await svc.from("kubo_domain_orders").update({
    status: "failed", error: message.slice(0, 500), auth_code: null, updated_at: new Date().toISOString(),
  }).eq("id", order.id);

  if (!order.stripe_payment_intent) return;
  try {
    await stripe.refunds.create({ payment_intent: order.stripe_payment_intent, reason: "requested_by_customer" });
    await svc.from("kubo_domain_orders").update({ status: "refunded", updated_at: new Date().toISOString() }).eq("id", order.id);
  } catch (e) {
    console.error("[domainOrders] refund failed for order", order.id, e);
  }
}

/**
 * Called from the Stripe webhook on checkout.session.completed for domain sessions.
 * Idempotent: only an order still in `awaiting_payment` is processed.
 */
export async function handleDomainCheckout(svc: any, stripe: Stripe, session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== "paid") return;
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  const { data: claimed } = await svc.from("kubo_domain_orders").update({
    status: "paid", stripe_payment_intent: paymentIntent, updated_at: new Date().toISOString(),
  }).eq("stripe_session_id", session.id).eq("status", "awaiting_payment").select("*").maybeSingle();
  if (!claimed) return; // already handled, or not one of ours

  const order = claimed as OrderRow;
  try {
    await placeAtIonos(svc, order);
  } catch (e: any) {
    console.error("[domainOrders] IONOS order failed:", e?.message ?? e);
    await failAndRefund(svc, stripe, order, e?.message ?? "ionos_error");
  }
}
