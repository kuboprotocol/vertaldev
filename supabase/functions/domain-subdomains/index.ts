// deno-lint-ignore-file no-explicit-any
// Vertal Domínios - Parceiros: subdomains.
//  - kind "vertal": free "<label>.<VERTAL_ROOT_DOMAIN>" on the Vertal Cloudflare zone
//  - kind "custom": "<label>.<client domain>" on a domain the client owns in Vertal
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, sanitizeError } from "../_shared/cors.ts";
import { cfConfig, cfCreateDnsRecord, cfDeleteDnsRecord, cfErrorMessage } from "../_shared/cloudflare.ts";

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RESERVED = new Set(["www", "api", "app", "admin", "mail", "smtp", "ftp", "ns1", "ns2", "status", "docs", "dashboard", "auth", "cdn", "static"]);
const MAX_VERTAL_SUBDOMAINS = Number(Deno.env.get("VERTAL_FREE_SUBDOMAINS") ?? "3");

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: userRes, error: ue } = await userClient.auth.getUser();
    if (ue || !userRes?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    const rootDomain = (Deno.env.get("VERTAL_ROOT_DOMAIN") ?? "").trim().toLowerCase();
    const rootZoneId = (Deno.env.get("VERTAL_ROOT_ZONE_ID") ?? "").trim();
    const appTarget = (Deno.env.get("VERTAL_APP_TARGET") ?? rootDomain).trim().toLowerCase();
    const cf = cfConfig();

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "list");

    if (action === "list") {
      const { data } = await svc.from("kubo_subdomains").select("*").eq("user_id", userId).order("created_at", { ascending: false });
      return json({ subdomains: data ?? [], root_domain: rootDomain || null, vertal_enabled: !!(cf.enabled && rootDomain && rootZoneId), free_limit: MAX_VERTAL_SUBDOMAINS });
    }

    if (action === "create") {
      const kind = body?.kind === "custom" ? "custom" : "vertal";
      const label = String(body?.label ?? "").trim().toLowerCase();
      if (!LABEL_RE.test(label)) return json({ error: "invalid_label" }, 400);
      const target = String(body?.target ?? appTarget).trim().toLowerCase().replace(/\.$/, "");
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(target)) return json({ error: "invalid_target" }, 400);
      const project_id = body?.project_id ?? null;

      let hostname: string;
      let zoneId: string | null = null;
      let domain_id: string | null = null;

      if (kind === "vertal") {
        if (!cf.enabled || !rootDomain || !rootZoneId) return json({ error: "vertal_subdomains_not_configured" }, 503);
        if (RESERVED.has(label)) return json({ error: "label_reserved" }, 409);
        const { count } = await svc.from("kubo_subdomains").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", "vertal");
        if ((count ?? 0) >= MAX_VERTAL_SUBDOMAINS) return json({ error: "free_subdomain_limit", limit: MAX_VERTAL_SUBDOMAINS }, 402);
        hostname = `${label}.${rootDomain}`;
        zoneId = rootZoneId;
      } else {
        domain_id = String(body?.domain_id ?? "");
        const { data: dom } = await svc.from("kubo_domains").select("*").eq("id", domain_id).eq("user_id", userId).maybeSingle();
        if (!dom) return json({ error: "domain not found" }, 404);
        hostname = `${label}.${dom.domain_name}`;
        zoneId = dom.metadata?.cf_zone_id ?? null;
      }

      const { data: taken } = await svc.from("kubo_subdomains").select("id").eq("hostname", hostname).maybeSingle();
      if (taken) return json({ error: "hostname_taken" }, 409);

      let cf_record_id: string | null = null;
      if (zoneId && cf.enabled) {
        const r = await cfCreateDnsRecord(zoneId, { type: "CNAME", name: hostname, content: target, ttl: 1, proxied: kind === "vertal" });
        if (!r.ok) return json({ error: "dns_create_failed", detail: cfErrorMessage(r.body) }, 502);
        cf_record_id = String(r.body?.result?.id ?? "") || null;
      }

      const { data: row, error } = await svc.from("kubo_subdomains").insert({
        user_id: userId, domain_id, hostname, kind, target, project_id, cf_record_id,
        status: cf_record_id ? "active" : "pending_dns",
      }).select().single();
      if (error) {
        if (cf_record_id && zoneId) await cfDeleteDnsRecord(zoneId, cf_record_id);
        return json({ error: sanitizeError(error) }, 500);
      }
      try {
        await svc.from("connector_activity_logs").insert({
          connector_slug: "cloudflare", user_id: userId, event_type: "subdomain_create", status: "success",
          message: `Subdomínio ${hostname} → ${target}`, metadata: { hostname, kind, target, synced: !!cf_record_id },
        });
      } catch { /* ignore */ }
      // When not synced, the client must add this CNAME at their own DNS provider.
      return json({ subdomain: row, synced: !!cf_record_id, manual_record: cf_record_id ? null : { type: "CNAME", name: label, value: target } });
    }

    if (action === "delete") {
      const id = String(body?.id ?? "");
      const { data: sub } = await svc.from("kubo_subdomains").select("*, kubo_domains(metadata)").eq("id", id).eq("user_id", userId).maybeSingle();
      if (!sub) return json({ error: "not found" }, 404);
      const zoneId = sub.kind === "vertal" ? rootZoneId : (sub as any).kubo_domains?.metadata?.cf_zone_id;
      if (sub.cf_record_id && zoneId && cf.enabled) await cfDeleteDnsRecord(zoneId, sub.cf_record_id);
      await svc.from("kubo_subdomains").delete().eq("id", id).eq("user_id", userId);
      return json({ success: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e: any) {
    console.error("[domain-subdomains] error:", e);
    return json({ error: sanitizeError(e) }, 500);
  }
});
