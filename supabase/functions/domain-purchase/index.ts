// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, sanitizeError } from "../_shared/cors.ts";
import { z } from "npm:zod@3";
import { cfConfig, cfDomainCheck, cfEnsureZone, cfErrorMessage, cfRegister, cfRegistrationStatus, usdToCredits } from "../_shared/cloudflare.ts";

const IONOS_API = "https://api.hosting.ionos.com/domains/v1";
const RESELLER_API = "https://api.ionos.com/reseller/v2";

const PurchaseSchema = z.object({
  domain: z.string().min(3).max(253).regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/),
  project_id: z.string().uuid().optional().nullable(),
});

function buildIonosKey(): string {
  const key = (Deno.env.get("IONOS_API_KEY") ?? "").trim();
  const prefix = (Deno.env.get("IONOS_API_PREFIX") ?? "").trim();
  if (!key) return "";
  if (key.includes(".")) return key;
  if (prefix) return `${prefix}.${key}`;
  return key;
}
const PLAN_LIMITS: Record<string, any> = {
  starter: { ramServerMax: 2, cpuServerMax: 1, ips: 1 },
  pro: { ramServerMax: 8, cpuServerMax: 4, ips: 2 },
  enterprise: { ramServerMax: 32, cpuServerMax: 16, ips: 10 },
};
const TLD_PRICES: Record<string, number> = {
  com: 15, "com.br": 25, net: 16, org: 16, dev: 18, app: 22,
  io: 50, ai: 80, co: 30, xyz: 8, tech: 20, store: 25, online: 18,
};

function tldOf(domain: string) {
  const parts = domain.toLowerCase().split(".");
  if (parts.length >= 3 && parts[parts.length - 2] === "com" && parts[parts.length - 1] === "br") return "com.br";
  return parts[parts.length - 1] ?? "com";
}

