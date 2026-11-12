// deno-lint-ignore-file no-explicit-any
// Cloudflare Registrar (API beta) + DNS helpers for Vertal Domínios - Parceiros.
// Docs: https://developers.cloudflare.com/registrar/registrar-api/
//
// Required secrets:
//   CLOUDFLARE_ACCOUNT_ID   — account that owns the registrations (billing profile + default registrant set)
//   CLOUDFLARE_API_TOKEN    — token with Registrar:Edit, Zone:Edit, DNS:Edit
// Optional:
//   VERTAL_ROOT_ZONE_ID     — zone of the Vertal root domain, used for free "<name>.<root>" subdomains
//   VERTAL_ROOT_DOMAIN      — e.g. "vertal.app"
//   VERTAL_APP_TARGET       — CNAME target for published apps (default: VERTAL_ROOT_DOMAIN)
//   DOMAIN_MARKUP_PCT       — partner margin added over Cloudflare at-cost price (default 30)
//   DOMAIN_USD_FX           — USD → billing currency rate when billing_settings.currency != usd (default 1)

const CF_API = "https://api.cloudflare.com/client/v4";

export type CfDomainQuote = {
  name: string;
  registrable: boolean;
  reason?: string;
  tier?: string;
  pricing?: { currency: string; registration_cost: string; renewal_cost: string };
};

export function cfConfig() {
  const accountId = (Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "").trim();
  const token = (Deno.env.get("CLOUDFLARE_API_TOKEN") ?? "").trim();
  return { accountId, token, enabled: !!(accountId && token) };
}

export async function cfFetch(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; body: any }> {
  const { token } = cfConfig();
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  return { ok: res.ok && body?.success !== false, status: res.status, body };
}

export function cfErrorMessage(body: any): string {
  const e = body?.errors?.[0] ?? body?.result?.error;
  return e?.message ?? e?.code ?? (typeof body === "string" ? body.slice(0, 200) : "cloudflare_error");
}

/** Suggestions from cached data — discovery only, never buy from this alone. */
export async function cfDomainSearch(q: string, limit = 8): Promise<CfDomainQuote[]> {
  const { accountId } = cfConfig();
  const r = await cfFetch(`/accounts/${accountId}/registrar/domain-search?q=${encodeURIComponent(q)}&limit=${limit}`);
  return r.ok ? (r.body?.result?.domains ?? []) : [];
}

/** Real-time registry check (max 20 per call). */
export async function cfDomainCheck(domains: string[]): Promise<CfDomainQuote[]> {
  const { accountId } = cfConfig();
  const out: CfDomainQuote[] = [];
  for (let i = 0; i < domains.length; i += 20) {
    const r = await cfFetch(`/accounts/${accountId}/registrar/domain-check`, {
      method: "POST",
      body: JSON.stringify({ domains: domains.slice(i, i + 20) }),
    });
    if (r.ok) out.push(...(r.body?.result?.domains ?? []));
  }
  return out;
}

/** Starts a registration. 201 = done, 202 = in progress (poll, don't retry). Billable. */
export async function cfRegister(domain: string) {
  const { accountId } = cfConfig();
  return await cfFetch(`/accounts/${accountId}/registrar/registrations`, {
    method: "POST",
    headers: { Prefer: "respond-async" },
    body: JSON.stringify({ domain_name: domain }),
  });
}

export async function cfRegistrationStatus(domain: string) {
  const { accountId } = cfConfig();
  return await cfFetch(`/accounts/${accountId}/registrar/registrations/${encodeURIComponent(domain)}/registration-status`);
}

/** Finds the zone for a domain, creating it (full setup) when missing. Returns id + assigned nameservers. */
export async function cfEnsureZone(domain: string): Promise<{ id: string; name_servers: string[] } | null> {
  const { accountId } = cfConfig();
  const found = await cfFetch(`/zones?name=${encodeURIComponent(domain)}&account.id=${accountId}`);
  const existing = found.ok ? found.body?.result?.[0] : null;
  if (existing?.id) return { id: existing.id, name_servers: existing.name_servers ?? [] };
  const created = await cfFetch(`/zones`, {
    method: "POST",
    body: JSON.stringify({ name: domain, account: { id: accountId }, type: "full" }),
  });
  if (!created.ok) return null;
  return { id: created.body.result.id, name_servers: created.body.result.name_servers ?? [] };
}

export async function cfCreateDnsRecord(zoneId: string, rec: { type: string; name: string; content: string; ttl?: number; priority?: number | null; proxied?: boolean }) {
  const payload: any = { type: rec.type, name: rec.name, content: rec.content, ttl: rec.ttl ?? 1 };
  if (rec.priority != null) payload.priority = rec.priority;
  if (["A", "AAAA", "CNAME"].includes(rec.type)) payload.proxied = rec.proxied ?? false;
  return await cfFetch(`/zones/${zoneId}/dns_records`, { method: "POST", body: JSON.stringify(payload) });
}

export async function cfDeleteDnsRecord(zoneId: string, recordId: string) {
  return await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, { method: "DELETE" });
}

/** Converts the Cloudflare at-cost USD price into Vertal credits, including the partner margin. */
export async function usdToCredits(svc: any, usd: number): Promise<number> {
  const markup = Number(Deno.env.get("DOMAIN_MARKUP_PCT") ?? "30");
  const fx = Number(Deno.env.get("DOMAIN_USD_FX") ?? "1");
  let centsPerCredit = 10;
  try {
    const { data } = await svc.from("billing_settings").select("price_per_credit_cents").eq("id", true).maybeSingle();
    if (data?.price_per_credit_cents > 0) centsPerCredit = data.price_per_credit_cents;
  } catch { /* default */ }
  const cents = usd * 100 * fx * (1 + (Number.isFinite(markup) ? markup : 30) / 100);
  return Math.max(1, Math.ceil(cents / centsPerCredit));
}
