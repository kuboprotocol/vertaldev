// Domain search for the publish flow, backed by the Cloudflare Registrar API (beta).
//   POST { action: "search", query }  →  { query, results: [{ name, tld, registrable, reason, price, currency, renewal_price }] }
//
// Read-only: it only checks availability and price. Registration and transfer are NOT exposed here,
// because they move money on the platform's Cloudflare account and need a billing/contract decision first.
// Requires CLOUDFLARE_API_TOKEN (with Registrar read/write permission) and CLOUDFLARE_ACCOUNT_ID.
import { corsHeaders } from "../_shared/cors.ts";
import * as creative from "../_shared/creative.ts";

const CF_API = "https://api.cloudflare.com/client/v4";
/** Cloudflare's domain-check endpoint accepts at most 20 domains per request. */
const MAX_CHECK_BATCH = 20;
/** TLDs offered as variants of the typed name. Unsupported ones come back as `extension_not_supported_via_api`. */
export const SEARCH_TLDS = ["com", "dev", "app", "io", "ai", "co", "xyz", "org", "net"];

const defaultDeps = {
  getUser: creative.getUser,
  fetch: (input: string, init?: RequestInit) => fetch(input, init),
  env: (k: string): string | undefined => Deno.env.get(k),
};
let deps = defaultDeps;
/** Test seam: swap external dependencies (auth, Cloudflare). */
export function __setDeps(d: Partial<typeof defaultDeps>) {
  deps = { ...defaultDeps, ...d };
}

export interface DomainResult {
  name: string;
  tld: string;
  registrable: boolean;
  reason: string | null;
  price: string | null;
  currency: string | null;
  renewal_price: string | null;
}

/** Normalises the user's input and returns the candidate domains to check (base name + TLD variants). */
export function buildCandidates(rawQuery: unknown): string[] {
  const query = String(rawQuery ?? "").trim().toLowerCase().replace(/[^a-z0-9.-]/g, "");
  if (query.length < 2) return [];
  const hasDot = query.includes(".");
  const base = hasDot ? query.split(".")[0] : query;
  if (!base || base.startsWith("-") || base.endsWith("-")) return [];
  const direct = hasDot ? [query] : [];
  const variants = SEARCH_TLDS.map((t) => `${base}.${t}`);
  return Array.from(new Set([...direct, ...variants])).slice(0, MAX_CHECK_BATCH);
}

/** The TLD of a domain, as the Registrar reports it (last label). */
export function tldOf(domain: string): string {
  const parts = domain.split(".");
  return parts[parts.length - 1] ?? "";
}

/** Maps one entry of the Registrar `domain-check` response into the shape the UI uses. */
export function mapCheckEntry(entry: any): DomainResult {
  const name = String(entry?.name ?? "");
  return {
    name,
    tld: tldOf(name),
    registrable: entry?.registrable === true,
    reason: typeof entry?.reason === "string" ? entry.reason : null,
    price: entry?.pricing?.registration_cost ?? null,
    currency: entry?.pricing?.currency ?? null,
    renewal_price: entry?.pricing?.renewal_cost ?? null,
  };
}

function j(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j(405, { error: "method_not_allowed" });

  const user = await deps.getUser(req.headers.get("Authorization"));
  if (!user) return j(401, { error: "unauthorized" });

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action !== "search") return j(400, { error: "unsupported_action" });

    const candidates = buildCandidates(body?.query);
    if (candidates.length === 0) return j(400, { error: "query_too_short" });

    const token = deps.env("CLOUDFLARE_API_TOKEN");
    const accountId = deps.env("CLOUDFLARE_ACCOUNT_ID");
    if (!token || !accountId) return j(503, { error: "registrar_not_configured" });

    const res = await deps.fetch(`${CF_API}/accounts/${accountId}/registrar/domain-check`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ domains: candidates }),
    });
    if (res.status === 401 || res.status === 403) return j(502, { error: "registrar_permission_missing" });
    if (!res.ok) {
      console.error(`[cloudflare-domains] domain-check failed (${res.status})`);
      return j(502, { error: "registrar_unavailable" });
    }

    const payload = await res.json().catch(() => null);
    const rows: any[] = Array.isArray(payload?.result?.domains) ? payload.result.domains : [];
    const results = rows.map(mapCheckEntry);
    // Registrable first, then the rest, keeping the order the candidates were typed in.
    results.sort((a, b) => Number(b.registrable) - Number(a.registrable));

    return j(200, { query: body.query, results });
  } catch (e) {
    console.error("[cloudflare-domains] error:", e);
    return j(500, { error: creative.sanitizeError(e) });
  }
}

Deno.serve(handleRequest);