async function getOrCreateContract(svc: any, userId: string, email: string, apiKey: string) {
  const { data: existing } = await svc.from("kubo_ionos_contracts").select("*").eq("user_id", userId).maybeSingle();
  if (existing) return existing;

  const reseller_reference = `kubo_${userId.slice(0, 8)}`;
  let contract_id = `local_${userId.slice(0, 8)}`;
  let admin_id: string | null = null;

  if (apiKey) {
    try {
      const r = await fetch(`${RESELLER_API}/contracts`, {
        method: "POST",
        headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Kubo ${email}`,
          resellerReference: reseller_reference,
          resourceLimits: PLAN_LIMITS.starter,
        }),
      });
      if (r.ok) {
        const d = await r.json();
        contract_id = String(d?.id ?? contract_id);
        // Try admin creation but don't fail purchase if it errors
        try {
          const ar = await fetch(`${RESELLER_API}/contracts/${contract_id}/admins`, {
            method: "POST",
            headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              firstName: "Kubo",
              lastName: email.split("@")[0] ?? "User",
              email,
              password: crypto.randomUUID() + "Aa1!",
            }),
          });
          if (ar.ok) admin_id = String((await ar.json())?.id ?? null);
        } catch { /* ignore */ }
      }
    } catch { /* fallback to local id */ }
  }

  const { data: inserted, error } = await svc.from("kubo_ionos_contracts").insert({
    user_id: userId, contract_id, admin_id, reseller_reference,
    plan: "starter", resource_limits: PLAN_LIMITS.starter,
  }).select().single();
  if (error) throw error;
  return inserted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: userRes, error: ue } = await userClient.auth.getUser();
    if (ue || !userRes?.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const user = userRes.user;

    const rawBody = await req.json().catch(() => ({}));

    // Poll a Cloudflare registration that answered 202 (in_progress).
    if (rawBody?.action === "status") {
      const { data: d } = await svc.from("kubo_domains").select("*").eq("id", String(rawBody.domain_id ?? "")).eq("user_id", user.id).maybeSingle();
      if (!d) return new Response(JSON.stringify({ error: "domain not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (d.metadata?.provider !== "cloudflare" || !cfConfig().enabled) return new Response(JSON.stringify({ domain: d }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const st = await cfRegistrationStatus(d.domain_name);
      const state: string = st.body?.result?.state ?? d.metadata?.registration_state ?? "in_progress";
      const reg = st.body?.result?.context?.registration;
      const status = state === "succeeded" ? "active" : ["failed", "blocked"].includes(state) ? "failed" : state === "action_required" ? "pending" : "processing";
      const { data: updated } = await svc.from("kubo_domains").update({
        status, ssl_status: status === "active" ? "provisioning" : d.ssl_status,
        expires_at: reg?.expires_at ?? d.expires_at,
        metadata: { ...d.metadata, registration_state: state },
      }).eq("id", d.id).select().single();
      return new Response(JSON.stringify({ domain: updated ?? d, state }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const parsed = PurchaseSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "invalid_input", details: parsed.error.flatten().fieldErrors }), { 
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const { domain, project_id } = parsed.data;
    const tld = tldOf(domain);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ── Primary partner: Cloudflare Registrar ────────────────────────────
    const cf = cfConfig();
    if (cf.enabled) {
      const [quote] = await cfDomainCheck([domain]);
      if (quote && !quote.registrable && quote.reason !== "extension_not_supported_via_api") {
        return json({ error: quote.reason ?? "domain_unavailable" }, 409);
      }
      if (quote?.registrable) {
        if (quote.tier && quote.tier !== "standard") return json({ error: "premium_domain_not_supported" }, 409);
        const usd = Number(quote.pricing?.registration_cost ?? 0);
        const cfPrice = await usdToCredits(svc, usd);
        const idempCf = `domain-purchase:cf:${user.id}:${domain}`;
        const { data: deductCf, error: deCf } = await svc.rpc("execute_atomic_credit_deduction", {
          _user_id: user.id, _amount: cfPrice, _reason: `domain_purchase:${domain}`, _category: "domain",
          _metadata: { domain, tld, provider: "cloudflare", price_usd: usd }, _idempotency_key: idempCf,
        });
        if (deCf) {
          const msg = (deCf as any)?.message ?? "credit_error";
          return json({ error: msg }, msg.includes("insufficient") ? 402 : 400);
        }

        const reg = await cfRegister(domain);
        const state: string = reg.body?.result?.state ?? (reg.ok ? "in_progress" : "failed");
        const failed = !reg.ok || ["failed", "blocked"].includes(state);

        try {
          await svc.from("connector_activity_logs").insert({
            connector_slug: "cloudflare", user_id: user.id, event_type: "purchase",
            status: failed ? "error" : "success",
            message: `Compra ${domain} (${cfPrice}c · $${usd}) → ${state}`,
            metadata: { domain, tld, price: cfPrice, price_usd: usd, state, http: reg.status, error: failed ? cfErrorMessage(reg.body) : null },
          });
        } catch { /* ignore */ }

        if (failed) {
          await svc.rpc("execute_atomic_credit_topup", {
            _user_id: user.id, _amount: cfPrice, _reason: `refund:domain_purchase:${domain}`, _category: "domain_refund",
            _metadata: { domain, provider: "cloudflare", state }, _idempotency_key: `refund:${idempCf}`,
          });
          return json({ error: `registration_${state}`, detail: cfErrorMessage(reg.body), refunded: true }, 502);
        }

        const zone = await cfEnsureZone(domain);
        const registration = reg.body?.result?.context?.registration;
        const { data: dom, error: ie } = await svc.from("kubo_domains").insert({
          user_id: user.id, domain_name: domain, tld, source: "purchase",
          status: state === "succeeded" ? "active" : state === "action_required" ? "pending" : "processing",
          project_id, credits_spent: cfPrice,
          ssl_status: state === "succeeded" ? "provisioning" : "pending",
          expires_at: registration?.expires_at ?? null,
          auto_renew: registration?.auto_renew ?? false,
          nameservers: zone?.name_servers ?? [],
          metadata: { provider: "cloudflare", partner: "Vertal Domínios - Parceiros", cf_zone_id: zone?.id ?? null, registration_state: state, price_usd: usd, credit_tx: deductCf },
        }).select().single();
        if (ie) return json({ error: sanitizeError(ie), refund_required: true, deduct: deductCf }, 500);
        return json({ success: true, provider: "cloudflare", state, domain: dom, balance_after: (deductCf as any)?.balance_after });
      }
      // extension_not_supported_via_api → falls through to IONOS (e.g. .com.br)
    }

    // ── Fallback partner: IONOS ──────────────────────────────────────────
    const price = TLD_PRICES[tld] ?? 20;
    if (!buildIonosKey()) {
      // Never debit credits when no registrar can actually place the order.
      return json({ error: cf.enabled ? "extension_not_supported" : "registrar_not_configured" }, 503);
    }

    // 1) Debit credits atomically
    const idemp = `domain-purchase:${user.id}:${domain}`;
    const { data: deduct, error: de } = await svc.rpc("execute_atomic_credit_deduction", {
      _user_id: user.id,
      _amount: price,
      _reason: `domain_purchase:${domain}`,
      _category: "domain",
      _metadata: { domain, tld },
      _idempotency_key: idemp,
    });
    if (de) {
      const msg = (de as any)?.message ?? "credit_error";
      const code = msg.includes("insufficient") ? 402 : 400;
      return new Response(JSON.stringify({ error: msg }), { status: code, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2) Ensure IONOS contract
    const apiKey = buildIonosKey();
    const contract = await getOrCreateContract(svc, user.id, user.email ?? `${user.id}@kubo.local`, apiKey);

    // 3) Place order on IONOS (best effort)
    let ionos_domain_id: string | null = null;
    let status = apiKey ? "processing" : "pending";
    let ionosResponseBody: any = null;
    let ionosHttpStatus: number | null = null;
    if (apiKey) {
      try {
        const r = await fetch(`${IONOS_API}/domainorders`, {
          method: "POST",
          headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify([{ domainName: domain, period: 1, autoRenewal: true }]),
        });
        ionosHttpStatus = r.status;
        const text = await r.text();
        try { ionosResponseBody = JSON.parse(text); } catch { ionosResponseBody = text; }
        if (r.ok) {
          const first = Array.isArray(ionosResponseBody) ? ionosResponseBody[0] : ionosResponseBody;
          ionos_domain_id = String(first?.id ?? first?.orderId ?? "");
          status = "active";
        } else {
          status = "failed";
        }
      } catch (e: any) {
        status = "failed";
        ionosResponseBody = { error: e?.message };
      }
    }

    // Log
    try {
      await svc.from("connector_activity_logs").insert({
        connector_slug: "ionos", user_id: user.id, event_type: "purchase",
        status: status === "failed" ? "error" : "success",
        message: `Compra ${domain} (${price}c) → ${status}`,
        metadata: { domain, tld, price, status, ionos_domain_id, http: ionosHttpStatus, ionos_body: ionosResponseBody },
      });
    } catch { /* ignore */ }

    // 4) Persist domain
    const { data: dom, error: ie } = await svc.from("kubo_domains").insert({
      user_id: user.id,
      contract_id: contract.contract_id,
      ionos_domain_id,
      domain_name: domain,
      tld,
      source: "purchase",
      status,
      project_id,
      credits_spent: price,
      ssl_status: status === "active" ? "provisioning" : "pending",
      metadata: { provider: "ionos", partner: "Vertal Domínios - Parceiros", credit_tx: deduct },
    }).select().single();
    if (ie) {
      return new Response(JSON.stringify({ error: sanitizeError(ie), refund_required: true, deduct }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, domain: dom, contract, balance_after: (deduct as any)?.balance_after }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[domain-purchase] error:", e);
    return new Response(JSON.stringify({ error: sanitizeError(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
