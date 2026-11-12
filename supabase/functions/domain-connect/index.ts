// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, sanitizeError } from "../_shared/cors.ts";
import { cfConfig, cfEnsureZone } from "../_shared/cloudflare.ts";

function tldOf(domain: string) {
  const parts = domain.toLowerCase().split(".");
  if (parts.length >= 3 && parts[parts.length - 2] === "com" && parts[parts.length - 1] === "br") return "com.br";
  return parts[parts.length - 1] ?? "com";
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

    const body = await req.json().catch(() => ({}));
    const domain = String(body?.domain ?? "").trim().toLowerCase();
    const nameservers: string[] = Array.isArray(body?.nameservers) ? body.nameservers.map((s: any) => String(s)) : [];
    const project_id = body?.project_id ?? null;
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
      return new Response(JSON.stringify({ error: "invalid_domain" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Onboard the domain into Cloudflare DNS: the client points their registrar to these
    // nameservers (first step of a transfer to Cloudflare Registrar, too).
    const viaCloudflare = body?.provider !== "manual" && cfConfig().enabled;
    const zone = viaCloudflare ? await cfEnsureZone(domain) : null;
    if (zone?.name_servers?.length) nameservers.splice(0, nameservers.length, ...zone.name_servers);

    const { data: dom, error: ie } = await svc.from("kubo_domains").insert({
      user_id: userRes.user.id,
      domain_name: domain,
      tld: tldOf(domain),
      source: "connect",
      status: zone ? "pending" : "active",
      nameservers,
      metadata: zone ? { provider: "cloudflare", partner: "Vertal Domínios - Parceiros", cf_zone_id: zone.id } : { provider: "manual" },
      project_id,
      ssl_status: "pending",
      credits_spent: 0,
    }).select().single();
    if (ie) return new Response(JSON.stringify({ error: sanitizeError(ie) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ success: true, domain: dom, nameservers, provider: zone ? "cloudflare" : "manual" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[domain-connect] error:", e);
    return new Response(JSON.stringify({ error: sanitizeError(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
